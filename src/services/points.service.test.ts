import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculatePoints } from './points.service';

describe('points.service', () => {
  describe('calculatePoints', () => {
    it('calculates points with floor rounding (Req 8.2)', () => {
      // 25000 / 10000 = 2.5, floor = 2, * 1 = 2 points
      expect(calculatePoints(25000, { pointsPerAmount: 1, amountPerPoint: 10000 })).toBe(2);
    });

    it('returns 0 for amounts below amountPerPoint threshold', () => {
      // 5000 / 10000 = 0.5, floor = 0, * 1 = 0 points
      expect(calculatePoints(5000, { pointsPerAmount: 1, amountPerPoint: 10000 })).toBe(0);
    });

    it('handles exact multiples correctly', () => {
      // 30000 / 10000 = 3, floor = 3, * 1 = 3 points
      expect(calculatePoints(30000, { pointsPerAmount: 1, amountPerPoint: 10000 })).toBe(3);
    });

    it('handles pointsPerAmount greater than 1', () => {
      // 50000 / 10000 = 5, floor = 5, * 2 = 10 points
      expect(calculatePoints(50000, { pointsPerAmount: 2, amountPerPoint: 10000 })).toBe(10);
    });

    it('returns 0 for zero finalTotal', () => {
      expect(calculatePoints(0, { pointsPerAmount: 1, amountPerPoint: 10000 })).toBe(0);
    });

    it('returns 0 for negative finalTotal', () => {
      expect(calculatePoints(-5000, { pointsPerAmount: 1, amountPerPoint: 10000 })).toBe(0);
    });

    it('returns 0 for zero or negative amountPerPoint', () => {
      expect(calculatePoints(25000, { pointsPerAmount: 1, amountPerPoint: 0 })).toBe(0);
      expect(calculatePoints(25000, { pointsPerAmount: 1, amountPerPoint: -1000 })).toBe(0);
    });

    it('returns 0 for zero or negative pointsPerAmount', () => {
      expect(calculatePoints(25000, { pointsPerAmount: 0, amountPerPoint: 10000 })).toBe(0);
      expect(calculatePoints(25000, { pointsPerAmount: -1, amountPerPoint: 10000 })).toBe(0);
    });

    it('handles large amounts correctly', () => {
      // 1000000 / 10000 = 100, * 1 = 100 points
      expect(calculatePoints(1000000, { pointsPerAmount: 1, amountPerPoint: 10000 })).toBe(100);
    });

    it('handles minimum amountPerPoint of 1000 (Req 8.1)', () => {
      // 5500 / 1000 = 5.5, floor = 5, * 1 = 5 points
      expect(calculatePoints(5500, { pointsPerAmount: 1, amountPerPoint: 1000 })).toBe(5);
    });

    it('handles maximum amountPerPoint of 100000 (Req 8.1)', () => {
      // 250000 / 100000 = 2.5, floor = 2, * 1 = 2 points
      expect(calculatePoints(250000, { pointsPerAmount: 1, amountPerPoint: 100000 })).toBe(2);
    });
  });
});
