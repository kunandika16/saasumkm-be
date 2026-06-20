-- AlterTable: Add new fields to rewards table
ALTER TABLE "rewards" ADD COLUMN "image_url" TEXT;
ALTER TABLE "rewards" ADD COLUMN "menu_item_id" TEXT;
ALTER TABLE "rewards" ADD COLUMN "discount_type" TEXT NOT NULL DEFAULT 'free';
ALTER TABLE "rewards" ADD COLUMN "discount_sub_type" TEXT;
ALTER TABLE "rewards" ADD COLUMN "discount_value" INTEGER;

-- CreateTable: reward_vouchers
CREATE TABLE "reward_vouchers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "reward_id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discount_type" TEXT NOT NULL,
    "discount_sub_type" TEXT,
    "discount_value" INTEGER,
    "expiry_date" TIMESTAMP(3) NOT NULL,
    "is_used" BOOLEAN NOT NULL DEFAULT false,
    "used_at" TIMESTAMP(3),
    "order_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique constraint on reward_vouchers code
CREATE UNIQUE INDEX "reward_vouchers_code_key" ON "reward_vouchers"("code");

-- CreateIndex: composite index on member_id and created_at
CREATE INDEX "reward_vouchers_member_id_created_at_idx" ON "reward_vouchers"("member_id", "created_at");

-- CreateIndex: index on code for fast lookup
CREATE INDEX "reward_vouchers_code_idx" ON "reward_vouchers"("code");

-- AddForeignKey: rewards.menu_item_id -> menu_items.id
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: reward_vouchers.tenant_id -> tenants.id
ALTER TABLE "reward_vouchers" ADD CONSTRAINT "reward_vouchers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: reward_vouchers.member_id -> members.id
ALTER TABLE "reward_vouchers" ADD CONSTRAINT "reward_vouchers_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: reward_vouchers.reward_id -> rewards.id
ALTER TABLE "reward_vouchers" ADD CONSTRAINT "reward_vouchers_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "rewards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: reward_vouchers.menu_item_id -> menu_items.id
ALTER TABLE "reward_vouchers" ADD CONSTRAINT "reward_vouchers_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: reward_vouchers.order_id -> orders.id
ALTER TABLE "reward_vouchers" ADD CONSTRAINT "reward_vouchers_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
