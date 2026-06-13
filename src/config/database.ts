import { PrismaClient } from '@prisma/client';

/**
 * Singleton PrismaClient instance.
 * Reuses the same connection pool across the application.
 */
const prisma = new PrismaClient();

export default prisma;
