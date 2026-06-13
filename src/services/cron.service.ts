import cron from 'node-cron';
import prisma from '../config/database';
import { expireOrders } from './order.service';
import { expirePoints } from './points.service';

/**
 * Initializes all scheduled cron jobs for the platform.
 * Should be called once from the app entry point.
 *
 * Jobs:
 * - Every 15 minutes: expire pending orders older than 24h (Req 7.8)
 * - Daily at 2 AM: expire points based on tenant settings (Req 8.9)
 */
export function initCronJobs(): void {
  // ─── Order Expiry Job — every 15 minutes ─────────────────────────────────
  cron.schedule('*/15 * * * *', async () => {
    try {
      const result = await expireOrders();
      if (result.expiredCount > 0 || result.restoredVouchers > 0) {
        console.log(
          `Cron: Expired ${result.expiredCount} orders, restored ${result.restoredVouchers} vouchers`
        );
      }
    } catch (error) {
      console.error('Cron: Order expiry job failed:', error);
    }
  });

  // ─── Point Expiry Job — daily at 2 AM ────────────────────────────────────
  cron.schedule('0 2 * * *', async () => {
    try {
      const tenants = await prisma.tenant.findMany({
        select: { id: true },
      });

      let totalExpired = 0;

      for (const tenant of tenants) {
        const expiredCount = await expirePoints(tenant.id);
        totalExpired += expiredCount;
      }

      if (totalExpired > 0) {
        console.log(`Cron: Expired ${totalExpired} point transactions across ${tenants.length} tenants`);
      }
    } catch (error) {
      console.error('Cron: Point expiry job failed:', error);
    }
  });

  console.log('Cron jobs initialized');
}
