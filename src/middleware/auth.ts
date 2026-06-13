import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { ApiError } from '../utils/api-error';

/**
 * JWT payload structure used throughout the application.
 */
export interface JwtPayload {
  memberId?: string;
  adminId?: string;
  tenantId: string;
  role: 'member' | 'admin';
  iat?: number;
  exp?: number;
}

/**
 * Extend Express Request to include authenticated user data.
 */
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * JWT verification middleware.
 * Extracts Bearer token from Authorization header, verifies it,
 * and attaches decoded payload to req.user.
 *
 * Returns 401 if token is missing, invalid, or expired.
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Access token is required');
  }

  const token = authHeader.slice(7); // Remove 'Bearer ' prefix

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('Access token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw ApiError.unauthorized('Invalid access token');
    }
    throw ApiError.unauthorized('Token verification failed');
  }
}
