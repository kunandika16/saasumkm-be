import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Mock env module
vi.mock('../../../src/config/env', () => ({
  env: {
    JWT_ACCESS_SECRET: 'test-access-secret-key-for-unit-tests',
    JWT_REFRESH_SECRET: 'test-refresh-secret-key-for-unit-tests',
    JWT_ACCESS_EXPIRY: '15m',
    JWT_REFRESH_EXPIRY: '7d',
  },
}));

import { authMiddleware } from '../../../src/middleware/auth';

describe('authMiddleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
    };
    mockRes = {};
    mockNext = vi.fn();
  });

  function createValidToken(payload: object): string {
    return jwt.sign(payload, 'test-access-secret-key-for-unit-tests', {
      expiresIn: '15m',
    });
  }

  it('calls next() and attaches user for valid token', () => {
    const token = createValidToken({
      memberId: 'member-123',
      tenantId: 'tenant-1',
      role: 'member',
    });
    mockReq.headers = { authorization: `Bearer ${token}` };

    authMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockReq.user).toBeDefined();
    expect(mockReq.user!.memberId).toBe('member-123');
    expect(mockReq.user!.tenantId).toBe('tenant-1');
    expect(mockReq.user!.role).toBe('member');
  });

  it('attaches admin payload correctly', () => {
    const token = createValidToken({
      adminId: 'admin-456',
      tenantId: 'tenant-1',
      role: 'admin',
    });
    mockReq.headers = { authorization: `Bearer ${token}` };

    authMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockReq.user!.adminId).toBe('admin-456');
    expect(mockReq.user!.role).toBe('admin');
  });

  it('throws when no Authorization header is present', () => {
    mockReq.headers = {};

    expect(() =>
      authMiddleware(mockReq as Request, mockRes as Response, mockNext)
    ).toThrow('Access token is required');
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('throws when Authorization header does not start with Bearer', () => {
    mockReq.headers = { authorization: 'Basic some-token' };

    expect(() =>
      authMiddleware(mockReq as Request, mockRes as Response, mockNext)
    ).toThrow('Access token is required');
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('throws when Authorization header is just "Bearer " with no token', () => {
    mockReq.headers = { authorization: 'Bearer ' };

    expect(() =>
      authMiddleware(mockReq as Request, mockRes as Response, mockNext)
    ).toThrow(); // Empty token will fail jwt.verify
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('throws for expired token', () => {
    const token = jwt.sign(
      { memberId: 'member-123', tenantId: 'tenant-1', role: 'member' },
      'test-access-secret-key-for-unit-tests',
      { expiresIn: '-1s' }
    );
    mockReq.headers = { authorization: `Bearer ${token}` };

    expect(() =>
      authMiddleware(mockReq as Request, mockRes as Response, mockNext)
    ).toThrow('Access token has expired');
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('throws for token signed with wrong secret', () => {
    const token = jwt.sign(
      { memberId: 'member-123', tenantId: 'tenant-1', role: 'member' },
      'wrong-secret',
      { expiresIn: '15m' }
    );
    mockReq.headers = { authorization: `Bearer ${token}` };

    expect(() =>
      authMiddleware(mockReq as Request, mockRes as Response, mockNext)
    ).toThrow('Invalid access token');
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('throws for malformed token', () => {
    mockReq.headers = { authorization: 'Bearer not-a-valid-jwt' };

    expect(() =>
      authMiddleware(mockReq as Request, mockRes as Response, mockNext)
    ).toThrow('Invalid access token');
    expect(mockNext).not.toHaveBeenCalled();
  });
});
