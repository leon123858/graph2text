import { describe, it, expect } from 'vitest';
import { MathUtility } from '../utils/mathUtility.js';

describe('MathUtility', () => {
    it('should correctly smooth data centered (Sliding Window O(N))', () => {
        const values = [1, 2, 3, 4, 5, 6, 7];
        // Window 3: half-window 1
        // idx 0 [1, 2] => 1.5
        // idx 1 [1, 2, 3] => 2
        // idx 2 [2, 3, 4] => 3
        const result = MathUtility.smoothDataCentered(values, 3);
        expect(result[0]).toBe(1.5);
        expect(result[1]).toBe(2);
        expect(result[2]).toBe(3);
        expect(result[6]).toBe(6.5);
    });

    it('should calculate differences std dev', () => {
        const arr = [10, 12, 14, 16]; 
        // Diffs: [2, 2, 2] => std dev should be 0 since variance of [2, 2, 2] is 0
        const std = MathUtility.calculateDifferencesStdDev(arr);
        expect(std).toBe(0);

        const arr2 = [10, 15, 12, 20];
        // Diffs: [5, -3, 8] -> Mean: 3.33
        const std2 = MathUtility.calculateDifferencesStdDev(arr2);
        expect(std2).toBeGreaterThan(0);
    });

    it('should detect dominant period', () => {
        const values = [];
        // Sine wave with period 10
        for (let i = 0; i < 100; i++) {
            values.push(Math.sin((i / 10) * 2 * Math.PI));
        }

        const result = MathUtility.detectDominantPeriod(values, 30);
        expect(result.isPeriodic).toBe(true);
        // It should find the lag nearest to the true cycle, which is exactly 10
        expect(result.period).toBe(10);
    });

    it('should calculate cross correlation and lag causality', () => {
        const a = [];
        const b = [];
        // b leads a by 5
        // b = sin(i), a = sin(i - 5) => so when b starts rising, a rises 5 steps later
        // wait, simple matching: if A matches B shifted right by 5, lag > 0
        for (let i = 0; i < 50; i++) {
            b.push(Math.sin((i + 5) * 0.5));
            a.push(Math.sin(i * 0.5));
        }

        const lagRes = MathUtility.calculateCrossCorrelation(a, b, 10);
        // Best correlation should be when lagging by 5
        expect(Math.abs(lagRes.bestLag)).toBe(5);
        expect(lagRes.bestCorrelation).toBeGreaterThan(0.9);
    });

    it('should find major turning points', () => {
        // Flat -> Peak -> Flat -> Valley -> Flat
        const smoothed = [0, 0, 5, 10, 5, 0, 0, -5, -10, -5, 0, 0];
        const vMin = -10, vMax = 10;
        const tp = MathUtility.findMajorTurningPoints(smoothed, vMin, vMax);
        
        expect(tp.length).toBe(2);
        expect(tp[0].value).toBe(10);
        expect(tp[0].index).toBe(3); // idx 3 is 10
        expect(tp[1].value).toBe(-10);
        expect(tp[1].index).toBe(8); // idx 8 is -10
    });

    it('should detect significant peaks and valleys via Z-score', () => {
        // Flat serie with high spike
        const values = new Array(50).fill(10);
        values[30] = 100; // Spike
        values[40] = -50;  // Dip

        const peaks = MathUtility.zScorePeakDetection(values, 10, 3.5, 0.1);
        
        // Should find at least the spike and the dip
        const spike = peaks.find(p => p.type === 'peak' && p.index === 30);
        const dip = peaks.find(p => p.type === 'valley' && p.index === 40);
        
        expect(spike).toBeDefined();
        expect(dip).toBeDefined();
        expect(spike!.value).toBe(100);
        expect(dip!.value).toBe(-50);
    });

    it('should simplify trajectory via PLA', () => {
        const values = [0, 1, 2, 3, 4, 10, 9, 8, 7, 0, 1, 2, 3, 4]; // 14 points
        const segments = MathUtility.piecewiseLinearApproximation(values, 4);
        
        expect(segments.length).toBeLessThanOrEqual(4);
        expect(segments[0].startIndex).toBe(0);
        expect(segments[segments.length - 1].endIndex).toBe(values.length - 1);
        // First segment should be rising
        expect(segments[0].slope).toBeGreaterThan(0);
    });

    it('should encode series into SAX symbols', () => {
        const values = [1, 1, 1, 10, 10, 10, 5, 5, 5, 1, 1, 1];
        const sax = MathUtility.saxEncoding(values, 4, 5); // 4 segments, alphabet size 5
        
        expect(sax.length).toBe(4);
        // Pattern should reflect Low -> High -> Med -> Low
        // With alphabet 5 (a,b,c,d,e): a/b is low, c is med, d/e is high
        expect(sax[0].charCodeAt(0)).toBeLessThanOrEqual('b'.charCodeAt(0));
        expect(sax[1].charCodeAt(0)).toBeGreaterThanOrEqual('d'.charCodeAt(0));
        expect(sax[3].charCodeAt(0)).toBeLessThanOrEqual('b'.charCodeAt(0));
    });
});
