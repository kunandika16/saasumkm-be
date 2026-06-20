-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'qris');

-- AlterTable: add payment_method column with default 'cash' for existing rows
ALTER TABLE "orders" ADD COLUMN "payment_method" "PaymentMethod" NOT NULL DEFAULT 'cash';
