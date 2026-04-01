import { describe, expect, it } from 'vitest';
import { DatasetProfiler } from '../pipeline/datasetProfiler.js';
import { SemanticFeatureEngine } from '../index.js';

describe('dataset pipeline', () => {
  it('profiles telemetry-like datasets and detects sessions and derived fields', () => {
    const rows = [
      { ts: 10, IMEI: 1001, trip_num: 1, EVSOC: 70, EVVSP: 0, RUL: 60, EVIGC: 1 },
      { ts: 11, IMEI: 1001, trip_num: 1, EVSOC: 69.5, EVVSP: 5, RUL: 59.5, EVIGC: 1 },
      { ts: 12, IMEI: 1001, trip_num: 2, EVSOC: 80, EVVSP: 0, RUL: 70, EVIGC: 1 },
      { ts: 13, IMEI: 2002, trip_num: 1, EVSOC: 90, EVVSP: 0, RUL: 80, EVIGC: 1 },
    ];

    const profile = DatasetProfiler.profile(rows);
    expect(profile.schema.timestampField).toBe('ts');
    expect(profile.schema.entityFields).toContain('IMEI');
    expect(profile.schema.sessionFields).toContain('trip_num');
    expect(profile.sessions.length).toBe(3);

    const rulProfile = profile.fieldProfiles.find((field) => field.name === 'RUL');
    const ignProfile = profile.fieldProfiles.find((field) => field.name === 'EVIGC');
    expect(rulProfile?.role).toBe('derived');
    expect(rulProfile?.derivedFrom).toBe('EVSOC');
    expect(ignProfile?.role).toBe('constant');
  });

  it('analyzes datasets by session instead of flattening all rows into one series', () => {
    const rows = [
      { ts: 10, IMEI: 1001, trip_num: 1, EVSOC: 70, EVVSP: 0, EVODO: 1000 },
      { ts: 11, IMEI: 1001, trip_num: 1, EVSOC: 69.5, EVVSP: 5, EVODO: 1002 },
      { ts: 12, IMEI: 1001, trip_num: 1, EVSOC: 69.1, EVVSP: 10, EVODO: 1005 },
      { ts: 13, IMEI: 1001, trip_num: 1, EVSOC: 68.8, EVVSP: 12, EVODO: 1008 },
      { ts: 14, IMEI: 1001, trip_num: 1, EVSOC: 68.5, EVVSP: 8, EVODO: 1010 },
      { ts: 20, IMEI: 1001, trip_num: 2, EVSOC: 80, EVVSP: 0, EVODO: 1015 },
      { ts: 21, IMEI: 1001, trip_num: 2, EVSOC: 79.8, EVVSP: 3, EVODO: 1017 },
      { ts: 22, IMEI: 1001, trip_num: 2, EVSOC: 79.5, EVVSP: 4, EVODO: 1018 },
      { ts: 23, IMEI: 1001, trip_num: 2, EVSOC: 79.2, EVVSP: 6, EVODO: 1020 },
      { ts: 24, IMEI: 1001, trip_num: 2, EVSOC: 79.0, EVVSP: 2, EVODO: 1022 },
      { ts: 30, IMEI: 2002, trip_num: 1, EVSOC: 90, EVVSP: 0, EVODO: 2000 },
      { ts: 31, IMEI: 2002, trip_num: 1, EVSOC: 89.6, EVVSP: 7, EVODO: 2004 },
      { ts: 32, IMEI: 2002, trip_num: 1, EVSOC: 89.2, EVVSP: 9, EVODO: 2007 },
      { ts: 33, IMEI: 2002, trip_num: 1, EVSOC: 88.8, EVVSP: 10, EVODO: 2010 },
      { ts: 34, IMEI: 2002, trip_num: 1, EVSOC: 88.4, EVVSP: 6, EVODO: 2013 },
    ];

    const result = SemanticFeatureEngine.analyzeDataset(rows);
    expect(result.profile.sessions.length).toBe(3);
    expect(result.narratives[0]).toContain('Session count: 3');
    expect(result.narratives.some((narrative) => narrative.includes('Session 1001::1'))).toBe(true);
    expect(result.narratives.some((narrative) => narrative.includes('[EVSOC | continuous]'))).toBe(true);
    expect(result.narratives.some((narrative) => narrative.includes('Metric Semantics: battery-state'))).toBe(true);
    expect(result.narratives.some((narrative) => narrative.includes('[Dynamic Signal Behavior]'))).toBe(true);
    expect(result.narratives.some((narrative) => narrative.includes('[Counter Behavior]'))).toBe(true);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].seriesFindings.length).toBeGreaterThan(0);
    expect(result.findings[0].seriesFindings[0].highlights.length).toBeGreaterThan(0);
    expect(result.findings[0].seriesFindings[0].analysis.featureCards.length).toBeGreaterThan(0);
    expect(result.findings[0].relationFinding).toBeDefined();
    expect(result.findings[0].relationFinding?.analysis.featureCards.length).toBeGreaterThan(0);
  });

  it('renders dataset-level LLM payloads from structured findings', () => {
    const rows = [
      { ts: 10, IMEI: 1001, trip_num: 1, EVSOC: 70, EVVSP: 0, EVODO: 1000 },
      { ts: 11, IMEI: 1001, trip_num: 1, EVSOC: 69.5, EVVSP: 5, EVODO: 1002 },
      { ts: 12, IMEI: 1001, trip_num: 1, EVSOC: 69.1, EVVSP: 10, EVODO: 1005 },
      { ts: 13, IMEI: 1001, trip_num: 1, EVSOC: 68.8, EVVSP: 12, EVODO: 1008 },
      { ts: 14, IMEI: 1001, trip_num: 1, EVSOC: 68.5, EVVSP: 8, EVODO: 1010 },
    ];

    const payload = SemanticFeatureEngine.analyzeDatasetForLLM(rows);
    expect(payload.text).toContain('DATASET');
    expect(payload.text).toContain('SESSION global::global');
    expect(payload.text).toContain('series: EVSOC');
  });

  it('renders dataset-level prompt schema payloads', () => {
    const rows = [
      { ts: 10, IMEI: 1001, trip_num: 1, EVSOC: 70, EVVSP: 0, EVODO: 1000 },
      { ts: 11, IMEI: 1001, trip_num: 1, EVSOC: 69.5, EVVSP: 5, EVODO: 1002 },
      { ts: 12, IMEI: 1001, trip_num: 1, EVSOC: 69.1, EVVSP: 10, EVODO: 1005 },
      { ts: 13, IMEI: 1001, trip_num: 1, EVSOC: 68.8, EVVSP: 12, EVODO: 1008 },
      { ts: 14, IMEI: 1001, trip_num: 1, EVSOC: 68.5, EVVSP: 8, EVODO: 1010 },
    ];

    const payload = SemanticFeatureEngine.analyzeDatasetForPrompt(rows);
    expect(payload.text).toContain('OBSERVED FACTS');
    expect(payload.text).toContain('UNCERTAIN FACTS');
    expect(payload.text).toContain('SUGGESTED QUESTIONS');
  });
});
