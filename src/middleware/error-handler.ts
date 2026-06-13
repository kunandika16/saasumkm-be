import { Request, Response, NextFunction } from 'express';
import { MulterError } from 'multer';
import { env } from '../config/env';
import { ApiError } from '../utils/api-error';

/**
 * Standardized error response format.
 */
interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

/**
 * Global error handler middleware.
 * Catches all errors and returns a standardized JSON response.
 *
 * Handles:
 * - ApiError: returns custom statusCode, message, code, details
 * - MulterError: maps to appropriate 400 response
 * - Generic errors: returns 500 with sanitized message in production
 *
 * In development, includes stack trace and full error details.
 * In production, hides internal error details for 500s.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error with stack trace in development
  if (env.NODE_ENV === 'development') {
    console.error(`[Error] ${err.name}: ${err.message}`, {
      stack: err.stack,
    });
  } else {
    console.error(`[Error] ${err.name}: ${err.message}`);
  }

  // Handle ApiError instances
  if (err instanceof ApiError) {
    const errorBody: ErrorResponse['error'] = {
      message: err.message,
      code: err.code,
    };
    if (err.details) {
      errorBody.details = err.details;
    }
    const response: ErrorResponse = {
      success: false,
      error: errorBody,
    };
    res.status(err.statusCode).json(response);
    return;
  }

  // Handle Multer errors
  if (err instanceof MulterError) {
    let message = 'File upload error';
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'File size exceeds the maximum limit of 2MB';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Unexpected file field';
    }

    const response: ErrorResponse = {
      success: false,
      error: {
        message,
        code: 'UPLOAD_ERROR',
      },
    };
    res.status(400).json(response);
    return;
  }

  // Handle generic/unknown errors
  const statusCode = 500;
  const response: ErrorResponse = {
    success: false,
    error: {
      message:
        env.NODE_ENV === 'production'
          ? 'Internal server error'
          : err.message || 'Internal server error',
      code: 'INTERNAL_ERROR',
      ...(env.NODE_ENV === 'development' && { details: err.stack }),
    },
  };
  res.status(statusCode).json(response);
}
