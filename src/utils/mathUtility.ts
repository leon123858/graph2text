import { sampleStandardDeviation, sampleCorrelation, variance, mean } from 'simple-statistics';
import { DataQualityIssue, PeriodResult, LagResult, TurningPoint, PeakSignal, Segment, TimePoint } from '../types.js';

export class MathUtility {
  public static assessSeriesQuality(data: TimePoint[]): DataQualityIssue[] {
    const issues: DataQualityIssue[] = [];
    if (data.length === 0) {
      issues.push({
        code: 'empty_series',
        severity: 'error',
        message: 'The series is empty.',
      });
      return issues;
    }

    if (data.length < 8) {
      issues.push({
        code: 'too_short',
        severity: 'warning',
        message: `Only ${data.length} points are available, so advanced feature extraction may be unstable.`,
      });
    }

    const values = data.map((point) => point.value);
    if (variance(values) === 0) {
      issues.push({
        code: 'constant_series',
        severity: 'warning',
        message: 'The series is constant, so pattern analysis is not meaningful.',
      });
    }

    let negativeJumps = 0;
    let duplicateTimestamps = 0;
    const gaps: number[] = [];

    for (let i = 1; i < data.length; i++) {
      const delta = data[i].time - data[i - 1].time;
      if (delta < 0) negativeJumps++;
      if (delta === 0) duplicateTimestamps++;
      if (delta > 0) gaps.push(delta);
    }

    if (negativeJumps > 0) {
      issues.push({
        code: 'negative_time_jump',
        severity: 'warning',
        message: `The timestamp moves backwards ${negativeJumps} times.`,
      });
    }

    if (duplicateTimestamps > 0) {
      issues.push({
        code: 'duplicate_timestamp',
        severity: 'warning',
        message: `The series contains ${duplicateTimestamps} duplicate timestamps.`,
      });
    }

    if (gaps.length > 4) {
      const sorted = [...gaps].sort((a, b) => a - b);
      const medianGap = sorted[Math.floor(sorted.length / 2)];
      const largeGapCount = gaps.filter((gap) => gap > medianGap * 4).length;
      const gapRatio = largeGapCount / gaps.length;
      if (gapRatio > 0.05) {
        issues.push({
          code: 'high_gap_ratio',
          severity: 'warning',
          message: `${(gapRatio * 100).toFixed(1)}% of intervals are large gaps relative to the median sampling interval.`,
        });
      }
    }

    return issues;
  }

  public static detectDominantPeriod(values: number[], maxLag: number): PeriodResult {
    const n = values.length;

    // Variance check
    if (variance(values) === 0) return { isPeriodic: false };

    let step = 1;
    let downsampled = values;
    if (n > 2000) {
      step = Math.floor(n / 1000);
      downsampled = values.filter((_, i) => i % step === 0);
    }

    // Pass 1: Global rough search on downsampled array
    let bestCorr = 0;
    let bestRoughLag = 0;
    const downsampledN = downsampled.length;
    const roughLoopLimit = Math.min(Math.floor(maxLag / step), Math.floor(downsampledN / 3));

    for (let lag = 2; lag <= roughLoopLimit; lag++) {
      const slice1 = downsampled.slice(0, downsampledN - lag);
      const slice2 = downsampled.slice(lag, downsampledN);
      const acf = sampleCorrelation(slice1, slice2);

      if (acf > bestCorr && acf > 0.45) {
        bestCorr = acf;
        bestRoughLag = lag;
      }
    }

    if (bestRoughLag === 0) return { isPeriodic: false };

    // Pass 2: Local fine search around expected lag on the primary full-resolution array
    const approxPeriod = bestRoughLag * step;
    let bestFinalPeriod = 0;
    let bestFinalCorr = 0;

    const searchStart = Math.max(2, approxPeriod - step - 1);
    const searchEnd = Math.min(maxLag, Math.min(n, approxPeriod + step + 1));

    for (let lag = searchStart; lag <= searchEnd; lag++) {
      const slice1 = values.slice(0, n - lag);
      const slice2 = values.slice(lag, n);
      const acf = sampleCorrelation(slice1, slice2);

      if (acf > bestFinalCorr && acf > 0.45) {
        bestFinalCorr = acf;
        bestFinalPeriod = lag;
      }
    }

    return { isPeriodic: bestFinalPeriod > 0, period: bestFinalPeriod };
  }

  public static detectCandidatePeriods(values: number[], maxLag: number, limit: number = 3): number[] {
    const n = values.length;
    if (n < 8 || variance(values) === 0) return [];

    const candidates: Array<{ lag: number; corr: number }> = [];
    for (let lag = 2; lag <= Math.min(maxLag, Math.floor(n / 2)); lag++) {
      const slice1 = values.slice(0, n - lag);
      const slice2 = values.slice(lag, n);
      if (slice1.length < 4 || variance(slice1) === 0 || variance(slice2) === 0) continue;
      const corr = sampleCorrelation(slice1, slice2);
      if (corr > 0.35) {
        candidates.push({ lag, corr });
      }
    }

    candidates.sort((left, right) => right.corr - left.corr);
    const selected: number[] = [];
    for (const candidate of candidates) {
      if (selected.every((period) => Math.abs(period - candidate.lag) > 2)) {
        selected.push(candidate.lag);
      }
      if (selected.length >= limit) break;
    }
    return selected;
  }

  public static calculateCrossCorrelation(a: number[], b: number[], maxLag: number): LagResult {
    const n = Math.min(a.length, b.length);
    if (n < 4) return { bestLag: 0, bestCorrelation: 0 };
    
    // Variance check to prevent division by zero in correlation
    if (variance(a) === 0 || variance(b) === 0) return { bestLag: 0, bestCorrelation: 0 };

    let step = 1;
    let downA = a;
    let downB = b;
    if (n > 2000) {
      step = Math.floor(n / 1000);
      downA = a.filter((_, i) => i % step === 0);
      downB = b.filter((_, i) => i % step === 0);
    }

    const downN = downA.length;
    const roughMaxLag = Math.min(Math.floor(downN / 3), Math.floor(maxLag / step));

    let bestRoughLag = 0;
    let maxRoughCorr = 0;

    for (let lag = -roughMaxLag; lag <= roughMaxLag; lag++) {
      let shiftedA: number[];
      let shiftedB: number[];

      if (lag < 0) {
        shiftedA = downA.slice(-lag);
        shiftedB = downB.slice(0, downN + lag);
      } else {
        shiftedA = downA.slice(0, downN - lag);
        shiftedB = downB.slice(lag);
      }

      if (shiftedA.length > 3) {
        if (variance(shiftedA) === 0 || variance(shiftedB) === 0) continue;
        const r = sampleCorrelation(shiftedA, shiftedB);
        if (Math.abs(r) > Math.abs(maxRoughCorr)) {
          maxRoughCorr = r;
          bestRoughLag = lag;
        }
      }
    }

    // Narrow down on original array
    const approxLag = bestRoughLag * step;
    let bestFinalLag = 0;
    let maxFinalCorr = 0;

    const searchStart = Math.max(-maxLag, approxLag - step - 1);
    const searchEnd = Math.min(maxLag, approxLag + step + 1);

    for (let lag = searchStart; lag <= searchEnd; lag++) {
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
        if (variance(shiftedA) === 0 || variance(shiftedB) === 0) continue;
        const r = sampleCorrelation(shiftedA, shiftedB);
        if (Math.abs(r) > Math.abs(maxFinalCorr)) {
          maxFinalCorr = r;
          bestFinalLag = lag;
        }
      }
    }

    return { bestLag: bestFinalLag, bestCorrelation: maxFinalCorr };
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

  public static zScorePeakDetection(values: number[], lag: number = 30, threshold: number = 3.5, influence: number = 0.5): PeakSignal[] {
    const n = values.length;
    const effectiveLag = Math.max(2, Math.min(lag, n - 1));
    if (n <= effectiveLag) return [];

    const signals: number[] = new Array(n).fill(0);
    const filteredY = [...values];
    const avgFilter = new Array(n).fill(0);
    const stdFilter = new Array(n).fill(0);

    const initialWindow = values.slice(0, effectiveLag);
    if (initialWindow.length < 2) return [];
    avgFilter[effectiveLag - 1] = mean(initialWindow);
    stdFilter[effectiveLag - 1] = sampleStandardDeviation(initialWindow) || 0;

    const results: PeakSignal[] = [];

    for (let i = effectiveLag; i < n; i++) {
        const baselineStd = stdFilter[i - 1] || 0;
        const deviation = Math.abs(values[i] - avgFilter[i - 1]);
        const isSignal =
          baselineStd === 0
            ? deviation > 0
            : deviation > threshold * baselineStd;

        if (isSignal) {
            if (values[i] > avgFilter[i - 1]) {
                signals[i] = 1;
            } else {
                signals[i] = -1;
            }
            filteredY[i] = influence * values[i] + (1 - influence) * filteredY[i - 1];
        } else {
            signals[i] = 0;
            filteredY[i] = values[i];
        }

        // Optimized update: instead of slice-mean, we could do incremental mean/std, 
        // but for robustness in JS with small windows (30), slice is fine.
        const start = i - effectiveLag + 1;
        const window = filteredY.slice(start, i + 1);
        if (window.length < 2) {
            avgFilter[i] = filteredY[i];
            stdFilter[i] = 0;
            continue;
        }
        avgFilter[i] = mean(window);
        stdFilter[i] = sampleStandardDeviation(window) || 0;

        if (signals[i] !== 0 && signals[i - 1] === 0) {
            results.push({
                index: i,
                value: values[i],
                type: signals[i] === 1 ? 'peak' : 'valley',
                score: Math.abs(values[i] - avgFilter[i - 1]) / (stdFilter[i - 1] || 1)
            });
        }
    }

    return results;
  }

  public static piecewiseLinearApproximation(values: number[], maxSegments: number = 8): Segment[] {
    const n = values.length;
    if (n < 2) return [];
    
    const segments: Segment[] = [];
    const pointsPerSegment = Math.max(2, Math.floor(n / maxSegments));
    
    for (let i = 0; i < maxSegments; i++) {
        const start = i * pointsPerSegment;
        if (start >= n - 1) break;

        let end = (i + 1) * pointsPerSegment;
        if (i === maxSegments - 1 || end >= n) end = n - 1;
        
        const startVal = values[start];
        const endVal = values[end];
        const slope = (endVal - startVal) / (end - start);

        segments.push({
            startIndex: start,
            endIndex: end,
            startValue: startVal,
            endValue: endVal,
            slope
        });
    }
    return segments;
  }

  public static saxEncoding(values: number[], segmentsCount: number = 12, alphabetSize: number = 5): string {
    if (values.length < 2) return "";
    
    const avg = mean(values);
    const std = sampleStandardDeviation(values) || 1;
    const normalized = values.map(v => (v - avg) / std);
    
    const paa: number[] = [];
    const pointsPerSegment = values.length / segmentsCount;
    for (let i = 0; i < segmentsCount; i++) {
        const start = Math.floor(i * pointsPerSegment);
        const end = Math.floor((i + 1) * pointsPerSegment);
        const segment = normalized.slice(start, end);
        if (segment.length > 0) {
            paa.push(mean(segment));
        }
    }
    
    // Breakpoints for N(0,1) for alphabet sizes 3-10
    const breakpointsMap: Record<number, number[]> = {
        3: [-0.43, 0.43],
        4: [-0.67, 0, 0.67],
        5: [-0.84, -0.25, 0.25, 0.84],
        6: [-0.97, -0.43, 0, 0.43, 0.97],
        7: [-1.07, -0.57, -0.18, 0.18, 0.57, 1.07],
        8: [-1.15, -0.67, -0.32, 0, 0.32, 0.67, 1.15]
    };
    
    const breakpoints = breakpointsMap[alphabetSize] || breakpointsMap[5];
    const alphabet = "abcdefghij";
    
    return paa.map(val => {
        let symIdx = 0;
        while (symIdx < breakpoints.length && val > breakpoints[symIdx]) {
            symIdx++;
        }
        return alphabet[symIdx];
    }).join('');
  }
}
