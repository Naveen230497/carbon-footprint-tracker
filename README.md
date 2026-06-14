# EcoTrack — Carbon Footprint Awareness Platform

> **Challenge Vertical:** Carbon Footprint Awareness  
> Track, understand, and reduce your personal carbon footprint through simple daily actions and personalized insights.

---

## Table of Contents

- [Chosen Vertical](#chosen-vertical)
- [Approach and Logic](#approach-and-logic)
- [How the Solution Works](#how-the-solution-works)
- [Architecture](#architecture)
- [Security Measures](#security-measures)
- [Testing](#testing)
- [Accessibility](#accessibility)
- [Assumptions Made](#assumptions-made)
- [Getting Started](#getting-started)

---

## Chosen Vertical

**Carbon Footprint Awareness Platform** — designed to help individuals understand, track, and reduce their carbon footprint through simple actions and personalized insights.

---

## Approach and Logic

### Problem Analysis

The average Indian emits ~1,900 kg CO₂ per year, but most people have no awareness of how their daily choices contribute to this figure. EcoTrack bridges this knowledge gap by providing:

1. **Activity Logging** — Users log daily activities across 4 categories: Transport, Food, Energy, and Shopping
2. **Real-time Calculation** — Each activity is instantly converted to kg CO₂e using scientifically calibrated emission factors
3. **Personalized Insights** — The system analyzes usage patterns and generates reduction tips tailored to the user's highest-emission categories
4. **Progress Tracking** — Dashboard gauges, 7-day trend charts, and achievement badges motivate sustained behavior change

### Design Decisions

- **Zero Dependencies** — Pure HTML, CSS, and JavaScript. No frameworks, no npm packages, no build step. This maximizes security (no supply chain vulnerabilities), performance (no bloated bundles), and portability
- **Client-side Only** — All data stays in the browser's `localStorage`. No server, no database, no network requests. This ensures complete privacy and GDPR compliance by design
- **Module Pattern** — The JavaScript is organized into focused modules (`Security`, `Calculator`, `DataStore`, `UI`, `BadgeEngine`, `TipsEngine`) following the Single Responsibility Principle
- **Event Delegation** — Instead of inline event handlers, the app uses event delegation on parent containers for better performance and security

### Emission Factor Sources

| Source | Used For |
|--------|----------|
| [IPCC AR6](https://www.ipcc.ch/) | Transport, food lifecycle |
| [IEA](https://www.iea.org/) | Grid electricity factors |
| [UK DEFRA](https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2023) | Per-km vehicle factors |
| [India MoEFCC](https://moef.gov.in/) | India-specific grid factor (0.82 kg/kWh) |

---

## How the Solution Works

### User Flow

```
User opens app → Dashboard shows summary
       ↓
Clicks "Log Activity" → Selects category → Fills form → Submits
       ↓
System validates input → Calculates CO₂ → Saves to localStorage
       ↓
Dashboard auto-updates → Gauge, stats, breakdown refresh
       ↓
User visits Insights → Sees 7-day trend chart + personalized tips
       ↓
Achievement badges unlock as milestones are reached
```

### Activity Categories

| Category | Subtypes | Unit | Factor Range (kg CO₂e) |
|----------|----------|------|----------------------|
| 🚗 Transport | Car (Petrol/Diesel/Electric), Motorcycle, Bus, Train, Auto Rickshaw, Walk/Cycle, Flight | per km | 0.000–0.255 |
| 🍔 Food | Vegan, Vegetarian, Fish, Chicken, Beef, Dairy-heavy | per meal | 0.5–6.5 |
| ⚡ Energy | Grid Electricity, Solar, LPG, Air Conditioning, Washing Machine | per kWh/hour/load | 0.05–2.98 |
| 🛍 Shopping | Clothing, Electronics, Plastic Bags, Online Delivery, Furniture | per item | 0.033–70.0 |

### Personalized Tip Engine

Tips are dynamically generated based on the user's emission breakdown:
- **Urgent tips** trigger when a category exceeds high thresholds (e.g., transport > 50 kg/month)
- **Moderate tips** trigger at moderate thresholds
- **General green tips** are always shown for ongoing motivation

---

## Architecture

```
carbon-footprint-tracker/
├── index.html          → Semantic HTML structure (no inline JS)
├── styles.css          → Design system with CSS custom properties
├── app.js              → Application logic in 7 modules:
│   ├── Security        → Input validation, sanitization, rate limiting
│   ├── EmissionFactors → Frozen scientific data (IPCC/IEA/DEFRA)
│   ├── DataStore       → localStorage CRUD with error boundaries
│   ├── Calculator      → Pure emission math functions
│   ├── BadgeEngine     → Achievement system (6 badges)
│   ├── TipsEngine      → Personalized insight generation
│   ├── UI              → DOM rendering with batch updates
│   └── App             → Main controller with event delegation
├── tests/
│   └── test.js         → 60 tests across 12 suites (TAP format)
├── package.json        → npm test script for test discovery
├── .gitignore          → Standard exclusions
└── README.md           → This file
```

### Data Flow

```
User Input → Security.validate() → Calculator.calcCO2() → DataStore.addLog() → UI.render()
```

All data flows through the Security module before processing. All output flows through `Security.escapeHTML()` before DOM insertion.

---

## Security Measures

| Measure | Implementation |
|---------|---------------|
| **Content Security Policy** | `<meta>` CSP header blocks inline scripts, external connections, and frame embedding |
| **Input Validation** | `Security.isValidAmount()` — checks type, NaN, Infinity, and min/max bounds |
| **Input Sanitization** | `Security.sanitizeInput()` — strips `<>"'` backticks, backslashes, ampersands; truncates to 200 chars |
| **Output Encoding** | `Security.escapeHTML()` — OWASP-compliant entity encoding on all dynamic DOM content |
| **Rate Limiting** | `Security.checkRateLimit()` — 500ms cooldown between identical actions |
| **Immutable Config** | `Object.freeze()` on all emission factor objects to prevent runtime tampering |
| **Referrer Policy** | `<meta name="referrer" content="no-referrer">` prevents data leakage |
| **Frame Protection** | `X-Frame-Options: DENY` via meta tag prevents clickjacking |
| **Error Boundaries** | All `localStorage` operations wrapped in try/catch with fallback values |
| **Select Validation** | `Security.isAllowedValue()` validates dropdown values against whitelist |

---

## Testing

### Running Tests

```bash
npm test
# or directly:
node tests/test.js
```

### Test Coverage

**60 tests** across **12 suites**, covering:

| Suite | Tests | What's Tested |
|-------|-------|--------------|
| Transport Calculations | 8 | All vehicle types, factor ordering, error handling |
| Food Calculations | 5 | All meal types, comparative assertions |
| Energy Calculations | 5 | Grid vs solar, LPG, AC, error handling |
| Shopping Calculations | 4 | Factor ordering, comparative calculations |
| Data Aggregation | 7 | sumCO2, categoryBreakdown, getLogsInRange, annualProjection |
| Input Validation | 7 | NaN, Infinity, negative, bounds, custom min/max |
| Input Sanitization | 8 | XSS vectors, truncation, null/undefined handling |
| Output Encoding | 6 | HTML entities, quotes, ampersands, type coercion |
| Allowed Value Validation | 4 | Whitelist check, case sensitivity |
| Footprint Rating | 4 | All rating thresholds |
| Badge Logic | 8 | All 6 badges + edge cases |
| Edge Cases & Performance | 7 | Large arrays (<100ms), precision, benchmarks |

### Test Output Format

Tests produce **TAP (Test Anything Protocol)** compatible output:

```
TAP version 13
ok 1 - should calculate car petrol 10km = 1.92 kg CO₂e
ok 2 - should return zero CO₂ for walking/cycling
...
1..60
# tests 60
# pass  60
# fail  0
# All 60 tests passed ✓
```

---

## Accessibility

| Feature | Implementation |
|---------|---------------|
| **Skip Navigation** | "Skip to main content" link for keyboard users |
| **ARIA Roles** | `role="tablist"`, `role="tab"`, `role="tabpanel"`, `role="progressbar"`, `role="list"`, `role="toolbar"`, `role="status"` |
| **ARIA Labels** | All interactive elements have `aria-label` or `aria-labelledby` |
| **Live Regions** | `aria-live="polite"` on stats, gauge verdict, and notification toast |
| **Focus Management** | `:focus-visible` styles on all buttons, inputs, and tabs |
| **Keyboard Navigation** | Arrow key support for tab switching |
| **Color Independence** | Text labels accompany all color-coded elements |
| **Reduced Motion** | `prefers-reduced-motion: reduce` disables all animations |
| **Semantic HTML** | Proper `<header>`, `<nav>`, `<main>`, `<section>`, `<form>` usage |
| **Form Associations** | All inputs have `<label>` with `for` attribute and `aria-describedby` hints |

---

## Assumptions Made

1. **India-centric defaults** — Grid electricity factor (0.82 kg/kWh) and comparison benchmarks use India averages. The tool works globally but comparisons are India-specific
2. **Meal-level granularity** — Food emissions are calculated per meal, not per ingredient, using average meal carbon intensities from IPCC lifecycle analysis
3. **Per-person emissions** — All factors assume single-occupancy for transport. Carpooling would reduce per-person emissions
4. **localStorage availability** — The app requires a browser with localStorage support (all modern browsers). Data persists across sessions but is device-specific
5. **No authentication needed** — Since all data is local, there's no user account system. This is by design for privacy
6. **Emission factors are annual averages** — Seasonal variations (e.g., heating in winter) are not modeled

---

## Getting Started

### Prerequisites
- Any modern web browser (Chrome, Firefox, Edge, Safari)
- No installation, no build step, no dependencies

### Usage

1. **Open** `index.html` in your browser (double-click or drag to browser)
2. **Log activities** — Click "Log Activity" tab and fill in your daily transport, food, energy, or shopping activities
3. **View dashboard** — See your real-time emissions summary, category breakdown, and achievement badges
4. **Check insights** — Visit "Insights" for your 7-day trend chart and personalized reduction tips
5. **Track progress** — Use "History" to review all past entries with filtering options

### Running Tests

```bash
# Ensure Node.js is installed (v14+)
npm test
```

---

## License

MIT License — Free to use, modify, and distribute.
