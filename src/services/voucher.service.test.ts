import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyVoucher } from './voucher.service';

// ─── Pure Function Tests (applyVoucher) ─────────────────────────────────────

describe('applyVoucher', () => {
  describe('percentage discount', () => {
    it('calculates percentage discount with Math.floor', () => {
      const result = applyVoucher(25000, {
        discountType: 'percentage',
        discountValue: 10,
      });
      expect(result.discountAmount).toBe(2500);
      expect(result.finalTotal).toBe(22500);
    });

    it('floors fractional discount amounts', () => {
      // 33333 * 15 / 100 = 4999.95 → floor → 4999
      const result = applyVoucher(33333, {
        discountType: 'percentage',
        discountValue: 15,
      });
      expect(result.discountAmount).toBe(4999);
      expect(result.finalTotal).toBe(28334);
    });

    it('applies 100% discount resulting in 0 final total', () => {
      const result = applyVoucher(50000, {
        discountType: 'percentage',
        discountValue: 100,
      });
      expect(result.discountAmount).toBe(50000);
      expect(result.finalTotal).toBe(0);
    });

    it('applies 1% discount correctly', () => {
      const result = applyVoucher(100000, {
        discountType: 'percentage',
        discountValue: 1,
      });
      expect(result.discountAmount).toBe(1000);
      expect(result.finalTotal).toBe(99000);
    });

    it('handles 0 total with percentage discount', () => {
      const result = applyVoucher(0, {
        discountType: 'percentage',
        discountValue: 50,
      });
      expect(result.discountAmount).toBe(0);
      expect(result.finalTotal).toBe(0);
    });
  });

  describe('fixed discount', () => {
    it('applies fixed discount correctly', () => {
      const result = applyVoucher(50000, {
        discountType: 'fixed',
        discountValue: 10000,
      });
      expect(result.discountAmount).toBe(10000);
      expect(result.finalTotal).toBe(40000);
    });

    it('clamps final total to 0 when fixed discount exceeds total', () => {
      const result = applyVoucher(5000, {
        discountType: 'fixed',
        discountValue: 10000,
      });
      expect(result.discountAmount).toBe(10000);
      expect(result.finalTotal).toBe(0);
    });

    it('handles fixed discount equal to total', () => {
      const result = applyVoucher(25000, {
        discountType: 'fixed',
        discountValue: 25000,
      });
      expect(result.discountAmount).toBe(25000);
      expect(result.finalTotal).toBe(0);
    });

    it('handles 0 total with fixed discount', () => {
      const result = applyVoucher(0, {
        discountType: 'fixed',
        discountValue: 5000,
      });
      expect(result.discountAmount).toBe(5000);
      expect(result.finalTotal).toBe(0);
    });
  });
});
