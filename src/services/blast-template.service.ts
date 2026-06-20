/**
 * Blast Template Service
 *
 * Provides pre-built Indonesian WhatsApp message templates for blast messaging.
 * Templates use casual language ("kamu", "yuk") without formal honorifics.
 *
 * Validates: Requirements 4.2, 4.4, 4.6, 6.6, 9.1, 9.2, 9.3, 9.4
 */

export type BlastCategory = 'reminder' | 'promo' | 'announcement' | 'custom';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const TEMPLATES: Record<string, string> = {
  reminder: `Halo {{nama}} 👋

Udah lama nih kita nggak ketemu! Kangen deh sama kamu 😊

Yuk mampir lagi ke tempat kita. Ada banyak menu favorit yang nungguin kamu. Jangan lupa cek poin loyalti kamu ya, siapa tau udah bisa dituker hadiah!

Ditunggu kedatangannya ya 🙏`,

  promo: `Halo {{nama}} 👋

Ada kabar gembira nih buat kamu! 🎉

[Tulis detail promo kamu di sini]

Yuk buruan sebelum kehabisan! Kamu pasti nggak mau ketinggalan kan? 😉

Sampai ketemu ya!`,

  announcement: `Halo {{nama}} 👋

Kita punya pengumuman penting nih buat kamu! 📢

[Tulis detail pengumuman kamu di sini]

Terima kasih selalu jadi pelanggan setia kami 🙏`,
};

const MAX_MESSAGE_LENGTH = 1000;
const NAME_FALLBACK = 'Pelanggan';

/**
 * Returns the pre-built template for the given category.
 * Returns empty string for "custom" category (admin writes from scratch).
 *
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4
 *
 * @param category - The blast category
 * @returns Template string with {{nama}} placeholder, or empty string for custom
 */
export function getTemplate(category: BlastCategory): string {
  if (category === 'custom') {
    return '';
  }
  return TEMPLATES[category] || '';
}

/**
 * Resolves {{nama}} placeholder in a template with the recipient's name.
 * Uses "Pelanggan" as fallback for null, undefined, empty, or whitespace-only names.
 *
 * Validates: Requirements 4.2, 6.6
 *
 * @param template - Message template containing {{nama}} placeholder
 * @param recipientName - The recipient's name (may be null/undefined/empty)
 * @returns Resolved message with name substituted
 */
export function resolveTemplate(template: string, recipientName: string | null | undefined): string {
  const name = recipientName && recipientName.trim() !== '' ? recipientName : NAME_FALLBACK;
  return template.replace(/\{\{nama\}\}/g, () => name);
}

/**
 * Validates a message for sending.
 * Message must be non-empty, contain at least one non-whitespace character,
 * and not exceed 1000 characters.
 *
 * Validates: Requirements 4.4, 4.6
 *
 * @param message - The message to validate
 * @returns Validation result with error message if invalid
 */
export function validateMessage(message: string): ValidationResult {
  if (!message || message.trim().length === 0) {
    return { valid: false, error: 'Pesan tidak boleh kosong' };
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return { valid: false, error: `Pesan tidak boleh lebih dari ${MAX_MESSAGE_LENGTH} karakter` };
  }

  return { valid: true };
}
