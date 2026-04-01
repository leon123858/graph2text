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
});
