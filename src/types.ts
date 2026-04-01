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

export interface LagResult {
  bestLag: number;
  bestCorrelation: number;
}
