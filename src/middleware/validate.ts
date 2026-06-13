import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ApiError } from '../utils/api-error';

/**
 * Target locations for validation on the Express request object.
 */
type ValidationTarget = 'body' | 'params' | 'query';

/**
 * Generic Zod validation middleware factory.
 * Takes a Zod schema and a target ('body' | 'params' | 'query'),
 * validates the request data against the schema.
 *
 * - Returns 400 with Zod error details if validation fails.
 * - Replaces req[target] with the parsed (and potentially transformed) data on success.
 */
export function validate(schema: ZodSchema, target: ValidationTarget = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const zodError = result.error as ZodError;
      throw new ApiError(400, 'Validation failed', {
        code: 'VALIDATION_ERROR',
        details: zodError.errors.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code,
        })),
      });
    }

    // Replace with parsed data (handles transformations and defaults)
    req[target] = result.data;
    next();
  };
}
