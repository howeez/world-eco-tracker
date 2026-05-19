/**
 * renderer.js
 * Voronoi Treemap — two-level navigation:
 *   World view     → click any cell → enter that continent's treemap
 *   Continent view → click a cell  → show country detail panel
 *   Back button / bg click → return to world view
 *
 * Labels are zoom-adaptive: small cells gain labels once they're large enough on screen.
 */

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { voronoiTreemap } from "https://esm.sh/d3-voronoi-treemap@1.1.2";
import { formatCompact, formatTrillions } from "./worldbank.js";

const VB_W   = 960;
const VB_H   = 720;
const CX     = VB_W / 2;
const CY     = VB_H / 2;
const RADIUS = Math.min(VB_W, VB_H) / 2 - 18;

// A label becomes visible when its apparent area on screen reaches this threshold (px²)
const LABEL_SHOW_AREA = 1400;

function circleClip(n = 128) {
  return d3.range(n).map(i => {
    const a = (i / n) * 2 * Math.PI;
    return [CX + RADIUS * Math.cos(a), CY + RADIUS * Math.sin(a)];
  });
}

function makeVT() {
  return voronoiTreemap()
    .clip(circleClip())
    .convergenceRatio(0.01)
    .maxIterationCount(50)
    .minWeightRatio(0.001);
}

// ── BubbleRenderer ─────────────────────────────────────────────────────────────

export class BubbleRenderer {
  constructor(svgEl, opts = {}) {
    this.svgEl          = svgEl;
    this.onCountryClick = opts.onCountryClick ?? (() => {});
    this.onZoomIn       = opts.onZoomIn       ?? (() => {});
    this.onZoomOut      = opts.onZoomOut      ?? (() => {});
    this.onComputeStart = opts.onComputeStart ?? (() => {});
    this.onComputeEnd   = opts.onComputeEnd   ?? (() => {});

    this._tooltip     = document.getElementById("tooltip");
    this._worldRoot   = null;
    this._contCache   = new Map();   // continentName → precomputed D3 root
    this._currentView = "world";
    this._zoom        = null;

    this.svg = d3.select(svgEl)
      .attr("viewBox", `0 0 ${VB_W} ${VB_H}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    // Clip to the master circle — no ghost ring, just a hard edge
    this.svg.append("defs")
      .append("clipPath").attr("id", "outer-clip")
      .append("circle").attr("cx", CX).attr("cy", CY).attr("r", RADIUS);

    this.g = this.svg.append("g").attr("clip-path", "url(#outer-clip)");
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  async render(data) {
    this._data = data;

    const hierarchyData = {
      name: "World",
      children: data.continents.map(c => ({
        name:     c.name,
        color:    c.color,
        totalGDP: c.totalGDP,
        children: c.countries.map(co => ({
          name:      co.name,
          iso2:      co.iso2,
          iso3:      co.iso3,
          continent: c.name,
          color:     c.color,
          gdp:       co.gdp,
        })),
      })),
    };

    const root = d3.hierarchy(hierarchyData)
      .sum(d => d.gdp ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    this.onComputeStart();
    await new Promise(r => setTimeout(r, 50));

    makeVT()(root);

    this._worldRoot = root;
    this.onComputeEnd();

    this._setupZoom();
    this._buildCells(root, "world");

    // Pre-compute continent treemaps in background, one per event-loop tick
    setTimeout(() => this._precompute(), 300);
  }

  /** Called from legend chip click. */
  zoomToContinent(name) {
    this._enterContinent(name);
  }

  /** Called from back button. */
  resetToWorld() {
    this._enterWorld();
  }

  resize() { /* CSS aspect-ratio handles scaling */ }

  // ─── View transitions ────────────────────────────────────────────────────────

  _enterContinent(name) {
    let root = this._contCache.get(name);

    if (!root) {
      const node = this._worldRoot?.children?.find(c => c.data.name === name);
      if (!node) return;

      root = d3.hierarchy({ name: node.data.name, color: node.data.color, children: node.data.children })
        .sum(d => d.gdp ?? 0)
        .sort((a, b) => b.value - a.value);

      makeVT()(root);
      this._contCache.set(name, root);
    }

    this._currentView = "continent";
    this.svg.call(this._zoom.transform, d3.zoomIdentity);
    this._buildCells(root, "continent");
    this.onZoomIn(name);
  }

  _enterWorld() {
    if (!this._worldRoot) return;
    this._currentView = "world";
    this.svg.call(this._zoom.transform, d3.zoomIdentity);
    this._buildCells(this._worldRoot, "world");
    this.onZoomOut();
  }

  /** Silently pre-compute all continent treemaps after initial render. */
  async _precompute() {
    for (const c of (this._worldRoot?.children ?? [])) {
      if (this._contCache.has(c.data.name)) continue;
      await new Promise(r => setTimeout(r, 0));  // yield to browser between each

      const root = d3.hierarchy({ name: c.data.name, color: c.data.color, children: c.data.children })
        .sum(d => d.gdp ?? 0)
        .sort((a, b) => b.value - a.value);

      makeVT()(root);
      this._contCache.set(c.data.name, root);
    }
  }

  // ─── Cell rendering ──────────────────────────────────────────────────────────

  _buildCells(root, viewType) {
    this.g.selectAll("*").remove();

    const isWorld = viewType === "world";
    const leaves  = root.leaves();

    // Dark background fill for the circle
    this.g.append("circle")
      .attr("cx", CX).attr("cy", CY).attr("r", RADIUS + 2)
      .attr("fill", "#0a0c14");

    // ── Country cells ──────────────────────────────────────────────────────────
    this.g.append("g").attr("class", "countries")
      .selectAll("path")
      .data(leaves)
      .join("path")
      .attr("d", d => d.polygon ? `M${d.polygon.join("L")}Z` : "")
      .attr("fill", d => isWorld ? d.parent.data.color : root.data.color)
      .attr("fill-opacity", 0.68)
      .attr("stroke", "#000")
      .attr("stroke-opacity", 0.35)
      .attr("stroke-width", isWorld ? 0.6 : 0.8)
      .style("cursor", "pointer")
      .on("mouseenter", (event, d) => {
        d3.select(event.currentTarget)
          .attr("fill-opacity", 0.96)
          .attr("stroke", "#fff")
          .attr("stroke-opacity", 0.5)
          .attr("stroke-width", 1.4);
        this._showTooltip(event, d, isWorld);
      })
      .on("mousemove", e => this._moveTooltip(e))
      .on("mouseleave", event => {
        d3.select(event.currentTarget)
          .attr("fill-opacity", 0.68)
          .attr("stroke", "#000")
          .attr("stroke-opacity", 0.35)
          .attr("stroke-width", isWorld ? 0.6 : 0.8);
        this._hideTooltip();
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        if (isWorld) {
          this._enterContinent(d.parent.data.name);
        } else {
          this.onCountryClick(d.data);
        }
      });

    // ── Continent outlines (world view only) ───────────────────────────────────
    if (isWorld) {
      this.g.append("g").attr("class", "cont-outlines")
        .attr("pointer-events", "none")
        .selectAll("path")
        .data(root.children ?? [])
        .join("path")
        .attr("d", d => d.polygon ? `M${d.polygon.join("L")}Z` : "")
        .attr("fill", "none")
        .attr("stroke", "rgba(255,255,255,0.55)")
        .attr("stroke-width", 2.5)
        .attr("stroke-linejoin", "round");
    }

    // ── Labels ─────────────────────────────────────────────────────────────────
    const labelG = this.g.append("g").attr("class", "labels").attr("pointer-events", "none");

    leaves.forEach(d => {
      if (!d.polygon) return;
      const area = Math.abs(d3.polygonArea(d.polygon));
      if (area < (isWorld ? 400 : 120)) return;   // skip cells too tiny to ever label

      const [lx, ly]  = d3.polygonCentroid(d.polygon);
      const fs        = isWorld
        ? Math.min(Math.max(Math.sqrt(area) * 0.062, 6.5), 15)
        : Math.min(Math.max(Math.sqrt(area) * 0.065, 7.5), 18);
      const showGDP   = area > (isWorld ? 5500 : 2500);
      const initOp    = area >= LABEL_SHOW_AREA ? 1 : 0;

      const cell = labelG.append("g")
        .attr("class", "cell-label")
        .attr("transform", `translate(${lx},${ly})`)
        .attr("data-area", area)
        .style("opacity", initOp);

      if (showGDP) {
        cell.append("text")
          .attr("text-anchor", "middle").attr("dy", "-0.45em")
          .attr("font-size", fs).attr("font-family", "'DM Mono', monospace")
          .attr("font-weight", "500").attr("fill", "rgba(255,255,255,0.92)")
          .text(d.data.name);
        cell.append("text")
          .attr("text-anchor", "middle").attr("dy", "0.85em")
          .attr("font-size", fs * 0.8).attr("font-family", "'Playfair Display', serif")
          .attr("fill", "rgba(255,255,255,0.62)")
          .text(formatCompact(d.data.gdp));
      } else {
        cell.append("text")
          .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
          .attr("font-size", fs).attr("font-family", "'DM Mono', monospace")
          .attr("font-weight", "500").attr("fill", "rgba(255,255,255,0.88)")
          .text(d.data.name);
      }
    });
  }

  // ─── Zoom / Pan ──────────────────────────────────────────────────────────────

  _setupZoom() {
    this._zoom = d3.zoom()
      .scaleExtent([0.55, 24])
      .on("zoom", ({ transform }) => {
        this.g.attr("transform", transform);
        this._updateLabels(transform.k);
      });

    this.svg.call(this._zoom).on("dblclick.zoom", null);

    // Clicking the bare SVG background (outside the circle) resets to world
    let _downPos = null;
    this.svg
      .on("pointerdown.bgNav", e => {
        _downPos = e.target === this.svgEl ? [e.clientX, e.clientY] : null;
      })
      .on("pointerup.bgNav", e => {
        if (!_downPos) return;
        const dx = e.clientX - _downPos[0], dy = e.clientY - _downPos[1];
        _downPos = null;
        if (dx * dx + dy * dy < 36 && this._currentView === "continent") {
          this._enterWorld();
        }
      });
  }

  /** Show/hide labels based on apparent size after zoom. */
  _updateLabels(k) {
    this.g.selectAll(".cell-label").style("opacity", function() {
      const area = +(this.getAttribute("data-area") ?? 0);
      // Apparent area scales as k² — show once it clears the threshold
      return area * k * k >= LABEL_SHOW_AREA ? 1 : 0;
    });
  }

  // ─── Tooltip ─────────────────────────────────────────────────────────────────

  _showTooltip(event, d, isWorld) {
    if (!this._tooltip) return;
    const contName  = isWorld ? d.parent.data.name : d.parent.data.name ?? d.data.continent;
    const contColor = isWorld ? d.parent.data.color : d.parent.data.color ?? d.data.color;
    this._tooltip.innerHTML = isWorld
      ? `<div class="tt-region" style="color:${contColor}">${contName}</div>
         <div class="tt-name">${d.data.name}</div>
         <div class="tt-gdp">${formatTrillions(d.data.gdp)}</div>
         <div class="tt-note">Click to explore ${contName}</div>`
      : `<div class="tt-region" style="color:${contColor}">${contName}</div>
         <div class="tt-name">${d.data.name}</div>
         <div class="tt-gdp">${formatTrillions(d.data.gdp)}</div>
         <div class="tt-note">Real GDP (constant 2015 USD) · click for breakdown</div>`;
    this._tooltip.style.display = "block";
    this._moveTooltip(event);
  }

  _moveTooltip(event) {
    if (!this._tooltip) return;
    this._tooltip.style.left = `${Math.min(event.clientX + 16, window.innerWidth  - 244)}px`;
    this._tooltip.style.top  = `${Math.max(event.clientY - 12, 8)}px`;
  }

  _hideTooltip() {
    if (this._tooltip) this._tooltip.style.display = "none";
  }
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

export function renderDetailPanel(panel, country, detail) {
  const { name, iso2, gdp, continent, color } = country;

  const flag      = flagEmoji(iso2);
  const sectors   = detail ? buildSectorBars(detail.agriculture, detail.industry, detail.services) : null;
  const growth    = detail?.gdpGrowth;
  const growthStr = growth != null ? `${growth > 0 ? "+" : ""}${growth.toFixed(2)}%` : "N/A";
  const growthClr = growth == null ? "#888" : growth >= 0 ? "#10b981" : "#ef4444";
  const arrow     = growth == null ? "" : growth >= 0 ? "▲ " : "▼ ";
  const sparkSvg  = detail?.history?.length > 1 ? buildSparkline(detail.history, color) : "";

  panel.querySelector("#detail-content").innerHTML = `
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

    ${sectors ? `
    <div class="detail-section">
      <div class="section-title">GDP by Sector</div>
      <div class="sector-bars">
        ${sectors.map(s => `
          <div class="sector-row">
            <div class="sector-name">${s.name}</div>
            <div class="sector-track">
              <div class="sector-fill" style="width:${s.pct.toFixed(1)}%;background:${s.color}"></div>
            </div>
            <div class="sector-pct">${s.pct.toFixed(1)}%</div>
          </div>`).join("")}
      </div>
    </div>` : detail === null
      ? `<div class="detail-loading"><div class="mini-spinner"></div><span>Loading breakdown…</span></div>`
      : `<div class="detail-na">Sector data unavailable</div>`}

    ${sparkSvg ? `
    <div class="detail-section">
      <div class="section-title">GDP History</div>
      <div class="sparkline-wrap">${sparkSvg}</div>
    </div>` : ""}

    <div class="detail-source">
      World Bank · NY.GDP.MKTP.KD (constant 2015 USD)
    </div>`;
}

function buildSectorBars(agr, ind, srv) {
  if (agr == null || ind == null || srv == null) return null;
  const tot = agr + ind + srv;
  if (tot <= 0) return null;
  return [
    { name: "Agriculture", pct: (agr / tot) * 100, color: "#10b981" },
    { name: "Industry",    pct: (ind / tot) * 100, color: "#6366f1" },
    { name: "Services",    pct: (srv / tot) * 100, color: "#f59e0b" },
  ];
}

function buildSparkline(history, color) {
  const W = 260, H = 56;
  const vals  = history.map(d => d.value);
  const years = history.map(d => +d.date);
  const minV  = Math.min(...vals), maxV = Math.max(...vals);
  const xS    = i => (i / (vals.length - 1)) * W;
  const yS    = v => H - ((v - minV) / (maxV - minV || 1)) * H;
  const pts   = vals.map((v, i) => `${xS(i)},${yS(v)}`).join(" ");
  return `<svg class="sparkline-svg" viewBox="0 0 ${W} ${H + 14}" width="${W}" height="${H + 14}">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="${xS(vals.length - 1)}" cy="${yS(vals[vals.length - 1])}" r="3" fill="${color}"/>
    <text x="0"   y="${H + 12}" font-size="9" fill="#666">${years[0]}</text>
    <text x="${W}" y="${H + 12}" font-size="9" fill="#666" text-anchor="end">${years[years.length - 1]}</text>
  </svg>`;
}

function fmtPop(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  return `${(n / 1e3).toFixed(0)}K`;
}

function flagEmoji(iso2) {
  if (!iso2 || iso2.length !== 2) return "🌐";
  const base = 0x1F1E6, code = iso2.toUpperCase();
  return String.fromCodePoint(base + code.charCodeAt(0) - 65) +
         String.fromCodePoint(base + code.charCodeAt(1) - 65);
}

export function renderLegend(container, continents, worldTotal, year) {
  container.innerHTML = "";
  for (const c of continents) {
    const pct  = ((c.totalGDP / worldTotal) * 100).toFixed(1);
    const chip = document.createElement("button");
    chip.className = "legend-chip";
    chip.style.setProperty("--chip-color", c.color);
    chip.dataset.continent = c.name;
    chip.innerHTML = `<span class="chip-name">${c.name}</span>
                      <span class="chip-gdp">${formatTrillions(c.totalGDP)}</span>
                      <span class="chip-pct">${pct}%</span>`;
    container.appendChild(chip);
  }
  const total = document.createElement("div");
  total.className = "legend-total";
  total.innerHTML = `<span>World</span><strong>${formatTrillions(worldTotal)}</strong><span>${year}</span>`;
  container.appendChild(total);
}
