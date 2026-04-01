import { describe, it, expect } from 'vitest';
import { SingleSeriesAnalyzer } from '../analyzers/singleSeriesAnalyzer.js';
import { TimePoint } from '../types.js';

describe('SingleSeriesAnalyzer', () => {
    it('returns raw data narrative for deeply tiny arrays (len < 5)', () => {
        const dummy: TimePoint[] = [
            { time: 'T1', value: 10 },
            { time: 'T2', value: 12 },
            { time: 'T3', value: 14 }
        ];

        const output = SingleSeriesAnalyzer.process(dummy, 'ShortMetric');
        expect(output).toContain('Limited observation data for [ShortMetric] (3 records)');
        expect(output).toContain('Time [T1] : Value 10.0');
    });

    it('identifies non-periodic random/stable data and highlights turning points', () => {
        const dummy: TimePoint[] = [];
        // Slow curve without repetition
        for (let i = 0; i < 20; i++) {
            dummy.push({ time: `T${i}`, value: 10 + i * 2 - (i > 10 ? i * 4 : 0) });
        }

        const output = SingleSeriesAnalyzer.process(dummy, 'RandomMetric');
        expect(output).toContain('No distinct fixed repetitive cycles were detected');
        expect(output).toContain('[Trajectory Skeleton]');

        // It should contain major phases because it goes up then down
        expect(output).toContain('Major Chronological Phases');
        expect(output).toContain('Climb');
        expect(output).toContain('Decline');
    });

    it('identifies strong periodicity, extracts golden cycle, and asserts waveform shape', () => {
        const dummy: TimePoint[] = [];
        // Sine wave is periodic (T=20)
        for (let i = 0; i < 100; i++) {
            dummy.push({ time: `T${i}`, value: Math.sin(i * (Math.PI / 10)) * 10 });
        }

        const output = SingleSeriesAnalyzer.process(dummy, 'SineWave');
        expect(output).toContain('Periodicity Conclusion: A highly repetitive pattern was detected.');
        expect(output).toContain('A complete cycle consists of 20 observation points.');
        expect(output).toContain('Golden Cycle');
        expect(output).toContain('Symmetrical Waveform'); // sine wave is symmetrical
    });

    it('identifies sudden spikes', () => {
        const dummy: TimePoint[] = [];
        // Stable
        for (let i = 0; i < 150; i++) {
            dummy.push({ time: `T${i}`, value: 10 });
        }
        // Sudden spike!
        dummy.push({ time: `T150`, value: 100 });
        for (let i = 151; i < 200; i++) {
            dummy.push({ time: `T${i}`, value: 10 });
        }

        const output = SingleSeriesAnalyzer.process(dummy, 'SpikeMetric');
        expect(output).toContain('[Sudden Volatility Warning]');
        expect(output).toContain('Sudden Spike');
        // Because of the drop back to 10
        expect(output).toContain('Sudden Crash');
    });
});
