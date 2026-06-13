/**
 * Phone Number Normalization and Validation Utilities
 *
 * Handles Indonesian phone number formats:
 * - 08xx... (local format)
 * - +628xx... (international with +)
 * - 628xx... (international without +)
 *
 * Normalizes all formats to "628xx..." (without +) for consistent storage.
 */

/**
 * Indonesian phone number validation regex.
 * Accepts formats: 08xx, +628xx, or 628xx with 10-13 total digits.
 */
const PHONE_REGEX = /^(\+62|62|0)8[1-9][0-9]{7,10}$/;

/**
 * Normalizes an Indonesian phone number by stripping spaces/dashes
 * and converting to the "628xx..." format (without +).
 *
 * @param phone - Phone number string in any accepted Indonesian format
 * @returns Normalized phone number in "628xx..." format
 *
 * @example
 * normalizePhone("0812-3456-7890")  // "6281234567890"
 * normalizePhone("+628123456789")   // "628123456789"
 * normalizePhone("628123456789")    // "628123456789"
 * normalizePhone("08123456789")     // "628123456789"
 */
export function normalizePhone(phone: string): string {
  // Strip spaces and dashes
  const cleaned = phone.replace(/[\s\-]/g, '');

  // Normalize to 62 prefix
  if (cleaned.startsWith('+62')) {
    return cleaned.slice(1); // Remove the +
  }

  if (cleaned.startsWith('0')) {
    return '62' + cleaned.slice(1); // Replace leading 0 with 62
  }

  // Already in 62xx format
  return cleaned;
}

/**
 * Validates an Indonesian phone number format.
 * Accepts: 08xx, +628xx, or 628xx with 10-13 total digits.
 *
 * @param phone - Phone number string to validate
 * @returns true if the phone number is valid, false otherwise
 *
 * @example
 * validatePhone("08123456789")    // true
 * validatePhone("+628123456789")  // true
 * validatePhone("628123456789")   // true
 * validatePhone("0712345678")     // false (must start with 8 after prefix)
 * validatePhone("081234")         // false (too short)
 */
export function validatePhone(phone: string): boolean {
  // Strip spaces and dashes before validation
  const cleaned = phone.replace(/[\s\-]/g, '');
  return PHONE_REGEX.test(cleaned);
}
