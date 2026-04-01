import { describe, expect, it } from 'vitest';
import { TimeSeriesAlignment } from '../pipeline/alignment.js';
import { MultiSeriesAnalyzer } from '../analyzers/multiSeriesAnalyzer.js';

describe('time-series alignment', () => {
  it('aligns nearby timestamps instead of truncating by array index', () => {
    const dataA = [
      { time: 10, value: 1 },
      { time: 20, value: 2 },
      { time: 30, value: 3 },
      { time: 40, value: 4 },
    ];
    const dataB = [
      { time: 9, value: 1 },
      { time: 21, value: 2 },
      { time: 31, value: 3 },
      { time: 41, value: 4 },
    ];

    const result = TimeSeriesAlignment.alignByTimestamp(dataA, dataB);
    expect(result.points.length).toBe(4);
    expect(result.coverageRatio).toBe(1);
  });

  it('includes alignment diagnostics in relation analysis output', () => {
    const dataA = [
      { time: 10, value: 1 },
      { time: 20, value: 2 },
      { time: 30, value: 3 },
      { time: 40, value: 4 },
      { time: 50, value: 5 },
    ];
    const dataB = [
      { time: 11, value: 1 },
      { time: 21, value: 2 },
      { time: 31, value: 3 },
      { time: 41, value: 4 },
      { time: 51, value: 5 },
    ];

    const output = MultiSeriesAnalyzer.process(dataA, dataB, 'A', 'B');
    expect(output).toContain('[Alignment Gate]');
    expect(output).toContain('Timestamp-aligned samples: 5');
  });
});
