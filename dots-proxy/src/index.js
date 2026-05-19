/**
 * Trade Data CORS Proxy — Cloudflare Worker
 *
 * Routes:
 *   GET /comtrade/bilateral?r={m49}&p={m49}
 *     Fetches annual (2000–2024) + monthly (2025–present) bilateral merchandise
 *     trade from UN Comtrade, aggregates monthly → annualised annual, and returns
 *     a single combined JSON array. The subscription key is injected server-side.
 *
 *   GET /ots/bilateral?r={iso3}&p={iso3}&startYear={n}&endYear={n}
 *     Fans out to api.tradestatistics.io year-by-year (legacy fallback).
 */

const OTS_BASE      = "https://api.tradestatistics.io";
const COMTRADE_BASE = "https://comtradeapi.un.org/data/v1/get/C";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// ── Router ────────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === "/comtrade/bilateral") {
      return handleComtradeBilateral(url.searchParams, env.COMTRADE_KEY);
    }
    if (url.pathname === "/ots/bilateral") {
      return handleOTSBilateral(url.searchParams);
    }

    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  },
};

// ── UN Comtrade bilateral handler ─────────────────────────────────────────────

async function handleComtradeBilateral(params, apiKey) {
  const r = params.get("r");
  const p = params.get("p");
  if (!r || !p) return json({ error: "Missing r or p (M49 codes)" }, 400);
  if (!apiKey)  return json({ error: "API key not configured" }, 500);

  const headers = { "Ocp-Apim-Subscription-Key": apiKey, "Accept": "application/json" };

  // Try home country as reporter first. If Comtrade has no data for that reporter
  // (many countries don't self-report reliably), fall back to the partner as reporter
  // and swap the export/import perspective.
  let result = await _fetchComtradeRows(r, p, false, headers);
  if (!result.combined.length) {
    result = await _fetchComtradeRows(p, r, true, headers);
  }

  return json({ data: result.combined, lastPeriod: result.lastPeriod });
}

async function _fetchComtradeRows(reporterM49, partnerM49, swapFlows, headers) {
  const now          = new Date();
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const commonParams = `cmdCode=TOTAL&flowCode=X,M&reporterCode=${reporterM49}&partnerCode=${partnerM49}`;

  // Annual batches (max 12 periods each)
  const annualBatch1  = range(2000, 2011).join(",");
  const annualBatch2a = range(2012, 2023).join(",");
  const annualBatch2b = "2024";

  // Monthly batches from Jan 2025 up to current month (max 12 per batch)
  const allMonths = [];
  for (let y = 2025; y <= currentYear; y++) {
    const maxM = y === currentYear ? currentMonth : 12;
    for (let m = 1; m <= maxM; m++) {
      allMonths.push(`${y}${String(m).padStart(2, "0")}`);
    }
  }
  const monthlyBatches = chunk(allMonths, 12);

  const fetches = [
    ctFetch(`${COMTRADE_BASE}/A/HS?${commonParams}&period=${annualBatch1}`,  headers),
    ctFetch(`${COMTRADE_BASE}/A/HS?${commonParams}&period=${annualBatch2a}`, headers),
    ctFetch(`${COMTRADE_BASE}/A/HS?${commonParams}&period=${annualBatch2b}`, headers),
    ...monthlyBatches.map(batch =>
      ctFetch(`${COMTRADE_BASE}/M/HS?${commonParams}&period=${batch.join(",")}`, headers)
    ),
  ];

  const allRows = (await Promise.all(fetches)).flatMap(r => r ?? []);

  // When the partner is the reporter, X = partner's exports TO home = home's imports,
  // and M = partner's imports FROM home = home's exports. Swap if needed.
  const expFlow = swapFlows ? "M" : "X";
  const impFlow = swapFlows ? "X" : "M";

  // Build year → {exports, imports} from annual rows
  const byYear = new Map();
  for (const row of allRows.filter(r => r.freqCode === "A")) {
    const yr = String(row.period);
    const e  = byYear.get(yr) ?? {};
    if (row.flowCode === expFlow) e.exports = row.primaryValue ?? null;
    if (row.flowCode === impFlow) e.imports = row.primaryValue ?? null;
    byYear.set(yr, e);
  }

  // Aggregate monthly rows → annualised entries
  const monthly = allRows.filter(r => r.freqCode === "M");
  const mByYear = new Map();
  for (const row of monthly) {
    const yr = String(row.refYear ?? row.period.slice(0, 4));
    const e  = mByYear.get(yr) ?? { expSum: 0, expN: 0, impSum: 0, impN: 0, lastPeriod: "" };
    if (row.flowCode === expFlow) { e.expSum += row.primaryValue ?? 0; e.expN++; }
    if (row.flowCode === impFlow) { e.impSum += row.primaryValue ?? 0; e.impN++; }
    if (String(row.period) > e.lastPeriod) e.lastPeriod = String(row.period);
    mByYear.set(yr, e);
  }

  for (const [yr, m] of mByYear.entries()) {
    const months = Math.max(m.expN, m.impN) || 1;
    const factor = months < 12 ? 12 / months : 1;
    byYear.set(yr, {
      exports:    m.expN > 0 ? m.expSum * factor : null,
      imports:    m.impN > 0 ? m.impSum * factor : null,
      partial:    months < 12,
      lastPeriod: m.lastPeriod,
    });
  }

  const lastPeriod = [...mByYear.values()]
    .map(m => m.lastPeriod).filter(Boolean).sort().pop() ?? null;

  const combined = [...byYear.entries()]
    .sort((a, b) => +a[0] - +b[0])
    .map(([year, d]) => ({ year: +year, ...d }))
    .filter(d => d.exports != null || d.imports != null);

  return { combined, lastPeriod };
}

async function ctFetch(url, headers) {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
      console.error(`ctFetch ${res.status} ${url}`);
      return [];
    }
    const j = await res.json();
    if (!j.data?.length) console.warn(`ctFetch empty data: ${url}`);
    return j.data ?? [];
  } catch (e) {
    console.error(`ctFetch error ${e.message}: ${url}`);
    return [];
  }
}

// ── OTS bilateral handler (legacy / fallback) ─────────────────────────────────

async function handleOTSBilateral(params) {
  const r = (params.get("r") ?? "").toLowerCase().trim();
  const p = (params.get("p") ?? "").toLowerCase().trim();
  if (!r || !p || r.length !== 3 || p.length !== 3) {
    return json({ error: "Missing or invalid r/p (3-letter ISO3)" }, 400);
  }

  const currentYear = new Date().getFullYear();
  const startYear   = Math.max(1990, parseInt(params.get("startYear") ?? "1990"));
  const endYear     = Math.min(currentYear - 1, parseInt(params.get("endYear") ?? String(currentYear - 1)));
  const years       = range(startYear, endYear);

  const results = await Promise.all(
    years.map(async (y) => {
      try {
        const res = await fetch(`${OTS_BASE}/yrp?y=${y}&r=${r}&p=${p}`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const row  = Array.isArray(data) ? data[0] : null;
        if (!row || row.error) return null;
        return { year: row.year, exports: row.trade_value_usd_exp ?? null, imports: row.trade_value_usd_imp ?? null };
      } catch { return null; }
    })
  );

  return json(results.filter(Boolean));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
