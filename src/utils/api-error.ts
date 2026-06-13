/**
 * Custom API error class for standardized error handling.
 * Extends built-in Error with HTTP status code and optional details.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    message: string,
    options?: { code?: string; details?: unknown }
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = options?.code;
    this.details = options?.details;
    this.name = 'ApiError';

    // Maintain proper stack trace in V8 engines
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, message, { code: 'BAD_REQUEST', details });
  }

  static unauthorized(message = 'Unauthorized'): ApiError {
    return new ApiError(401, message, { code: 'UNAUTHORIZED' });
  }

  static forbidden(message = 'Forbidden'): ApiError {
    return new ApiError(403, message, { code: 'FORBIDDEN' });
  }

  static notFound(message = 'Resource not found'): ApiError {
    return new ApiError(404, message, { code: 'NOT_FOUND' });
  }

  static internal(message = 'Internal server error'): ApiError {
    return new ApiError(500, message, { code: 'INTERNAL_ERROR' });
  }
}
