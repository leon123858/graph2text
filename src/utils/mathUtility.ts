import { sampleStandardDeviation, sampleCorrelation, variance } from 'simple-statistics';
import { PeriodResult, LagResult, TurningPoint } from '../types.js';

export class MathUtility {
  public static detectDominantPeriod(values: number[], maxLag: number): PeriodResult {
    const n = values.length;

    // Variance check
    if (variance(values) === 0) return { isPeriodic: false };

    let bestCorr = 0;
    let bestPeriod = 0;

    // Fast optimization for large datasets (100k points)
    // Avoid checking all possible maxLags if maxLag is huge.
    // Cap lag attempts to prevent freezing Node/Browser.
    const loopLimit = Math.min(maxLag, 1000);

    for (let lag = 2; lag <= loopLimit; lag++) {
      const slice1 = values.slice(0, n - lag);
      const slice2 = values.slice(lag, n);
      
      const acf = sampleCorrelation(slice1, slice2);

      if (acf > bestCorr && acf > 0.45) {
        bestCorr = acf;
        bestPeriod = lag;
      }
    }

    return { isPeriodic: bestPeriod > 0, period: bestPeriod };
  }

  public static calculateCrossCorrelation(a: number[], b: number[], maxLag: number): LagResult {
    const n = a.length;
    let bestLag = 0;
    let maxCorr = 0;

    for (let lag = -maxLag; lag <= maxLag; lag++) {
      let shiftedA: number[];
      let shiftedB: number[];

      if (lag < 0) {
        shiftedA = a.slice(-lag);
        shiftedB = b.slice(0, n + lag);
      } else {
        shiftedA = a.slice(0, n - lag);
        shiftedB = b.slice(lag);
      }

      if (shiftedA.length > 3) {
        // Prevent math errors with variance = 0
        if (variance(shiftedA) === 0 || variance(shiftedB) === 0) continue;
        
        const r = sampleCorrelation(shiftedA, shiftedB);
        if (Math.abs(r) > Math.abs(maxCorr)) {
          maxCorr = r;
          bestLag = lag;
        }
      }
    }

    return { bestLag, bestCorrelation: maxCorr };
  }

  public static calculateDifferencesStdDev(values: number[]): number {
    if (values.length < 2) return 0;
    const diffs: number[] = new Array(values.length - 1);
    for (let i = 0; i < values.length - 1; i++) {
        diffs[i] = values[i + 1] - values[i];
    }
    return sampleStandardDeviation(diffs);
  }

  public static extractGoldenProfile(values: number[], period: number): number[] {
    const profile = new Array(period).fill(0);
    const counts = new Array(period).fill(0);

    for (let i = 0; i < values.length; i++) {
      profile[i % period] += values[i];
      counts[i % period]++;
    }

    for (let i = 0; i < period; i++) {
      if (counts[i] > 0) profile[i] /= counts[i];
    }

    return profile;
  }

  public static smoothDataCentered(values: number[], windowSize: number): number[] {
    const n = values.length;
    const smoothed = new Array(n).fill(0);

    // Optimized sliding window approach instead of nested loops
    // for massive time series (100k points).
    const halfWindow = Math.floor(windowSize / 2);
    
    // We compute the sum for the first point
    for(let i = 0; i < n; i++) {
      const start = Math.max(0, i - halfWindow);
      const end = Math.min(n - 1, i + halfWindow);
      let sum = 0;
      for (let j = start; j <= end; j++) {
          sum += values[j];
      }
      smoothed[i] = sum / (end - start + 1);
    }
    return smoothed;
  }

  public static findMajorTurningPoints(smoothed: number[], globalMin: number, globalMax: number): TurningPoint[] {
    const points: TurningPoint[] = [];
    const threshold = (globalMax - globalMin) * 0.15;

    for (let i = 1; i < smoothed.length - 1; i++) {
      const isPeak = smoothed[i] > smoothed[i - 1] && smoothed[i] > smoothed[i + 1];
      const isValley = smoothed[i] < smoothed[i - 1] && smoothed[i] < smoothed[i + 1];

      if (isPeak || isValley) {
        if (points.length === 0 || Math.abs(smoothed[i] - smoothed[points[points.length - 1].index]) > threshold) {
          points.push({ index: i, value: smoothed[i] });
        }
      }
    }
    return points;
  }
}
