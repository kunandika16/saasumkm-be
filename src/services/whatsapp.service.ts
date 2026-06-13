import axios from 'axios';
import { env } from '../config/env';
import { formatIDR } from '../utils/formatting';

/**
 * WhatsApp Notification Service via Fonnte API.
 *
 * Implements fail-open pattern: notification failures never block order flow.
 * All errors are caught and logged, functions always return boolean.
 *
 * Validates: Requirements 7.3, 7.5, 7.8
 */

/**
 * Internal helper — sends a WhatsApp message via Fonnte API.
 *
 * @param target - Recipient phone number
 * @param message - Message text to send
 * @returns true if sent successfully, false otherwise
 */
async function sendWhatsAppMessage(target: string, message: string): Promise<boolean> {
  const apiKey = env.FONNTE_API_KEY || env.FONNTE_TOKEN;

  if (!apiKey) {
    console.warn('[WhatsApp] FONNTE_API_KEY is not set. Skipping notification.');
    return false;
  }

  try {
    const response = await axios.post(
      env.FONNTE_API_URL,
      {
        target,
        message,
        countryCode: '62',
      },
      {
        headers: {
          Authorization: apiKey,
        },
      }
    );

    if (response.status >= 200 && response.status < 300) {
      return true;
    }

    console.error('[WhatsApp] Unexpected response status:', response.status, response.data);
    return false;
  } catch (error) {
    console.error('[WhatsApp] Failed to send message:', error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Sends payment confirmed notification to member's WhatsApp.
 *
 * Validates: Requirement 7.3
 *
 * @param whatsapp - Member's WhatsApp number
 * @param orderData - Order details for the message
 * @returns true if sent, false if failed (never throws)
 */
export async function sendPaymentConfirmed(
  whatsapp: string,
  orderData: { orderId: string; finalTotal: number; pointsEarned: number }
): Promise<boolean> {
  try {
    const message = `Pembayaran untuk pesanan #${orderData.orderId} telah dikonfirmasi. Total: ${formatIDR(orderData.finalTotal)}. Poin diperoleh: ${orderData.pointsEarned}. Terima kasih!`;
    return await sendWhatsAppMessage(whatsapp, message);
  } catch (error) {
    console.error('[WhatsApp] sendPaymentConfirmed error:', error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Sends order rejected notification to member's WhatsApp.
 *
 * Validates: Requirement 7.5
 *
 * @param whatsapp - Member's WhatsApp number
 * @param orderData - Order details for the message
 * @returns true if sent, false if failed (never throws)
 */
export async function sendOrderRejected(
  whatsapp: string,
  orderData: { orderId: string }
): Promise<boolean> {
  try {
    const message = `Pesanan #${orderData.orderId} tidak dapat divalidasi. Voucher telah dikembalikan. Silakan hubungi kami untuk informasi lebih lanjut.`;
    return await sendWhatsAppMessage(whatsapp, message);
  } catch (error) {
    console.error('[WhatsApp] sendOrderRejected error:', error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Sends order expired notification to member's WhatsApp.
 *
 * Validates: Requirement 7.8
 *
 * @param whatsapp - Member's WhatsApp number
 * @param orderData - Order details for the message
 * @returns true if sent, false if failed (never throws)
 */
export async function sendOrderExpired(
  whatsapp: string,
  orderData: { orderId: string }
): Promise<boolean> {
  try {
    const message = `Pesanan #${orderData.orderId} telah kedaluwarsa karena belum dibayar dalam 24 jam. Voucher telah dikembalikan. Silakan buat pesanan baru.`;
    return await sendWhatsAppMessage(whatsapp, message);
  } catch (error) {
    console.error('[WhatsApp] sendOrderExpired error:', error instanceof Error ? error.message : error);
    return false;
  }
}
