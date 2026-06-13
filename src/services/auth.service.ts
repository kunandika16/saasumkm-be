import jwt, { SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { ApiError } from '../utils/api-error';
import { JwtPayload } from '../middleware/auth';

const SALT_ROUNDS = 12;

/**
 * Generates a short-lived access token (default 15m).
 * Payload contains memberId or adminId, tenantId, and role.
 */
export function generateAccessToken(payload: {
  memberId?: string;
  adminId?: string;
  tenantId: string;
  role: 'member' | 'admin';
}): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRY,
  } as SignOptions);
}

/**
 * Generates a long-lived refresh token (default 7d).
 * Payload contains memberId or adminId, tenantId, and role.
 */
export function generateRefreshToken(payload: {
  memberId?: string;
  adminId?: string;
  tenantId: string;
  role: 'member' | 'admin';
}): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRY,
  } as SignOptions);
}

/**
 * Verifies an access token and returns the decoded payload.
 * Throws ApiError if the token is invalid or expired.
 */
export function verifyAccessToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
    return decoded;
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

/**
 * Verifies a refresh token and returns the decoded payload.
 * Throws ApiError if the token is invalid or expired.
 */
export function verifyRefreshToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('Refresh token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw ApiError.unauthorized('Invalid refresh token');
    }
    throw ApiError.unauthorized('Token verification failed');
  }
}

/**
 * Hashes a plaintext password using bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compares a plaintext password against a bcrypt hash.
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
