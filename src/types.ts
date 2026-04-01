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
  findings: DatasetFinding[];
}

export interface FeatureCard {
  kind:
    | 'trend'
    | 'periodicity'
    | 'regime'
    | 'anomaly'
    | 'counter'
    | 'dynamic'
    | 'battery'
    | 'correlation'
    | 'lead_lag'
    | 'event_coupling'
    | 'windowed_stability'
    | 'quality';
  title: string;
  confidence: number;
  summary: string;
  evidence: string[];
}

export interface SeriesAnalysisResult {
  summary: SeriesFeatureSummary;
  featureCards: FeatureCard[];
  narrative: string;
}

export interface RelationAnalysisResult {
  summary: RelationFeatureSummary;
  featureCards: FeatureCard[];
  narrative: string;
}

export interface LlmTextPayload {
  text: string;
  bulletLines: string[];
}

export interface PromptSchemaPayload {
  observedFacts: string[];
  highConfidenceFacts: string[];
  uncertainFacts: string[];
  doNotInfer: string[];
  suggestedQuestions: string[];
  text: string;
}

export interface FindingItem {
  label: string;
  detail: string;
  severity?: 'info' | 'warning' | 'high';
}

export interface SeriesFinding {
  metric: string;
  role?: FieldRole;
  metricMode?: MetricMode;
  analysis: SeriesAnalysisResult;
  highlights: FindingItem[];
}

export interface RelationFinding {
  pair: [string, string];
  analysis: RelationAnalysisResult;
  highlights: FindingItem[];
}

export interface DatasetFinding {
  sessionId: string;
  rowCount: number;
  startTime: number;
  endTime: number;
  seriesFindings: SeriesFinding[];
  relationFinding?: RelationFinding;
}

export interface RegimeSegment {
  startIndex: number;
  endIndex: number;
  startTime: number;
  endTime: number;
  startValue: number;
  endValue: number;
  meanValue: number;
  slope: number;
  volatility: 'low' | 'medium' | 'high';
  regime: 'rising' | 'falling' | 'stable';
}

export type MetricMode = 'generic' | 'dynamic' | 'battery' | 'counter';

export interface SeriesFeatureSummary {
  name: string;
  role?: FieldRole;
  metricMode?: MetricMode;
  metricSubtype?: string;
  sampleCount: number;
  duration?: number;
  dominantPeriods: number[];
  trend: 'rising' | 'falling' | 'stable' | 'mixed';
  volatility: 'low' | 'medium' | 'high';
  anomalies: PeakSignal[];
  regimes: RegimeSegment[];
  counterFeatures?: {
    totalIncrease: number;
    resets: number;
    plateauRatio: number;
  };
  dynamicFeatures?: {
    stopRatio: number;
    cruiseRatio: number;
    surgeCount: number;
    brakingCount: number;
    peakValue: number;
  };
  batteryFeatures?: {
    netChange: number;
    dischargeSteps: number;
    rechargeSteps: number;
    recoveryEvents: number;
    lowBandRatio: number;
  };
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
  metricModeA?: MetricMode;
  metricModeB?: MetricMode;
  metricSubtypeA?: string;
  metricSubtypeB?: string;
  eventCoupling?: {
    triggerSeries: string;
    responseSeries: string;
    triggerCount: number;
    alignedResponseRate: number;
    avgResponseDelta: number;
  };
  windowedCorrelation?: {
    strongestWindowCorrelation: number;
    weakestWindowCorrelation: number;
    stableWindowRatio: number;
  };
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
