import { describe, it, expect } from 'vitest';
import { SingleSeriesAnalyzer } from '../analyzers/singleSeriesAnalyzer.js';
import { SemanticFeatureEngine } from '../index.js';
import { TimePoint } from '../types.js';

describe('SingleSeriesAnalyzer', () => {
    it('returns raw data narrative for deeply tiny arrays (len < 5)', () => {
        const dummy: TimePoint[] = [
            { time: 1, value: 10 },
            { time: 2, value: 12 },
            { time: 3, value: 14 }
        ];

        const output = SingleSeriesAnalyzer.process(dummy, 'ShortMetric');
        expect(output).toContain('Limited observation data for [ShortMetric] (3 records)');
        expect(output).toContain('Time [1] : Value 10.0');
    });

    it('identifies non-periodic random/stable data and highlights turning points', () => {
        const dummy: TimePoint[] = [];
        // Slow curve without repetition
        for (let i = 0; i < 20; i++) {
            dummy.push({ time: i, value: 10 + i * 2 - (i > 10 ? i * 4 : 0) });
        }

        const output = SingleSeriesAnalyzer.process(dummy, 'RandomMetric');
        expect(output).toContain('No distinct fixed repetitive cycles were detected');
        expect(output).toContain('[Trajectory & Feature Analysis: RandomMetric]');
        expect(output).toContain('Structural DNA');

        // It should contain phased linear trend approximation
        expect(output).toContain('[Phased Linear Trend Approximation]');
        expect(output).toContain('Rising');
        expect(output).toContain('Falling');
    });

    it('identifies strong periodicity, extracts golden cycle, and asserts waveform shape', () => {
        const dummy: TimePoint[] = [];
        // Sine wave is periodic (T=20)
        for (let i = 0; i < 100; i++) {
            dummy.push({ time: i, value: Math.sin(i * (Math.PI / 10)) * 10 });
        }

        const output = SingleSeriesAnalyzer.process(dummy, 'SineWave');
        expect(output).toMatch(/Periodicity Conclusion: A highly repetitive pattern was detected/);
        expect(output).toMatch(/A complete cycle consists of 20 observation points/);
        expect(output).toMatch(/Golden Cycle/i);
        expect(output).toMatch(/(Symmetrical|Complex\/Multi-peak) Waveform/); 
    });

    it('identifies sudden spikes', () => {
        const dummy: TimePoint[] = [];
        // Stable
        for (let i = 0; i < 150; i++) {
            dummy.push({ time: i, value: 10 });
        }
        // Sudden spike!
        dummy.push({ time: 150, value: 100 });
        for (let i = 151; i < 200; i++) {
            dummy.push({ time: i, value: 10 });
        }

        const output = SingleSeriesAnalyzer.process(dummy, 'SpikeMetric');
        expect(output).toContain('[Landmark Events & Anomalies]');
        expect(output).toContain('Spike/High');
    });

    it('does not crash on short periodic series after folding', () => {
        const dummy: TimePoint[] = [];
        for (let i = 0; i < 16; i++) {
            dummy.push({ time: i, value: i % 4 });
        }

        expect(() => SingleSeriesAnalyzer.process(dummy, 'ShortPeriodic')).not.toThrow();
    });

    it('renders counter-specific analysis when role is counter', () => {
        const dummy: TimePoint[] = [
            { time: 0, value: 100 },
            { time: 1, value: 102 },
            { time: 2, value: 102 },
            { time: 3, value: 105 },
            { time: 4, value: 4 },
            { time: 5, value: 8 }
        ];

        const output = SingleSeriesAnalyzer.process(dummy, 'Odometer', 'counter');
        expect(output).toContain('Analysis Mode: counter');
        expect(output).toContain('[Counter Behavior]');
        expect(output).toContain('Reset events detected: 1');
    });

    it('renders battery-specific analysis for EVSOC-like signals', () => {
        const dummy: TimePoint[] = [
            { time: 0, value: 80 },
            { time: 1, value: 79.5 },
            { time: 2, value: 79.1 },
            { time: 3, value: 79.3 },
            { time: 4, value: 78.7 },
            { time: 5, value: 78.2 }
        ];

        const output = SingleSeriesAnalyzer.process(dummy, 'EVSOC');
        expect(output).toContain('Metric Semantics: battery-state');
        expect(output).toContain('[Battery State Behavior]');
        expect(output).toContain('Discharge steps');
    });

    it('renders dynamic-specific analysis for EVVSP-like signals', () => {
        const dummy: TimePoint[] = [
            { time: 0, value: 0 },
            { time: 1, value: 0.5 },
            { time: 2, value: 10 },
            { time: 3, value: 25 },
            { time: 4, value: 5 },
            { time: 5, value: 0 }
        ];

        const output = SingleSeriesAnalyzer.process(dummy, 'EVVSP');
        expect(output).toContain('Metric Semantics: dynamic-signal');
        expect(output).toContain('[Dynamic Signal Behavior]');
        expect(output).toContain('Surge events');
    });

    it('emits structured feature cards for LLM-facing use', () => {
        const dummy: TimePoint[] = [
            { time: 0, value: 80 },
            { time: 1, value: 79.4 },
            { time: 2, value: 79.1 },
            { time: 3, value: 78.9 },
            { time: 4, value: 78.7 },
            { time: 5, value: 78.4 }
        ];

        const result = SemanticFeatureEngine.analyzeSingleStructured(dummy, 'EVSOC');
        expect(result.featureCards.length).toBeGreaterThan(0);
        expect(result.featureCards.some((card) => card.kind === 'battery')).toBe(true);
        expect(result.narrative).toContain('[Battery State Behavior]');
    });

    it('suppresses low-confidence periodicity cards for noisy dynamic signals', () => {
        const dummy: TimePoint[] = [
            { time: 0, value: 0 },
            { time: 1, value: 2 },
            { time: 2, value: 1 },
            { time: 3, value: 3 },
            { time: 4, value: 2 },
            { time: 5, value: 4 },
            { time: 6, value: 3 },
            { time: 7, value: 5 }
        ];

        const result = SemanticFeatureEngine.analyzeSingleStructured(dummy, 'EVVSP');
        expect(result.featureCards.some((card) => card.kind === 'periodicity')).toBe(false);
    });

    it('renders compact LLM-target text for single-series analysis', () => {
        const dummy: TimePoint[] = [
            { time: 0, value: 80 },
            { time: 1, value: 79.5 },
            { time: 2, value: 79.0 },
            { time: 3, value: 78.8 },
            { time: 4, value: 78.4 },
            { time: 5, value: 78.1 }
        ];

        const result = SemanticFeatureEngine.analyzeSingleForLLM(dummy, 'EVSOC');
        expect(result.text).toContain('SERIES EVSOC');
        expect(result.text).toContain('metric_subtype: soc');
        expect(result.text).toContain('confidence=');
    });

    it('renders prompt-optimized schema for downstream LLMs', () => {
        const dummy: TimePoint[] = [
            { time: 0, value: 80 },
            { time: 1, value: 79.5 },
            { time: 2, value: 79.0 },
            { time: 3, value: 78.8 },
            { time: 4, value: 78.4 },
            { time: 5, value: 78.1 }
        ];

        const result = SemanticFeatureEngine.analyzeSingleForPrompt(dummy, 'EVSOC');
        expect(result.text).toContain('OBSERVED FACTS');
        expect(result.text).toContain('HIGH CONFIDENCE FACTS');
        expect(result.text).toContain('DO NOT INFER');
    });
});
