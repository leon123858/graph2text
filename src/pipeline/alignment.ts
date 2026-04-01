import { DataQualityIssue, LagResult, TimePoint } from '../types.js';

export interface AlignedSeriesPoint {
  time: number;
  a: number;
  b: number;
}

export interface AlignmentResult {
  points: AlignedSeriesPoint[];
  coverageRatio: number;
  qualityIssues: DataQualityIssue[];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function estimateStep(points: TimePoint[]): number {
  const deltas: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const delta = points[i].time - points[i - 1].time;
    if (delta > 0) deltas.push(delta);
  }
  return median(deltas);
}

export class TimeSeriesAlignment {
  public static alignByTimestamp(dataA: TimePoint[], dataB: TimePoint[]): AlignmentResult {
    const qualityIssues: DataQualityIssue[] = [];
    if (dataA.length === 0 || dataB.length === 0) {
      return {
        points: [],
        coverageRatio: 0,
        qualityIssues: [
          {
            code: 'empty_series',
            severity: 'error',
            message: 'At least one input series is empty.',
          },
        ],
      };
    }

    const sortedA = [...dataA].sort((left, right) => left.time - right.time);
    const sortedB = [...dataB].sort((left, right) => left.time - right.time);
    const maxDistance = Math.max(1, Math.max(estimateStep(sortedA), estimateStep(sortedB)) * 1.5);

    const points: AlignedSeriesPoint[] = [];
    let indexB = 0;

    for (const pointA of sortedA) {
      while (indexB + 1 < sortedB.length && sortedB[indexB + 1].time <= pointA.time) {
        indexB++;
      }

      const candidates = [sortedB[indexB], sortedB[indexB + 1]].filter(
        (candidate): candidate is TimePoint => candidate !== undefined
      );

      let bestCandidate: TimePoint | undefined;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const candidate of candidates) {
        const distance = Math.abs(candidate.time - pointA.time);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestCandidate = candidate;
        }
      }

      if (bestCandidate && bestDistance <= maxDistance) {
        points.push({
          time: Math.round((pointA.time + bestCandidate.time) / 2),
          a: pointA.value,
          b: bestCandidate.value,
        });
      }
    }

    const coverageRatio = points.length / Math.min(sortedA.length, sortedB.length);
    if (coverageRatio < 0.6) {
      qualityIssues.push({
        code: 'weak_alignment',
        severity: 'warning',
        message: `Only ${(coverageRatio * 100).toFixed(1)}% of the two series could be aligned by timestamp.`,
      });
    }

    return { points, coverageRatio, qualityIssues };
  }

  public static toTimePoints(points: AlignedSeriesPoint[], key: 'a' | 'b'): TimePoint[] {
    return points.map((point) => ({
      time: point.time,
      value: point[key],
    }));
  }

  public static toLagResult(bestLag: number, bestCorrelation: number): LagResult {
    return { bestLag, bestCorrelation };
  }
}
