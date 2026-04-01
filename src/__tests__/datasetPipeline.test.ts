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
      { ts: 10, IMEI: 1001, trip_num: 1, EVSOC: 70, EVVSP: 0 },
      { ts: 11, IMEI: 1001, trip_num: 1, EVSOC: 69.5, EVVSP: 5 },
      { ts: 12, IMEI: 1001, trip_num: 1, EVSOC: 69.1, EVVSP: 10 },
      { ts: 20, IMEI: 1001, trip_num: 2, EVSOC: 80, EVVSP: 0 },
      { ts: 21, IMEI: 1001, trip_num: 2, EVSOC: 79.8, EVVSP: 3 },
      { ts: 22, IMEI: 1001, trip_num: 2, EVSOC: 79.5, EVVSP: 4 },
      { ts: 30, IMEI: 2002, trip_num: 1, EVSOC: 90, EVVSP: 0 },
      { ts: 31, IMEI: 2002, trip_num: 1, EVSOC: 89.6, EVVSP: 7 },
      { ts: 32, IMEI: 2002, trip_num: 1, EVSOC: 89.2, EVVSP: 9 },
    ];

    const result = SemanticFeatureEngine.analyzeDataset(rows);
    expect(result.profile.sessions.length).toBe(3);
    expect(result.narratives[0]).toContain('Session count: 3');
    expect(result.narratives.some((narrative) => narrative.includes('Session 1001::1'))).toBe(true);
  });
});
