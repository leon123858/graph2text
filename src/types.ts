export interface TimePoint {
  time: number;
  value: number;
}

export interface PeriodResult {
  isPeriodic: boolean;
  period?: number;
}

export interface TurningPoint {
  index: number;
  value: number;
}

export interface Segment {
  startIndex: number;
  endIndex: number;
  startValue: number;
  endValue: number;
  slope: number;
}

export interface PeakSignal {
  index: number;
  value: number;
  type: 'peak' | 'valley';
  score: number;
}

export interface LagResult {
  bestLag: number;
  bestCorrelation: number;
}
