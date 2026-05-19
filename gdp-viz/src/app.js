/**
 * app.js
 * Entry point. Orchestrates data loading, rendering, and UI state.
 *
 * State machine:
 *   "world"     — all continent bubbles visible
 *   "continent" — zoomed into a specific continent
 *   "detail"    — country detail panel open (can coexist with either above)
 */

import { fetchWorldGDP, fetchCountryDetail } from "./worldbank.js";
import { BubbleRenderer, renderDetailPanel, renderLegend } from "./renderer.js";

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const svgEl       = document.getElementById("chart-svg");
const legendEl    = document.getElementById("legend-bar");
const statusEl    = document.getElementById("status");
const statusMsg   = document.getElementById("status-message");
const subtitle    = document.getElementById("subtitle");
const detailPanel = document.getElementById("detail-panel");
const closeBtn    = document.getElementById("close-panel");
const backBtn     = document.getElementById("back-btn");

// ─── State ────────────────────────────────────────────────────────────────────

let renderer = null;

// ─── Status helpers ───────────────────────────────────────────────────────────

function setStatus(msg, isError = false) {
  statusEl.classList.remove("hidden", "error");
  if (isError) statusEl.classList.add("error");
  statusMsg.textContent = msg;
}

function hideStatus() {
  statusEl.classList.add("hidden");
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

async function openDetail(countryData) {
  detailPanel.classList.add("open");
  // Render immediately with loading state for the breakdown
  renderDetailPanel(detailPanel, countryData, null);

  try {
    const detail = await fetchCountryDetail(countryData.iso3);
    // Re-render with full data
    renderDetailPanel(detailPanel, countryData, detail);
  } catch (err) {
    renderDetailPanel(detailPanel, countryData, {});
    console.warn("Detail fetch failed:", err);
  }
}

function closeDetail() {
  detailPanel.classList.remove("open");
}

// ─── Back button ──────────────────────────────────────────────────────────────

function setView(v) {
  if (v === "world") {
    backBtn.classList.add("hidden");
  } else {
    backBtn.classList.remove("hidden");
  }
}

// ─── Legend chip clicks ───────────────────────────────────────────────────────

legendEl.addEventListener("click", (e) => {
  const chip = e.target.closest(".legend-chip");
  if (!chip || !renderer) return;
  renderer.zoomToContinent(chip.dataset.continent);
  setView("continent");
  closeDetail();
});

// ─── Back button ──────────────────────────────────────────────────────────────

backBtn.addEventListener("click", () => {
  renderer?.resetToWorld();
  setView("world");
});

// ─── Close detail ─────────────────────────────────────────────────────────────

closeBtn.addEventListener("click", closeDetail);

// ─── Main ─────────────────────────────────────────────────────────────────────

async function init() {
  setStatus("Fetching GDP data from World Bank…");

  try {
    const data = await fetchWorldGDP();

    if (subtitle) {
      subtitle.textContent =
        `Real GDP by country & region — ${data.year} data (constant 2015 USD) · Source: World Bank`;
    }

    renderLegend(legendEl, data.continents, data.worldTotal, data.year);

    renderer = new BubbleRenderer(svgEl, {
      onCountryClick(countryData) { openDetail(countryData); },
      onZoomIn(_name)             { setView("continent"); closeDetail(); },
      onZoomOut()                 { setView("world"); },
      onComputeStart()            { setStatus("Computing layout…"); },
      onComputeEnd()              { hideStatus(); },
    });

    await renderer.render(data);

  } catch (err) {
    console.error(err);
    setStatus(`Failed to load data: ${err.message}. Check your connection and reload.`, true);
  }
}

// ─── Resize ───────────────────────────────────────────────────────────────────

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => renderer?.resize(), 180);
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

init();
