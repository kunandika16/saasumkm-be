import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { sendPaymentConfirmed, sendOrderRejected, sendOrderExpired } from './whatsapp.service';

vi.mock('axios');
vi.mock('../config/env', () => ({
  env: {
    FONNTE_API_URL: 'https://api.fonnte.com/send',
    FONNTE_API_KEY: 'test-api-key',
    FONNTE_TOKEN: undefined,
  },
}));

const mockedAxios = vi.mocked(axios);

describe('WhatsApp Notification Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendPaymentConfirmed', () => {
    it('should send payment confirmed message with formatted total and points', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: { status: true } });

      const result = await sendPaymentConfirmed('08123456789', {
        orderId: 'abc-123',
        finalTotal: 25000,
        pointsEarned: 2,
      });

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.fonnte.com/send',
        {
          target: '08123456789',
          message: 'Pembayaran untuk pesanan #abc-123 telah dikonfirmasi. Total: Rp 25.000. Poin diperoleh: 2. Terima kasih!',
          countryCode: '62',
        },
        {
          headers: { Authorization: 'test-api-key' },
        }
      );
    });

    it('should return false on API error without throwing', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Network error'));

      const result = await sendPaymentConfirmed('08123456789', {
        orderId: 'abc-123',
        finalTotal: 25000,
        pointsEarned: 2,
      });

      expect(result).toBe(false);
    });

    it('should return false on non-2xx status', async () => {
      mockedAxios.post.mockResolvedValue({ status: 500, data: { error: 'server error' } });

      const result = await sendPaymentConfirmed('08123456789', {
        orderId: 'abc-123',
        finalTotal: 25000,
        pointsEarned: 2,
      });

      expect(result).toBe(false);
    });
  });

  describe('sendOrderRejected', () => {
    it('should send order rejected message', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: { status: true } });

      const result = await sendOrderRejected('08123456789', { orderId: 'order-456' });

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.fonnte.com/send',
        {
          target: '08123456789',
          message: 'Pesanan #order-456 tidak dapat divalidasi. Voucher telah dikembalikan. Silakan hubungi kami untuk informasi lebih lanjut.',
          countryCode: '62',
        },
        {
          headers: { Authorization: 'test-api-key' },
        }
      );
    });

    it('should return false on API error without throwing', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Timeout'));

      const result = await sendOrderRejected('08123456789', { orderId: 'order-456' });

      expect(result).toBe(false);
    });
  });

  describe('sendOrderExpired', () => {
    it('should send order expired message', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: { status: true } });

      const result = await sendOrderExpired('08123456789', { orderId: 'order-789' });

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.fonnte.com/send',
        {
          target: '08123456789',
          message: 'Pesanan #order-789 telah kedaluwarsa karena belum dibayar dalam 24 jam. Voucher telah dikembalikan. Silakan buat pesanan baru.',
          countryCode: '62',
        },
        {
          headers: { Authorization: 'test-api-key' },
        }
      );
    });

    it('should return false on API error without throwing', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Connection refused'));

      const result = await sendOrderExpired('08123456789', { orderId: 'order-789' });

      expect(result).toBe(false);
    });
  });

  describe('fail-open behavior', () => {
    it('should never throw even with unexpected errors', async () => {
      mockedAxios.post.mockImplementation(() => {
        throw new TypeError('Cannot read properties of undefined');
      });

      // None of these should throw
      const r1 = await sendPaymentConfirmed('08123456789', {
        orderId: 'test',
        finalTotal: 10000,
        pointsEarned: 1,
      });
      const r2 = await sendOrderRejected('08123456789', { orderId: 'test' });
      const r3 = await sendOrderExpired('08123456789', { orderId: 'test' });

      expect(r1).toBe(false);
      expect(r2).toBe(false);
      expect(r3).toBe(false);
    });
  });
});
