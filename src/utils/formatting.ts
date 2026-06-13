/**
 * IDR Currency and Date Formatting Utilities
 *
 * Provides formatting functions for Indonesian Rupiah currency
 * and date/time values in Indonesian locale.
 */

/**
 * Formats a non-negative integer as Indonesian Rupiah currency.
 * Uses period (.) as thousands separator with "Rp " prefix.
 *
 * @param amount - Non-negative integer representing IDR amount
 * @returns Formatted string, e.g. "Rp 25.000"
 *
 * @example
 * formatIDR(0)       // "Rp 0"
 * formatIDR(1000)    // "Rp 1.000"
 * formatIDR(25000)   // "Rp 25.000"
 * formatIDR(1500000) // "Rp 1.500.000"
 */
export function formatIDR(amount: number): string {
  const formatted = amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `Rp ${formatted}`;
}

/**
 * Formats a date to Indonesian locale string.
 * Output format: "DD MMM YYYY, HH:mm" (e.g., "25 Des 2024, 14:30")
 *
 * @param date - Date object or ISO date string
 * @returns Formatted date string in Indonesian locale
 *
 * @example
 * formatDate(new Date('2024-12-25T14:30:00')) // "25 Des 2024, 14:30"
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
  ];

  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');

  return `${day} ${month} ${year}, ${hours}:${minutes}`;
}
