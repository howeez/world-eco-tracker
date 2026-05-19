# GDP Visualization — World Bank Live Data

A production-grade, zero-dependency web app that fetches **real GDP data live from the World Bank API** and renders it as an interactive Voronoi-style pie chart — inspired by the Goldman Sachs 2050 GDP infographic.

---

## Project Structure

```
gdp-viz/
├── index.html              # App shell & entry point
├── styles/
│   └── main.css            # All styles (typography, layout, animations, tooltip)
└── src/
    ├── worldbank.js        # World Bank API client & data transformation
    ├── layout.js           # Pie chart geometry & arc math (pure functions)
    ├── renderer.js         # SVG drawing, labels, interactions, legend bar
    └── app.js              # Orchestrator — wires everything together
```

---

## Architecture

### Data Flow

```
World Bank REST API
       │
       ▼
 worldbank.js          Fetches NY.GDP.MKTP.KD (real GDP, constant 2015 USD)
 fetchWorldGDP()       Groups countries into 4 regions, sorts by size
       │
       ▼
 layout.js             Converts GDP fractions → SVG arc angles & paths
 computeLayout()       Pure geometry: no DOM access, fully testable
       │
       ▼
 renderer.js           Draws segments, labels, legend bar, handles hover
 render()              Produces SVG elements with staggered animations
       │
       ▼
 app.js                Boots everything, manages resize & tooltip state
```

### Module Responsibilities

| File | Responsibility | Side Effects |
|------|---------------|-------------|
| `worldbank.js` | API fetch, data normalization | `fetch()` only |
| `layout.js` | Arc geometry computation | None (pure) |
| `renderer.js` | SVG DOM manipulation | DOM writes only |
| `app.js` | Orchestration, event wiring | DOM + window events |

---

## Running Locally

This project uses **ES modules** (`type="module"`), which requires a local HTTP server (browsers block module imports from `file://`).

### Option A: Python (no install needed)
```bash
cd gdp-viz
python3 -m http.server 8080
# Open http://localhost:8080
```

### Option B: Node.js
```bash
npm install -g serve    # one-time
serve gdp-viz           # starts server, opens browser
```

### Option C: VS Code
Install the **Live Server** extension, right-click `index.html` → "Open with Live Server".

---

## World Bank API

- **Endpoint**: `https://api.worldbank.org/v2/country/{codes}/indicator/{indicator}`
- **Indicator**: `NY.GDP.MKTP.KD` — GDP in constant 2015 US dollars (real GDP)
- **Auth**: None required
- **Rate limits**: Generous; no key needed for this usage
- **Data freshness**: Most recent year available (usually 1–2 years lag)
- **Docs**: https://datahelpdesk.worldbank.org/knowledgebase/articles/898581

---

## Customization

### Add or Remove Countries

Edit the `REGIONS` object in `worldbank.js`. Each country is an ISO 3166-1 alpha-2 code. The `ISO2_TO_ISO3` map must also be updated (World Bank uses ISO3 internally).

```js
"Asia (ex DM)": {
  color: "#C0392B",
  countries: ["CN", "IN", "ID", /* add more here */],
},
```

### Change the Indicator

Swap `GDP_INDICATOR` in `worldbank.js` for any World Bank indicator:
- `NY.GDP.MKTP.CD` — Nominal GDP (current USD)
- `NY.GDP.MKTP.KD` — Real GDP (constant 2015 USD) ← current
- `NY.GDP.PCAP.KD` — GDP per capita (constant 2015 USD)

### Adjust Colors / Fonts

All design tokens are CSS variables in `styles/main.css` under `:root`.

---

## Browser Compatibility

Works in all modern browsers (Chrome, Firefox, Safari, Edge). Requires ES2020+ support (native modules, optional chaining).

---

## License

Data © World Bank, licensed under CC BY 4.0.  
Code: MIT.
