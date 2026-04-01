import fs from 'fs';
import readline from 'readline';
import path, { join } from 'path';
import { fileURLToPath } from 'url';
import { SemanticFeatureEngine, TimePoint } from '../../src/index.js';

async function validateRealTelemetryData() {
    const csvPath = join(process.cwd(), 'data', '01_raw_telemetry.csv');
    
    if (!fs.existsSync(csvPath)) {
        console.error(`Could not find CSV file at ${csvPath}`);
        process.exit(1);
    }
    
    console.log(`[Phase 1] Scanning and parsing massive dataset: ${csvPath}...`);
    
    const fileStream = fs.createReadStream(csvPath, { encoding: 'utf8' });
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let headers: string[] = [];
    const metricData: { [key: string]: TimePoint[] } = {};

    let lineCount = 0;
    
    for await (const line of rl) {
        if (!line.trim()) continue;
        
        const columns = line.split(',');
        
        if (lineCount === 0) {
            headers = columns;
            // Initialize arrays for all headers except 'ts' (assuming ts is index 0)
            for (let i = 1; i < headers.length; i++) {
                metricData[headers[i]] = [];
            }
        } else {
            const timeVal = parseFloat(columns[0]); // ts
            if (isNaN(timeVal)) continue;

            for (let i = 1; i < headers.length; i++) {
                const headerName = headers[i];
                const value = parseFloat(columns[i]);
                if (!isNaN(value)) {
                    metricData[headerName].push({
                        time: timeVal,
                        value: value
                    });
                }
            }
        }
        lineCount++;
    }

    console.log(`[Success] Parsed ${lineCount - 1} rows of telemetry data.\n`);
    
    // Prepare for integration processing
    const columnsToAnalyze = Object.keys(metricData);
    
    console.log(`[Phase 2] Analyzing Single Metrics (${columnsToAnalyze.length} columns)...`);
    
    for (const col of columnsToAnalyze) {
        const data = metricData[col];
        if (data.length === 0) continue;
        
        const report = SemanticFeatureEngine.analyzeSingle(data, col);
        console.log(`\n======================================================`);
        console.log(`| Single Analysis: ${col} `);
        console.log(`======================================================`);
        console.log(report);
    }

    console.log(`\n[Phase 3] Relational Causal Analysis on 2 Random Metrics...`);
    
    if (columnsToAnalyze.length >= 2) {
        // Pick two random but distinct metrics
        const pick1 = Math.floor(Math.random() * columnsToAnalyze.length);
        let pick2 = Math.floor(Math.random() * columnsToAnalyze.length);
        while (pick1 === pick2) {
            pick2 = Math.floor(Math.random() * columnsToAnalyze.length);
        }

        const colA = columnsToAnalyze[pick1];
        const colB = columnsToAnalyze[pick2];

        console.log(`Analyzing: [${colA}] vs [${colB}]`);
        const relationReport = SemanticFeatureEngine.analyzeRelation(metricData[colA], metricData[colB], colA, colB);
        console.log(`\n======================================================`);
        console.log(`| Multidimensional Correlation Analysis `);
        console.log(`======================================================`);
        console.log(relationReport);

        // --- HTML Visualization Generation ---
        console.log("\n[Phase 4] Generating real-test-output.html to verify visual correctness...");

        const dataA = metricData[colA];
        const dataB = metricData[colB];

        // Downsample for the ECharts browser rendering to prevent browser freeze (limit to ~5,000 points)
        const plotLimit = Math.min(dataA.length, 3000);
        const step = Math.max(1, Math.ceil(dataA.length / plotLimit));

        const times = [];
        const valuesA = [];
        const valuesB = [];

        for (let i = 0; i < dataA.length; i += step) {
            times.push(dataA[i].time);
            valuesA.push(dataA[i].value);
            // Make sure B has same indices
            if (dataB[i]) {
                valuesB.push(dataB[i].value);
            } else {
                valuesB.push(0);
            }
        }

        const reportA = SemanticFeatureEngine.analyzeSingle(metricData[colA], colA);
        const reportB = SemanticFeatureEngine.analyzeSingle(metricData[colB], colB);

        const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Semantic Time-Series | Real Data Verification</title>
    <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-color: #0f172a;
            --card-bg: rgba(30, 41, 59, 0.7);
            --accent-primary: #38bdf8;
            --accent-secondary: #f43f5e;
            --text-primary: #f1f5f9;
            --text-secondary: #94a3b8;
            --border-color: rgba(255, 255, 255, 0.1);
        }

        body { 
            margin: 0; 
            padding: 40px; 
            font-family: 'Inter', sans-serif; 
            background-color: var(--bg-color); 
            color: var(--text-primary);
            background-image: 
                radial-gradient(at 0% 0%, rgba(56, 189, 248, 0.15) 0px, transparent 50%),
                radial-gradient(at 100% 100%, rgba(244, 63, 94, 0.1) 0px, transparent 50%);
            min-height: 100vh;
        }

        .container { 
            max-width: 1400px; 
            margin: 0 auto;
            display: flex; 
            flex-direction: column; 
            gap: 32px; 
        }

        header {
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 24px;
            margin-bottom: 12px;
        }

        h1 { 
            font-size: 2.5rem; 
            font-weight: 700; 
            margin: 0;
            background: linear-gradient(to right, var(--accent-primary), #818cf8);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            letter-spacing: -0.025em;
        }

        .subtitle {
            color: var(--text-secondary);
            font-size: 1.1rem;
            margin-top: 8px;
        }

        .main-card {
            background: var(--card-bg);
            backdrop-filter: blur(12px);
            border: 1px solid var(--border-color);
            border-radius: 24px;
            padding: 32px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            transition: transform 0.3s ease;
        }

        #chart { 
            width: 100%; 
            height: 600px; 
        }

        .reports-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 24px;
        }

        .report-card {
            background: rgba(15, 23, 42, 0.5);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 24px;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .report-card.wide {
            grid-column: 1 / -1;
        }

        .report-header {
            display: flex;
            align-items: center;
            gap: 12px;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 12px;
        }

        .badge {
            padding: 4px 12px;
            border-radius: 9999px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .badge-a { background: rgba(56, 189, 248, 0.2); color: var(--accent-primary); border: 1px solid var(--accent-primary); }
        .badge-b { background: rgba(244, 63, 94, 0.2); color: var(--accent-secondary); border: 1px solid var(--accent-secondary); }
        .badge-relation { background: rgba(129, 140, 248, 0.2); color: #818cf8; border: 1px solid #818cf8; }

        .report-title {
            font-size: 1.25rem;
            font-weight: 600;
        }

        .narrative { 
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.95rem;
            white-space: pre-wrap; 
            line-height: 1.6; 
            color: #cbd5e1;
        }

        footer {
            margin-top: 40px;
            text-align: center;
            color: var(--text-secondary);
            font-size: 0.875rem;
        }

        /* Customize scrollbar */
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: var(--bg-color); }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #475569; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>Semantic Feature Verification</h1>
            <div class="subtitle">Validating library analysis on real-world telemetry data</div>
        </header>

        <div class="main-card">
            <div id="chart"></div>
        </div>

        <div class="reports-grid">
            <div class="report-card">
                <div class="report-header">
                    <span class="badge badge-a">Metric A</span>
                    <span class="report-title">${colA}</span>
                </div>
                <div class="narrative">${reportA.replace(/</g, "&lt;")}</div>
            </div>

            <div class="report-card">
                <div class="report-header">
                    <span class="badge badge-b">Metric B</span>
                    <span class="report-title">${colB}</span>
                </div>
                <div class="narrative">${reportB.replace(/</g, "&lt;")}</div>
            </div>

            <div class="report-card wide">
                <div class="report-header">
                    <span class="badge badge-relation">Relational Analysis</span>
                    <span class="report-title">Inter-series Correlation</span>
                </div>
                <div class="narrative">${relationReport.replace(/</g, "&lt;")}</div>
            </div>
        </div>

        <footer>
            Parsed ${dataA.length} data points. Visualization downsampled to ~${plotLimit} points using step ${step}.
        </footer>
    </div>

    <script>
        const chartDom = document.getElementById('chart');
        const myChart = echarts.init(chartDom, 'dark');
        
        const option = {
            backgroundColor: 'transparent',
            animation: true,
            animationDuration: 1500,
            tooltip: { 
                trigger: 'axis',
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                borderColor: 'rgba(255, 255, 255, 0.1)',
                textStyle: { color: '#f1f5f9' },
                backdropFilter: 'blur(4px)'
            },
            legend: { 
                data: ['${colA}', '${colB}'], 
                textStyle: { color: '#94a3b8', fontFamily: 'Inter' },
                top: 0
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '15%',
                containLabel: true
            },
            dataZoom: [
                { 
                    type: 'inside', 
                    start: 0, 
                    end: 100 
                },
                { 
                    start: 0, 
                    end: 100,
                    textStyle: { color: '#94a3b8' },
                    handleIcon: 'path://M10.7,11.9v-1.3H9.3v1.3c-4.9,0.3-8.8,4.4-8.8,9.4c0,5,3.9,9.1,8.8,9.4v1.3h1.3v-1.3c4.9-0.3,8.8-4.4,8.8-9.4C19.5,16.3,15.6,12.2,10.7,11.9z M13.3,24.4H6.7V23h6.6V24.4z M13.3,19.6H6.7v-1.4h6.6V19.6z',
                    handleSize: '80%',
                    handleStyle: {
                        color: '#fff',
                        shadowBlur: 3,
                        shadowColor: 'rgba(0, 0, 0, 0.6)',
                        shadowOffsetX: 2,
                        shadowOffsetY: 2
                    }
                }
            ],
            xAxis: { 
                type: 'category', 
                data: ${JSON.stringify(times)},
                axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } },
                axisLabel: { color: '#94a3b8' },
                splitLine: { show: false }
            },
            yAxis: [
                { 
                    type: 'value',
                    name: '${colA}',
                    axisLine: { show: true, lineStyle: { color: '#38bdf8' } },
                    axisLabel: { color: '#38bdf8' },
                    splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.05)' } }
                },
                { 
                    type: 'value',
                    name: '${colB}',
                    position: 'right',
                    axisLine: { show: true, lineStyle: { color: '#f43f5e' } },
                    axisLabel: { color: '#f43f5e' },
                    splitLine: { show: false }
                }
            ],
            series: [
                {
                    name: '${colA}',
                    type: 'line',
                    yAxisIndex: 0,
                    data: ${JSON.stringify(valuesA)},
                    showSymbol: false,
                    smooth: true,
                    lineStyle: { width: 3, color: '#38bdf8' },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(56, 189, 248, 0.2)' },
                            { offset: 1, color: 'rgba(56, 189, 248, 0)' }
                        ])
                    }
                },
                {
                    name: '${colB}',
                    type: 'line',
                    yAxisIndex: 1,
                    data: ${JSON.stringify(valuesB)},
                    showSymbol: false,
                    smooth: true,
                    lineStyle: { width: 3, color: '#f43f5e' },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(244, 63, 94, 0.2)' },
                            { offset: 1, color: 'rgba(244, 63, 94, 0)' }
                        ])
                    }
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
        const outputPath = path.join(currentDirPath, '..', '..', 'dist', 'real-test-output.html');

        fs.writeFileSync(outputPath, htmlContent, 'utf-8');
        console.log(`✅ Visual Verification File created successfully at: ${outputPath}`);
    }
}

validateRealTelemetryData().catch(console.error);

