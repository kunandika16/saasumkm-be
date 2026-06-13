import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/api-error';

/**
 * Admin role guard middleware.
 * Must be used AFTER authMiddleware — checks that the authenticated
 * user has role = "admin" in their JWT claims.
 *
 * Returns 403 if user is not an admin.
 */
export function adminGuard(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    throw ApiError.unauthorized('Authentication required');
  }

  if (req.user.role !== 'admin') {
    throw ApiError.forbidden('Admin access required');
  }

  next();
}
