/**
 * app.js
 * Entry point. Orchestrates data loading, rendering, and UI state.
 *
 * State machine:
 *   "world"     — all continent bubbles visible
 *   "continent" — zoomed into a specific continent
 *   "detail"    — country detail panel open (can coexist with either above)
 */

import {
  fetchWorldGDP, fetchCountryCore, fetchCountrySupp,
  getCachedCountryDetail, setCachedCountryDetail,
  fetchTradePartners, fetchTradeGoods, flagEmoji,
} from "./worldbank.js";
import { BubbleRenderer, renderLegend } from "./renderer.js";
import { renderDetailPanel } from "./panel.js";

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

let _openIso3 = null;

async function openDetail(countryData) {
  const iso3 = countryData.iso3;
  _openIso3 = iso3;
  detailPanel.classList.add("open");

  // Cache hit: render immediately, then load trade data
  const cached = getCachedCountryDetail(iso3);
  if (cached) {
    renderDetailPanel(detailPanel, countryData, cached, null, null);
    const [partners, goods] = await Promise.all([fetchTradePartners(iso3), fetchTradeGoods(iso3)]);
    if (_openIso3 === iso3) renderDetailPanel(detailPanel, countryData, cached, partners, goods);
    return;
  }

  // Cache miss: show loading state, then progressively fill in
  renderDetailPanel(detailPanel, countryData, null, null, null);
  const partnersPromise = fetchTradePartners(iso3);
  const goodsPromise    = fetchTradeGoods(iso3);

  // Phase 1: 3 indicators + history (renders stats + sparkline quickly)
  const core = await fetchCountryCore(iso3);
  if (_openIso3 !== iso3) return;
  renderDetailPanel(detailPanel, countryData, { ...core, _sectorsLoading: true }, null, null);

  // Phase 2: 6 sector/trade indicators + partners + goods (fills in the rest)
  const [supp, partners, goods] = await Promise.all([fetchCountrySupp(iso3), partnersPromise, goodsPromise]);
  if (_openIso3 !== iso3) return;
  const detail = { ...core, ...supp };
  setCachedCountryDetail(iso3, detail);
  renderDetailPanel(detailPanel, countryData, detail, partners, goods);
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

// ─── Country search ───────────────────────────────────────────────────────────

function initSearch(countries) {
  const input    = document.getElementById("country-input");
  const dropdown = document.getElementById("search-dropdown");
  if (!input || !dropdown) return;

  let filtered    = [];
  let activeIndex = -1;

  function renderDropdown(matches) {
    filtered    = matches;
    activeIndex = -1;
    if (!matches.length) {
      dropdown.innerHTML = "";
      dropdown.classList.add("hidden");
      input.setAttribute("aria-expanded", "false");
      return;
    }
    dropdown.innerHTML = matches.map((c, i) =>
      `<li class="search-item" role="option" data-idx="${i}">
        <span class="si-flag">${c.flag}</span>
        <span class="si-name">${c.name}</span>
        <span class="si-continent">${c.continent}</span>
      </li>`
    ).join("");
    dropdown.classList.remove("hidden");
    input.setAttribute("aria-expanded", "true");
  }

  function pick(country) {
    input.value = "";
    dropdown.innerHTML = "";
    dropdown.classList.add("hidden");
    input.setAttribute("aria-expanded", "false");
    activeIndex = -1;
    filtered = [];
    openDetail(country);
  }

  function setActive(idx) {
    activeIndex = idx;
    dropdown.querySelectorAll(".search-item").forEach((li, i) =>
      li.classList.toggle("active", i === activeIndex)
    );
  }

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { renderDropdown([]); return; }
    renderDropdown(
      countries.filter(c => c.name.toLowerCase().includes(q)).slice(0, 8)
    );
  });

  input.addEventListener("keydown", (e) => {
    if (!filtered.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(activeIndex + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      pick(filtered[activeIndex]);
    } else if (e.key === "Escape") {
      renderDropdown([]);
    }
  });

  dropdown.addEventListener("mousedown", (e) => {
    const li = e.target.closest(".search-item");
    if (!li) return;
    e.preventDefault();
    pick(filtered[parseInt(li.dataset.idx, 10)]);
  });

  input.addEventListener("blur", () => {
    setTimeout(() => renderDropdown([]), 150);
  });
}

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

    const allCountries = data.continents.flatMap(c =>
      c.countries.map(country => ({
        ...country,
        flag: flagEmoji(country.iso2),
        continentColor: c.color,
      }))
    );
    initSearch(allCountries);

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
