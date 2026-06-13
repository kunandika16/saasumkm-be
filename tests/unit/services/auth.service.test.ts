import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

// Mock the env module before importing auth service
vi.mock('../../../src/config/env', () => ({
  env: {
    JWT_ACCESS_SECRET: 'test-access-secret-key-for-unit-tests',
    JWT_REFRESH_SECRET: 'test-refresh-secret-key-for-unit-tests',
    JWT_ACCESS_EXPIRY: '15m',
    JWT_REFRESH_EXPIRY: '7d',
  },
}));

import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashPassword,
  comparePassword,
} from '../../../src/services/auth.service';

describe('auth.service', () => {
  describe('generateAccessToken', () => {
    it('generates a valid JWT string', () => {
      const token = generateAccessToken({
        memberId: 'member-123',
        tenantId: 'tenant-1',
        role: 'member',
      });

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      // JWT has 3 parts separated by dots
      expect(token.split('.')).toHaveLength(3);
    });

    it('embeds correct payload for a member', () => {
      const token = generateAccessToken({
        memberId: 'member-123',
        tenantId: 'tenant-1',
        role: 'member',
      });

      const decoded = jwt.decode(token) as any;
      expect(decoded.memberId).toBe('member-123');
      expect(decoded.tenantId).toBe('tenant-1');
      expect(decoded.role).toBe('member');
      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
    });

    it('embeds correct payload for an admin', () => {
      const token = generateAccessToken({
        adminId: 'admin-456',
        tenantId: 'tenant-1',
        role: 'admin',
      });

      const decoded = jwt.decode(token) as any;
      expect(decoded.adminId).toBe('admin-456');
      expect(decoded.tenantId).toBe('tenant-1');
      expect(decoded.role).toBe('admin');
    });

    it('sets expiration on the token', () => {
      const token = generateAccessToken({
        memberId: 'member-123',
        tenantId: 'tenant-1',
        role: 'member',
      });

      const decoded = jwt.decode(token) as any;
      // exp should be ~15 minutes from now
      const expectedExpiry = Math.floor(Date.now() / 1000) + 15 * 60;
      expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
      expect(decoded.exp).toBeLessThanOrEqual(expectedExpiry + 2); // Allow 2s tolerance
    });
  });

  describe('generateRefreshToken', () => {
    it('generates a valid JWT string', () => {
      const token = generateRefreshToken({
        memberId: 'member-123',
        tenantId: 'tenant-1',
        role: 'member',
      });

      expect(token).toBeTruthy();
      expect(token.split('.')).toHaveLength(3);
    });

    it('uses a different secret than access token', () => {
      const payload = {
        memberId: 'member-123',
        tenantId: 'tenant-1',
        role: 'member' as const,
      };

      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);

      // They should be different tokens (different secrets/expiries)
      expect(accessToken).not.toBe(refreshToken);
    });

    it('sets longer expiration than access token', () => {
      const payload = {
        memberId: 'member-123',
        tenantId: 'tenant-1',
        role: 'member' as const,
      };

      const accessDecoded = jwt.decode(generateAccessToken(payload)) as any;
      const refreshDecoded = jwt.decode(generateRefreshToken(payload)) as any;

      expect(refreshDecoded.exp).toBeGreaterThan(accessDecoded.exp);
    });
  });

  describe('verifyAccessToken', () => {
    it('verifies a valid access token and returns payload', () => {
      const token = generateAccessToken({
        memberId: 'member-123',
        tenantId: 'tenant-1',
        role: 'member',
      });

      const decoded = verifyAccessToken(token);

      expect(decoded.memberId).toBe('member-123');
      expect(decoded.tenantId).toBe('tenant-1');
      expect(decoded.role).toBe('member');
    });

    it('throws on an expired token', () => {
      // Create a token that's already expired
      const token = jwt.sign(
        { memberId: 'member-123', tenantId: 'tenant-1', role: 'member' },
        'test-access-secret-key-for-unit-tests',
        { expiresIn: '-1s' }
      );

      expect(() => verifyAccessToken(token)).toThrow('Access token has expired');
    });

    it('throws on a malformed token', () => {
      expect(() => verifyAccessToken('not.a.valid.token')).toThrow('Invalid access token');
    });

    it('throws on a token signed with wrong secret', () => {
      const token = jwt.sign(
        { memberId: 'member-123', tenantId: 'tenant-1', role: 'member' },
        'wrong-secret',
        { expiresIn: '15m' }
      );

      expect(() => verifyAccessToken(token)).toThrow('Invalid access token');
    });

    it('rejects a refresh token used as access token', () => {
      const refreshToken = generateRefreshToken({
        memberId: 'member-123',
        tenantId: 'tenant-1',
        role: 'member',
      });

      // Refresh tokens are signed with a different secret
      expect(() => verifyAccessToken(refreshToken)).toThrow('Invalid access token');
    });
  });

  describe('verifyRefreshToken', () => {
    it('verifies a valid refresh token and returns payload', () => {
      const token = generateRefreshToken({
        memberId: 'member-123',
        tenantId: 'tenant-1',
        role: 'member',
      });

      const decoded = verifyRefreshToken(token);

      expect(decoded.memberId).toBe('member-123');
      expect(decoded.tenantId).toBe('tenant-1');
      expect(decoded.role).toBe('member');
    });

    it('throws on an expired refresh token', () => {
      const token = jwt.sign(
        { memberId: 'member-123', tenantId: 'tenant-1', role: 'member' },
        'test-refresh-secret-key-for-unit-tests',
        { expiresIn: '-1s' }
      );

      expect(() => verifyRefreshToken(token)).toThrow('Refresh token has expired');
    });

    it('throws on a malformed refresh token', () => {
      expect(() => verifyRefreshToken('garbage-string')).toThrow('Invalid refresh token');
    });

    it('rejects an access token used as refresh token', () => {
      const accessToken = generateAccessToken({
        memberId: 'member-123',
        tenantId: 'tenant-1',
        role: 'member',
      });

      expect(() => verifyRefreshToken(accessToken)).toThrow('Invalid refresh token');
    });
  });

  describe('hashPassword', () => {
    it('produces a bcrypt hash string', async () => {
      const hash = await hashPassword('my-secure-password');

      expect(hash).toBeTruthy();
      expect(hash).not.toBe('my-secure-password');
      // bcrypt hashes start with $2a$ or $2b$
      expect(hash).toMatch(/^\$2[ab]\$/);
    });

    it('produces different hashes for the same input (salt)', async () => {
      const hash1 = await hashPassword('same-password');
      const hash2 = await hashPassword('same-password');

      expect(hash1).not.toBe(hash2);
    });

    it('produces hash of expected length', async () => {
      const hash = await hashPassword('test');
      // bcrypt hashes are always 60 characters
      expect(hash.length).toBe(60);
    });
  });

  describe('comparePassword', () => {
    it('returns true for matching password and hash', async () => {
      const password = 'correct-password';
      const hash = await hashPassword(password);

      const result = await comparePassword(password, hash);
      expect(result).toBe(true);
    });

    it('returns false for non-matching password', async () => {
      const hash = await hashPassword('correct-password');

      const result = await comparePassword('wrong-password', hash);
      expect(result).toBe(false);
    });

    it('returns false for empty password against a hash', async () => {
      const hash = await hashPassword('some-password');

      const result = await comparePassword('', hash);
      expect(result).toBe(false);
    });
  });
});
