import { min, max, mean } from 'simple-statistics';
import { FeatureCardCalibrator } from '../pipeline/featureCardCalibrator.js';
import { MetricSemantics } from '../pipeline/metricSemantics.js';
import { SeriesFeaturePipeline } from '../pipeline/seriesFeaturePipeline.js';
import { MathUtility } from '../utils/mathUtility.js';
import { FeatureCard, FieldRole, FindingItem, SeriesAnalysisResult, SeriesFeatureSummary, TimePoint } from '../types.js';

export class SingleSeriesAnalyzer {
  public static analyze(data: TimePoint[], name: string, role?: FieldRole): SeriesAnalysisResult {
    const summary = SingleSeriesAnalyzer.summarize(data, name, role);
    const featureCards = FeatureCardCalibrator.calibrate(SingleSeriesAnalyzer.buildFeatureCards(summary));
    const narrative = SingleSeriesAnalyzer.process(data, name, role);
    return { summary, featureCards, narrative };
  }

  public static summarize(data: TimePoint[], name: string, role?: FieldRole): SeriesFeatureSummary {
    const sortedData = MetricSemantics.sortTelemetryPoints(data);
    const metricMode = MetricSemantics.inferMetricMode(name, role);
    const metricSubtype = MetricSemantics.inferMetricSubtype(name, role);
    const values = sortedData.map((d) => d.value);
    const dominantPeriods = MathUtility.detectCandidatePeriods(values, Math.floor(values.length / 3));
    const anomalies = MathUtility.zScorePeakDetection(values, Math.min(30, Math.max(5, Math.floor(values.length / 5))), 3.5, 0.1);
    const qualityIssues = MathUtility.assessSeriesQuality(sortedData);
    const regimes = SeriesFeaturePipeline.extractRegimes(sortedData);
    const counterFeatures = role === 'counter' ? SeriesFeaturePipeline.extractCounterFeatures(sortedData) : undefined;
    const dynamicFeatures = metricMode === 'dynamic' ? SeriesFeaturePipeline.extractDynamicFeatures(sortedData) : undefined;
    const batteryFeatures = metricMode === 'battery' ? SeriesFeaturePipeline.extractBatteryFeatures(sortedData) : undefined;

    let positiveMoves = 0;
    let negativeMoves = 0;
    for (let i = 1; i < values.length; i++) {
      const delta = values[i] - values[i - 1];
      if (delta > 0) positiveMoves++;
      if (delta < 0) negativeMoves++;
    }

    let trend: SeriesFeatureSummary['trend'] = 'stable';
    if (positiveMoves > negativeMoves * 1.25) trend = 'rising';
    else if (negativeMoves > positiveMoves * 1.25) trend = 'falling';
    else if (positiveMoves > 0 && negativeMoves > 0) trend = 'mixed';

    const range = values.length === 0 ? 0 : Math.max(...values) - Math.min(...values);
    const avgAbs = values.length === 0 ? 0 : values.reduce((sum, value) => sum + Math.abs(value), 0) / values.length;
    const relativeRange = avgAbs === 0 ? range : range / avgAbs;
    let volatility: SeriesFeatureSummary['volatility'] = 'low';
    if (relativeRange > 0.8) volatility = 'high';
    else if (relativeRange > 0.25) volatility = 'medium';

    return {
      name,
      role,
      metricMode,
      metricSubtype,
      sampleCount: sortedData.length,
      duration: sortedData.length > 1 ? sortedData[sortedData.length - 1].time - sortedData[0].time : undefined,
      dominantPeriods,
      trend,
      volatility,
      anomalies,
      regimes,
      counterFeatures,
      dynamicFeatures,
      batteryFeatures,
      qualityIssues,
    };
  }

  public static process(data: TimePoint[], name: string, role?: FieldRole): string {
    const sortedData = MetricSemantics.sortTelemetryPoints(data);
    const n = sortedData.length;
    const summary = SingleSeriesAnalyzer.summarize(sortedData, name, role);
    const analysisMode = SeriesFeaturePipeline.chooseAnalysisMode(role);

    // Rule 1: Not enough data for advanced feature extraction
    if (n < 5) return SingleSeriesAnalyzer.generateRawDataNarrative(sortedData, name);

    const values = sortedData.map((d) => d.value);

    // Rule 2: Detect periodicity (Dominant Period)
    const periodResult = summary.dominantPeriods.length > 0
      ? { isPeriodic: true, period: summary.dominantPeriods[0] }
      : MathUtility.detectDominantPeriod(values, Math.floor(n / 3));

    let sb = `Dynamic Behavior and Trajectory Analysis Report for [${name}]:\n\n`;
    if (summary.qualityIssues.length > 0) {
      sb += `[Data Quality Gate]\n`;
      for (const issue of summary.qualityIssues) {
        sb += `- ${issue.severity.toUpperCase()}: ${issue.message}\n`;
      }
      sb += '\n';
    }

    sb += `[Series Characterization]\n`;
    sb += `- Samples: ${summary.sampleCount}`;
    if (summary.duration !== undefined) {
      sb += `, Duration: ${summary.duration} time units`;
    }
    sb += `\n- Trend Regime: ${summary.trend}\n`;
    sb += `- Volatility Regime: ${summary.volatility}\n`;
    sb += `- Analysis Mode: ${analysisMode}\n`;
    sb += `- Metric Semantics: ${MetricSemantics.describeMetricMode(summary.metricMode ?? 'generic')}\n`;
    if (summary.dominantPeriods.length > 0) {
      sb += `- Candidate Periods: ${summary.dominantPeriods.join(', ')} observation points\n\n`;
    } else {
      sb += `- Candidate Periods: none with sufficient confidence\n\n`;
    }

    sb += SingleSeriesAnalyzer.generateRegimeNarrative(summary);
    if (summary.counterFeatures) {
      sb += SingleSeriesAnalyzer.generateCounterNarrative(summary);
    }
    if (summary.dynamicFeatures) {
      sb += SingleSeriesAnalyzer.generateDynamicNarrative(summary);
    }
    if (summary.batteryFeatures) {
      sb += SingleSeriesAnalyzer.generateBatteryNarrative(summary);
    }

    if (periodResult.isPeriodic && periodResult.period! >= 4) {
      // Rule 3: Periodic
      const T = periodResult.period!;
      sb += `1. Periodicity Conclusion: A highly repetitive pattern was detected. A complete cycle consists of ${T} observation points.\n`;
      sb += `The following analysis represents the 'Golden Cycle' characteristics extracted after noise filtering and phase folding:\n\n`;

      const foldedValues = MathUtility.extractGoldenProfile(values, T);
      const foldedData: TimePoint[] = foldedValues.map((val, i) => ({
        time: (i * 100.0) / T,
        value: val,
      }));

      sb += SingleSeriesAnalyzer.generateAdvancedTrajectoryNarrative(foldedData, 'Standard Cycle Trajectory') + '\n';
      sb += SingleSeriesAnalyzer.generateWaveformDistributionNarrative(foldedValues) + '\n';
    } else {
      // Rule 4: Non-periodic
      sb += `1. Periodicity Conclusion: No distinct fixed repetitive cycles were detected. Advanced global trajectory analysis follows:\n\n`;
      sb += SingleSeriesAnalyzer.generateAdvancedTrajectoryNarrative(sortedData, name) + '\n';
    }

    return sb;
  }

  public static buildFeatureCards(summary: SeriesFeatureSummary): FeatureCard[] {
    const cards: FeatureCard[] = [];

    cards.push({
      kind: 'trend',
      title: 'Global Trend',
      confidence: 0.85,
      summary: `${summary.name} is ${summary.trend} with ${summary.volatility} volatility.`,
      evidence: [
        `sample_count=${summary.sampleCount}`,
        `metric_mode=${summary.metricMode ?? 'generic'}`,
        `metric_subtype=${summary.metricSubtype ?? 'generic'}`,
        `regime_count=${summary.regimes.length}`,
      ],
    });

    if (summary.dominantPeriods.length > 0) {
      const periodConfidence = summary.dominantPeriods[0] >= 6 ? 0.62 : 0.25;
      if (periodConfidence >= 0.5) {
        cards.push({
          kind: 'periodicity',
          title: 'Candidate Periodicity',
          confidence: periodConfidence,
          summary: `Possible repeating structure at ${summary.dominantPeriods.join(', ')} samples.`,
          evidence: summary.dominantPeriods.map((period) => `period=${period}`),
        });
      }
    }

    if (summary.regimes.length > 0) {
      const leadingRegime = summary.regimes[0];
      cards.push({
        kind: 'regime',
        title: 'Primary Regime',
        confidence: 0.8,
        summary: `${leadingRegime.regime} / ${leadingRegime.volatility} regime from ${leadingRegime.startTime} to ${leadingRegime.endTime}.`,
        evidence: [
          `mean=${leadingRegime.meanValue.toFixed(3)}`,
          `slope=${leadingRegime.slope.toFixed(6)}`,
        ],
      });
    }

    if (summary.anomalies.length > 0) {
      const anomaly = [...summary.anomalies].sort((a, b) => b.score - a.score)[0];
      cards.push({
        kind: 'anomaly',
        title: 'Top Anomaly',
        confidence: Math.min(0.99, 0.45 + anomaly.score / 10),
        summary: `${anomaly.type} anomaly near index ${anomaly.index} with score ${anomaly.score.toFixed(1)}.`,
        evidence: [
          `value=${anomaly.value.toFixed(3)}`,
          `score=${anomaly.score.toFixed(3)}`,
        ],
      });
    }

    if (summary.counterFeatures) {
      cards.push({
        kind: 'counter',
        title: 'Counter Behavior',
        confidence: 0.95,
        summary: `Counter increased ${summary.counterFeatures.totalIncrease.toFixed(1)} with ${summary.counterFeatures.resets} resets.`,
        evidence: [
          `total_increase=${summary.counterFeatures.totalIncrease.toFixed(3)}`,
          `resets=${summary.counterFeatures.resets}`,
          `plateau_ratio=${summary.counterFeatures.plateauRatio.toFixed(3)}`,
        ],
      });
    }

    if (summary.dynamicFeatures) {
      cards.push({
        kind: 'dynamic',
        title: 'Dynamic Activity',
        confidence: 0.78,
        summary: `${summary.dynamicFeatures.surgeCount} surges and ${summary.dynamicFeatures.brakingCount} braking events detected.`,
        evidence: [
          `stop_ratio=${summary.dynamicFeatures.stopRatio.toFixed(3)}`,
          `cruise_ratio=${summary.dynamicFeatures.cruiseRatio.toFixed(3)}`,
          `peak=${summary.dynamicFeatures.peakValue.toFixed(3)}`,
        ],
      });
    }

    if (summary.batteryFeatures) {
      cards.push({
        kind: 'battery',
        title: 'Battery State',
        confidence: 0.82,
        summary: `Net change ${summary.batteryFeatures.netChange.toFixed(2)} with ${summary.batteryFeatures.dischargeSteps} discharge steps and ${summary.batteryFeatures.rechargeSteps} recharge steps.`,
        evidence: [
          `net_change=${summary.batteryFeatures.netChange.toFixed(3)}`,
          `recovery_events=${summary.batteryFeatures.recoveryEvents}`,
          `low_band_ratio=${summary.batteryFeatures.lowBandRatio.toFixed(3)}`,
        ],
      });
    }

    for (const issue of summary.qualityIssues) {
      cards.push({
        kind: 'quality',
        title: 'Data Quality Warning',
        confidence: 1,
        summary: issue.message,
        evidence: [`severity=${issue.severity}`, `code=${issue.code}`],
      });
    }

    return cards;
  }

  public static buildHighlights(summary: SeriesFeatureSummary): FindingItem[] {
    return FeatureCardCalibrator.calibrate(SingleSeriesAnalyzer.buildFeatureCards(summary))
      .filter((card) => card.kind !== 'quality' || summary.qualityIssues.length <= 2)
      .slice(0, 5)
      .map((card) => ({
        label: card.title,
        detail: card.summary,
        severity: card.kind === 'quality' ? 'warning' : card.kind === 'anomaly' ? 'high' : 'info',
      }));
  }

  private static generateRawDataNarrative(data: TimePoint[], name: string): string {
    let sb = `Limited observation data for [${name}] (${data.length} records). Advanced trajectory and periodicity computations are skipped. Raw records below:\n`;
    for (const point of data) {
      sb += ` - Time [${point.time}] : Value ${point.value.toFixed(1)}\n`;
    }
    sb += 'Please interpret directly based on the raw data above.\n';
    return sb;
  }

  private static generateAdvancedTrajectoryNarrative(data: TimePoint[], name: string): string {
    const values = data.map((d) => d.value);
    const n = values.length;

    // 1. Symbolic DNA (SAX)
    const saxPattern = MathUtility.saxEncoding(values, 12, 5);

    // 2. Trajectory Phases (PLA)
    const segments = MathUtility.piecewiseLinearApproximation(values, 8);

    // 3. Landmarks (Z-Score)
    const peakLag = Math.max(2, Math.min(30, Math.floor(n / 5)));
    const peaks = MathUtility.zScorePeakDetection(values, peakLag, 3.5, 0.1);

    const vMin = min(values);
    const vMax = max(values);
    const avg = mean(values);

    let sb = `[Trajectory & Feature Analysis: ${name}]\n`;
    sb += `- Global Statistics: Range [${vMin.toFixed(1)}, ${vMax.toFixed(1)}], Average: ${avg.toFixed(1)}\n`;
    sb += `- Structural DNA: "${saxPattern}" (12-segment symbolic trend encoding)\n\n`;

    sb += `[Phased Linear Trend Approximation]\n`;
    segments.forEach((seg, i) => {
      const slope = seg.slope;
      let direction = 'Stable';
      if (slope > 0.05) direction = 'Rising';
      else if (slope < -0.05) direction = 'Falling';

      sb += `- Phase ${i + 1} (${direction}): From ${data[seg.startIndex].time} (${seg.startValue.toFixed(1)}) to ${data[seg.endIndex].time} (${seg.endValue.toFixed(1)})\n`;
    });

    if (peaks.length > 0) {
      sb += `\n[Landmark Events & Anomalies]\n`;
      // Show top 5 by significance (score)
      const topPeaks = [...peaks].sort((a, b) => b.score - a.score).slice(0, 5);
      topPeaks.forEach((p) => {
        const type = p.type === 'peak' ? 'Spike/High' : 'Dip/Low';
        sb += `- ${type} at ${data[p.index].time} (Value: ${p.value.toFixed(1)}, Significance: ${p.score.toFixed(1)}σ)\n`;
      });
    } else {
      sb += `\n- No significant localized anomalies detected via Z-score analysis.\n`;
    }

    return sb;
  }

  private static generateRegimeNarrative(summary: SeriesFeatureSummary): string {
    if (summary.regimes.length === 0) {
      return `[Regime Segmentation]\n- No stable regime segmentation could be produced.\n\n`;
    }

    let sb = `[Regime Segmentation]\n`;
    const topRegimes = summary.regimes.slice(0, 6);
    for (const [index, regime] of topRegimes.entries()) {
      sb += `- Regime ${index + 1}: ${regime.regime} / ${regime.volatility} volatility from ${regime.startTime} to ${regime.endTime} (mean ${regime.meanValue.toFixed(1)}, slope ${regime.slope.toFixed(3)}).\n`;
    }
    sb += '\n';
    return sb;
  }

  private static generateCounterNarrative(summary: SeriesFeatureSummary): string {
    if (!summary.counterFeatures) return '';

    let sb = `[Counter Behavior]\n`;
    sb += `- Total increase observed: ${summary.counterFeatures.totalIncrease.toFixed(1)} units.\n`;
    sb += `- Reset events detected: ${summary.counterFeatures.resets}.\n`;
    sb += `- Plateau ratio: ${(summary.counterFeatures.plateauRatio * 100).toFixed(1)}% of steps were unchanged.\n\n`;
    return sb;
  }

  private static generateDynamicNarrative(summary: SeriesFeatureSummary): string {
    if (!summary.dynamicFeatures) return '';

    let sb = `[Dynamic Signal Behavior]\n`;
    sb += `- Stop ratio: ${(summary.dynamicFeatures.stopRatio * 100).toFixed(1)}% of samples stayed near zero.\n`;
    sb += `- Cruise ratio: ${(summary.dynamicFeatures.cruiseRatio * 100).toFixed(1)}% of samples stayed in the high-load band.\n`;
    sb += `- Surge events: ${summary.dynamicFeatures.surgeCount}, braking events: ${summary.dynamicFeatures.brakingCount}.\n`;
    sb += `- Peak observed value: ${summary.dynamicFeatures.peakValue.toFixed(1)}.\n\n`;
    return sb;
  }

  private static generateBatteryNarrative(summary: SeriesFeatureSummary): string {
    if (!summary.batteryFeatures) return '';

    let sb = `[Battery State Behavior]\n`;
    sb += `- Net change across the session: ${summary.batteryFeatures.netChange.toFixed(2)} units.\n`;
    sb += `- Discharge steps: ${summary.batteryFeatures.dischargeSteps}, recharge steps: ${summary.batteryFeatures.rechargeSteps}.\n`;
    sb += `- Recovery events: ${summary.batteryFeatures.recoveryEvents}.\n`;
    sb += `- Low-band occupancy: ${(summary.batteryFeatures.lowBandRatio * 100).toFixed(1)}% of samples stayed near the lower operating band.\n\n`;
    return sb;
  }

  private static generateWaveformDistributionNarrative(foldedCycle: number[]): string {
    const T = foldedCycle.length;
    if (T < 3) return "[Waveform Morphological Distribution]\n- Insufficient data for analysis.\n";

    const mean = foldedCycle.reduce((sum, val) => sum + val, 0) / T;
    const smoothed = new Array(T);
    for (let i = 0; i < T; i++) {
      const prev = foldedCycle[(i - 1 + T) % T];
      const curr = foldedCycle[i];
      const next = foldedCycle[(i + 1) % T];
      smoothed[i] = (prev + curr + next) / 3;
    }

    let minVal = smoothed[0], maxVal = smoothed[0];
    let minIdx = 0, maxIdx = 0;

    for (let i = 1; i < T; i++) {
      if (smoothed[i] < minVal) { minVal = smoothed[i]; minIdx = i; }
      if (smoothed[i] > maxVal) { maxVal = smoothed[i]; maxIdx = i; }
    }

    const amplitude = maxVal - minVal;
    const isFlat = mean !== 0 ? (amplitude / Math.abs(mean)) < 0.05 : amplitude < 0.01;

    let sb = `[Waveform Morphological Distribution]\n`;

    if (isFlat) {
      sb += `- Shape Classification: The cycle is categorized as 'Flat/Stable' (No significant fluctuations detected).\n`;
      sb += `- Amplitude: Peak-to-peak amplitude is negligible.\n`;
      return sb;
    }

    let riseDuration = maxIdx > minIdx ? maxIdx - minIdx : T - minIdx + maxIdx;
    let fallDuration = T - riseDuration;

    let shape = 'Symmetrical Waveform (Similar ramp-up and decay times)';
    if (riseDuration > fallDuration * 1.5) shape = 'Left-skewed Waveform (Slow ramp-up, rapid decay)';
    else if (fallDuration > riseDuration * 1.5) shape = 'Right-skewed Waveform (Sudden spike, slow decay)';

    const nearPeakCount = smoothed.filter(v => v >= maxVal - (amplitude * 0.1)).length;
    const hasMultiplePeaks = nearPeakCount > (T * 0.2);

    const peakPhase = (maxIdx / T) * 100.0;

    if (hasMultiplePeaks) {
      sb += `- Shape Classification: Complex/Multi-peak Waveform (Broad peak area detected).\n`;
    } else {
      sb += `- Shape Classification: The primary cycle is categorized as '${shape}'.\n`;
    }

    sb += `- Phase Location: The primary peak occurs at approximately ${peakPhase.toFixed(0)}% of the cycle progress.\n`;
    sb += `- Energy Distribution: The primary ramp-up takes about ${((riseDuration / T) * 100).toFixed(0)}% of the cycle duration, while the decay phase accounts for ${((fallDuration / T) * 100).toFixed(0)}%.\n`;

    return sb;
  }
}
