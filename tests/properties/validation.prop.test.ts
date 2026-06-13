import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { RegisterRequestSchema } from '../../src/validators/member.validator';
import { UpdateSettingsRequestSchema } from '../../src/validators/settings.validator';

/**
 * Property 1: Registration Input Validation
 *
 * For any string input for name and WhatsApp number, the validation function
 * SHALL accept the input if and only if: the name is 2–100 characters containing
 * only letters, spaces, periods, or apostrophes, AND the WhatsApp number matches
 * Indonesian format (08xx or +628xx) with 10–13 total digits.
 *
 * **Validates: Requirements 2.2**
 */
describe('Property 1: Registration Input Validation', () => {
  // Fixed valid tenantId and accessMethod for testing name + whatsapp validation
  const validTenantId = '00000000-0000-0000-0000-000000000001';
  const validAccessMethod = 'nfc';

  // --- Name Generators ---

  // Valid name characters: letters (a-z, A-Z), space, period, apostrophe
  const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const validNameChars = letters + " .'";
  const validNameChar = fc.constantFrom(...validNameChars.split(''));

  // Generator for valid names: 2-100 chars, only allowed characters
  const validNameArb = fc
    .array(validNameChar, { minLength: 2, maxLength: 100 })
    .map((chars) => chars.join(''));

  // Generator for names that are too short (0-1 chars)
  const tooShortNameArb = fc
    .array(validNameChar, { minLength: 0, maxLength: 1 })
    .map((chars) => chars.join(''));

  // Generator for names that are too long (101+ chars)
  const tooLongNameArb = fc
    .array(validNameChar, { minLength: 101, maxLength: 150 })
    .map((chars) => chars.join(''));

  // Invalid characters for names: digits and special symbols
  const invalidChars = '0123456789!@#$%^&*()_+=[]{}|<>?,/\\~`-';
  const invalidNameCharArb = fc.constantFrom(...invalidChars.split(''));

  // Generator for names with invalid characters (digits, symbols)
  const invalidCharNameArb = fc
    .tuple(
      fc.array(validNameChar, { minLength: 1, maxLength: 50 }).map((c) => c.join('')),
      invalidNameCharArb,
      fc.array(validNameChar, { minLength: 1, maxLength: 50 }).map((c) => c.join(''))
    )
    .map(([prefix, invalidChar, suffix]) => prefix + invalidChar + suffix);

  // --- WhatsApp Generators ---

  // The digit after 8 must be 1-9 (the regex requires 8[1-9])
  const firstDigitAfter8 = fc.integer({ min: 1, max: 9 }).map(String);

  // Remaining digits (7-10 digits to make total 10-13)
  const remainingDigits = (minLen: number, maxLen: number) =>
    fc.array(fc.integer({ min: 0, max: 9 }).map(String), { minLength: minLen, maxLength: maxLen }).map((d) => d.join(''));

  // Valid WhatsApp: prefix (0, +62, or 62) + 8 + [1-9] + 7-10 remaining digits
  // Total digits: 10-13
  // 08[1-9]XXXXXXX  = 10-13 digits total (prefix '0' + '8' + first + 7-10 remaining = 10-13)
  // +628[1-9]XXXXXXX = 10-13 digits (after stripping +62 → 8[1-9] + 7-10 = 10-13 effective)
  // 628[1-9]XXXXXXX  = 10-13 digits (after stripping 62 → 8[1-9] + 7-10 = 10-13 effective)
  const validWhatsAppArb = fc
    .tuple(
      fc.oneof(fc.constant('0'), fc.constant('+62'), fc.constant('62')),
      firstDigitAfter8,
      remainingDigits(7, 10)
    )
    .map(([prefix, firstDigit, rest]) => `${prefix}8${firstDigit}${rest}`);

  // Invalid WhatsApp: too short (fewer than 10 total digits)
  const tooShortWhatsAppArb = fc
    .tuple(
      fc.constant('08'),
      firstDigitAfter8,
      remainingDigits(0, 5) // 0-5 remaining → total 3-8 digits, well under 10
    )
    .map(([prefix, first, rest]) => `${prefix}${first}${rest}`)
    .filter((phone) => {
      const stripped = phone.replace(/[\s\-]/g, '');
      return !/^(\+62|62|0)8[1-9][0-9]{7,10}$/.test(stripped);
    });

  // Invalid WhatsApp: too long (more than 13 total digits)
  const tooLongWhatsAppArb = fc
    .tuple(
      fc.constant('08'),
      firstDigitAfter8,
      remainingDigits(11, 15) // 11-15 remaining → total 14-18 digits
    )
    .map(([prefix, first, rest]) => `${prefix}${first}${rest}`);

  // Invalid WhatsApp: wrong prefix (not starting with 0, +62, or 62)
  const wrongPrefixWhatsAppArb = fc
    .tuple(
      fc.oneof(fc.constant('+61'), fc.constant('07'), fc.constant('1'), fc.constant('+1')),
      remainingDigits(8, 10)
    )
    .map(([prefix, rest]) => `${prefix}${rest}`);

  // Invalid WhatsApp: starts with 80 (digit after 8 is 0, rejected by regex)
  const zeroAfter8WhatsAppArb = fc
    .tuple(
      fc.oneof(fc.constant('0'), fc.constant('+62'), fc.constant('62')),
      remainingDigits(7, 10)
    )
    .map(([prefix, rest]) => `${prefix}80${rest}`);

  // --- Property Tests ---

  it('should accept any valid name (2-100 chars, allowed characters only)', () => {
    fc.assert(
      fc.property(validNameArb, validWhatsAppArb, (name, whatsapp) => {
        const result = RegisterRequestSchema.safeParse({
          name,
          whatsapp,
          tenantId: validTenantId,
          accessMethod: validAccessMethod,
        });
        expect(result.success).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  it('should reject names that are too short (less than 2 chars)', () => {
    fc.assert(
      fc.property(tooShortNameArb, validWhatsAppArb, (name, whatsapp) => {
        const result = RegisterRequestSchema.safeParse({
          name,
          whatsapp,
          tenantId: validTenantId,
          accessMethod: validAccessMethod,
        });
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject names that are too long (more than 100 chars)', () => {
    fc.assert(
      fc.property(tooLongNameArb, validWhatsAppArb, (name, whatsapp) => {
        const result = RegisterRequestSchema.safeParse({
          name,
          whatsapp,
          tenantId: validTenantId,
          accessMethod: validAccessMethod,
        });
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject names with invalid characters (digits, special symbols)', () => {
    fc.assert(
      fc.property(invalidCharNameArb, validWhatsAppArb, (name, whatsapp) => {
        const result = RegisterRequestSchema.safeParse({
          name,
          whatsapp,
          tenantId: validTenantId,
          accessMethod: validAccessMethod,
        });
        expect(result.success).toBe(false);
      }),
      { numRuns: 200 }
    );
  });

  it('should accept any valid Indonesian WhatsApp number (08xx/+628xx/628xx, 10-13 digits)', () => {
    fc.assert(
      fc.property(validNameArb, validWhatsAppArb, (name, whatsapp) => {
        const result = RegisterRequestSchema.safeParse({
          name,
          whatsapp,
          tenantId: validTenantId,
          accessMethod: validAccessMethod,
        });
        expect(result.success).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  it('should reject WhatsApp numbers that are too short', () => {
    fc.assert(
      fc.property(validNameArb, tooShortWhatsAppArb, (name, whatsapp) => {
        const result = RegisterRequestSchema.safeParse({
          name,
          whatsapp,
          tenantId: validTenantId,
          accessMethod: validAccessMethod,
        });
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject WhatsApp numbers that are too long', () => {
    fc.assert(
      fc.property(validNameArb, tooLongWhatsAppArb, (name, whatsapp) => {
        const result = RegisterRequestSchema.safeParse({
          name,
          whatsapp,
          tenantId: validTenantId,
          accessMethod: validAccessMethod,
        });
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject WhatsApp numbers with wrong prefix', () => {
    fc.assert(
      fc.property(validNameArb, wrongPrefixWhatsAppArb, (name, whatsapp) => {
        const result = RegisterRequestSchema.safeParse({
          name,
          whatsapp,
          tenantId: validTenantId,
          accessMethod: validAccessMethod,
        });
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject WhatsApp numbers with 0 as digit after 8', () => {
    fc.assert(
      fc.property(validNameArb, zeroAfter8WhatsAppArb, (name, whatsapp) => {
        const result = RegisterRequestSchema.safeParse({
          name,
          whatsapp,
          tenantId: validTenantId,
          accessMethod: validAccessMethod,
        });
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('should accept registration only when BOTH name AND whatsapp are valid', () => {
    fc.assert(
      fc.property(
        fc.oneof(validNameArb, tooShortNameArb, tooLongNameArb, invalidCharNameArb),
        fc.oneof(validWhatsAppArb, tooShortWhatsAppArb, tooLongWhatsAppArb, wrongPrefixWhatsAppArb),
        (name, whatsapp) => {
          const result = RegisterRequestSchema.safeParse({
            name,
            whatsapp,
            tenantId: validTenantId,
            accessMethod: validAccessMethod,
          });

          const NAME_REGEX = /^[a-zA-Z\s.']+$/;
          const WHATSAPP_REGEX = /^(\+62|62|0)8[1-9][0-9]{7,10}$/;

          const nameValid =
            name.length >= 2 && name.length <= 100 && NAME_REGEX.test(name);
          const whatsappStripped = whatsapp.replace(/[\s\-]/g, '');
          const whatsappValid = WHATSAPP_REGEX.test(whatsappStripped);

          const shouldPass = nameValid && whatsappValid;
          expect(result.success).toBe(shouldPass);
        }
      ),
      { numRuns: 500 }
    );
  });
});

import { ProfileUpdateRequestSchema } from '../../src/validators/member.validator';

/**
 * Property 16: Profile Name Update Validation
 *
 * For any string input for profile name, the ProfileUpdateRequestSchema SHALL accept
 * the input if and only if: the name is 2–50 characters containing only letters,
 * spaces, periods, apostrophes, or hyphens.
 *
 * **Validates: Requirements 10.5, 10.6**
 */
describe('Property 16: Profile Name Update Validation', () => {
  // Valid profile name characters: letters (a-z, A-Z), space, period, apostrophe, hyphen
  const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const validProfileNameChars = letters + " .'-";
  const validProfileNameChar = fc.constantFrom(...validProfileNameChars.split(''));

  // Generator for valid profile names: 2-50 chars, only allowed characters
  const validProfileNameArb = fc
    .array(validProfileNameChar, { minLength: 2, maxLength: 50 })
    .map((chars) => chars.join(''));

  // Generator for names that are too short (0-1 chars)
  const tooShortProfileNameArb = fc
    .array(validProfileNameChar, { minLength: 0, maxLength: 1 })
    .map((chars) => chars.join(''));

  // Generator for names that are too long (51+ chars)
  const tooLongProfileNameArb = fc
    .array(validProfileNameChar, { minLength: 51, maxLength: 80 })
    .map((chars) => chars.join(''));

  // Invalid characters for profile names: digits and special symbols (excluding hyphen which is valid)
  const invalidProfileChars = '0123456789!@#$%^&*()_+=[]{}|<>?,/\\~`';
  const invalidProfileCharArb = fc.constantFrom(...invalidProfileChars.split(''));

  // Generator for names with invalid characters
  const invalidCharProfileNameArb = fc
    .tuple(
      fc.array(validProfileNameChar, { minLength: 1, maxLength: 24 }).map((c) => c.join('')),
      invalidProfileCharArb,
      fc.array(validProfileNameChar, { minLength: 0, maxLength: 24 }).map((c) => c.join(''))
    )
    .map(([prefix, invalidChar, suffix]) => prefix + invalidChar + suffix)
    .filter((name) => name.length >= 2 && name.length <= 50);

  it('should accept valid profile names (2-50 chars, letters/spaces/periods/apostrophes/hyphens)', () => {
    fc.assert(
      fc.property(validProfileNameArb, (name) => {
        const result = ProfileUpdateRequestSchema.safeParse({ name });
        expect(result.success).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  it('should reject profile names that are too short (0-1 chars)', () => {
    fc.assert(
      fc.property(tooShortProfileNameArb, (name) => {
        const result = ProfileUpdateRequestSchema.safeParse({ name });
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject profile names that are too long (51+ chars)', () => {
    fc.assert(
      fc.property(tooLongProfileNameArb, (name) => {
        const result = ProfileUpdateRequestSchema.safeParse({ name });
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject profile names with invalid characters (digits, special symbols)', () => {
    fc.assert(
      fc.property(invalidCharProfileNameArb, (name) => {
        const result = ProfileUpdateRequestSchema.safeParse({ name });
        expect(result.success).toBe(false);
      }),
      { numRuns: 200 }
    );
  });

  it('should pass if and only if name is 2-50 chars AND contains only allowed characters (biconditional)', () => {
    const PROFILE_NAME_REGEX = /^[a-zA-Z\s.'\-]+$/;

    // Generate from a mix of valid and invalid names
    const anyProfileNameArb = fc.oneof(
      validProfileNameArb,
      tooShortProfileNameArb,
      tooLongProfileNameArb,
      invalidCharProfileNameArb,
      fc.string({ minLength: 0, maxLength: 60 }) // fully random strings
    );

    fc.assert(
      fc.property(anyProfileNameArb, (name) => {
        const result = ProfileUpdateRequestSchema.safeParse({ name });

        const isValidLength = name.length >= 2 && name.length <= 50;
        const hasValidChars = PROFILE_NAME_REGEX.test(name);
        const shouldPass = isValidLength && hasValidChars;

        expect(result.success).toBe(shouldPass);
      }),
      { numRuns: 500 }
    );
  });
});

/**
 * Property 17: Google Maps URL Validation
 *
 * For any URL string, the settings validator SHALL accept the googlePlaceUrl
 * if and only if: the URL uses HTTPS protocol, matches one of the four accepted
 * Google Maps domain patterns (maps.google.com, www.google.com/maps, goo.gl/maps,
 * maps.app.goo.gl), and does not exceed 2048 characters in length.
 *
 * **Validates: Requirements 11.2**
 */
describe('Property 17: Google Maps URL Validation', () => {
  // --- Google Maps URL Generators ---

  // Valid Google Maps domain patterns
  const validDomains = [
    'maps.google.com',
    'www.google.com/maps',
    'goo.gl/maps',
    'maps.app.goo.gl',
  ] as const;

  // Path-safe characters for URL paths
  const pathChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~';
  const pathCharArb = fc.constantFrom(...pathChars.split(''));

  // Generator for a valid URL path segment
  const pathSegmentArb = fc
    .array(pathCharArb, { minLength: 1, maxLength: 30 })
    .map((chars) => chars.join(''));

  // Generator for an optional path (may be empty or have segments)
  const optionalPathArb = fc
    .array(pathSegmentArb, { minLength: 0, maxLength: 5 })
    .map((segments) => (segments.length > 0 ? '/' + segments.join('/') : ''));

  // Generator for valid Google Maps URLs (matching any of the 4 domains)
  const validGoogleMapsUrlArb = fc
    .tuple(fc.constantFrom(...validDomains), optionalPathArb)
    .map(([domain, path]) => `https://${domain}${path}`)
    .filter((url) => url.length <= 2048);

  // Generator for valid URLs exceeding 2048 characters
  const tooLongGoogleMapsUrlArb = fc
    .tuple(
      fc.constantFrom(...validDomains),
      fc.array(pathCharArb, { minLength: 2040, maxLength: 2100 }).map((chars) => chars.join(''))
    )
    .map(([domain, longPath]) => `https://${domain}/${longPath}`)
    .filter((url) => url.length > 2048);

  // Generator for non-Google domains
  const nonGoogleDomainArb = fc.constantFrom(
    'maps.bing.com',
    'www.openstreetmap.org',
    'waze.com',
    'mapquest.com',
    'example.com',
    'google.com', // google.com without /maps path
    'maps.google.org',
    'www.google.com/search', // google.com but not /maps
  );

  // Generator for URLs with non-Google domains
  const nonGoogleUrlArb = fc
    .tuple(nonGoogleDomainArb, optionalPathArb)
    .map(([domain, path]) => `https://${domain}${path}`);

  // Generator for non-https URLs (http, ftp, etc.)
  const nonHttpsUrlArb = fc
    .tuple(
      fc.constantFrom('http://', 'ftp://', ''),
      fc.constantFrom(...validDomains),
      optionalPathArb
    )
    .map(([protocol, domain, path]) => `${protocol}${domain}${path}`);

  // --- Property Tests ---

  it('should accept valid Google Maps URLs with maps.google.com domain', () => {
    fc.assert(
      fc.property(optionalPathArb, (path) => {
        const url = `https://maps.google.com${path}`;
        if (url.length > 2048) return; // skip if accidentally too long
        const result = UpdateSettingsRequestSchema.safeParse({ googlePlaceUrl: url });
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should accept valid Google Maps URLs with www.google.com/maps domain', () => {
    fc.assert(
      fc.property(optionalPathArb, (path) => {
        const url = `https://www.google.com/maps${path}`;
        if (url.length > 2048) return; // skip if accidentally too long
        const result = UpdateSettingsRequestSchema.safeParse({ googlePlaceUrl: url });
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should accept valid Google Maps URLs with goo.gl/maps domain', () => {
    fc.assert(
      fc.property(optionalPathArb, (path) => {
        const url = `https://goo.gl/maps${path}`;
        if (url.length > 2048) return; // skip if accidentally too long
        const result = UpdateSettingsRequestSchema.safeParse({ googlePlaceUrl: url });
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should accept valid Google Maps URLs with maps.app.goo.gl domain', () => {
    fc.assert(
      fc.property(optionalPathArb, (path) => {
        const url = `https://maps.app.goo.gl${path}`;
        if (url.length > 2048) return; // skip if accidentally too long
        const result = UpdateSettingsRequestSchema.safeParse({ googlePlaceUrl: url });
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should accept any valid Google Maps URL across all domain patterns', () => {
    fc.assert(
      fc.property(validGoogleMapsUrlArb, (url) => {
        const result = UpdateSettingsRequestSchema.safeParse({ googlePlaceUrl: url });
        expect(result.success).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  it('should reject URLs exceeding 2048 characters', () => {
    fc.assert(
      fc.property(tooLongGoogleMapsUrlArb, (url) => {
        const result = UpdateSettingsRequestSchema.safeParse({ googlePlaceUrl: url });
        expect(result.success).toBe(false);
        if (!result.success) {
          const messages = result.error.issues.map((i) => i.message);
          expect(messages).toContain('Google Maps URL maksimal 2048 karakter');
        }
      }),
      { numRuns: 50 }
    );
  });

  it('should reject URLs with non-Google domains', () => {
    fc.assert(
      fc.property(nonGoogleUrlArb, (url) => {
        const result = UpdateSettingsRequestSchema.safeParse({ googlePlaceUrl: url });
        expect(result.success).toBe(false);
        if (!result.success) {
          const messages = result.error.issues.map((i) => i.message);
          expect(messages).toContain('Format Google Maps Place URL tidak valid');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should reject non-https URLs even with valid Google Maps domains', () => {
    fc.assert(
      fc.property(nonHttpsUrlArb, (url) => {
        const result = UpdateSettingsRequestSchema.safeParse({ googlePlaceUrl: url });
        expect(result.success).toBe(false);
        if (!result.success) {
          const messages = result.error.issues.map((i) => i.message);
          expect(messages).toContain('Format Google Maps Place URL tidak valid');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should validate URL format correctly: accept iff HTTPS + valid domain + ≤ 2048 chars', () => {
    const GOOGLE_MAPS_URL_REGEX =
      /^https:\/\/(maps\.google\.com|www\.google\.com\/maps|goo\.gl\/maps|maps\.app\.goo\.gl)(\/.*)?$/;

    const anyUrlArb = fc.oneof(
      validGoogleMapsUrlArb,
      tooLongGoogleMapsUrlArb,
      nonGoogleUrlArb,
      nonHttpsUrlArb
    );

    fc.assert(
      fc.property(anyUrlArb, (url) => {
        const result = UpdateSettingsRequestSchema.safeParse({ googlePlaceUrl: url });
        const matchesRegex = GOOGLE_MAPS_URL_REGEX.test(url);
        const withinLength = url.length <= 2048;
        const shouldPass = matchesRegex && withinLength;
        expect(result.success).toBe(shouldPass);
      }),
      { numRuns: 500 }
    );
  });
});

/**
 * Property 20: Point Rule Configuration Validation
 *
 * For any numeric value for amountPerPoint, the validation SHALL accept the input
 * if and only if: the value is an integer AND between 1000 and 100000 (inclusive).
 *
 * **Validates: Requirements 8.1**
 */
describe('Property 20: Point Rule Configuration Validation', () => {
  // --- Generators ---

  // Valid amountPerPoint: integers between 1000 and 100000
  const validAmountPerPointArb = fc.integer({ min: 1000, max: 100000 });

  // Invalid: integers below 1000
  const belowMinAmountArb = fc.integer({ min: -1000000, max: 999 });

  // Invalid: integers above 100000
  const aboveMaxAmountArb = fc.integer({ min: 100001, max: 10000000 });

  // Invalid: non-integer (floating point) values in any range
  const nonIntegerAmountArb = fc
    .tuple(
      fc.integer({ min: 1000, max: 99999 }),
      fc.integer({ min: 1, max: 99 })
    )
    .map(([whole, frac]) => whole + frac / 100)
    .filter((v) => !Number.isInteger(v));

  // --- Property Tests ---

  it('should accept any integer amountPerPoint between 1000 and 100000', () => {
    fc.assert(
      fc.property(validAmountPerPointArb, (amountPerPoint) => {
        const result = UpdateSettingsRequestSchema.safeParse({ amountPerPoint });
        expect(result.success).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  it('should reject amountPerPoint below 1000', () => {
    fc.assert(
      fc.property(belowMinAmountArb, (amountPerPoint) => {
        const result = UpdateSettingsRequestSchema.safeParse({ amountPerPoint });
        expect(result.success).toBe(false);
      }),
      { numRuns: 200 }
    );
  });

  it('should reject amountPerPoint above 100000', () => {
    fc.assert(
      fc.property(aboveMaxAmountArb, (amountPerPoint) => {
        const result = UpdateSettingsRequestSchema.safeParse({ amountPerPoint });
        expect(result.success).toBe(false);
      }),
      { numRuns: 200 }
    );
  });

  it('should reject non-integer amountPerPoint values', () => {
    fc.assert(
      fc.property(nonIntegerAmountArb, (amountPerPoint) => {
        const result = UpdateSettingsRequestSchema.safeParse({ amountPerPoint });
        expect(result.success).toBe(false);
      }),
      { numRuns: 200 }
    );
  });

  it('should accept iff amountPerPoint is an integer AND between 1000 and 100000 (biconditional)', () => {
    // Generate from the full spectrum: valid, below, above, and non-integer
    const anyAmountArb = fc.oneof(
      validAmountPerPointArb,
      belowMinAmountArb,
      aboveMaxAmountArb,
      nonIntegerAmountArb,
      fc.double({ min: -1000000, max: 1000000, noNaN: true, noDefaultInfinity: true })
    );

    fc.assert(
      fc.property(anyAmountArb, (amountPerPoint) => {
        const result = UpdateSettingsRequestSchema.safeParse({ amountPerPoint });

        const shouldPass =
          Number.isInteger(amountPerPoint) &&
          amountPerPoint >= 1000 &&
          amountPerPoint <= 100000;

        expect(result.success).toBe(shouldPass);
      }),
      { numRuns: 500 }
    );
  });
});
