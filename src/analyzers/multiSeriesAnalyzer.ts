import { sampleCorrelation } from 'simple-statistics';
import { FeatureCardCalibrator } from '../pipeline/featureCardCalibrator.js';
import { TimeSeriesAlignment } from '../pipeline/alignment.js';
import { MetricSemantics } from '../pipeline/metricSemantics.js';
import { MathUtility } from '../utils/mathUtility.js';
import { FeatureCard, FindingItem, RelationAnalysisResult, RelationFeatureSummary, TimePoint } from '../types.js';

interface CouplingSummary {
  triggerSeries: string;
  responseSeries: string;
  triggerCount: number;
  alignedResponseRate: number;
  avgResponseDelta: number;
}

export class MultiSeriesAnalyzer {
  public static analyze(dataA: TimePoint[], dataB: TimePoint[], nameA: string, nameB: string): RelationAnalysisResult {
    const summary = MultiSeriesAnalyzer.summarize(dataA, dataB, nameA, nameB);
    const featureCards = FeatureCardCalibrator.calibrate(MultiSeriesAnalyzer.buildFeatureCards(summary));
    const narrative = MultiSeriesAnalyzer.process(dataA, dataB, nameA, nameB);
    return { summary, featureCards, narrative };
  }

  private static computeEventCoupling(valsA: number[], valsB: number[], nameA: string, nameB: string): CouplingSummary | undefined {
    if (valsA.length < 6 || valsB.length < 6) return undefined;

    const deltasA: number[] = [];
    const deltasB: number[] = [];
    for (let i = 1; i < valsA.length; i++) {
      deltasA.push(valsA[i] - valsA[i - 1]);
      deltasB.push(valsB[i] - valsB[i - 1]);
    }

    const maxDeltaA = Math.max(...deltasA.map((value) => Math.abs(value)), 0);
    const maxDeltaB = Math.max(...deltasB.map((value) => Math.abs(value)), 0);
    const thresholdA = maxDeltaA * 0.35;
    const thresholdB = maxDeltaB * 0.35;

    const couplingAB = MultiSeriesAnalyzer.evaluateDirectionalCoupling(deltasA, deltasB, nameA, nameB, thresholdA);
    const couplingBA = MultiSeriesAnalyzer.evaluateDirectionalCoupling(deltasB, deltasA, nameB, nameA, thresholdB);

    if (!couplingAB) return couplingBA;
    if (!couplingBA) return couplingAB;
    return couplingAB.triggerCount >= couplingBA.triggerCount ? couplingAB : couplingBA;
  }

  private static evaluateDirectionalCoupling(
    triggerDeltas: number[],
    responseDeltas: number[],
    triggerSeries: string,
    responseSeries: string,
    threshold: number
  ): CouplingSummary | undefined {
    if (threshold <= 0) return undefined;

    let triggerCount = 0;
    let responseAlignedCount = 0;
    let responseDeltaSum = 0;

    for (let i = 0; i < triggerDeltas.length - 1; i++) {
      const triggerDelta = triggerDeltas[i];
      if (Math.abs(triggerDelta) < threshold) continue;

      triggerCount++;
      const expectedDirection = Math.sign(triggerDelta);
      const nextResponseDelta = responseDeltas[i + 1] ?? 0;
      responseDeltaSum += nextResponseDelta;

      if (Math.sign(nextResponseDelta) === expectedDirection && Math.abs(nextResponseDelta) > 0) {
        responseAlignedCount++;
      }
    }

    if (triggerCount === 0) return undefined;

    return {
      triggerSeries,
      responseSeries,
      triggerCount,
      alignedResponseRate: responseAlignedCount / triggerCount,
      avgResponseDelta: responseDeltaSum / triggerCount,
    };
  }

  private static computeWindowedCorrelation(valsA: number[], valsB: number[]) {
    if (valsA.length < 8 || valsB.length < 8) return undefined;
    const windowSize = Math.max(4, Math.floor(valsA.length / 5));
    const correlations: number[] = [];

    for (let start = 0; start + windowSize <= valsA.length; start += Math.max(2, Math.floor(windowSize / 2))) {
      const windowA = valsA.slice(start, start + windowSize);
      const windowB = valsB.slice(start, start + windowSize);
      if (windowA.length < 4) continue;
      if (MathUtility.calculateCrossCorrelation(windowA, windowB, Math.floor(windowA.length / 3)).bestCorrelation === 0 &&
        (new Set(windowA).size <= 1 || new Set(windowB).size <= 1)) {
        continue;
      }
      const corr = sampleCorrelation(windowA, windowB);
      if (Number.isFinite(corr)) correlations.push(corr);
    }

    if (correlations.length === 0) return undefined;
    return {
      strongestWindowCorrelation: Math.max(...correlations.map((value) => Math.abs(value))),
      weakestWindowCorrelation: Math.min(...correlations.map((value) => Math.abs(value))),
      stableWindowRatio: correlations.filter((value) => Math.abs(value) >= 0.5).length / correlations.length,
    };
  }

  public static summarize(dataA: TimePoint[], dataB: TimePoint[], nameA: string, nameB: string): RelationFeatureSummary {
    const alignment = TimeSeriesAlignment.alignByTimestamp(dataA, dataB);
    const alignedA = TimeSeriesAlignment.toTimePoints(alignment.points, 'a');
    const alignedB = TimeSeriesAlignment.toTimePoints(alignment.points, 'b');
    const valsA = alignedA.map((point) => point.value);
    const valsB = alignedB.map((point) => point.value);
    const staticCorrelation =
      valsA.length > 3 && valsB.length > 3 ? sampleCorrelation(valsA, valsB) : 0;
    const lagResult = MathUtility.calculateCrossCorrelation(valsA, valsB, Math.floor(valsA.length / 3));
    const metricModeA = MetricSemantics.inferMetricMode(nameA);
    const metricModeB = MetricSemantics.inferMetricMode(nameB);
    const metricSubtypeA = MetricSemantics.inferMetricSubtype(nameA);
    const metricSubtypeB = MetricSemantics.inferMetricSubtype(nameB);
    const eventCoupling = MultiSeriesAnalyzer.computeEventCoupling(valsA, valsB, nameA, nameB);
    const windowedCorrelation = MultiSeriesAnalyzer.computeWindowedCorrelation(valsA, valsB);

    return {
      nameA,
      nameB,
      alignedPoints: alignment.points.length,
      coverageRatio: alignment.coverageRatio,
      bestLag: lagResult.bestLag,
      bestCorrelation: lagResult.bestCorrelation,
      staticCorrelation,
      metricModeA,
      metricModeB,
      metricSubtypeA,
      metricSubtypeB,
      eventCoupling,
      windowedCorrelation,
      qualityIssues: [
        ...alignment.qualityIssues,
        ...MathUtility.assessSeriesQuality(alignedA),
        ...MathUtility.assessSeriesQuality(alignedB),
      ],
    };
  }

  public static process(dataA: TimePoint[], dataB: TimePoint[], nameA: string, nameB: string): string {
    const alignment = TimeSeriesAlignment.alignByTimestamp(dataA, dataB);
    const alignedA = TimeSeriesAlignment.toTimePoints(alignment.points, 'a');
    const alignedB = TimeSeriesAlignment.toTimePoints(alignment.points, 'b');
    const n = Math.min(alignedA.length, alignedB.length);
    const valsA = alignedA.slice(0, n).map((d) => d.value);
    const valsB = alignedB.slice(0, n).map((d) => d.value);
    if (n === 0) {
      return `Time-Series Causal Relationship Analysis Report for [${nameA}] and [${nameB}]:\n\n- No aligned timestamps were found, so relational analysis could not be performed.\n`;
    }
    const summary = MultiSeriesAnalyzer.summarize(dataA, dataB, nameA, nameB);

    let sb = `Time-Series Causal Relationship Analysis Report for [${nameA}] and [${nameB}]:\n\n`;
    sb += `[Alignment Gate]\n`;
    sb += `- Timestamp-aligned samples: ${n}\n`;
    sb += `- Coverage ratio: ${(alignment.coverageRatio * 100).toFixed(1)}%\n`;
    if (alignment.qualityIssues.length > 0) {
      for (const issue of alignment.qualityIssues) {
        sb += `- ${issue.severity.toUpperCase()}: ${issue.message}\n`;
      }
    }
    sb += '\n';
    sb += `[Metric Semantics]\n`;
    sb += `- ${nameA}: ${summary.metricModeA}\n`;
    sb += `- ${nameB}: ${summary.metricModeB}\n\n`;

    // 1. Concurrent Pearson Correlation
    const r =
      valsA.length > 3 && valsB.length > 3 && Number.isFinite(sampleCorrelation(valsA, valsB))
        ? sampleCorrelation(valsA, valsB)
        : 0;
    const absR = Math.abs(r);
    
    let rDesc = 'Moderate static correlation';
    if (absR < 0.3) rDesc = 'No significant static synchronization';
    else if (r > 0.6) rDesc = 'Highly positive static correlation (Moving together concurrently)';
    else if (r < -0.6) rDesc = 'Highly negative static correlation (Inverse concurrent relationship)';
    
    sb += `[Concurrent Numerical Correlation]\n`;
    sb += `- Both series exhibit '${rDesc}' (Pearson Coefficient: ${r.toFixed(2)}).\n`;

    // 2. Directional Trend Agreement (New Mechanism)
    let syncMoves = 0;
    let trackableMoves = 0;
    for (let i = 1; i < n; i++) {
        const diffA = valsA[i] - valsA[i - 1];
        const diffB = valsB[i] - valsB[i - 1];
        // Only count if they are actually moving 
        if (Math.abs(diffA) > 1e-9 && Math.abs(diffB) > 1e-9) {
            trackableMoves++;
            if ((diffA > 0 && diffB > 0) || (diffA < 0 && diffB < 0)) syncMoves++;
        }
    }
    
    sb += `\n[Directional Trend Agreement]\n`;
    if (trackableMoves > 0) {
        const agreePct = (syncMoves / trackableMoves) * 100;
        let trendDesc = 'They step randomly relative to each other.';
        if (agreePct > 70) trendDesc = `They share strong positive local momentum, physically stepping in the same direction ${agreePct.toFixed(1)}% of the time.`;
        else if (agreePct < 30) trendDesc = `They move inversely tick-by-tick, diverging in direction ${(100 - agreePct).toFixed(1)}% of the time.`;
        sb += `- ${trendDesc}\n`;
    } else {
        sb += `- Not enough volatility to measure step-by-step directional agreement.\n`;
    }

    // 3. Phase-Shifted Cross-Correlation (Temporal Causality)
    const maxLag = Math.floor(n / 3);
    const lagResult = MathUtility.calculateCrossCorrelation(valsA, valsB, maxLag);

    sb += `\n[Temporal Lead-Lag Tracking (Phase-Shifted Causality)]\n`;
    if (Math.abs(lagResult.bestCorrelation) > 0.5 && lagResult.bestLag !== 0) {
      const leader = lagResult.bestLag > 0 ? nameA : nameB;
      const follower = lagResult.bestLag > 0 ? nameB : nameA;
      
      sb += `- Highly correlated after phase shift! (Phase-Shifted Pearson: ${lagResult.bestCorrelation.toFixed(2)}).\n`;
      sb += `- Significant causal phenomenon detected: [${leader}] acts as the leading indicator. Following its shifts, [${follower}] accurately tracks the structural changes with a delay/lag of ${Math.abs(lagResult.bestLag)} time units.\n`;
    } else if (Math.abs(lagResult.bestCorrelation) <= 0.5) {
      sb += `- No underlying delayed structural similarities were found (No phase-shifted correlation).\n`;
    } else {
      sb += `- Changes in both series mostly occur synchronously. No obvious pure lead-lag tracking behavior detected.\n`;
    }

    // 4. Value Intersections
    let crossCount = 0;
    let lastCross: string | null = null;
    
    for (let i = 1; i < n; i++) {
      if (valsA[i - 1] <= valsB[i - 1] && valsA[i] > valsB[i]) {
        crossCount++;
        lastCross = `${alignedA[i].time} (${nameA} upwardly crossed ${nameB})`;
      }
      if (valsA[i - 1] >= valsB[i - 1] && valsA[i] < valsB[i]) {
        crossCount++;
        lastCross = `${alignedA[i].time} (${nameB} upwardly crossed ${nameA})`;
      }
    }

    sb += `\n[Value Intersection Status]\n`;
    if (crossCount > 0) {
      sb += `- During the observation period, the two series physically intersected ${crossCount} times. The final reversal occurred at ${lastCross}.\n`;
    } else {
      sb += `- No physical intersections occurred; one series consistently remained vertically separate from the other.\n`;
    }

    sb += `\n[Windowed Relation Stability]\n`;
    if (summary.windowedCorrelation) {
      sb += `- Strongest local absolute correlation: ${summary.windowedCorrelation.strongestWindowCorrelation.toFixed(2)}.\n`;
      sb += `- Weakest local absolute correlation: ${summary.windowedCorrelation.weakestWindowCorrelation.toFixed(2)}.\n`;
      sb += `- Stable-window ratio: ${(summary.windowedCorrelation.stableWindowRatio * 100).toFixed(1)}% of windows stayed above |0.5| correlation.\n`;
    } else {
      sb += `- Not enough aligned structure to evaluate local window stability.\n`;
    }

    sb += `\n[Telemetry Event Coupling]\n`;
    if (summary.eventCoupling) {
      sb += `- Trigger series: [${summary.eventCoupling.triggerSeries}] produced ${summary.eventCoupling.triggerCount} major events.\n`;
      sb += `- Response series: [${summary.eventCoupling.responseSeries}] followed with matching direction ${(summary.eventCoupling.alignedResponseRate * 100).toFixed(1)}% of the time.\n`;
      sb += `- Average next-step response delta: ${summary.eventCoupling.avgResponseDelta.toFixed(3)}.\n`;
    } else {
      sb += `- No strong event-conditioned coupling was detected.\n`;
    }

    return sb;
  }

  public static buildFeatureCards(summary: RelationFeatureSummary): FeatureCard[] {
    const cards: FeatureCard[] = [
      {
        kind: 'correlation',
        title: 'Global Correlation',
        confidence: Math.min(0.95, Math.abs(summary.staticCorrelation) + 0.25),
        summary: `Static correlation ${summary.staticCorrelation.toFixed(2)} across ${summary.alignedPoints} aligned samples.`,
        evidence: [
          `coverage=${summary.coverageRatio.toFixed(3)}`,
          `metric_mode_a=${summary.metricModeA ?? 'generic'}`,
          `metric_mode_b=${summary.metricModeB ?? 'generic'}`,
          `metric_subtype_a=${summary.metricSubtypeA ?? 'generic'}`,
          `metric_subtype_b=${summary.metricSubtypeB ?? 'generic'}`,
        ],
      },
      {
        kind: 'lead_lag',
        title: 'Lead-Lag',
        confidence: Math.min(0.95, Math.abs(summary.bestCorrelation) + 0.25),
        summary: `Best lag ${summary.bestLag} with correlation ${summary.bestCorrelation.toFixed(2)}.`,
        evidence: [`best_lag=${summary.bestLag}`, `best_correlation=${summary.bestCorrelation.toFixed(3)}`],
      },
    ];

    if (summary.windowedCorrelation) {
      cards.push({
        kind: 'windowed_stability',
        title: 'Windowed Stability',
        confidence: 0.8,
        summary: `${(summary.windowedCorrelation.stableWindowRatio * 100).toFixed(1)}% of local windows stayed above |0.5| correlation.`,
        evidence: [
          `strongest=${summary.windowedCorrelation.strongestWindowCorrelation.toFixed(3)}`,
          `weakest=${summary.windowedCorrelation.weakestWindowCorrelation.toFixed(3)}`,
        ],
      });
    }

    if (summary.eventCoupling) {
      cards.push({
        kind: 'event_coupling',
        title: 'Event Coupling',
        confidence: 0.45 + Math.min(0.45, summary.eventCoupling.alignedResponseRate * 0.5),
        summary: `${summary.eventCoupling.triggerSeries} triggered ${summary.eventCoupling.triggerCount} events and ${summary.eventCoupling.responseSeries} aligned ${(summary.eventCoupling.alignedResponseRate * 100).toFixed(1)}% of the time.`,
        evidence: [
          `avg_response_delta=${summary.eventCoupling.avgResponseDelta.toFixed(3)}`,
          `trigger_count=${summary.eventCoupling.triggerCount}`,
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

  public static buildHighlights(summary: RelationFeatureSummary): FindingItem[] {
    return FeatureCardCalibrator.calibrate(MultiSeriesAnalyzer.buildFeatureCards(summary))
      .slice(0, 5)
      .map((card) => ({
        label: card.title,
        detail: card.summary,
        severity: card.kind === 'quality' ? 'warning' : 'info',
      }));
  }
}
