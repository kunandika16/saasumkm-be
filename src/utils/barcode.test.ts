import { describe, it, expect } from 'vitest';
import { encodeBarcode, decodeBarcode } from './barcode';

describe('encodeBarcode', () => {
  it('returns a non-empty string', () => {
    const result = encodeBarcode('order-123', 25000);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('produces deterministic output', () => {
    const a = encodeBarcode('abc', 100);
    const b = encodeBarcode('abc', 100);
    expect(a).toBe(b);
  });

  it('produces different output for different inputs', () => {
    const a = encodeBarcode('order-1', 1000);
    const b = encodeBarcode('order-2', 1000);
    expect(a).not.toBe(b);
  });
});

describe('decodeBarcode', () => {
  it('decodes a valid barcode', () => {
    const barcode = encodeBarcode('order-abc-123', 50000);
    const decoded = decodeBarcode(barcode);
    expect(decoded.orderId).toBe('order-abc-123');
    expect(decoded.finalTotal).toBe(50000);
  });

  it('throws on invalid barcode string', () => {
    expect(() => decodeBarcode('not-valid-base64!!!')).toThrow();
  });

  it('throws on barcode with missing fields', () => {
    const invalid = Buffer.from(JSON.stringify({ foo: 'bar' })).toString('base64');
    expect(() => decodeBarcode(invalid)).toThrow('Invalid barcode payload');
  });
});

describe('round-trip property', () => {
  it('decode(encode(orderId, finalTotal)) === { orderId, finalTotal }', () => {
    const testCases = [
      { orderId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', finalTotal: 0 },
      { orderId: 'order-001', finalTotal: 25000 },
      { orderId: 'x', finalTotal: 999999999 },
      { orderId: 'uuid-with-special-chars', finalTotal: 1 },
    ];

    for (const { orderId, finalTotal } of testCases) {
      const encoded = encodeBarcode(orderId, finalTotal);
      const decoded = decodeBarcode(encoded);
      expect(decoded.orderId).toBe(orderId);
      expect(decoded.finalTotal).toBe(finalTotal);
    }
  });
});
