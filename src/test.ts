import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SemanticFeatureEngine, TimePoint } from './index.js';

// Setup pure math for data gen
console.log("Generating test data points (100k points for A, slightly less for B to test robustness...)");
const dataA: TimePoint[] = [];
const dataB: TimePoint[] = [];

for (let i = 0; i < 100000; i++) {
  // A structural wave with noise
  dataA.push({ time: i, value: Math.sin(i * 0.001) * 100 + Math.random() * 10 });
  
  // A leading wave (shifted by 200 time steps) to test causality
  dataB.push({ time: i, value: Math.cos((i + 200) * 0.001) * 100 + Math.random() * 10 });
}

console.log("Analyzing Single Series (A)...");
console.time("analyzeSingle A");
const resultA = SemanticFeatureEngine.analyzeSingle(dataA, "Sine Wave A");
console.timeEnd("analyzeSingle A");

console.log("\nAnalyzing Relation (A vs B)...");
console.time("analyzeRelation A-B");
const resultAB = SemanticFeatureEngine.analyzeRelation(dataA, dataB, "Sine Wave A", "Cosine Wave B (Lead)");
console.timeEnd("analyzeRelation A-B");

console.log("\n--- RESULT A ---");
console.log(resultA.substring(0, 1000) + "...\n");
console.log("--- RESULT AB ---");
console.log(resultAB);

// --- HTML Visualization Generation ---
console.log("\nGenerating test-output.html to verify visual correctness...");

// Downsample for the ECharts browser rendering to prevent browser freeze (limit to ~5,000 points)
const plotLimit = Math.min(dataA.length, 5000);
const step = Math.ceil(dataA.length / plotLimit);

const times = [];
const valuesA = [];
const valuesB = [];

for (let i = 0; i < dataA.length; i += step) {
    times.push(dataA[i].time);
    valuesA.push(dataA[i].value);
    valuesB.push(dataB[i].value);
}

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Semantic Time-Series Verification</title>
    <!-- Include Apache ECharts -->
    <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
    <style>
        body { margin: 0; padding: 20px; font-family: sans-serif; background-color: #121212; color: #ffffff; }
        .container { display: flex; flex-direction: column; gap: 20px; }
        #chart { width: 100%; height: 600px; background-color: #1e1e1e; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
        .narrative { background: #2a2a2a; padding: 20px; border-radius: 8px; white-space: pre-wrap; line-height: 1.5; border-left: 4px solid #4caf50; }
        h1, h2, h3 { color: #4caf50; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Semantic Feature Verification</h1>
        <p>This chart visualizes the downsampled structural data (showing ~5000 points out of 100k) to verify the analytical narrative below.</p>
        <div id="chart"></div>
        <div>
            <h2>Analysis Engine Output</h2>
            <div class="narrative">${resultA.replace(/</g, "&lt;")}</div>
            <br/>
            <div class="narrative" style="border-left-color: #2196f3;">${resultAB.replace(/</g, "&lt;")}</div>
        </div>
    </div>

    <script>
        const chartDom = document.getElementById('chart');
        const myChart = echarts.init(chartDom, 'dark');
        
        const option = {
            backgroundColor: 'transparent',
            tooltip: { trigger: 'axis' },
            legend: { data: ['Sine Wave A', 'Cosine Wave B (Lead)'], textStyle: { color: '#ccc' } },
            dataZoom: [
                { type: 'inside', start: 0, end: 100 },
                { start: 0, end: 100 }
            ],
            xAxis: { 
                type: 'category', 
                data: ${JSON.stringify(times)},
                axisLine: { lineStyle: { color: '#666' } }
            },
            yAxis: { 
                type: 'value',
                axisLine: { lineStyle: { color: '#666' } },
                splitLine: { lineStyle: { color: '#333' } }
            },
            series: [
                {
                    name: 'Sine Wave A',
                    type: 'line',
                    data: ${JSON.stringify(valuesA)},
                    showSymbol: false,
                    lineStyle: { width: 2, color: '#4caf50' }
                },
                {
                    name: 'Cosine Wave B (Lead)',
                    type: 'line',
                    data: ${JSON.stringify(valuesB)},
                    showSymbol: false,
                    lineStyle: { width: 2, color: '#2196f3' }
                }
            ]
        };
        myChart.setOption(option);
        
        window.addEventListener('resize', function() {
            myChart.resize();
        });
    </script>
</body>
</html>`;

const currentFileUrl = import.meta.url;
const currentDirPath = path.dirname(fileURLToPath(currentFileUrl));
const outputPath = path.join(currentDirPath, 'test-output.html');

fs.writeFileSync(outputPath, htmlContent, 'utf-8');
console.log(`✅ Visual Verification File created successfully at: ${outputPath}`);
