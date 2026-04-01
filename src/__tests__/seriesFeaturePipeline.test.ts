import { describe, expect, it } from 'vitest';
import { SeriesFeaturePipeline } from '../pipeline/seriesFeaturePipeline.js';

describe('SeriesFeaturePipeline', () => {
  it('extracts multiple regimes from mixed-behavior data', () => {
    const points = [
      { time: 0, value: 10 },
      { time: 1, value: 10 },
      { time: 2, value: 10 },
      { time: 3, value: 20 },
      { time: 4, value: 30 },
      { time: 5, value: 40 },
      { time: 6, value: 39 },
      { time: 7, value: 38 },
      { time: 8, value: 37 },
    ];

    const regimes = SeriesFeaturePipeline.extractRegimes(points, 3);
    expect(regimes.length).toBeGreaterThanOrEqual(2);
    expect(regimes.some((regime) => regime.regime === 'rising')).toBe(true);
  });

  it('extracts counter-specific features', () => {
    const points = [
      { time: 0, value: 100 },
      { time: 1, value: 105 },
      { time: 2, value: 105 },
      { time: 3, value: 110 },
      { time: 4, value: 5 },
      { time: 5, value: 8 },
    ];

    const features = SeriesFeaturePipeline.extractCounterFeatures(points);
    expect(features.totalIncrease).toBe(13);
    expect(features.resets).toBe(1);
    expect(features.plateauRatio).toBeGreaterThan(0);
  });
});
