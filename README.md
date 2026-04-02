# Semantic Time Series 📊➡️📝

> **Project Status**
> This repository is an experimental project created for exploration and validation purposes only.
> Its current architecture is not suitable for supporting complex application requirements or production-scale evolution.
> The project is now archived, and no further active development is planned.

**Semantic Time Series** is a highly optimized, purely TypeScript-based package designed to transform thousands of complex time-series data points into readable, analytical, feature-rich textual narratives. It is specifically engineered to bridge the gap between raw telemetry/charts and Large Language Models (LLMs) that struggle to interpret massive continuous numerical arrays.

## Key Features 🚀

- **LLM-Optimized Output**: Converts data series into structured English paragraphs, highlighting Trajectory, Causality, Golden Cycles, and Sudden Volatility. 
- **100k+ Data Point Ready**: Refactored with high-performance $O(N)$ sliding windows and capped correlation loops so it seamlessly processes over 100,000 data points per series in under a second.
- **Pure Frontend Compatibility**: Fully Isomorphic JS/TS. Built as an ECMAScript Module (ESM) with zero dependencies on Node.js core modules (`fs`, `path`, etc.). Drops right into React, Vue, Vite, and Webpack seamlessly.
- **Robust Mathematics**: Powered natively by `simple-statistics`, providing airtight Pearson correlations and differences standard deviations without massive bundle bloat.
- **Built-in HTML Chart Visualizer**: Comes with a built-in test-suite generator (`yarn test`) which outputs an ECharts HTML file directly overlaying the text and downsampled visual data.

## Installation 📦

Since this is an ESM module tailored for React/Vite environments:
```bash
yarn add semantic-time-series
```

*(Note: Ensure your `package.json` configures `"type": "module"` if used in a Node backend environment).*

## Quick Start 🛠️

```typescript
import { SemanticFeatureEngine, TimePoint } from 'semantic-time-series';

// 1. Prepare your data points
const myChartData: TimePoint[] = [
  { time: 1, value: 100 },
  { time: 2, value: 150 },
  { time: 3, value: 100 },
  // ... Up to 100,000 points ...
];

// 2. Extract Narrative for a Single Line
// Automatically detects periodicity, phases, and sudden spikes!
const singleSeriesText = SemanticFeatureEngine.analyzeSingle(myChartData, "Server CPU Usage");
console.log(singleSeriesText);

// 3. Extract Causality & Lead-Lag between TWO series
const anotherData: TimePoint[] = [ /* ... */ ];
const relationalText = SemanticFeatureEngine.analyzeRelation(
    myChartData, 
    anotherData, 
    "Server CPU Usage", 
    "Database Active Connections"
);
console.log(relationalText);
```

### Note on Client-Side Performance (React/Browser)
While evaluating 100k data points locally takes less than a second (`~800ms`), doing this synchronously on the main UI thread in React may cause a minor stutter. It is highly recommended to wrap `SemanticFeatureEngine` inside a **Web Worker** if you are digesting massive datasets natively inside the browser.

## Built-In Commands 🔧

To develop or run visual tests on this module:

- `yarn dev` : Runs the TypeScript compiler in watch mode.
- `yarn build` : Compiles the `/src` down to the distribution `/dist` directory.
- `yarn test` : Runs a mock test generating 100k data points and exports a verification `test-output.html` chart.
- `yarn test:unit` : Runs the Vitest coverage suite to prove math causality.
- `yarn coverage` : Validates mathematical coverage branch testing.
