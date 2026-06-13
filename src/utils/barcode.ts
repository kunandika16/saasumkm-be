/**
 * Payment Barcode Encode/Decode Utilities
 *
 * Encodes order ID and final total into a barcode-safe string,
 * and decodes it back. Uses Base64 encoding of a JSON payload
 * to ensure the barcode string is safe for rendering with react-barcode.
 */

export interface BarcodePayload {
  orderId: string;
  finalTotal: number;
}

/**
 * Encodes an order ID and final total into a barcode string.
 * Uses Base64 encoding of JSON to produce an alphanumeric-safe string.
 *
 * @param orderId - The UUID order identifier
 * @param finalTotal - Non-negative integer representing the final payment amount in IDR
 * @returns Base64-encoded barcode string
 *
 * @example
 * encodeBarcode("abc-123", 25000) // Base64 string
 */
export function encodeBarcode(orderId: string, finalTotal: number): string {
  const payload = JSON.stringify({ orderId, finalTotal });
  return Buffer.from(payload, 'utf-8').toString('base64');
}

/**
 * Decodes a barcode string back into its order ID and final total.
 *
 * @param barcode - Base64-encoded barcode string produced by encodeBarcode
 * @returns Object containing orderId and finalTotal
 * @throws Error if the barcode string is invalid or cannot be decoded
 *
 * @example
 * decodeBarcode(encodeBarcode("abc-123", 25000))
 * // { orderId: "abc-123", finalTotal: 25000 }
 */
export function decodeBarcode(barcode: string): BarcodePayload {
  const json = Buffer.from(barcode, 'base64').toString('utf-8');
  const parsed = JSON.parse(json);

  if (typeof parsed.orderId !== 'string' || typeof parsed.finalTotal !== 'number') {
    throw new Error('Invalid barcode payload: missing orderId or finalTotal');
  }

  return {
    orderId: parsed.orderId,
    finalTotal: parsed.finalTotal,
  };
}
