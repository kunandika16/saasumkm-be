/**
 * Blast Recipient Service
 *
 * Filters and returns recipients for WhatsApp blast messaging
 * based on category and inactivity period.
 *
 * Validates: Requirements 3.3, 3.4, 10.1, 10.2, 10.3, 10.4, 10.6
 */

import prisma from '../config/database';

export type BlastCategory = 'reminder' | 'promo' | 'announcement' | 'custom';
export type InactivityPeriod = '1week' | '1month' | '3months';

export interface Recipient {
  id: string;
  name: string;
  whatsapp: string;
}

export interface RecipientCountResult {
  count: number;
  sampleRecipient?: {
    name: string;
    whatsapp: string;
  };
}

const INACTIVITY_DAYS: Record<InactivityPeriod, number> = {
  '1week': 7,
  '1month': 30,
  '3months': 90,
};

/**
 * Retrieves filtered recipients for a blast job based on category and optional inactivity period.
 *
 * - For Reminder: returns members whose last paid order `validatedAt` exceeds the threshold
 *   (7/30/90 days) OR who have never placed a paid order, excluding members without WhatsApp.
 * - For Promo/Announcement/Custom: returns all members with a non-empty WhatsApp number.
 *
 * Validates: Requirements 3.3, 3.4, 10.1, 10.2, 10.3, 10.4, 10.6
 *
 * @param tenantId - The tenant ID to filter members for
 * @param category - The blast category
 * @param inactivityPeriod - Required for reminder category; the inactivity threshold
 * @returns Array of recipients with id, name, and whatsapp
 */
export async function getRecipients(
  tenantId: string,
  category: BlastCategory,
  inactivityPeriod?: InactivityPeriod
): Promise<Recipient[]> {
  if (category === 'reminder' && inactivityPeriod) {
    return getReminderRecipients(tenantId, inactivityPeriod);
  }

  // Promo, Announcement, Custom — all members with non-empty WhatsApp
  return prisma.member.findMany({
    where: {
      tenantId,
      whatsapp: { not: '' },
    },
    select: { id: true, name: true, whatsapp: true },
  });
}

/**
 * Returns the count of matching recipients and a sample recipient for preview.
 *
 * Validates: Requirements 3.5, 10.5
 *
 * @param tenantId - The tenant ID to filter members for
 * @param category - The blast category
 * @param inactivityPeriod - Required for reminder category; the inactivity threshold
 * @returns Object with count and optional sample recipient
 */
export async function getRecipientCount(
  tenantId: string,
  category: BlastCategory,
  inactivityPeriod?: InactivityPeriod
): Promise<RecipientCountResult> {
  const recipients = await getRecipients(tenantId, category, inactivityPeriod);

  const result: RecipientCountResult = {
    count: recipients.length,
  };

  if (recipients.length > 0) {
    result.sampleRecipient = {
      name: recipients[0].name,
      whatsapp: recipients[0].whatsapp,
    };
  }

  return result;
}

/**
 * Filters recipients for the Reminder category.
 * Returns members whose last paid order validatedAt exceeds the inactivity threshold
 * OR who have never placed a paid order — excluding members without WhatsApp.
 *
 * Validates: Requirements 3.4, 10.1, 10.2, 10.3, 10.6
 *
 * @param tenantId - The tenant ID
 * @param inactivityPeriod - The inactivity threshold key
 * @returns Filtered recipients
 */
async function getReminderRecipients(
  tenantId: string,
  inactivityPeriod: InactivityPeriod
): Promise<Recipient[]> {
  const days = INACTIVITY_DAYS[inactivityPeriod];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  return prisma.member.findMany({
    where: {
      tenantId,
      whatsapp: { not: '' },
      OR: [
        // Members whose last paid order was before cutoff
        // (every paid order has validatedAt before cutoff, meaning no recent paid orders)
        {
          orders: {
            every: {
              OR: [
                { status: { not: 'paid' } },
                { validatedAt: { lt: cutoffDate } },
              ],
            },
          },
        },
        // Members who have never placed a paid order
        {
          orders: {
            none: { status: 'paid' },
          },
        },
      ],
    },
    select: { id: true, name: true, whatsapp: true },
  });
}
