import fs from 'fs';
import readline from 'readline';
import path, { join } from 'path';
import { fileURLToPath } from 'url';
import { SemanticFeatureEngine, DatasetRow, TimePoint } from '../../src/index.js';

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function buildSessionId(row: DatasetRow, entityFields: string[], sessionFields: string[]): string {
    const entityKey = entityFields.length > 0
        ? entityFields.map((field) => String(row[field] ?? 'unknown')).join('|')
        : 'global';
    const sessionKey = sessionFields.length > 0
        ? sessionFields.map((field) => String(row[field] ?? 'unknown')).join('|')
        : 'global';
    return `${entityKey}::${sessionKey}`;
}

function toTimePoints(rows: DatasetRow[], timestampField: string, metric: string): TimePoint[] {
    return rows
        .map((row) => {
            const time = Number(row[timestampField]);
            const value = Number(row[metric]);
            return Number.isFinite(time) && Number.isFinite(value) ? { time, value } : undefined;
        })
        .filter((point): point is TimePoint => point !== undefined);
}

function downsample(points: TimePoint[], limit: number): TimePoint[] {
    if (points.length <= limit) return points;
    const step = Math.max(1, Math.ceil(points.length / limit));
    const result: TimePoint[] = [];
    for (let i = 0; i < points.length; i += step) {
        result.push(points[i]);
    }
    return result;
}

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
    const rows: DatasetRow[] = [];

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
            const row: DatasetRow = {};

            row[headers[0]] = timeVal;
            for (let i = 1; i < headers.length; i++) {
                const headerName = headers[i];
                const value = parseFloat(columns[i]);
                if (!isNaN(value)) {
                    row[headerName] = value;
                    metricData[headerName].push({
                        time: timeVal,
                        value: value
                    });
                }
            }
            rows.push(row);
        }
        lineCount++;
    }

    console.log(`[Success] Parsed ${lineCount - 1} rows of telemetry data.\n`);
    const datasetResult = SemanticFeatureEngine.analyzeDataset(rows);
    const datasetLlm = SemanticFeatureEngine.analyzeDatasetForLLM(rows);
    const datasetPrompt = SemanticFeatureEngine.analyzeDatasetForPrompt(rows);
    const sessionRowMap = new Map<string, DatasetRow[]>();
    for (const row of rows) {
        const sessionId = buildSessionId(
            row,
            datasetResult.profile.schema.entityFields,
            datasetResult.profile.schema.sessionFields
        );
        const bucket = sessionRowMap.get(sessionId);
        if (bucket) {
            bucket.push(row);
        } else {
            sessionRowMap.set(sessionId, [row]);
        }
    }
    console.log(`[Dataset Summary]`);
    console.log(datasetResult.narratives[0]);
    console.log(`\n[Dataset LLM Payload]\n${datasetLlm.text}\n`);
    console.log(`[Dataset Prompt Payload]\n${datasetPrompt.text}\n`);
    
    // Prepare for integration processing
    const columnsToAnalyze = datasetResult.profile.fieldProfiles
        .filter(field => field.role === 'continuous' || field.role === 'counter')
        .map(field => field.name);
    
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

    console.log(`\n[Phase 3] Relational Causal Analysis on 2 Deterministic Metrics...`);
    
    if (columnsToAnalyze.length >= 2) {
        const [colA, colB] = columnsToAnalyze;

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
        const llmA = SemanticFeatureEngine.analyzeSingleForLLM(metricData[colA], colA);
        const llmB = SemanticFeatureEngine.analyzeSingleForLLM(metricData[colB], colB);
        const relationLlm = SemanticFeatureEngine.analyzeRelationForLLM(metricData[colA], metricData[colB], colA, colB);
        const promptA = SemanticFeatureEngine.analyzeSingleForPrompt(metricData[colA], colA);
        const promptB = SemanticFeatureEngine.analyzeSingleForPrompt(metricData[colB], colB);
        const relationPrompt = SemanticFeatureEngine.analyzeRelationForPrompt(metricData[colA], metricData[colB], colA, colB);
        const topFinding = datasetResult.findings[0];
        const reviewSections = datasetResult.findings.map((finding, index) => {
            const sessionRows = sessionRowMap.get(finding.sessionId) ?? [];
            const seriesForChart = finding.seriesFindings.slice(0, 3).map((seriesFinding) => {
                const points = downsample(
                    toTimePoints(sessionRows, datasetResult.profile.schema.timestampField, seriesFinding.metric),
                    240
                );
                return {
                    name: seriesFinding.metric,
                    metricMode: seriesFinding.metricMode ?? 'generic',
                    times: points.map((point) => point.time),
                    values: points.map((point) => point.value),
                    llm: SemanticFeatureEngine.analyzeSingleForLLM(
                        toTimePoints(sessionRows, datasetResult.profile.schema.timestampField, seriesFinding.metric),
                        seriesFinding.metric,
                        seriesFinding.role
                    ).text,
                    prompt: SemanticFeatureEngine.analyzeSingleForPrompt(
                        toTimePoints(sessionRows, datasetResult.profile.schema.timestampField, seriesFinding.metric),
                        seriesFinding.metric,
                        seriesFinding.role
                    ).text,
                };
            });

            const sessionRelation = finding.relationFinding
                ? {
                    pair: finding.relationFinding.pair,
                    llm: SemanticFeatureEngine.analyzeRelationForLLM(
                        toTimePoints(sessionRows, datasetResult.profile.schema.timestampField, finding.relationFinding.pair[0]),
                        toTimePoints(sessionRows, datasetResult.profile.schema.timestampField, finding.relationFinding.pair[1]),
                        finding.relationFinding.pair[0],
                        finding.relationFinding.pair[1]
                    ).text,
                    prompt: SemanticFeatureEngine.analyzeRelationForPrompt(
                        toTimePoints(sessionRows, datasetResult.profile.schema.timestampField, finding.relationFinding.pair[0]),
                        toTimePoints(sessionRows, datasetResult.profile.schema.timestampField, finding.relationFinding.pair[1]),
                        finding.relationFinding.pair[0],
                        finding.relationFinding.pair[1]
                    ).text,
                }
                : undefined;

            const metricCards = finding.seriesFindings.map((seriesFinding) => {
                const highlights = seriesFinding.highlights
                    .map((item) => `<li><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.detail)}</li>`)
                    .join('');
                const featureCards = seriesFinding.analysis.featureCards
                    .slice(0, 4)
                    .map((card) => `<li><strong>${escapeHtml(card.title)}:</strong> ${escapeHtml(card.summary)} <em>(confidence ${card.confidence.toFixed(2)})</em></li>`)
                    .join('');

                return `<div class="finding-card">
                    <div class="finding-header">
                        <span class="badge badge-a">${escapeHtml(seriesFinding.metricMode ?? 'generic')}</span>
                        <span class="report-title">${escapeHtml(seriesFinding.metric)}</span>
                    </div>
                    <ul class="highlights">${highlights}</ul>
                    <div class="facts-title">Feature Cards</div>
                    <ul class="highlights">${featureCards}</ul>
                    <div class="facts-title">LLM Payload</div>
                    <div class="llm-block">${escapeHtml(seriesForChart.find((item) => item.name === seriesFinding.metric)?.llm ?? '')}</div>
                    <div class="facts-title">Prompt Schema</div>
                    <div class="llm-block">${escapeHtml(seriesForChart.find((item) => item.name === seriesFinding.metric)?.prompt ?? '')}</div>
                </div>`;
            }).join('');

            const relationCard = finding.relationFinding
                ? `<div class="finding-card wide">
                    <div class="finding-header">
                        <span class="badge badge-relation">relation</span>
                        <span class="report-title">${escapeHtml(finding.relationFinding.pair.join(' <-> '))}</span>
                    </div>
                    <ul class="highlights">
                        ${finding.relationFinding.highlights.map((item) => `<li><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.detail)}</li>`).join('')}
                    </ul>
                    <div class="facts-title">Relation Cards</div>
                    <ul class="highlights">
                        ${finding.relationFinding.analysis.featureCards.slice(0, 4).map((card) => `<li><strong>${escapeHtml(card.title)}:</strong> ${escapeHtml(card.summary)} <em>(confidence ${card.confidence.toFixed(2)})</em></li>`).join('')}
                    </ul>
                    <div class="facts-title">LLM Payload</div>
                    <div class="llm-block">${escapeHtml(sessionRelation?.llm ?? '')}</div>
                    <div class="facts-title">Prompt Schema</div>
                    <div class="llm-block">${escapeHtml(sessionRelation?.prompt ?? '')}</div>
                </div>`
                : '';

            const checklist = `
                <ul class="review-list">
                    <li>Check whether major rises/falls in the chart appear in the feature cards.</li>
                    <li>Check whether the LLM payload omits weak or noisy claims.</li>
                    <li>Check whether relation claims match visible lag/coupling in the plotted traces.</li>
                    <li>Check whether the prompt schema clearly separates high-confidence facts from uncertain ones.</li>
                </ul>
            `;

            return {
                chartId: `session-chart-${index}`,
                titleHtml: `<section class="review-section">
                    <div class="session-header">
                        <h2>${escapeHtml(finding.sessionId)}</h2>
                        <p>${finding.rowCount} rows | ${finding.startTime} -> ${finding.endTime}</p>
                    </div>
                    <div class="review-note">
                        <strong>Human Review Checklist</strong>
                        ${checklist}
                    </div>
                    <div class="main-card">
                        <div id="session-chart-${index}" class="session-chart"></div>
                    </div>
                    <div class="finding-grid">${metricCards}${relationCard}</div>
                </section>`,
                chartData: {
                    chartId: `session-chart-${index}`,
                    series: seriesForChart,
                },
            };
        });
        const sessionCards = datasetResult.findings.map((finding) => {
            const seriesCards = finding.seriesFindings.map((seriesFinding) => {
                const highlights = seriesFinding.highlights
                    .map((item) => `<li><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.detail)}</li>`)
                    .join('');
                const featureCards = seriesFinding.analysis.featureCards
                    .slice(0, 4)
                    .map((card) => `<li><strong>${escapeHtml(card.title)}:</strong> ${escapeHtml(card.summary)} <em>(confidence ${card.confidence.toFixed(2)})</em></li>`)
                    .join('');

                return `<div class="finding-card">
                    <div class="finding-header">
                        <span class="badge badge-a">${escapeHtml(seriesFinding.metricMode ?? 'generic')}</span>
                        <span class="report-title">${escapeHtml(seriesFinding.metric)}</span>
                    </div>
                    <ul class="highlights">${highlights}</ul>
                    <div class="facts-title">Feature Cards</div>
                    <ul class="highlights">${featureCards}</ul>
                </div>`;
            }).join('');

            const relationCard = finding.relationFinding
                ? `<div class="finding-card wide">
                    <div class="finding-header">
                        <span class="badge badge-relation">relation</span>
                        <span class="report-title">${escapeHtml(finding.relationFinding.pair.join(' <-> '))}</span>
                    </div>
                    <ul class="highlights">
                        ${finding.relationFinding.highlights.map((item) => `<li><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.detail)}</li>`).join('')}
                    </ul>
                    <div class="facts-title">Relation Cards</div>
                    <ul class="highlights">
                        ${finding.relationFinding.analysis.featureCards.slice(0, 4).map((card) => `<li><strong>${escapeHtml(card.title)}:</strong> ${escapeHtml(card.summary)} <em>(confidence ${card.confidence.toFixed(2)})</em></li>`).join('')}
                    </ul>
                </div>`
                : '';

            return `<section class="session-section">
                <div class="session-header">
                    <h2>${escapeHtml(finding.sessionId)}</h2>
                    <p>${finding.rowCount} rows | ${finding.startTime} -> ${finding.endTime}</p>
                </div>
                <div class="finding-grid">${seriesCards}${relationCard}</div>
            </section>`;
        }).join('');

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

        .session-chart {
            width: 100%;
            height: 420px;
        }

        .reports-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 24px;
        }

        .session-section {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .review-section {
            display: flex;
            flex-direction: column;
            gap: 18px;
        }

        .review-note {
            background: rgba(15, 23, 42, 0.45);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 18px;
            color: #dbeafe;
        }

        .review-list {
            margin: 12px 0 0;
            padding-left: 18px;
            line-height: 1.7;
        }

        .session-header h2 {
            margin: 0;
            font-size: 1.4rem;
        }

        .session-header p {
            margin: 6px 0 0;
            color: var(--text-secondary);
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

        .finding-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 18px;
        }

        .finding-card {
            background: rgba(15, 23, 42, 0.5);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 20px;
        }

        .finding-card.wide {
            grid-column: 1 / -1;
        }

        .report-header {
            display: flex;
            align-items: center;
            gap: 12px;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 12px;
        }

        .finding-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 14px;
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

        .llm-block {
            background: rgba(2, 6, 23, 0.7);
            border: 1px solid rgba(56, 189, 248, 0.18);
            border-radius: 14px;
            padding: 18px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.88rem;
            white-space: pre-wrap;
            line-height: 1.6;
            color: #dbeafe;
        }

        .highlights {
            margin: 0;
            padding-left: 18px;
            color: #cbd5e1;
            line-height: 1.7;
        }

        .facts-title {
            margin-top: 14px;
            font-size: 0.85rem;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--text-secondary);
        }

        .summary-panel {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 18px;
        }

        .summary-tile {
            background: rgba(15, 23, 42, 0.45);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 18px;
        }

        .summary-tile strong {
            display: block;
            font-size: 1.5rem;
            margin-bottom: 6px;
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

        <div class="summary-panel">
            <div class="summary-tile">
                <strong>${datasetResult.profile.sessions.length}</strong>
                Sessions detected
            </div>
            <div class="summary-tile">
                <strong>${datasetResult.profile.fieldProfiles.length}</strong>
                Fields profiled
            </div>
            <div class="summary-tile">
                <strong>${datasetResult.findings.length}</strong>
                Session reports rendered
            </div>
            <div class="summary-tile">
                <strong>${columnsToAnalyze.length}</strong>
                Metrics selected
            </div>
        </div>

        <div class="report-card">
            <div class="report-header">
                <span class="badge badge-relation">LLM Payload</span>
                <span class="report-title">Dataset-Level Graph2Text Output</span>
            </div>
            <div class="llm-block">${escapeHtml(datasetLlm.text)}</div>
            <div class="facts-title">Prompt Schema</div>
            <div class="llm-block">${escapeHtml(datasetPrompt.text)}</div>
        </div>

        <div class="main-card">
            <div id="chart"></div>
        </div>

        <section class="review-section">
            <div class="session-header">
                <h2>Session Review Workspace</h2>
                <p>These charts are the primary human-validation surface: compare raw traces against feature cards, LLM payloads, and prompt schema outputs.</p>
            </div>
            ${reviewSections.map((section) => section.titleHtml).join('')}
        </section>

        ${sessionCards}

        <div class="reports-grid">
            <div class="report-card">
                <div class="report-header">
                    <span class="badge badge-a">Metric A</span>
                    <span class="report-title">${colA}</span>
                </div>
                <div class="llm-block">${escapeHtml(llmA.text)}</div>
                <div class="facts-title">Prompt Schema</div>
                <div class="llm-block">${escapeHtml(promptA.text)}</div>
                <div class="narrative">${escapeHtml(reportA)}</div>
            </div>

            <div class="report-card">
                <div class="report-header">
                    <span class="badge badge-b">Metric B</span>
                    <span class="report-title">${colB}</span>
                </div>
                <div class="llm-block">${escapeHtml(llmB.text)}</div>
                <div class="facts-title">Prompt Schema</div>
                <div class="llm-block">${escapeHtml(promptB.text)}</div>
                <div class="narrative">${escapeHtml(reportB)}</div>
            </div>

            <div class="report-card wide">
                <div class="report-header">
                    <span class="badge badge-relation">Relational Analysis</span>
                    <span class="report-title">Inter-series Correlation</span>
                </div>
                <div class="llm-block">${escapeHtml(relationLlm.text)}</div>
                <div class="facts-title">Prompt Schema</div>
                <div class="llm-block">${escapeHtml(relationPrompt.text)}</div>
                <div class="narrative">${escapeHtml(relationReport)}</div>
            </div>
        </div>

        <footer>
            Parsed ${dataA.length} data points. Visualization downsampled to ~${plotLimit} points using step ${step}. Top session: ${escapeHtml(topFinding?.sessionId ?? 'n/a')}.
        </footer>
    </div>

    <script>
        const chartDom = document.getElementById('chart');
        const myChart = echarts.init(chartDom, 'dark');
        const reviewCharts = ${JSON.stringify(reviewSections.map((section) => section.chartData))};
        
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

        reviewCharts.forEach((reviewChart) => {
            const target = document.getElementById(reviewChart.chartId);
            if (!target) return;
            const chart = echarts.init(target, 'dark');
            const baseTimes = reviewChart.series[0]?.times ?? [];
            chart.setOption({
                backgroundColor: 'transparent',
                animation: false,
                tooltip: { trigger: 'axis' },
                legend: {
                    top: 0,
                    textStyle: { color: '#94a3b8', fontFamily: 'Inter' },
                    data: reviewChart.series.map((item) => item.name)
                },
                grid: { left: '4%', right: '4%', bottom: '12%', containLabel: true },
                dataZoom: [
                    { type: 'inside', start: 0, end: 100 },
                    { start: 0, end: 100 }
                ],
                xAxis: {
                    type: 'category',
                    data: baseTimes,
                    axisLine: { lineStyle: { color: '#475569' } }
                },
                yAxis: {
                    type: 'value',
                    axisLine: { lineStyle: { color: '#475569' } },
                    splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.15)' } }
                },
                series: reviewChart.series.map((item, idx) => ({
                    name: item.name,
                    type: 'line',
                    data: item.values,
                    showSymbol: false,
                    smooth: false,
                    lineStyle: { width: 2 },
                    emphasis: { focus: 'series' }
                }))
            });
            window.addEventListener('resize', function() {
                chart.resize();
            });
        });
        
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
