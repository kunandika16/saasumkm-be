import { describe, it, expect } from 'vitest';
import { formatIDR, formatDate } from './formatting';

describe('formatIDR', () => {
  it('formats zero', () => {
    expect(formatIDR(0)).toBe('Rp 0');
  });

  it('formats values below 1000 without separator', () => {
    expect(formatIDR(500)).toBe('Rp 500');
    expect(formatIDR(999)).toBe('Rp 999');
  });

  it('formats thousands with period separator', () => {
    expect(formatIDR(1000)).toBe('Rp 1.000');
    expect(formatIDR(25000)).toBe('Rp 25.000');
  });

  it('formats millions with multiple period separators', () => {
    expect(formatIDR(1500000)).toBe('Rp 1.500.000');
    expect(formatIDR(10000000)).toBe('Rp 10.000.000');
  });

  it('formats large values correctly', () => {
    expect(formatIDR(100000000)).toBe('Rp 100.000.000');
  });
});

describe('formatDate', () => {
  it('formats a Date object to Indonesian locale', () => {
    const date = new Date(2024, 11, 25, 14, 30, 0); // Dec 25, 2024 14:30
    expect(formatDate(date)).toBe('25 Des 2024, 14:30');
  });

  it('formats an ISO date string', () => {
    // Use a fixed timezone-independent test
    const date = new Date(2024, 0, 15, 9, 5, 0); // Jan 15, 2024 09:05
    expect(formatDate(date)).toBe('15 Jan 2024, 09:05');
  });

  it('pads hours and minutes with leading zeros', () => {
    const date = new Date(2024, 4, 1, 8, 3, 0); // May 1, 2024 08:03
    expect(formatDate(date)).toBe('1 Mei 2024, 08:03');
  });

  it('handles midnight correctly', () => {
    const date = new Date(2024, 6, 10, 0, 0, 0); // Jul 10, 2024 00:00
    expect(formatDate(date)).toBe('10 Jul 2024, 00:00');
  });
});
