export interface TimePoint {
  time: number;
  value: number;
}

export interface NamedSeries {
  name: string;
  points: TimePoint[];
}

export type PrimitiveValue = number | string | null;
export type DatasetRow = Record<string, PrimitiveValue>;

export type FieldRole =
  | 'timestamp'
  | 'entity_key'
  | 'session_key'
  | 'continuous'
  | 'state'
  | 'counter'
  | 'constant'
  | 'derived'
  | 'unknown';

export interface DataQualityIssue {
  code:
    | 'empty_series'
    | 'too_short'
    | 'constant_series'
    | 'high_gap_ratio'
    | 'negative_time_jump'
    | 'duplicate_timestamp'
    | 'weak_alignment'
    | 'mixed_sessions'
    | 'derived_field';
  severity: 'info' | 'warning' | 'error';
  message: string;
}

export interface FieldProfile {
  name: string;
  role: FieldRole;
  nonNullCount: number;
  uniqueCount: number;
  min?: number;
  max?: number;
  mean?: number;
  zeroRatio?: number;
  integerRatio?: number;
  monotonicIncreaseRatio?: number;
  medianDelta?: number;
  derivedFrom?: string;
  qualityIssues: DataQualityIssue[];
}

export interface DatasetSchema {
  timestampField: string;
  entityFields: string[];
  sessionFields: string[];
}

export interface SessionDescriptor {
  id: string;
  entityKey: string;
  sessionKey: string;
  rowCount: number;
  startTime: number;
  endTime: number;
}

export interface DatasetProfile {
  schema: DatasetSchema;
  fieldProfiles: FieldProfile[];
  sessions: SessionDescriptor[];
  qualityIssues: DataQualityIssue[];
}

export interface DatasetAnalysisResult {
  profile: DatasetProfile;
  narratives: string[];
}

export interface SeriesFeatureSummary {
  name: string;
  sampleCount: number;
  duration?: number;
  dominantPeriods: number[];
  trend: 'rising' | 'falling' | 'stable' | 'mixed';
  volatility: 'low' | 'medium' | 'high';
  anomalies: PeakSignal[];
  qualityIssues: DataQualityIssue[];
}

export interface RelationFeatureSummary {
  nameA: string;
  nameB: string;
  alignedPoints: number;
  coverageRatio: number;
  bestLag: number;
  bestCorrelation: number;
  staticCorrelation: number;
  qualityIssues: DataQualityIssue[];
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
