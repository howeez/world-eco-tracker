/**
 * panel.js
 * Renders the country detail panel: header stats, GDP sparkline, sector breakdown.
 * Imported by app.js; has no knowledge of the chart or DOM outside #detail-panel.
 */

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import {
  flagEmoji,
  formatCompact,
  formatTrillions,
  fetchSectorDetail,
  fetchBilateralHistoryComtrade,
  fetchBilateralHistoryOTS,
  fetchBilateralGoods,
  isoToOEC,
} from "./worldbank.js";

// ── Module state ──────────────────────────────────────────────────────────────

let _countryList   = [];
let _lastPanelState = null;

export function setCountryList(countries) { _countryList = countries; }

// ── Public API ─────────────────────────────────────────────────────────────────

export function renderDetailPanel(panel, country, detail, partners, goods = null) {
  _lastPanelState = { panel, country, detail, partners, goods };
  const { name, iso2, iso3, gdp, continent, color } = country;

  const flag      = flagEmoji(iso2);
  const agr = detail?.agriculture, ind = detail?.industry, srv = detail?.services;
  const hasSectors = agr != null && ind != null && srv != null;
  const growth    = detail?.gdpGrowth;
  const growthStr = growth != null ? `${growth > 0 ? "+" : ""}${growth.toFixed(2)}%` : "N/A";
  const growthClr = growth == null ? "#888" : growth >= 0 ? "#10b981" : "#ef4444";
  const arrow     = growth == null ? "" : growth >= 0 ? "▲ " : "▼ ";

  const content = panel.querySelector("#detail-content");
  content.innerHTML = `
    <div class="detail-flag">${flag}</div>
    <h2 class="detail-name">${name}</h2>
    <div class="detail-continent" style="color:${color}">${continent}</div>

    <div class="detail-stats">
      <div class="stat-block">
        <div class="stat-label">Total GDP</div>
        <div class="stat-value">${formatTrillions(gdp)}</div>
        <div class="stat-sub">constant 2015 USD</div>
      </div>
      <div class="stat-block">
        <div class="stat-label">GDP Growth</div>
        <div class="stat-value" style="color:${growthClr}">${arrow}${growthStr}</div>
        <div class="stat-sub">${detail?.gdpGrowthYear ?? "latest year"}</div>
      </div>
      <div class="stat-block">
        <div class="stat-label">GDP per Capita</div>
        <div class="stat-value">${detail?.gdpPerCapita != null ? formatTrillions(detail.gdpPerCapita) : "N/A"}</div>
        <div class="stat-sub">constant 2015 USD</div>
      </div>
      <div class="stat-block">
        <div class="stat-label">Population</div>
        <div class="stat-value">${detail?.population != null ? fmtPop(detail.population) : "N/A"}</div>
        <div class="stat-sub">${detail?.populationYear ?? ""}</div>
      </div>
    </div>

    ${hasSectors ? `
    <div class="detail-section">
      <div class="section-title">GDP Composition <span class="section-hint">· % of GDP · click to expand</span></div>
      <div class="sector-stack-bar">
        <div class="sector-seg" style="flex:${agr.toFixed(2)};background:#10b981" data-sector="agriculture" title="Agriculture · ${agr.toFixed(1)}%"></div>
        <div class="sector-seg" style="flex:${ind.toFixed(2)};background:#6366f1" data-sector="industry"    title="Industry · ${ind.toFixed(1)}%"></div>
        <div class="sector-seg" style="flex:${srv.toFixed(2)};background:#f59e0b" data-sector="services"    title="Services · ${srv.toFixed(1)}%"></div>
        ${(100 - agr - ind - srv) > 0.5 ? `<div class="sector-seg sector-seg-other" style="flex:${(100 - agr - ind - srv).toFixed(2)}" title="Other · ${(100 - agr - ind - srv).toFixed(1)}%"></div>` : ""}
      </div>
      <div class="sector-legend">
        <div class="sector-legend-item" data-sector="agriculture">
          <span class="sli-dot" style="background:#10b981"></span>
          <span class="sli-name">Agriculture</span>
          <span class="sli-pct">${agr.toFixed(1)}%</span>
          <span class="sli-chevron">›</span>
        </div>
        <div class="sector-legend-item" data-sector="industry">
          <span class="sli-dot" style="background:#6366f1"></span>
          <span class="sli-name">Industry</span>
          <span class="sli-pct">${ind.toFixed(1)}%</span>
          <span class="sli-chevron">›</span>
        </div>
        <div class="sector-legend-item" data-sector="services">
          <span class="sli-dot" style="background:#f59e0b"></span>
          <span class="sli-name">Services</span>
          <span class="sli-pct">${srv.toFixed(1)}%</span>
          <span class="sli-chevron">›</span>
        </div>
      </div>
    </div>` : (detail === null || detail?._sectorsLoading)
      ? `<div class="detail-loading"><div class="mini-spinner"></div><span>Loading breakdown…</span></div>`
      : `<div class="detail-na">Sector data unavailable</div>`}

    ${detail?.history?.length > 1 ? `
    <div class="detail-section">
      <div class="section-title">GDP History</div>
      <div class="sparkline-wrap"></div>
    </div>` : ""}

    ${detail !== null ? buildTradeSection(detail, partners, goods) : ""}

    <div class="detail-source">
      World Bank · NY.GDP.MKTP.KD (constant 2015 USD)
    </div>`;

  if (detail?.history?.length > 1) {
    buildSparkline(content.querySelector(".sparkline-wrap"), detail.history, color);
  }

  if (hasSectors) {
    initSectorDrilldown(content, iso3);
  }

  if (detail !== null) {
    initTradeInteractivity(content, country, panel);
  }
}

// ── Trade section ─────────────────────────────────────────────────────────────

function buildTradeSection(detail, partners, goods) {
  const hasAgg = detail?.exports != null || detail?.imports != null;
  if (!hasAgg && partners === null && goods === null) return "";

  const balance   = (detail?.exports ?? 0) - (detail?.imports ?? 0);
  const tradeYear = detail?.exportsYear ?? "";
  const isLoading = partners === null && goods === null;

  const exportContent = isLoading
    ? `<div class="detail-loading"><div class="mini-spinner"></div><span>Loading…</span></div>`
    : (goods?.topExportGoods?.length || partners?.topExports?.length)
      ? `${goods?.topExportGoods?.length ? `<div class="sub-title">Export Composition · ${goods.year ?? ""} · % of exports</div>
        <div class="sub-bars">${goods.topExportGoods.map(p => subBar(p.name, p.share, "#10b981")).join("")}</div>` : ""}
        ${partners?.topExports?.length ? `<div class="sub-title" style="margin-top:10px">Top Export Destinations · ${partners.year ?? ""}</div>
        <div class="sub-bars">${partners.topExports.map(p => partnerSubBar(p, "#10b981")).join("")}</div>` : ""}`
      : `<div class="detail-na">No export data available</div>`;

  const importContent = isLoading
    ? `<div class="detail-loading"><div class="mini-spinner"></div><span>Loading…</span></div>`
    : (goods?.topImportGoods?.length || partners?.topImports?.length)
      ? `${goods?.topImportGoods?.length ? `<div class="sub-title">Import Composition · ${goods.year ?? ""} · % of imports</div>
        <div class="sub-bars">${goods.topImportGoods.map(p => subBar(p.name, p.share, "#f59e0b")).join("")}</div>` : ""}
        ${partners?.topImports?.length ? `<div class="sub-title" style="margin-top:10px">Top Import Sources · ${partners.year ?? ""}</div>
        <div class="sub-bars">${partners.topImports.map(p => partnerSubBar(p, "#f59e0b")).join("")}</div>` : ""}`
      : `<div class="detail-na">No import data available</div>`;

  return `
  <div class="detail-section">
    <div class="section-title">Trade${tradeYear ? `<span class="section-hint"> · ${tradeYear} · merchandise USD</span>` : ""}</div>

    ${hasAgg ? `
    <div class="trade-overview">
      ${detail.exports != null ? `
      <div class="trade-row">
        <span class="trade-label">Exports</span>
        <span class="trade-value" style="color:#10b981">${formatTrillions(detail.exports)}</span>
      </div>` : ""}
      ${detail.imports != null ? `
      <div class="trade-row">
        <span class="trade-label">Imports</span>
        <span class="trade-value" style="color:#ef4444">${formatTrillions(detail.imports)}</span>
      </div>` : ""}
      ${detail.exports != null && detail.imports != null ? `
      <div class="trade-row trade-balance-row">
        <span class="trade-label">Balance</span>
        <span class="trade-value" style="color:${balance >= 0 ? "#10b981" : "#ef4444"}">${balance >= 0 ? "+" : ""}${formatTrillions(balance)}</span>
      </div>` : ""}
      ${detail.tariff != null ? `
      <div class="trade-row">
        <span class="trade-label">Avg. Tariff</span>
        <span class="trade-value">${detail.tariff.toFixed(1)}%</span>
      </div>` : ""}
    </div>` : ""}

    <div class="trade-search-wrap">
      <input class="trade-search-input" type="text" placeholder="Search trade partner…" autocomplete="off" aria-label="Search trade partner" />
      <ul class="trade-search-dropdown hidden" role="listbox"></ul>
    </div>

    <details class="trade-accordion">
      <summary class="trade-accordion-summary">
        <span class="ta-dot" style="background:#10b981"></span>
        <span class="ta-label">Exports</span>
        <span class="ta-chevron">›</span>
      </summary>
      <div class="trade-accordion-body">${exportContent}</div>
    </details>

    <details class="trade-accordion">
      <summary class="trade-accordion-summary">
        <span class="ta-dot" style="background:#f59e0b"></span>
        <span class="ta-label">Imports</span>
        <span class="ta-chevron">›</span>
      </summary>
      <div class="trade-accordion-body">${importContent}</div>
    </details>

    <div class="sub-note">OEC · BACI · World Development Indicators</div>
  </div>`;
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function buildSparkline(container, history, color, opts = {}) {
  if (!container) return;

  const { formatY = null, zeroBased = true } = opts;
  const yFmt = formatY ?? formatCompact;

  const margin = { top: 8, right: 8, bottom: 18, left: 54 };
  const W = 280, H = 90;
  const iW = W - margin.left - margin.right;
  const iH = H - margin.top - margin.bottom;

  const vals  = history.map(d => d.value);
  const years = history.map(d => +d.date);
  const n     = vals.length;

  const xS = d3.scaleLinear().domain([0, n - 1]).range([0, iW]);
  const minVal = zeroBased ? 0 : Math.max(0, d3.min(vals) - (d3.max(vals) - d3.min(vals)) * 0.25);
  const yS = d3.scaleLinear()
    .domain([minVal, d3.max(vals)])
    .range([iH, 0])
    .nice();

  const line = d3.line()
    .x((_, i) => xS(i))
    .y(v => yS(v))
    .curve(d3.curveMonotoneX);

  const area = d3.area()
    .x((_, i) => xS(i))
    .y0(iH)
    .y1(v => yS(v))
    .curve(d3.curveMonotoneX);

  const svg = d3.create("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("width", "100%")
    .attr("class", "sparkline-svg")
    .style("overflow", "visible");

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  g.append("g")
    .call(
      d3.axisLeft(yS)
        .ticks(3)
        .tickSize(-iW)
        .tickFormat(v => yFmt(v))
    )
    .call(axis => {
      axis.select(".domain").remove();
      axis.selectAll(".tick line")
        .attr("stroke", "rgba(255,255,255,0.06)")
        .attr("stroke-dasharray", "2,2");
      axis.selectAll(".tick text")
        .attr("fill", "#6b7280")
        .attr("font-size", 8.5)
        .attr("font-family", "'DM Mono', monospace");
    });

  g.append("path").datum(vals)
    .attr("fill", color).attr("fill-opacity", 0.1).attr("d", area);

  g.append("path").datum(vals)
    .attr("fill", "none").attr("stroke", color).attr("stroke-width", 1.8).attr("d", line);

  g.append("circle")
    .attr("cx", xS(n - 1)).attr("cy", yS(vals[n - 1]))
    .attr("r", 3).attr("fill", color);

  [[0, "start"], [n - 1, "end"]].forEach(([i, anchor]) => {
    g.append("text")
      .attr("x", xS(i)).attr("y", iH + 14)
      .attr("text-anchor", anchor)
      .attr("font-size", 8.5).attr("fill", "#6b7280")
      .attr("font-family", "'DM Mono', monospace")
      .text(years[i]);
  });

  // Hover elements
  const hoverG = g.append("g").style("display", "none").attr("pointer-events", "none");
  const vLine  = hoverG.append("line")
    .attr("y1", 0).attr("y2", iH)
    .attr("stroke", "rgba(255,255,255,0.3)").attr("stroke-width", 1).attr("stroke-dasharray", "3,2");
  const hDot   = hoverG.append("circle")
    .attr("r", 4).attr("fill", color).attr("stroke", "#fff").attr("stroke-width", 1.5);
  const hBg    = hoverG.append("rect")
    .attr("rx", 3).attr("fill", "rgba(18,20,32,0.94)")
    .attr("stroke", "rgba(255,255,255,0.14)").attr("stroke-width", 0.5);
  const hText  = hoverG.append("text")
    .attr("font-size", 9).attr("font-family", "'DM Mono', monospace").attr("fill", "#f0f0f5");

  g.append("rect")
    .attr("width", iW).attr("height", iH)
    .attr("fill", "transparent").style("cursor", "crosshair")
    .on("mousemove", function(event) {
      const [mx] = d3.pointer(event);
      const idx  = Math.max(0, Math.min(n - 1, Math.round(xS.invert(mx))));
      const cx   = xS(idx), cy = yS(vals[idx]);

      hoverG.style("display", null);
      vLine.attr("x1", cx).attr("x2", cx);
      hDot.attr("cx", cx).attr("cy", cy);
      hText.text(`${years[idx]}: ${yFmt(vals[idx])}`);

      const bb  = hText.node().getBBox();
      const pad = 4;
      const bw  = bb.width + pad * 2, bh = bb.height + pad * 2;
      let bx    = cx + 8;
      if (bx + bw > iW) bx = cx - bw - 8;
      const by  = Math.max(0, Math.min(iH - bh, cy - bh / 2));

      hBg.attr("x", bx).attr("y", by).attr("width", bw).attr("height", bh);
      hText.attr("x", bx + pad).attr("y", by + bh - pad - 1);
    })
    .on("mouseleave", () => hoverG.style("display", "none"));

  container.appendChild(svg.node());
}

// ── Sector drill-down ─────────────────────────────────────────────────────────

const SECTOR_COLORS = { agriculture: "#10b981", industry: "#6366f1", services: "#f59e0b" };

function initSectorDrilldown(content, iso3) {
  function handleClick(sector) {
    const existing   = content.querySelector(`.sector-expand[data-for="${sector}"]`);
    const legendItem = content.querySelector(`.sector-legend-item[data-sector="${sector}"]`);

    if (existing) {
      existing.remove();
      legendItem?.classList.remove("expanded");
      return;
    }

    content.querySelectorAll(".sector-expand").forEach(el => el.remove());
    content.querySelectorAll(".sector-legend-item.expanded").forEach(el => el.classList.remove("expanded"));
    legendItem?.classList.add("expanded");

    const expand = document.createElement("div");
    expand.className  = "sector-expand";
    expand.dataset.for = sector;
    expand.innerHTML  = `<div class="detail-loading"><div class="mini-spinner"></div><span>Loading ${sector} detail…</span></div>`;
    content.querySelector(".sector-legend")?.after(expand);

    fetchSectorDetail(iso3, sector)
      .then(fetched => {
        expand.innerHTML = buildSectorExpansion(sector, fetched);
        if (fetched.history?.length > 1) {
          const wrap = expand.querySelector(".sector-history-wrap");
          if (wrap) buildSparkline(wrap, fetched.history, SECTOR_COLORS[sector], {
            formatY: v => `${v.toFixed(1)}%`,
          });
        }
      })
      .catch(() => {
        expand.innerHTML = `<div class="sub-section"><div class="detail-na">Detail data unavailable</div></div>`;
      });
  }

  content.querySelectorAll(".sector-legend-item, .sector-seg[data-sector]").forEach(el => {
    el.addEventListener("click", () => handleClick(el.dataset.sector));
  });
}

function buildSectorExpansion(sector, fetched) {
  const SECTOR_META = {
    agriculture: { title: "% of GDP · 2013–2023", suppLabel: "Agricultural employment", suppKey: "empl" },
    industry:    { title: "% of GDP · 2013–2023", suppLabel: "Manufacturing (% of GDP)", suppKey: "mfg"  },
    services:    { title: "% of GDP · 2013–2023", suppLabel: "Services employment",      suppKey: "empl" },
  };
  const meta      = SECTOR_META[sector];
  const suppValue = fetched[meta.suppKey];
  const suppYear  = fetched[`${meta.suppKey}Year`];
  const hasHist   = fetched.history?.length > 1;

  if (!hasHist && suppValue == null) {
    return `<div class="sub-section"><div class="detail-na">Trend data not available</div></div>`;
  }

  return `<div class="sub-section">
    ${hasHist ? `
    <div class="sub-title">${meta.title}</div>
    <div class="sector-history-wrap"></div>` : ""}
    ${suppValue != null ? `<div class="sub-stat">${meta.suppLabel}: <strong>${suppValue.toFixed(1)}%</strong>${suppYear ? ` <span style="color:var(--ink-faint);font-size:0.85em">(${suppYear})</span>` : ""}</div>` : ""}
    <div class="sub-note">OEC · World Development Indicators</div>
  </div>`;
}

// ── Trade interactivity ───────────────────────────────────────────────────────

function initTradeInteractivity(content, homeCountry, panel) {
  content.querySelectorAll(".partner-bar[data-oec]").forEach(el => {
    el.addEventListener("click", () => {
      const oecCode = el.dataset.oec;
      if (!oecCode) return;
      showBilateralView(panel, homeCountry, el.dataset.name, oecCode);
    });
  });

  const input    = content.querySelector(".trade-search-input");
  const dropdown = content.querySelector(".trade-search-dropdown");
  if (!input || !dropdown) return;

  let filtered = [], activeIdx = -1;

  function renderDropdown(matches) {
    filtered = matches; activeIdx = -1;
    if (!matches.length) { dropdown.innerHTML = ""; dropdown.classList.add("hidden"); return; }
    dropdown.innerHTML = matches.map((c, i) =>
      `<li class="ts-item" data-idx="${i}" role="option">${c.flag ? `${c.flag} ` : ""}${c.name}</li>`
    ).join("");
    dropdown.classList.remove("hidden");
  }

  function setActive(idx) {
    activeIdx = idx;
    dropdown.querySelectorAll(".ts-item").forEach((li, i) => li.classList.toggle("active", i === activeIdx));
  }

  function pick(partner) {
    const oecCode = isoToOEC(partner.iso3);
    if (!oecCode) return;
    input.value = ""; renderDropdown([]);
    showBilateralView(panel, homeCountry, partner.name, oecCode);
  }

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { renderDropdown([]); return; }
    renderDropdown(_countryList.filter(c => c.iso3 !== homeCountry.iso3 && c.name.toLowerCase().includes(q)).slice(0, 8));
  });

  input.addEventListener("keydown", e => {
    if (!filtered.length) return;
    if (e.key === "ArrowDown")                    { e.preventDefault(); setActive(Math.min(activeIdx + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp")                 { e.preventDefault(); setActive(Math.max(activeIdx - 1, 0)); }
    else if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); pick(filtered[activeIdx]); }
    else if (e.key === "Escape")                  { renderDropdown([]); }
  });

  dropdown.addEventListener("mousedown", e => {
    const li = e.target.closest(".ts-item");
    if (!li) return;
    e.preventDefault();
    pick(filtered[parseInt(li.dataset.idx, 10)]);
  });

  input.addEventListener("blur", () => setTimeout(() => renderDropdown([]), 150));
}

// ── Bilateral trade view ──────────────────────────────────────────────────────

const _MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function _fmtMonth(yyyymm) {
  if (!yyyymm || yyyymm.length < 6) return null;
  const m = parseInt(yyyymm.slice(4, 6), 10);
  const y = yyyymm.slice(0, 4);
  return `${_MONTH_NAMES[m - 1] ?? ""} ${y}`;
}

function showBilateralView(panel, homeCountry, partnerName, partnerOecCode) {
  const content = panel.querySelector("#detail-content");

  // Derive partner flag from the OEC code (last 3 chars = ISO3)
  const partnerIso3  = partnerOecCode.slice(2).toUpperCase();
  const partnerIso2  = _countryList.find(c => c.iso3 === partnerIso3)?.iso2 ?? "";
  const homeFlag     = flagEmoji(homeCountry.iso2);
  const partnerFlag  = flagEmoji(partnerIso2);

  content.innerHTML = `
    <button class="bilateral-back">← ${homeCountry.name}</button>
    <div class="bilateral-header">
      <div class="bilateral-countries">${homeFlag} ${homeCountry.name} ↔ ${partnerFlag} ${partnerName}</div>
      <div class="bilateral-subtitle">Merchandise trade · BACI</div>
    </div>
    <div class="bilateral-loading"><div class="mini-spinner"></div><span>Loading trade history…</span></div>`;

  content.querySelector(".bilateral-back").addEventListener("click", () => {
    if (_lastPanelState) {
      const { panel: p, country, detail, partners, goods } = _lastPanelState;
      renderDetailPanel(p, country, detail, partners, goods);
    }
  });

  Promise.all([
    fetchBilateralHistoryComtrade(homeCountry.iso3, partnerIso3)
      .then(r => r ?? fetchBilateralHistoryOTS(homeCountry.iso3, partnerIso3)),
    fetchBilateralGoods(homeCountry.iso3, partnerOecCode),
  ]).then(([histData, goodsData]) => {
      const loadEl = content.querySelector(".bilateral-loading");
      if (!loadEl) return;

      if (!histData && !goodsData) {
        loadEl.outerHTML = `<div class="detail-na">No bilateral trade data available</div>`;
        return;
      }

      const allDates  = [...(histData?.exports ?? []), ...(histData?.imports ?? [])].map(d => +d.date);
      const yearRange = allDates.length ? `${Math.min(...allDates)}–${Math.max(...allDates)}` : null;
      const throughStr = histData?.lastPeriod ? ` · through ${_fmtMonth(histData.lastPeriod)}` : "";
      const subtitleEl = content.querySelector(".bilateral-subtitle");
      if (subtitleEl && yearRange) {
        subtitleEl.textContent = `Merchandise trade · ${yearRange}${throughStr} · UN Comtrade`;
      }

      const latestExp = histData?.exports?.[histData.exports.length - 1];
      const latestImp = histData?.imports?.[histData.imports.length - 1];
      const balance   = (latestExp?.value ?? 0) - (latestImp?.value ?? 0);
      const goodsYear = goodsData?.year ?? "";

      const expGoodsHtml = goodsData?.exports?.length
        ? `<div class="sub-bars">${goodsData.exports.map(g => subBar(g.name, g.share, "#10b981")).join("")}</div>`
        : `<div class="detail-na">No data available</div>`;
      const impGoodsHtml = goodsData?.imports?.length
        ? `<div class="sub-bars">${goodsData.imports.map(g => subBar(g.name, g.share, "#f59e0b")).join("")}</div>`
        : `<div class="detail-na">No data available</div>`;

      loadEl.outerHTML = `
        <div class="bilateral-stats">
          ${latestExp ? `<div class="bilateral-stat">
            <div class="bstat-label">Exports to ${partnerName}</div>
            <div class="bstat-value" style="color:#10b981">${formatTrillions(latestExp.value)}</div>
            <div class="bstat-year">${latestExp.date}</div>
          </div>` : ""}
          ${latestImp ? `<div class="bilateral-stat">
            <div class="bstat-label">Imports from ${partnerName}</div>
            <div class="bstat-value" style="color:#f59e0b">${formatTrillions(latestImp.value)}</div>
            <div class="bstat-year">${latestImp.date}</div>
          </div>` : ""}
          ${latestExp && latestImp ? `<div class="bilateral-stat">
            <div class="bstat-label">Trade balance</div>
            <div class="bstat-value" style="color:${balance >= 0 ? "#10b981" : "#ef4444"}">${balance >= 0 ? "+" : ""}${formatTrillions(balance)}</div>
            <div class="bstat-year">latest year</div>
          </div>` : ""}
        </div>
        ${histData?.exports?.length || histData?.imports?.length ? `
        <div class="bilateral-legend">
          <span class="bl-item"><span class="bl-dot" style="background:#10b981"></span>Exports to ${partnerName}</span>
          <span class="bl-item"><span class="bl-dot" style="background:#f59e0b"></span>Imports from ${partnerName}</span>
        </div>
        <div class="bilateral-chart"></div>` : ""}
        ${goodsData ? `
        <details class="trade-accordion">
          <summary class="trade-accordion-summary">
            <span class="ta-dot" style="background:#10b981"></span>
            <span class="ta-label">Top Export Items${goodsYear ? ` · ${goodsYear}` : ""} · % of bilateral exports</span>
            <span class="ta-chevron">›</span>
          </summary>
          <div class="trade-accordion-body">${expGoodsHtml}</div>
        </details>
        <details class="trade-accordion">
          <summary class="trade-accordion-summary">
            <span class="ta-dot" style="background:#f59e0b"></span>
            <span class="ta-label">Top Import Items${goodsYear ? ` · ${goodsYear}` : ""} · % of bilateral imports</span>
            <span class="ta-chevron">›</span>
          </summary>
          <div class="trade-accordion-body">${impGoodsHtml}</div>
        </details>` : ""}
        <div class="sub-note" style="margin-top:0.5rem">Trade history: UN Comtrade &nbsp;·&nbsp; Goods breakdown: OEC · BACI</div>`;

      const chartEl = content.querySelector(".bilateral-chart");
      if (chartEl && histData) buildBilateralSparkline(chartEl, histData);
    })
    .catch(() => {
      const loadEl = content.querySelector(".bilateral-loading");
      if (loadEl) loadEl.outerHTML = `<div class="detail-na">Failed to load bilateral trade data</div>`;
    });
}

function buildBilateralSparkline(container, data) {
  if (!container) return;

  const expMap   = new Map(data.exports.map(d => [+d.date, d.value]));
  const impMap   = new Map(data.imports.map(d => [+d.date, d.value]));
  const allYears = [...new Set([...data.exports.map(d => +d.date), ...data.imports.map(d => +d.date)])].sort((a, b) => a - b);
  const n = allYears.length;
  if (!n) return;

  const expSeries = allYears.map(y => expMap.get(y) ?? null);
  const impSeries = allYears.map(y => impMap.get(y) ?? null);
  const allVals   = [...expSeries, ...impSeries].filter(v => v != null);

  const margin = { top: 8, right: 8, bottom: 18, left: 54 };
  const W = 280, H = 110;
  const iW = W - margin.left - margin.right;
  const iH = H - margin.top - margin.bottom;

  const xS = d3.scaleLinear().domain([0, n - 1]).range([0, iW]);
  const yS = d3.scaleLinear().domain([0, d3.max(allVals) ?? 1]).range([iH, 0]).nice();

  const lineFn = series =>
    d3.line().defined(v => v != null).x((_, i) => xS(i)).y(v => yS(v)).curve(d3.curveMonotoneX)(series);
  const areaFn = series =>
    d3.area().defined(v => v != null).x((_, i) => xS(i)).y0(iH).y1(v => yS(v)).curve(d3.curveMonotoneX)(series);

  const svg = d3.create("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("width", "100%")
    .attr("class", "sparkline-svg")
    .style("overflow", "visible");

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  g.append("g")
    .call(d3.axisLeft(yS).ticks(3).tickSize(-iW).tickFormat(formatCompact))
    .call(ax => {
      ax.select(".domain").remove();
      ax.selectAll(".tick line").attr("stroke", "rgba(255,255,255,0.06)").attr("stroke-dasharray", "2,2");
      ax.selectAll(".tick text").attr("fill", "#6b7280").attr("font-size", 8.5).attr("font-family", "'DM Mono', monospace");
    });

  const drawSeries = (series, color) => {
    if (!series.some(v => v != null)) return;
    g.append("path").attr("fill", color).attr("fill-opacity", 0.08).attr("d", areaFn(series));
    g.append("path").attr("fill", "none").attr("stroke", color).attr("stroke-width", 1.8).attr("d", lineFn(series));
    const lastIdx = series.length - 1 - [...series].reverse().findIndex(v => v != null);
    g.append("circle").attr("cx", xS(lastIdx)).attr("cy", yS(series[lastIdx])).attr("r", 3).attr("fill", color);
  };

  drawSeries(expSeries, "#10b981");
  drawSeries(impSeries, "#f59e0b");

  [[0, "start"], [n - 1, "end"]].forEach(([i, anchor]) => {
    g.append("text")
      .attr("x", xS(i)).attr("y", iH + 14)
      .attr("text-anchor", anchor)
      .attr("font-size", 8.5).attr("fill", "#6b7280")
      .attr("font-family", "'DM Mono', monospace")
      .text(allYears[i]);
  });

  // ── Hover overlay ────────────────────────────────────────────────────────────
  const hoverG  = g.append("g").style("display", "none").attr("pointer-events", "none");
  const vLine   = hoverG.append("line")
    .attr("y1", 0).attr("y2", iH)
    .attr("stroke", "rgba(255,255,255,0.3)").attr("stroke-width", 1).attr("stroke-dasharray", "3,2");
  const hDotExp = hoverG.append("circle").attr("r", 4).attr("fill", "#10b981").attr("stroke", "#fff").attr("stroke-width", 1.5);
  const hDotImp = hoverG.append("circle").attr("r", 4).attr("fill", "#f59e0b").attr("stroke", "#fff").attr("stroke-width", 1.5);
  const hBg     = hoverG.append("rect").attr("rx", 3).attr("fill", "rgba(18,20,32,0.94)").attr("stroke", "rgba(255,255,255,0.14)").attr("stroke-width", 0.5);
  const hTYear  = hoverG.append("text").attr("font-size", 8.5).attr("font-family", "'DM Mono', monospace").attr("fill", "#6b7280");
  const hTExp   = hoverG.append("text").attr("font-size", 9).attr("font-family", "'DM Mono', monospace").attr("fill", "#10b981");
  const hTImp   = hoverG.append("text").attr("font-size", 9).attr("font-family", "'DM Mono', monospace").attr("fill", "#f59e0b");

  g.append("rect")
    .attr("width", iW).attr("height", iH)
    .attr("fill", "transparent").style("cursor", "crosshair")
    .on("mousemove", function(event) {
      const [mx] = d3.pointer(event);
      const idx  = Math.max(0, Math.min(n - 1, Math.round(xS.invert(mx))));
      const cx   = xS(idx);
      const expV = expSeries[idx];
      const impV = impSeries[idx];

      hoverG.style("display", null);
      vLine.attr("x1", cx).attr("x2", cx);

      expV != null ? hDotExp.style("display", null).attr("cx", cx).attr("cy", yS(expV)) : hDotExp.style("display", "none");
      impV != null ? hDotImp.style("display", null).attr("cx", cx).attr("cy", yS(impV)) : hDotImp.style("display", "none");

      const lineH = 11, pad = 4;
      // Position at origin to measure, then reposition
      hTYear.attr("x", 0).attr("y", lineH).text(String(allYears[idx]));
      hTExp.attr("x", 0).attr("y", lineH * 2).text(expV != null ? `↑ ${formatCompact(expV)}` : "↑ —");
      hTImp.attr("x", 0).attr("y", lineH * 3).text(impV != null ? `↓ ${formatCompact(impV)}` : "↓ —");

      const bw  = Math.max(hTYear.node().getBBox().width, hTExp.node().getBBox().width, hTImp.node().getBBox().width) + pad * 2;
      const bh  = lineH * 3 + pad * 2;
      let bx    = cx + 8;
      if (bx + bw > iW) bx = cx - bw - 8;
      const refY = expV != null ? yS(expV) : impV != null ? yS(impV) : iH / 2;
      const by   = Math.max(0, Math.min(iH - bh, refY - bh / 2));

      hBg.attr("x", bx).attr("y", by).attr("width", bw).attr("height", bh);
      hTYear.attr("x", bx + pad).attr("y", by + pad + lineH - 2);
      hTExp.attr("x", bx + pad).attr("y", by + pad + lineH * 2 - 2);
      hTImp.attr("x", bx + pad).attr("y", by + pad + lineH * 3 - 2);
    })
    .on("mouseleave", () => hoverG.style("display", "none"));

  container.appendChild(svg.node());
}

// ── Bar helpers ───────────────────────────────────────────────────────────────

function partnerSubBar(partner, color) {
  const w = Math.max(0, Math.min(100, partner.share));
  return `<div class="sub-bar-row partner-bar" data-oec="${partner.oecCode ?? ""}" data-name="${partner.name}">
    <div class="sub-bar-name">${partner.name}</div>
    <div class="sub-bar-track"><div class="sub-bar-fill" style="width:${w.toFixed(1)}%;background:${color}"></div></div>
    <div class="sub-bar-pct">${partner.share.toFixed(1)}%</div>
  </div>`;
}

function subBar(name, pct, color) {
  const w = Math.max(0, Math.min(100, pct));
  return `<div class="sub-bar-row">
    <div class="sub-bar-name">${name}</div>
    <div class="sub-bar-track"><div class="sub-bar-fill" style="width:${w.toFixed(1)}%;background:${color}"></div></div>
    <div class="sub-bar-pct">${pct.toFixed(1)}%</div>
  </div>`;
}

function fmtPop(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  return `${(n / 1e3).toFixed(0)}K`;
}

