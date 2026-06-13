import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { validate } from '../../../src/middleware/validate';

describe('validate middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      body: {},
      params: {},
      query: {},
    };
    mockRes = {};
    mockNext = vi.fn();
  });

  const testSchema = z.object({
    name: z.string().min(2).max(100),
    email: z.string().email(),
  });

  describe('body validation (default target)', () => {
    it('calls next() for valid body data', () => {
      mockReq.body = { name: 'John', email: 'john@example.com' };

      const middleware = validate(testSchema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('replaces req.body with parsed data (applies transforms)', () => {
      const schemaWithTransform = z.object({
        name: z.string().trim(),
        age: z.coerce.number(),
      });

      mockReq.body = { name: '  trimmed  ', age: '25' };

      const middleware = validate(schemaWithTransform);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.body.name).toBe('trimmed');
      expect(mockReq.body.age).toBe(25);
    });

    it('throws 400 for missing required fields', () => {
      mockReq.body = { name: 'John' }; // Missing email

      const middleware = validate(testSchema);

      expect(() =>
        middleware(mockReq as Request, mockRes as Response, mockNext)
      ).toThrow('Validation failed');
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('throws 400 for invalid field values', () => {
      mockReq.body = { name: 'J', email: 'not-an-email' }; // name too short

      const middleware = validate(testSchema);

      expect(() =>
        middleware(mockReq as Request, mockRes as Response, mockNext)
      ).toThrow('Validation failed');
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('includes error details with path and message', () => {
      mockReq.body = { name: 'A', email: 'invalid' };

      const middleware = validate(testSchema);

      try {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      } catch (error: any) {
        expect(error.statusCode).toBe(400);
        expect(error.details).toBeDefined();
        expect(Array.isArray(error.details)).toBe(true);
        expect(error.details.length).toBeGreaterThanOrEqual(1);
        // Each error detail should have path and message
        for (const detail of error.details) {
          expect(detail.path).toBeDefined();
          expect(detail.message).toBeDefined();
        }
      }
    });

    it('throws for completely empty body when fields are required', () => {
      mockReq.body = {};

      const middleware = validate(testSchema);

      expect(() =>
        middleware(mockReq as Request, mockRes as Response, mockNext)
      ).toThrow('Validation failed');
    });
  });

  describe('params validation', () => {
    it('validates route params correctly', () => {
      const paramsSchema = z.object({
        id: z.string().uuid(),
      });

      mockReq.params = { id: '550e8400-e29b-41d4-a716-446655440000' };

      const middleware = validate(paramsSchema, 'params');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('throws for invalid params', () => {
      const paramsSchema = z.object({
        id: z.string().uuid(),
      });

      mockReq.params = { id: 'not-a-uuid' };

      const middleware = validate(paramsSchema, 'params');

      expect(() =>
        middleware(mockReq as Request, mockRes as Response, mockNext)
      ).toThrow('Validation failed');
    });
  });

  describe('query validation', () => {
    it('validates query params correctly', () => {
      const querySchema = z.object({
        page: z.coerce.number().min(1),
        limit: z.coerce.number().min(1).max(100),
      });

      mockReq.query = { page: '1', limit: '20' } as any;

      const middleware = validate(querySchema, 'query');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.query).toEqual({ page: 1, limit: 20 });
    });

    it('throws for invalid query params', () => {
      const querySchema = z.object({
        page: z.coerce.number().min(1),
      });

      mockReq.query = { page: '0' } as any; // min is 1

      const middleware = validate(querySchema, 'query');

      expect(() =>
        middleware(mockReq as Request, mockRes as Response, mockNext)
      ).toThrow('Validation failed');
    });
  });
});
