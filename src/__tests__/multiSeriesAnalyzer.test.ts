import { describe, it, expect } from 'vitest';
import { MultiSeriesAnalyzer } from '../analyzers/multiSeriesAnalyzer.js';
import { TimePoint } from '../types.js';

describe('MultiSeriesAnalyzer', () => {
    it('detects highly positive correlation when moving together', () => {
        const dataA: TimePoint[] = [];
        const dataB: TimePoint[] = [];

        for (let i = 0; i < 30; i++) {
            dataA.push({ time: i, value: i * 2 + Math.random() });
            dataB.push({ time: i, value: i * 2 + Math.random() });
        }

        const output = MultiSeriesAnalyzer.process(dataA, dataB, 'A', 'B');
        expect(output).toContain("Highly positive static correlation (Moving together concurrently)");
        // Since they are identical noise or very similar, Pearson is close to 1.00
        expect(output).toMatch(/Pearson Coefficient: 0\.99|Pearson Coefficient: 1\.00/);
    });

    it('detects highly negative correlation', () => {
        const dataA: TimePoint[] = [];
        const dataB: TimePoint[] = [];

        for (let i = 0; i < 30; i++) {
            dataA.push({ time: i, value: i * 2 });
            dataB.push({ time: i, value: -i * 2 });
        }

        const output = MultiSeriesAnalyzer.process(dataA, dataB, 'A', 'B');
        expect(output).toContain("Highly negative static correlation (Inverse concurrent relationship)");
        expect(output).toContain("Pearson Coefficient: -1.00");
    });

    it('detects proper lead-lag causality', () => {
        const dataA: TimePoint[] = [];
        const dataB: TimePoint[] = [];

        // B moves exactly 5 ticks ahead of A
        // A lags B by 5 ticks => B leads A
        for (let i = 0; i < 50; i++) {
            const phaseB = i + 5;
            dataA.push({ time: i, value: Math.sin(i * 0.2) });
            dataB.push({ time: i, value: Math.sin(phaseB * 0.2) });
        }

        const output = MultiSeriesAnalyzer.process(dataA, dataB, 'ValA', 'ValB');
        expect(output).toContain("Significant causal phenomenon detected");
        expect(output).toContain("[ValB] acts as the leading indicator");
        expect(output).toContain("accurately tracks the structural changes with a delay/lag of 5 time units.");
    });

    it('detects and counts precise value intersections', () => {
        const dataA: TimePoint[] = [
            { time: 1, value: 10 },
            { time: 2, value: 5 },
            { time: 3, value: 10 }
        ];
        const dataB: TimePoint[] = [
            { time: 1, value: 5 },
            { time: 2, value: 10 },
            { time: 3, value: 5 }
        ];

        // T1: A>B. T2: A<B (cross 1). T3: A>B (cross 2).
        const output = MultiSeriesAnalyzer.process(dataA, dataB, 'A', 'B');
        expect(output).toContain("- During the observation period, the two series physically intersected 2 times.");
        expect(output).toContain("The final reversal occurred at 3 (A upwardly crossed B)");
    });

    it('detects sine vs cosine as phase-shifted correlation despite zero static correlation', () => {
        const dataA: TimePoint[] = [];
        const dataB: TimePoint[] = [];

        for (let i = 0; i < 200; i++) {
            dataA.push({ time: i, value: Math.sin(i * 0.1) });
            dataB.push({ time: i, value: Math.cos(i * 0.1) });
        }

        const output = MultiSeriesAnalyzer.process(dataA, dataB, 'Sine', 'Cosine');
        
        expect(output).toContain("No significant static synchronization");
        expect(output).toContain("Highly correlated after phase shift!");
        expect(output).toMatch(/Phase-Shifted Pearson: 0\.99|Phase-Shifted Pearson: 1\.00/);
    });
});
