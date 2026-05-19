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

const _SECTOR_CONF = {
  agriculture: { main: "NV.AGR.TOTL.ZS", supp: "SL.AGR.EMPL.ZS", suppKey: "empl" },
  industry:    { main: "NV.IND.TOTL.ZS",  supp: "NV.IND.MANF.ZS", suppKey: "mfg"  },
  services:    { main: "NV.SRV.TOTL.ZS",  supp: "SL.SRV.EMPL.ZS", suppKey: "empl" },
};

const _SECTOR_HIST = Array.from({ length: 11 }, (_, i) => 2013 + i).join(","); // 2013–2023

/** Fetch 10-year % of GDP trend + supplementary stat for a sector. */
export async function fetchSectorDetail(iso3, sector) {
  const cacheKey = `gdpviz_sectorv2_${iso3}_${sector}`;
  const cached = _cacheGet(cacheKey);
  if (cached) return cached;

  const conf = _SECTOR_CONF[sector];
  if (!conf) return {};

  const [histRows, suppRows] = await Promise.all([
    _wdiGet(conf.main, _SECTOR_HIST).catch(() => []),
    _wdiGet(conf.supp, _WDI_YEARS).catch(() => []),
  ]);

  const history = histRows
    .filter(r => r["Country Official ID"] === iso3.toLowerCase() && r.Measure != null)
    .sort((a, b) => a.Year - b.Year)
    .map(r => ({ value: r.Measure, date: String(r.Year) }));

  const { value: suppValue, year: suppYear } = _wdiLatest(suppRows, iso3);

  const result = {
    source: "oec_wdi",
    history,
    [conf.suppKey]: suppValue,
    [`${conf.suppKey}Year`]: suppYear,
  };
  _cacheSet(cacheKey, result);
  return result;
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

/**
 * Fetch top export/import goods by HS chapter (HS2) via OEC BACI.
 * Returns { topExportGoods, topImportGoods, year } or null on failure.
 */
export async function fetchTradeGoods(iso3) {
  const cacheKey = `gdpviz_goods_${iso3}`;
  const cached = _cacheGet(cacheKey);
  if (cached) return cached;

  const oecCode = _isoToOEC(iso3);
  if (!oecCode) return null;

  for (const year of [2023, 2022, 2021]) {
    try {
      const mk = (dimFilter, drilldown = "HS2") =>
        `${OEC_BASE}/data.jsonrecords?cube=trade_i_baci_a_22` +
        `&drilldowns=${drilldown}` +
        `&measures=Trade+Value` +
        `&include=${dimFilter}` +
        `&Year=${year}` +
        `&limit=200`;

      const [expJson, impJson] = await Promise.all([
        _oecGet(mk(`Exporter+Country:${oecCode}`)),
        _oecGet(mk(`Importer+Country:${oecCode}`)),
      ]);

      const expRows = _parseOECGoodsRows(expJson);
      const impRows = _parseOECGoodsRows(impJson);
      if (!expRows.length && !impRows.length) continue;

      const result = {
        topExportGoods: _oecTopGoods(expRows),
        topImportGoods: _oecTopGoods(impRows),
        year: String(year),
      };
      _cacheSet(cacheKey, result);
      return result;
    } catch (err) {
      console.warn(`OEC goods ${year} failed:`, err);
      break;
    }
  }
  return null;
}

function _parseOECGoodsRows(json) {
  try {
    const rows = json?.data ?? [];
    if (!rows.length) return [];
    // Detect the product name field: first string field that isn't a metadata column
    const nameField = Object.keys(rows[0]).find(k =>
      typeof rows[0][k] === "string" && k !== "Year" && !k.endsWith(" ID")
    );
    if (!nameField) return [];
    return rows
      .map(d => ({ name: String(d[nameField] ?? "").trim(), value: +(d["Trade Value"] ?? 0) }))
      .filter(d => d.value > 0 && d.name)
      .sort((a, b) => b.value - a.value);
  } catch { return []; }
}

function _oecTopGoods(rows, n = 10) {
  const total = rows.reduce((s, d) => s + d.value, 0);
  return rows.slice(0, n).map(d => ({
    ...d,
    share: total > 0 ? (d.value / total) * 100 : 0,
  }));
}

// ── Country detail — OEC WDI cube (mirrors World Bank WDI, much faster) ───────

const OEC_WDI = "https://api-v2.oec.world/tesseract/data.jsonrecords?cube=indicators_i_wdi_a";

// Cover lagged indicators (tariffs ~2019, trade ~2022, GDP growth ~2024)
const _WDI_YEARS  = "2024,2023,2022,2021,2020,2019,2018";
// 21 years for the sparkline history
const _WDI_HIST   = Array.from({ length: 21 }, (_, i) => 2004 + i).join(",");

async function _wdiGet(indicatorId, years) {
  const url = `${OEC_WDI}&drilldowns=Country+Official,Year&measures=Measure` +
              `&include=Indicator:${indicatorId}&Year=${years}&limit=10000`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`OEC WDI ${res.status}`);
  return (await res.json()).data ?? [];
}

function _wdiLatest(rows, iso3) {
  const hits = rows
    .filter(r => r["Country Official ID"] === iso3.toLowerCase() && r.Measure != null)
    .sort((a, b) => b.Year - a.Year);
  return hits.length ? { value: hits[0].Measure, year: String(hits[0].Year) } : { value: null, year: null };
}

async function _fetchIndicatorBatch(iso3, indicators) {
  const pairs = await Promise.all(
    Object.entries(indicators).map(([key, indId]) =>
      _wdiGet(indId, _WDI_YEARS)
        .then(rows => {
          const { value, year } = _wdiLatest(rows, iso3);
          return [key, value, year];
        })
        .catch(() => [key, null, null])
    )
  );
  const out = {};
  for (const [key, value, year] of pairs) {
    out[key] = value;
    out[`${key}Year`] = year;
  }
  return out;
}

/** Phase 1 — stats shown immediately (3 indicators + sparkline history). */
export async function fetchCountryCore(iso3) {
  const [stats, histRows] = await Promise.all([
    _fetchIndicatorBatch(iso3, {
      gdpPerCapita: "NY.GDP.PCAP.KD",
      gdpGrowth:    "NY.GDP.MKTP.KD.ZG",
      population:   "SP.POP.TOTL",
    }),
    _wdiGet(GDP_INDICATOR, _WDI_HIST),
  ]);

  const history = histRows
    .filter(r => r["Country Official ID"] === iso3.toLowerCase() && r.Measure != null)
    .sort((a, b) => a.Year - b.Year)
    .map(r => ({ value: r.Measure, date: String(r.Year) }));

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