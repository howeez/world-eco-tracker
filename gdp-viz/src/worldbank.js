/**
 * worldbank.js
 * Fetches GDP data from the World Bank API.
 * Indicators used:
 *   NY.GDP.MKTP.KD  — GDP (constant 2015 USD)
 *   NY.GDP.PCAP.KD  — GDP per capita (constant 2015 USD)
 *   NY.GDP.MKTP.KD.ZG — GDP growth (annual %)
 *   NV.AGR.TOTL.ZS  — Agriculture, value added (% of GDP)
 *   NV.IND.TOTL.ZS  — Industry, value added (% of GDP)
 *   NV.SRV.TOTL.ZS  — Services, value added (% of GDP)
 *   SP.POP.TOTL     — Population, total
 */

const WB_BASE = "https://api.worldbank.org/v2";
const GDP_INDICATOR = "NY.GDP.MKTP.KD";

// ── Cache ─────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function _cacheGet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}

function _cacheSet(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch { /* quota exceeded or private mode — silently skip */ }
}

export const CONTINENT_COLORS = {
  "Asia":          "#06b6d4",
  "Europe":        "#6366f1",
  "North America": "#ef4444",
  "South America": "#f59e0b",
  "Africa":        "#a855f7",
  "Middle East":   "#10b981",
  "Oceania":       "#f97316",
};

// ISO3 → Continent, covering ~190 economies
export const CONTINENT_MAP = {
  // Africa
  "DZA":"Africa","AGO":"Africa","BEN":"Africa","BWA":"Africa","BFA":"Africa",
  "BDI":"Africa","CMR":"Africa","CPV":"Africa","CAF":"Africa","TCD":"Africa",
  "COM":"Africa","COD":"Africa","COG":"Africa","CIV":"Africa","DJI":"Africa",
  "EGY":"Africa","GNQ":"Africa","ERI":"Africa","ETH":"Africa","GAB":"Africa",
  "GMB":"Africa","GHA":"Africa","GIN":"Africa","GNB":"Africa","KEN":"Africa",
  "LSO":"Africa","LBR":"Africa","LBY":"Africa","MDG":"Africa","MWI":"Africa",
  "MLI":"Africa","MRT":"Africa","MUS":"Africa","MAR":"Africa","MOZ":"Africa",
  "NAM":"Africa","NER":"Africa","NGA":"Africa","RWA":"Africa","STP":"Africa",
  "SEN":"Africa","SLE":"Africa","SOM":"Africa","ZAF":"Africa","SSD":"Africa",
  "SDN":"Africa","SWZ":"Africa","TZA":"Africa","TGO":"Africa","TUN":"Africa",
  "UGA":"Africa","ZMB":"Africa","ZWE":"Africa","SYC":"Africa","MHL":"Africa",

  // Asia
  "AFG":"Asia","BGD":"Asia","BTN":"Asia","BRN":"Asia","KHM":"Asia",
  "CHN":"Asia","IND":"Asia","IDN":"Asia","JPN":"Asia","KAZ":"Asia",
  "KOR":"Asia","KGZ":"Asia","LAO":"Asia","MYS":"Asia","MDV":"Asia",
  "MNG":"Asia","MMR":"Asia","NPL":"Asia","PAK":"Asia","PHL":"Asia",
  "SGP":"Asia","LKA":"Asia","TJK":"Asia","THA":"Asia","TLS":"Asia",
  "TKM":"Asia","UZB":"Asia","VNM":"Asia",

  // Europe
  "ALB":"Europe","AND":"Europe","AUT":"Europe","BLR":"Europe","BEL":"Europe",
  "BIH":"Europe","BGR":"Europe","HRV":"Europe","CYP":"Europe","CZE":"Europe",
  "DNK":"Europe","EST":"Europe","FIN":"Europe","FRA":"Europe","DEU":"Europe",
  "GRC":"Europe","HUN":"Europe","ISL":"Europe","IRL":"Europe","ITA":"Europe",
  "XKX":"Europe","LVA":"Europe","LIE":"Europe","LTU":"Europe","LUX":"Europe",
  "MLT":"Europe","MDA":"Europe","MCO":"Europe","MNE":"Europe","NLD":"Europe",
  "MKD":"Europe","NOR":"Europe","POL":"Europe","PRT":"Europe","ROU":"Europe",
  "RUS":"Europe","SMR":"Europe","SRB":"Europe","SVK":"Europe","SVN":"Europe",
  "ESP":"Europe","SWE":"Europe","CHE":"Europe","UKR":"Europe","GBR":"Europe",

  // North America
  "ATG":"North America","BHS":"North America","BRB":"North America",
  "BLZ":"North America","CAN":"North America","CRI":"North America",
  "CUB":"North America","DMA":"North America","DOM":"North America",
  "SLV":"North America","GRD":"North America","GTM":"North America",
  "HTI":"North America","HND":"North America","JAM":"North America",
  "MEX":"North America","NIC":"North America","PAN":"North America",
  "KNA":"North America","LCA":"North America","VCT":"North America",
  "TTO":"North America","USA":"North America",

  // South America
  "ARG":"South America","BOL":"South America","BRA":"South America",
  "CHL":"South America","COL":"South America","ECU":"South America",
  "GUY":"South America","PRY":"South America","PER":"South America",
  "SUR":"South America","URY":"South America","VEN":"South America",

  // Middle East
  "BHR":"Middle East","IRN":"Middle East","IRQ":"Middle East",
  "ISR":"Middle East","JOR":"Middle East","KWT":"Middle East",
  "LBN":"Middle East","OMN":"Middle East","QAT":"Middle East",
  "SAU":"Middle East","SYR":"Middle East","TUR":"Middle East",
  "ARE":"Middle East","YEM":"Middle East","PSE":"Middle East",

  // Oceania
  "AUS":"Oceania","FJI":"Oceania","KIR":"Oceania","FSM":"Oceania",
  "NRU":"Oceania","NZL":"Oceania","PLW":"Oceania","PNG":"Oceania",
  "WSM":"Oceania","SLB":"Oceania","TON":"Oceania","TUV":"Oceania",
  "VUT":"Oceania",
};

const DISPLAY_NAMES = {
  "United States of America": "United States",
  "Russian Federation": "Russia",
  "Korea, Rep.": "South Korea",
  "Korea, Dem. People's Rep.": "North Korea",
  "Egypt, Arab Rep.": "Egypt",
  "Iran, Islamic Rep.": "Iran",
  "Venezuela, RB": "Venezuela",
  "Yemen, Rep.": "Yemen",
  "Syrian Arab Republic": "Syria",
  "Lao PDR": "Laos",
  "Turkiye": "Turkey",
  "Brunei Darussalam": "Brunei",
  "Slovak Republic": "Slovakia",
  "Czechia": "Czech Republic",
  "Kyrgyz Republic": "Kyrgyzstan",
  "Congo, Dem. Rep.": "DR Congo",
  "Congo, Rep.": "Congo",
  "Cote d'Ivoire": "Côte d'Ivoire",
  "Gambia, The": "Gambia",
  "Bahamas, The": "Bahamas",
  "Eswatini": "Eswatini",
  "Micronesia, Fed. Sts.": "Micronesia",
  "West Bank and Gaza": "Palestine",
  "Tanzania": "Tanzania",
  "North Macedonia": "N. Macedonia",
  "Bosnia and Herzegovina": "Bosnia & Herz.",
};

export function cleanName(name) {
  return DISPLAY_NAMES[name] || name;
}

export function flagEmoji(iso2) {
  if (!iso2 || iso2.length !== 2) return "🌐";
  const base = 0x1F1E6;
  const a = iso2.toUpperCase().charCodeAt(0) - 65;
  const b = iso2.toUpperCase().charCodeAt(1) - 65;
  return String.fromCodePoint(base + a) + String.fromCodePoint(base + b);
}

export function formatTrillions(usd) {
  const abs = Math.abs(usd);
  if (abs >= 1e12) return `$${(usd / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `$${(usd / 1e9).toFixed(1)}B`;
  if (abs >= 1e6)  return `$${(usd / 1e6).toFixed(1)}M`;
  return `$${usd.toLocaleString()}`;
}

export function formatCompact(usd) {
  const abs = Math.abs(usd);
  if (abs >= 1e12) return `$${(usd / 1e12).toFixed(1)}T`;
  if (abs >= 1e9)  return `$${(usd / 1e9).toFixed(0)}B`;
  return `$${(usd / 1e6).toFixed(0)}M`;
}

async function fetchPage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`World Bank API ${res.status}: ${url}`);
  const json = await res.json();
  if (!Array.isArray(json) || json.length < 2) throw new Error("Unexpected API response shape");
  return json; // [meta, data]
}

/**
 * Fetch the most-recent GDP for every country (one or two pages).
 * Returns { continents, worldTotal, year }
 */
export async function fetchWorldGDP() {
  const cached = _cacheGet("gdpviz_world");
  if (cached) return cached;

  const base = `${WB_BASE}/country/all/indicator/${GDP_INDICATOR}?format=json&mrv=1&per_page=300`;
  const [meta, firstPage] = await fetchPage(base);

  let rows = firstPage ?? [];

  // Fetch additional pages if the result set is paginated
  if (meta.pages > 1) {
    const extra = await Promise.all(
      Array.from({ length: meta.pages - 1 }, (_, i) =>
        fetchPage(`${base}&page=${i + 2}`).then(([, d]) => d ?? [])
      )
    );
    rows = rows.concat(extra.flat());
  }

  // Index by ISO3 (skip nulls and aggregates)
  const gdpByISO3 = {};
  for (const row of rows) {
    const iso3 = row.countryiso3code;
    if (!iso3 || row.value === null || !CONTINENT_MAP[iso3]) continue;
    if (!gdpByISO3[iso3] || row.date > gdpByISO3[iso3].year) {
      gdpByISO3[iso3] = {
        iso3,
        iso2: row.country?.id ?? "",
        name: cleanName(row.country?.value ?? iso3),
        gdp: row.value,
        year: row.date,
      };
    }
  }

  // Group by continent
  const byContinent = {};
  for (const entry of Object.values(gdpByISO3)) {
    const continent = CONTINENT_MAP[entry.iso3];
    if (!byContinent[continent]) {
      byContinent[continent] = {
        name: continent,
        color: CONTINENT_COLORS[continent],
        countries: [],
      };
    }
    byContinent[continent].countries.push({ ...entry, continent });
  }

  const continents = Object.values(byContinent).map(c => ({
    ...c,
    totalGDP: c.countries.reduce((s, x) => s + x.gdp, 0),
    countries: [...c.countries].sort((a, b) => b.gdp - a.gdp),
  })).sort((a, b) => b.totalGDP - a.totalGDP);

  const worldTotal = continents.reduce((s, c) => s + c.totalGDP, 0);
  const year = Object.values(gdpByISO3)[0]?.year ?? "N/A";

  const result = { continents, worldTotal, year };
  _cacheSet("gdpviz_world", result);
  return result;
}

/**
 * Fetch sub-sector detail for a given sector (called on sector bar click).
 * Agriculture → FAO FAOSTAT (top products by gross production value)
 * Industry    → World Bank UNIDO manufacturing sub-sector indicators
 * Services    → World Bank contextual indicators
 */
export async function fetchSectorDetail(iso3, sector) {
  const cacheKey = `gdpviz_sector_${iso3}_${sector}`;
  const cached = _cacheGet(cacheKey);
  if (cached) return cached;

  let result = {};
  if (sector === "agriculture") result = await _fetchAgDetail(iso3);
  else if (sector === "industry")    result = await _fetchIndDetail(iso3);
  else if (sector === "services")    result = await _fetchSrvDetail(iso3);

  _cacheSet(cacheKey, result);
  return result;
}

// Matches FAO aggregate/total item names that should be excluded
const _FAO_AGG = /total|aggregate|excl\.|primary\s*$|,\s*nes\b|n\.e\.s\.|excluding|all items|\s\+\s/i;

async function _fetchAgDetail(iso3) {
  for (const year of [2022, 2021, 2020]) {
    try {
      const url = `https://fenix.fao.org/faostat/api/v1/data/QV` +
        `?area_cs=ISO3&area=${iso3}&element=57&year=${year}&format=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) break;
      const json = await res.json();

      const rows = (json.data ?? [])
        .map(d => ({ item: String(d.item ?? ""), value: Number(d.value ?? 0) }))
        .filter(d => d.value > 0 && !_FAO_AGG.test(d.item))
        .sort((a, b) => b.value - a.value);

      if (!rows.length) continue;

      const total = rows.reduce((s, d) => s + d.value, 0);
      return {
        source: "fao", year,
        items: rows.slice(0, 5).map(d => ({
          name: _cleanFaoName(d.item),
          pct:  (d.value / total) * 100,
        })),
      };
    } catch { break; }
  }

  // Fallback to World Bank FAO-sourced production indices
  const [crop, live, empl] = await Promise.all([
    _wbLatest(iso3, "AG.PRD.CROP.XD"),
    _wbLatest(iso3, "AG.PRD.LVSK.XD"),
    _wbLatest(iso3, "SL.AGR.EMPL.ZS"),
  ]);
  return { source: "wb_fallback", crop, live, empl };
}

async function _fetchIndDetail(iso3) {
  const SUB = [
    ["Food & Beverages",      "NV.MNF.FBTO.ZS.UN"],
    ["Textiles & Apparel",    "NV.MNF.TXTL.ZS.UN"],
    ["Chemicals",             "NV.MNF.CHEM.ZS.UN"],
    ["Machinery & Transport", "NV.MNF.MTRN.ZS.UN"],
    ["Other Manufacturing",   "NV.MNF.OTHR.ZS.UN"],
  ];
  const [mfgTotal, ...subs] = await Promise.all([
    _wbLatest(iso3, "NV.IND.MANF.ZS"),
    ...SUB.map(([name, id]) => _wbLatest(iso3, id).then(v => ({ name, pct: v }))),
  ]);
  return {
    source: "wb",
    mfgTotal,
    subSectors: subs.filter(s => s.pct != null),
  };
}

async function _fetchSrvDetail(iso3) {
  const IND = {
    tour:   "ST.INT.RCPT.GD.ZS",   // Tourism receipts (% of GDP)
    health: "SH.XPD.CHEX.GD.ZS",   // Current health expenditure (% of GDP) — replaces discontinued SH.XPD.TOTL.GD.ZS
    edu:    "SE.XPD.TOTL.GD.ZS",   // Education expenditure (% of GDP)
    govt:   "GC.XPN.TOTL.GD.ZS",   // Govt. final consumption (% of GDP)
    empl:   "SL.SRV.EMPL.ZS",      // Services employment (% of total)
  };
  // Use mrv=5 — health/tourism data is updated less frequently than annual
  const pairs = await Promise.all(
    Object.entries(IND).map(([k, id]) => _wbLatest(iso3, id, 5).then(v => [k, v]))
  );
  return { source: "wb", ...Object.fromEntries(pairs) };
}

async function _wbLatest(iso3, indicator, mrv = 3) {
  try {
    const res  = await fetch(`${WB_BASE}/country/${iso3}/indicator/${indicator}?format=json&mrv=${mrv}&per_page=${mrv}`);
    const [, data] = await res.json();
    return (data ?? []).filter(d => d.value !== null)[0]?.value ?? null;
  } catch { return null; }
}


// ── OEC Tesseract API (BACI bilateral trade data) ────────────────────────────

const OEC_BASE = "https://api-v2.oec.world/tesseract";

// OEC uses a 2-letter region prefix + lowercase ISO3 for country IDs (e.g. "nausa", "eudeu")
const _OEC_REGION = {
  "Asia":          "as",
  "Europe":        "eu",
  "North America": "na",
  "South America": "sa",
  "Africa":        "af",
  "Middle East":   "as",  // OEC classifies Middle East as Western Asia
  "Oceania":       "oc",
};

function _isoToOEC(iso3) {
  const prefix = _OEC_REGION[CONTINENT_MAP[iso3]];
  return prefix ? prefix + iso3.toLowerCase() : null;
}

/**
 * Fetch top export/import partners via OEC Tesseract API (BACI data).
 * Returns { topExports, topImports, year } or null on failure.
 */
export async function fetchTradePartners(iso3) {
  const cacheKey = `gdpviz_partners_${iso3}`;
  const cached = _cacheGet(cacheKey);
  if (cached) return cached;

  const oecCode = _isoToOEC(iso3);
  if (!oecCode) return null;

  for (const year of [2023, 2022, 2021]) {
    try {
      const mk = (dimFilter) =>
        `${OEC_BASE}/data.jsonrecords?cube=trade_i_baci_a_22` +
        `&drilldowns=Exporter+Country,Importer+Country` +
        `&measures=Trade+Value` +
        `&include=${dimFilter}` +
        `&Year=${year}` +
        `&limit=300`;

      const [expJson, impJson] = await Promise.all([
        _oecGet(mk(`Exporter+Country:${oecCode}`)),
        _oecGet(mk(`Importer+Country:${oecCode}`)),
      ]);

      const expRows = _parseOECRows(expJson, "Importer Country");
      const impRows = _parseOECRows(impJson, "Exporter Country");
      if (!expRows.length && !impRows.length) continue;

      const result = {
        topExports: _oecTopPartners(expRows),
        topImports: _oecTopPartners(impRows),
        year: String(year),
      };
      _cacheSet(cacheKey, result);
      return result;
    } catch (err) {
      console.warn(`OEC ${year} failed:`, err);
      break;
    }
  }
  return null;
}

async function _oecGet(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`OEC ${res.status}`);
  return res.json();
}

function _parseOECRows(json, partnerField) {
  try {
    const rows = json?.data ?? [];
    return rows
      .map(d => ({ name: cleanName(d[partnerField] ?? ""), value: +(d["Trade Value"] ?? 0) }))
      .filter(d => d.value > 0 && d.name)
      .sort((a, b) => b.value - a.value);
  } catch { return []; }
}

function _oecTopPartners(rows, n = 10) {
  const total = rows.reduce((s, d) => s + d.value, 0);
  return rows.slice(0, n).map(d => ({
    ...d,
    share: total > 0 ? (d.value / total) * 100 : 0,
  }));
}

function _cleanFaoName(name) {
  return name
    .replace(/\s*\([^)]*\)/g, "")   // strip parentheticals like "(corn)"
    .replace(/,\s*paddy$/i, "")      // "Rice, paddy" → "Rice"
    .replace(/,\s*green$/i, "")      // "Coffee, green" → "Coffee"
    .replace(/,\s*fresh$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Country detail — two-phase progressive loading ───────────────────────────

async function _fetchIndicatorBatch(iso3, indicators, mrv = 5) {
  const pairs = await Promise.all(
    Object.entries(indicators).map(([key, ind]) =>
      fetch(`${WB_BASE}/country/${iso3}/indicator/${ind}?format=json&mrv=${mrv}&per_page=${mrv}`)
        .then(r => r.json())
        .then(([, data]) => [key, (data ?? []).filter(d => d.value !== null)])
        .catch(() => [key, []])
    )
  );
  const out = {};
  for (const [key, data] of pairs) {
    out[key] = data[0]?.value ?? null;
    out[`${key}Year`] = data[0]?.date ?? null;
  }
  return out;
}

/** Phase 1 — stats shown immediately (3 indicators + sparkline history). */
export async function fetchCountryCore(iso3) {
  const [stats, history] = await Promise.all([
    _fetchIndicatorBatch(iso3, {
      gdpPerCapita: "NY.GDP.PCAP.KD",
      gdpGrowth:    "NY.GDP.MKTP.KD.ZG",
      population:   "SP.POP.TOTL",
    }),
    fetch(`${WB_BASE}/country/${iso3}/indicator/${GDP_INDICATOR}?format=json&mrv=20&per_page=20`)
      .then(r => r.json())
      .then(([, data]) => (data ?? []).filter(d => d.value !== null).reverse())
      .catch(() => []),
  ]);
  return { ...stats, history };
}

/** Phase 2 — sector breakdown + trade overview (6 indicators). */
export async function fetchCountrySupp(iso3) {
  return _fetchIndicatorBatch(iso3, {
    agriculture: "NV.AGR.TOTL.ZS",
    industry:    "NV.IND.TOTL.ZS",
    services:    "NV.SRV.TOTL.ZS",
    exports:     "TX.VAL.MRCH.CD.WT",
    imports:     "TM.VAL.MRCH.CD.WT",
    tariff:      "TM.TAX.MRCH.SM.AR.ZS",
  });
}

export function getCachedCountryDetail(iso3) {
  return _cacheGet(`gdpviz_country_${iso3}`);
}

export function setCachedCountryDetail(iso3, detail) {
  _cacheSet(`gdpviz_country_${iso3}`, detail);
}