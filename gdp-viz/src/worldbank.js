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

  return { continents, worldTotal, year };
}

/**
 * Fetch detailed breakdown for a specific country (called on country click).
 * Returns { gdpPerCapita, gdpGrowth, agriculture, industry, services, population, history }
 */
export async function fetchCountryDetail(iso3) {
  const indicators = {
    gdpPerCapita:  "NY.GDP.PCAP.KD",
    gdpGrowth:     "NY.GDP.MKTP.KD.ZG",
    agriculture:   "NV.AGR.TOTL.ZS",
    industry:      "NV.IND.TOTL.ZS",
    services:      "NV.SRV.TOTL.ZS",
    population:    "SP.POP.TOTL",
  };

  const requests = Object.entries(indicators).map(([key, ind]) =>
    fetch(`${WB_BASE}/country/${iso3}/indicator/${ind}?format=json&mrv=5&per_page=5`)
      .then(r => r.json())
      .then(([, data]) => [key, (data ?? []).filter(d => d.value !== null)])
      .catch(() => [key, []])
  );

  // Fetch GDP history for sparkline (20 years)
  const historyReq = fetch(
    `${WB_BASE}/country/${iso3}/indicator/${GDP_INDICATOR}?format=json&mrv=20&per_page=20`
  )
    .then(r => r.json())
    .then(([, data]) => (data ?? []).filter(d => d.value !== null).reverse())
    .catch(() => []);

  const [results, history] = await Promise.all([Promise.all(requests), historyReq]);

  const detail = { history };
  for (const [key, data] of results) {
    detail[key] = data[0]?.value ?? null;
    detail[`${key}Year`] = data[0]?.date ?? null;
  }

  return detail;
}