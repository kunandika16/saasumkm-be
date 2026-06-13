import { describe, it, expect } from 'vitest';
import { normalizePhone, validatePhone } from './phone';

describe('normalizePhone', () => {
  it('normalizes 08xx format to 628xx', () => {
    expect(normalizePhone('08123456789')).toBe('628123456789');
  });

  it('normalizes +628xx format to 628xx (removes +)', () => {
    expect(normalizePhone('+628123456789')).toBe('628123456789');
  });

  it('keeps 628xx format unchanged', () => {
    expect(normalizePhone('628123456789')).toBe('628123456789');
  });

  it('strips spaces', () => {
    expect(normalizePhone('0812 3456 7890')).toBe('6281234567890');
  });

  it('strips dashes', () => {
    expect(normalizePhone('0812-3456-7890')).toBe('6281234567890');
  });

  it('strips both spaces and dashes', () => {
    expect(normalizePhone('+62 812-345-6789')).toBe('628123456789');
  });
});

describe('validatePhone', () => {
  it('accepts valid 08xx format (11 digits)', () => {
    expect(validatePhone('08123456789')).toBe(true);
  });

  it('accepts valid 08xx format (12 digits)', () => {
    expect(validatePhone('081234567890')).toBe(true);
  });

  it('accepts valid 08xx format (13 digits)', () => {
    expect(validatePhone('0812345678901')).toBe(true);
  });

  it('accepts valid +628xx format', () => {
    expect(validatePhone('+628123456789')).toBe(true);
  });

  it('accepts valid 628xx format', () => {
    expect(validatePhone('628123456789')).toBe(true);
  });

  it('accepts numbers with spaces/dashes (stripped before validation)', () => {
    expect(validatePhone('0812-3456-7890')).toBe(true);
    expect(validatePhone('0812 3456 7890')).toBe(true);
  });

  it('rejects numbers not starting with 8 after prefix', () => {
    expect(validatePhone('07123456789')).toBe(false);
    expect(validatePhone('+627123456789')).toBe(false);
  });

  it('rejects numbers starting with 80 after prefix', () => {
    expect(validatePhone('08023456789')).toBe(false);
  });

  it('rejects too short numbers', () => {
    expect(validatePhone('081234567')).toBe(false); // 9 digits
  });

  it('rejects too long numbers', () => {
    expect(validatePhone('08123456789012')).toBe(false); // 14 digits
  });

  it('rejects completely invalid formats', () => {
    expect(validatePhone('12345')).toBe(false);
    expect(validatePhone('abc')).toBe(false);
    expect(validatePhone('')).toBe(false);
  });
});
