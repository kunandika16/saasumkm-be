/**
 * Blast Job Service
 *
 * Orchestrates WhatsApp blast job execution by communicating with the
 * Python WhatsApp Web automation service. Handles job creation, status
 * polling, failure recording, and single message sending.
 *
 * Validates: Requirements 5.2, 5.5, 6.6, 7.3, 8.1, 8.2, 8.3, 8.5
 */

import axios from 'axios';
import prisma from '../config/database';
import { resolveTemplate } from './blast-template.service';

const WA_PYTHON_SERVICE_URL = process.env.WA_PYTHON_SERVICE_URL || 'http://localhost:8001';

export interface BlastRecipient {
  phone: string;
  name: string;
}

export interface BlastJobResult {
  id: string;
  tenantId: string;
  category: string;
  inactivityPeriod: string | null;
  message: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  lastSentIndex: number;
  createdAt: Date;
  completedAt: Date | null;
}

export interface BlastJobStatusResult {
  jobId: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  lastSentIndex: number;
  completedAt: string | null;
  failedRecipients: Array<{
    name: string;
    whatsapp: string;
    reason: string;
  }>;
}

export interface SendSingleResult {
  success: boolean;
  error?: string;
}

/**
 * Creates a BlastJob record and triggers the Python WhatsApp service to start delivery.
 *
 * Flow:
 * 1. Create BlastJob record in DB with status 'in_progress'
 * 2. Call Python service POST /blast/send with job_id, recipients, and message_template
 * 3. If Python service call fails, update job status to 'failed' and throw
 * 4. Return the created job
 *
 * Validates: Requirements 5.2, 5.5, 8.1, 8.2, 8.3
 *
 * @param tenantId - The tenant initiating the blast
 * @param category - Blast category (reminder, promo, announcement, custom)
 * @param inactivityPeriod - Optional inactivity period for reminder category
 * @param message - The message template with {{nama}} placeholder
 * @param recipients - Array of recipients with phone and name
 * @returns The created BlastJob record
 */
export async function createBlastJob(
  tenantId: string,
  category: 'reminder' | 'promo' | 'announcement' | 'custom',
  inactivityPeriod: string | null,
  message: string,
  recipients: BlastRecipient[]
): Promise<BlastJobResult> {
  // 1. Create BlastJob record in DB
  const blastJob = await prisma.blastJob.create({
    data: {
      tenantId,
      category,
      inactivityPeriod,
      message,
      status: 'in_progress',
      totalRecipients: recipients.length,
    },
  });

  // 2. Call Python service to start blast delivery
  try {
    await axios.post(`${WA_PYTHON_SERVICE_URL}/blast/send`, {
      job_id: blastJob.id,
      recipients: recipients.map((r) => ({ phone: r.phone, name: r.name })),
      message_template: message,
    });
  } catch (error) {
    // 3. If Python service call fails, update job status to 'failed'
    await prisma.blastJob.update({
      where: { id: blastJob.id },
      data: { status: 'failed' },
    });

    if (axios.isAxiosError(error) && !error.response) {
      throw new Error('Layanan WhatsApp tidak tersedia');
    }

    throw new Error('Gagal memulai blast job');
  }

  // 4. Return the created job
  return blastJob;
}

/**
 * Fetches blast job status from the Python service and syncs it to the local DB.
 *
 * Flow:
 * 1. Call Python service GET /blast/:jobId/status
 * 2. Update local DB BlastJob with latest sent_count, failed_count, lastSentIndex, status
 * 3. If status is "completed", set completedAt
 * 4. If Python service has failed_recipients, sync them to BlastJobFailure table
 * 5. Return the combined status response
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.5
 *
 * @param jobId - The blast job ID to check
 * @returns Combined status with progress and failed recipients
 */
export async function getBlastJobStatus(jobId: string): Promise<BlastJobStatusResult> {
  let pythonStatus;

  try {
    const response = await axios.get(`${WA_PYTHON_SERVICE_URL}/blast/${jobId}/status`);
    pythonStatus = response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && !error.response) {
      throw new Error('Layanan WhatsApp tidak tersedia');
    }

    // If Python service returns an error, fall back to DB status
    const dbJob = await prisma.blastJob.findUnique({
      where: { id: jobId },
      include: { failures: true },
    });

    if (!dbJob) {
      throw new Error('Blast job tidak ditemukan');
    }

    return {
      jobId: dbJob.id,
      status: dbJob.status,
      totalRecipients: dbJob.totalRecipients,
      sentCount: dbJob.sentCount,
      failedCount: dbJob.failedCount,
      lastSentIndex: dbJob.lastSentIndex,
      completedAt: dbJob.completedAt ? dbJob.completedAt.toISOString() : null,
      failedRecipients: dbJob.failures.map((f) => ({
        name: f.memberName,
        whatsapp: f.whatsapp,
        reason: f.reason,
      })),
    };
  }

  // Update local DB with latest status from Python service
  const updateData: Record<string, unknown> = {
    sentCount: pythonStatus.sent_count,
    failedCount: pythonStatus.failed_count,
    lastSentIndex: pythonStatus.last_sent_index,
    status: pythonStatus.status,
  };

  if (pythonStatus.status === 'completed') {
    updateData.completedAt = new Date();
  }

  const updatedJob = await prisma.blastJob.update({
    where: { id: jobId },
    data: updateData,
  });

  // Sync failed recipients to BlastJobFailure table
  if (pythonStatus.failed_recipients && pythonStatus.failed_recipients.length > 0) {
    // Get existing failures to avoid duplicates
    const existingFailures = await prisma.blastJobFailure.findMany({
      where: { blastJobId: jobId },
      select: { whatsapp: true },
    });
    const existingPhones = new Set(existingFailures.map((f) => f.whatsapp));

    const newFailures = pythonStatus.failed_recipients.filter(
      (f: { phone: string }) => !existingPhones.has(f.phone)
    );

    if (newFailures.length > 0) {
      await prisma.blastJobFailure.createMany({
        data: newFailures.map((f: { phone: string; name: string; reason: string }) => ({
          blastJobId: jobId,
          memberName: f.name,
          whatsapp: f.phone,
          reason: f.reason,
        })),
      });
    }
  }

  // Fetch all failures for the response
  const allFailures = await prisma.blastJobFailure.findMany({
    where: { blastJobId: jobId },
  });

  return {
    jobId: updatedJob.id,
    status: updatedJob.status,
    totalRecipients: updatedJob.totalRecipients,
    sentCount: updatedJob.sentCount,
    failedCount: updatedJob.failedCount,
    lastSentIndex: updatedJob.lastSentIndex,
    completedAt: updatedJob.completedAt ? updatedJob.completedAt.toISOString() : null,
    failedRecipients: allFailures.map((f) => ({
      name: f.memberName,
      whatsapp: f.whatsapp,
      reason: f.reason,
    })),
  };
}

/**
 * Records a delivery failure for a blast job.
 * Creates a BlastJobFailure record and increments failedCount on the BlastJob.
 *
 * Validates: Requirements 8.3, 8.5
 *
 * @param jobId - The blast job ID
 * @param memberName - Name of the failed recipient
 * @param whatsapp - WhatsApp number of the failed recipient
 * @param reason - Reason for the failure
 */
export async function recordFailure(
  jobId: string,
  memberName: string,
  whatsapp: string,
  reason: string
): Promise<void> {
  await prisma.$transaction([
    prisma.blastJobFailure.create({
      data: {
        blastJobId: jobId,
        memberName,
        whatsapp,
        reason,
      },
    }),
    prisma.blastJob.update({
      where: { id: jobId },
      data: {
        failedCount: { increment: 1 },
      },
    }),
  ]);
}

/**
 * Sends a single WhatsApp message to a member via the Python service.
 * Looks up the member by ID to get their name and WhatsApp number,
 * resolves the {{nama}} placeholder, then calls the Python service.
 *
 * Validates: Requirements 6.6, 7.3
 *
 * @param memberId - The member ID to send to
 * @param message - The message template with {{nama}} placeholder
 * @returns Success/failure result
 */
export async function sendSingleMessage(
  memberId: string,
  message: string
): Promise<SendSingleResult> {
  // Look up member by ID
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { name: true, whatsapp: true },
  });

  if (!member) {
    return { success: false, error: 'Member tidak ditemukan' };
  }

  if (!member.whatsapp) {
    return { success: false, error: 'Member tidak memiliki nomor WhatsApp' };
  }

  // Resolve the {{nama}} placeholder
  const resolvedMessage = resolveTemplate(message, member.name);

  try {
    await axios.post(`${WA_PYTHON_SERVICE_URL}/message/send`, {
      phone: member.whatsapp,
      name: member.name,
      message_template: resolvedMessage,
    });

    return { success: true };
  } catch (error) {
    if (axios.isAxiosError(error) && !error.response) {
      return { success: false, error: 'Layanan WhatsApp tidak tersedia' };
    }

    return { success: false, error: 'Gagal mengirim pesan' };
  }
}
