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
} from "./worldbank.js";

// ── Public API ─────────────────────────────────────────────────────────────────

export function renderDetailPanel(panel, country, detail, partners, goods = null) {
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
}

// ── Trade section ─────────────────────────────────────────────────────────────

function buildTradeSection(detail, partners, goods) {
  const hasAgg = detail?.exports != null || detail?.imports != null;
  if (!hasAgg && partners === null && goods === null) return "";

  const balance   = (detail?.exports ?? 0) - (detail?.imports ?? 0);
  const tradeYear = detail?.exportsYear ?? "";
  const isLoading = partners === null && goods === null;

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

    ${isLoading ? `
    <div class="detail-loading"><div class="mini-spinner"></div><span>Loading trade data…</span></div>` : ""}

    ${goods?.topExportGoods?.length ? `
    <div class="sub-title" style="margin-top:10px">Export Composition · ${goods.year ?? ""} · % of exports</div>
    <div class="sub-bars">${goods.topExportGoods.map(p => subBar(p.name, p.share, "#10b981")).join("")}</div>` : ""}

    ${partners?.topExports?.length ? `
    <div class="sub-title" style="margin-top:10px">Top Export Destinations · ${partners.year ?? ""}</div>
    <div class="sub-bars">${partners.topExports.map(p => subBar(p.name, p.share, "#10b981")).join("")}</div>` : ""}

    ${goods?.topImportGoods?.length ? `
    <div class="sub-title" style="margin-top:10px">Import Composition · ${goods.year ?? ""} · % of imports</div>
    <div class="sub-bars">${goods.topImportGoods.map(p => subBar(p.name, p.share, "#f59e0b")).join("")}</div>` : ""}

    ${partners?.topImports?.length ? `
    <div class="sub-title" style="margin-top:10px">Top Import Sources · ${partners.year ?? ""}</div>
    <div class="sub-bars">${partners.topImports.map(p => subBar(p.name, p.share, "#f59e0b")).join("")}</div>` : ""}

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
            zeroBased: false,
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

// ── Bar helpers ───────────────────────────────────────────────────────────────

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
