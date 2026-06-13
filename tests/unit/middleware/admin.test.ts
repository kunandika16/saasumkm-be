import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

import { adminGuard } from '../../../src/middleware/admin';

describe('adminGuard', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {};
    mockRes = {};
    mockNext = vi.fn();
  });

  it('calls next() when user has admin role', () => {
    mockReq.user = {
      adminId: 'admin-1',
      tenantId: 'tenant-1',
      role: 'admin',
    };

    adminGuard(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  it('throws 401 when req.user is undefined (not authenticated)', () => {
    mockReq.user = undefined;

    expect(() =>
      adminGuard(mockReq as Request, mockRes as Response, mockNext)
    ).toThrow('Authentication required');
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('throws 403 when user has member role', () => {
    mockReq.user = {
      memberId: 'member-1',
      tenantId: 'tenant-1',
      role: 'member',
    };

    expect(() =>
      adminGuard(mockReq as Request, mockRes as Response, mockNext)
    ).toThrow('Admin access required');
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('returns error with correct status code for unauthenticated user', () => {
    mockReq.user = undefined;

    try {
      adminGuard(mockReq as Request, mockRes as Response, mockNext);
    } catch (error: any) {
      expect(error.statusCode).toBe(401);
    }
  });

  it('returns error with correct status code for non-admin user', () => {
    mockReq.user = {
      memberId: 'member-1',
      tenantId: 'tenant-1',
      role: 'member',
    };

    try {
      adminGuard(mockReq as Request, mockRes as Response, mockNext);
    } catch (error: any) {
      expect(error.statusCode).toBe(403);
    }
  });
});
