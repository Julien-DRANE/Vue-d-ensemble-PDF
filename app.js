import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

const state = {
  pdfDocument: null,
  currentFileName: "",
  thumbnailWidth: 150,
};

const input = document.querySelector("#pdf-input");
const gallery = document.querySelector("#gallery");
const pageCount = document.querySelector("#page-count");
const emptyState = document.querySelector("#empty-state");
const thumbSize = document.querySelector("#thumb-size");
const thumbSizeValue = document.querySelector("#thumb-size-value");
const dropzone = document.querySelector("#dropzone");
const fitButton = document.querySelector("#fit-button");
const exportButton = document.querySelector("#export-button");

input.addEventListener("change", async (event) => {
  const [file] = event.target.files || [];
  if (file) {
    await loadPdf(file);
  }
});

thumbSize.addEventListener("input", () => {
  updateThumbnailSize(Number(thumbSize.value));
});

fitButton.addEventListener("click", () => {
  const width = computeBestFitWidth();
  updateThumbnailSize(width);
});

exportButton.addEventListener("click", async () => {
  await exportGalleryAsPng();
});

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragover");
  });
});

dropzone.addEventListener("drop", async (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (file && file.type === "application/pdf") {
    input.files = event.dataTransfer.files;
    await loadPdf(file);
  }
});

window.addEventListener("resize", () => {
  if (state.pdfDocument) {
    syncSliderLabel();
  }
});

async function loadPdf(file) {
  try {
    setStatus(`Chargement de ${file.name}...`);
    state.currentFileName = file.name;
    clearGallery();

    const buffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: buffer });
    state.pdfDocument = await loadingTask.promise;

    setStatus(`${state.pdfDocument.numPages} pages • ${file.name}`);
    emptyState.hidden = true;
    gallery.classList.add("has-document");
    await renderAllPages();
  } catch (error) {
    state.pdfDocument = null;
    gallery.classList.remove("has-document");
    emptyState.hidden = false;
    setStatus("Impossible de lire ce PDF");
    console.error(error);
  }
}

async function renderAllPages() {
  const documentRef = state.pdfDocument;
  if (!documentRef) return;

  const pagePromises = Array.from({ length: documentRef.numPages }, (_, index) =>
    renderPageCard(index + 1, documentRef),
  );

  await Promise.all(pagePromises);
}

async function renderPageCard(pageNumber, documentRef) {
  const page = await documentRef.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const scale = state.thumbnailWidth / viewport.width;
  const scaledViewport = page.getViewport({ scale });

  const card = document.createElement("article");
  card.className = "page-card";

  const frame = document.createElement("div");
  frame.className = "page-frame";

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = Math.floor(scaledViewport.width);
  canvas.height = Math.floor(scaledViewport.height);

  const placeholder = document.createElement("div");
  placeholder.className = "loader";
  placeholder.textContent = "Rendu...";
  frame.appendChild(placeholder);

  const label = document.createElement("div");
  label.className = "page-label";
  label.textContent = `Page ${pageNumber}`;

  card.append(frame, label);
  gallery.appendChild(card);

  await page.render({
    canvasContext: context,
    viewport: scaledViewport,
  }).promise;

  frame.replaceChildren(canvas);
}

function updateThumbnailSize(width) {
  state.thumbnailWidth = width;
  document.documentElement.style.setProperty("--thumb-size", `${width}px`);
  thumbSize.value = String(width);
  syncSliderLabel();

  if (state.pdfDocument) {
    clearGallery();
    void renderAllPages();
  }
}

function computeBestFitWidth() {
  const availableWidth = gallery.clientWidth || window.innerWidth - 64;
  const targetColumns = Math.max(2, Math.floor(availableWidth / 180));
  const calculatedWidth = Math.floor((availableWidth - (targetColumns - 1) * 18) / targetColumns);
  return Math.max(90, Math.min(280, calculatedWidth));
}

function clearGallery() {
  gallery.innerHTML = "";
}

function setStatus(text) {
  pageCount.textContent = text;
}

function syncSliderLabel() {
  thumbSizeValue.textContent = `${state.thumbnailWidth} px`;
}

async function exportGalleryAsPng() {
  if (!state.pdfDocument) {
    setStatus("Charge d'abord un PDF");
    return;
  }

  const cards = [...gallery.querySelectorAll(".page-card")];
  if (!cards.length) {
    setStatus("Aucune vignette à exporter");
    return;
  }

  const previousLabel = exportButton.textContent;
  exportButton.disabled = true;
  exportButton.textContent = "Export en cours...";

  try {
    const galleryStyle = window.getComputedStyle(gallery);
    const columnTemplate = galleryStyle.gridTemplateColumns.trim();
    const columnCount = columnTemplate ? columnTemplate.split(" ").length : 1;
    const gap = Number.parseFloat(galleryStyle.gap) || 18;
    const padding = 32;
    const labelHeight = 28;

    const renderedCards = cards
      .map((card, index) => {
        const canvas = card.querySelector("canvas");
        if (!canvas) return null;

        return {
          index,
          canvas,
          width: canvas.width,
          height: canvas.height,
        };
      })
      .filter(Boolean);

    if (!renderedCards.length) {
      setStatus("Les vignettes ne sont pas encore prêtes");
      return;
    }

    const rows = [];
    for (let index = 0; index < renderedCards.length; index += columnCount) {
      rows.push(renderedCards.slice(index, index + columnCount));
    }

    const rowHeights = rows.map((row) =>
      Math.max(...row.map((item) => item.height)) + labelHeight,
    );

    const exportWidth =
      padding * 2 +
      rows.reduce((maxWidth, row) => {
        const rowWidth = row.reduce((sum, item) => sum + item.width, 0) + gap * Math.max(0, row.length - 1);
        return Math.max(maxWidth, rowWidth);
      }, 0);

    const exportHeight =
      padding * 2 +
      rowHeights.reduce((sum, height) => sum + height, 0) +
      gap * Math.max(0, rows.length - 1);

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = exportWidth;
    exportCanvas.height = exportHeight;

    const context = exportCanvas.getContext("2d");
    context.fillStyle = "#f4efe7";
    context.fillRect(0, 0, exportWidth, exportHeight);

    let y = padding;

    rows.forEach((row, rowIndex) => {
      const rowWidth = row.reduce((sum, item) => sum + item.width, 0) + gap * Math.max(0, row.length - 1);
      let x = padding + Math.max(0, (exportWidth - padding * 2 - rowWidth) / 2);

      row.forEach((item) => {
        context.fillStyle = "#ffffff";
        context.fillRect(x, y, item.width, item.height);
        context.drawImage(item.canvas, x, y);

        context.fillStyle = "#6f675d";
        context.font = '16px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
        context.textAlign = "center";
        context.fillText(`Page ${item.index + 1}`, x + item.width / 2, y + item.height + 20);

        x += item.width + gap;
      });

      y += rowHeights[rowIndex] + gap;
    });

    const fileStem = (state.currentFileName || "pdf-overview").replace(/\.pdf$/i, "");
    const link = document.createElement("a");
    link.href = exportCanvas.toDataURL("image/png");
    link.download = `${fileStem}-overview.png`;
    link.click();

    setStatus(`${state.pdfDocument.numPages} pages • export PNG prêt`);
  } finally {
    exportButton.disabled = false;
    exportButton.textContent = previousLabel;
  }
}

syncSliderLabel();
