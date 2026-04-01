import { sampleCorrelation } from 'simple-statistics';
import { MathUtility } from '../utils/mathUtility.js';
import { TimePoint } from '../types.js';

export class MultiSeriesAnalyzer {
  public static process(dataA: TimePoint[], dataB: TimePoint[], nameA: string, nameB: string): string {
    const n = Math.min(dataA.length, dataB.length);
    const valsA = dataA.slice(0, n).map((d) => d.value);
    const valsB = dataB.slice(0, n).map((d) => d.value);

    let sb = `Time-Series Causal Relationship Analysis Report for [${nameA}] and [${nameB}]:\n\n`;

    // Pearson Correlation
    const r = sampleCorrelation(valsA, valsB);
    const absR = Math.abs(r);
    
    let rDesc = 'Moderate correlation';
    if (absR < 0.3) rDesc = 'No significant synchronization';
    else if (r > 0.6) rDesc = 'Highly positive correlation (Moving together)';
    else if (r < -0.6) rDesc = 'Highly negative correlation (Inverse relationship)';
    
    sb += `[Synchronous Correlation]: Both exhibit '${rDesc}' (Pearson Coefficient: ${r.toFixed(2)}).\n`;

    // Cross-Correlation Lag Detection
    // Capped to math.min(n/3, 100) and max 10 to simulate c# constraint, though we optimized the math
    const maxLag = Math.min(Math.floor(n / 3), 10);
    const lagResult = MathUtility.calculateCrossCorrelation(valsA, valsB, maxLag);

    sb += `\n[Temporal Lead-Lag Causality]\n`;
    if (lagResult.bestCorrelation > 0.5 && lagResult.bestLag !== 0) {
      const leader = lagResult.bestLag > 0 ? nameA : nameB;
      const follower = lagResult.bestLag > 0 ? nameB : nameA;
      sb += `Significant causal phenomenon detected: [${leader}] acts as the leading indicator. Following its shifts, [${follower}] accurately tracks the changes with a delay of ${Math.abs(lagResult.bestLag)} time units.\n`;
    } else {
      sb += `Changes in both series mostly occur synchronously or irregularly. No obvious lead-lag tracking behavior detected.\n`;
    }

    // Intersections
    let crossCount = 0;
    let lastCross: string | null = null;
    
    for (let i = 1; i < n; i++) {
      if (valsA[i - 1] <= valsB[i - 1] && valsA[i] > valsB[i]) {
        crossCount++;
        lastCross = `${dataA[i].time} (${nameA} upwardly crossed ${nameB})`;
      }
      if (valsA[i - 1] >= valsB[i - 1] && valsA[i] < valsB[i]) {
        crossCount++;
        lastCross = `${dataA[i].time} (${nameB} upwardly crossed ${nameA})`;
      }
    }

    sb += `\n[Value Intersection Status]\n`;
    if (crossCount > 0) {
      sb += `During the observation period, the two series intersected ${crossCount} times. The final reversal occurred at ${lastCross}.\n`;
    } else {
      sb += `No intersections occurred during the observation period; one series consistently remained at a higher level than the other.\n`;
    }

    return sb;
  }
}
