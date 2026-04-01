import { sampleCorrelation } from 'simple-statistics';
import { TimeSeriesAlignment } from '../pipeline/alignment.js';
import { MathUtility } from '../utils/mathUtility.js';
import { RelationFeatureSummary, TimePoint } from '../types.js';

export class MultiSeriesAnalyzer {
  public static summarize(dataA: TimePoint[], dataB: TimePoint[], nameA: string, nameB: string): RelationFeatureSummary {
    const alignment = TimeSeriesAlignment.alignByTimestamp(dataA, dataB);
    const alignedA = TimeSeriesAlignment.toTimePoints(alignment.points, 'a');
    const alignedB = TimeSeriesAlignment.toTimePoints(alignment.points, 'b');
    const valsA = alignedA.map((point) => point.value);
    const valsB = alignedB.map((point) => point.value);
    const staticCorrelation =
      valsA.length > 3 && valsB.length > 3 ? sampleCorrelation(valsA, valsB) : 0;
    const lagResult = MathUtility.calculateCrossCorrelation(valsA, valsB, Math.floor(valsA.length / 3));

    return {
      nameA,
      nameB,
      alignedPoints: alignment.points.length,
      coverageRatio: alignment.coverageRatio,
      bestLag: lagResult.bestLag,
      bestCorrelation: lagResult.bestCorrelation,
      staticCorrelation,
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

    return sb;
  }
}
