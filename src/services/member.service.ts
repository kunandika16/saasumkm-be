import prisma from '../config/database';
import { ApiError } from '../utils/api-error';
import { normalizePhone, validatePhone } from '../utils/phone';

/**
 * Name validation regex for profile updates.
 * Req 10.5: 2-50 chars with letters, spaces, period, apostrophe, hyphen.
 */
const PROFILE_NAME_REGEX = /^[a-zA-Z\s.'\-]+$/;

/**
 * Validates a name for profile update.
 * Req 10.5: 2-50 chars, letters/spaces/period/apostrophe/hyphen.
 */
function validateProfileName(name: string): void {
  if (!name || name.length < 2) {
    throw ApiError.badRequest('Nama minimal 2 karakter');
  }
  if (name.length > 50) {
    throw ApiError.badRequest('Nama maksimal 50 karakter');
  }
  if (!PROFILE_NAME_REGEX.test(name)) {
    throw ApiError.badRequest(
      'Nama hanya boleh huruf, spasi, titik, apostrof, atau strip'
    );
  }
}

export interface CreateMemberInput {
  tenantId: string;
  name: string;
  whatsapp: string;
}

/**
 * Creates a new member record with a unique ID and registration timestamp.
 * Validates and normalizes the WhatsApp number before storage.
 *
 * Validates: Req 2.4 — create Member with unique ID and registration timestamp.
 */
export async function createMember(input: CreateMemberInput) {
  const { tenantId, name, whatsapp } = input;

  if (!validatePhone(whatsapp)) {
    throw ApiError.badRequest(
      'Format nomor WhatsApp tidak valid (08xx atau +628xx, 10-13 digit)'
    );
  }

  const normalizedPhone = normalizePhone(whatsapp);

  // Check for existing member with same tenant + whatsapp (unique constraint)
  const existing = await prisma.member.findUnique({
    where: {
      tenantId_whatsapp: {
        tenantId,
        whatsapp: normalizedPhone,
      },
    },
  });

  if (existing) {
    throw ApiError.badRequest(
      'Nomor WhatsApp ini sudah terdaftar sebagai member'
    );
  }

  const member = await prisma.member.create({
    data: {
      tenantId,
      name,
      whatsapp: normalizedPhone,
    },
  });

  return member;
}

/**
 * Retrieves a member by their unique ID.
 * Returns member data needed for home page display (Req 3.1)
 * and profile page (Req 10.1).
 *
 * Validates: Req 3.1 — display member name and point balance.
 * Validates: Req 10.1 — profile shows name, whatsapp, member ID, registration date, point balance, total visits.
 */
export async function getMemberById(memberId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
  });

  if (!member) {
    throw ApiError.notFound('Member tidak ditemukan');
  }

  return member;
}

/**
 * Retrieves a member by tenant ID and WhatsApp number.
 * Normalizes the phone number before querying.
 */
export async function getMemberByWhatsApp(tenantId: string, whatsapp: string) {
  if (!validatePhone(whatsapp)) {
    throw ApiError.badRequest(
      'Format nomor WhatsApp tidak valid (08xx atau +628xx, 10-13 digit)'
    );
  }

  const normalizedPhone = normalizePhone(whatsapp);

  const member = await prisma.member.findUnique({
    where: {
      tenantId_whatsapp: {
        tenantId,
        whatsapp: normalizedPhone,
      },
    },
  });

  if (!member) {
    throw ApiError.notFound('Member tidak ditemukan');
  }

  return member;
}

/**
 * Updates a member's profile name.
 * Validates name according to Req 10.5: 2-50 chars with letters, spaces,
 * period, apostrophe, hyphen.
 *
 * Validates: Req 10.5 — name update 2-50 chars with allowed characters.
 */
export async function updateProfile(
  memberId: string,
  data: { name: string }
) {
  validateProfileName(data.name);

  // Ensure member exists
  const existing = await prisma.member.findUnique({
    where: { id: memberId },
  });

  if (!existing) {
    throw ApiError.notFound('Member tidak ditemukan');
  }

  const updated = await prisma.member.update({
    where: { id: memberId },
    data: { name: data.name },
  });

  return updated;
}

/**
 * Retrieves all members for a given tenant.
 * Used by admin dashboard for member list view.
 */
export async function getMembersByTenant(tenantId: string) {
  const members = await prisma.member.findMany({
    where: { tenantId },
    orderBy: { registeredAt: 'desc' },
  });

  return members;
}

/**
 * Retrieves dormant members — those with no visit in the last 30 days.
 * Returns up to 50 members sorted by days since last visit descending.
 *
 * Validates: Req 12.6 — dormant = no visit in last 30 days,
 * show up to 50 sorted by days since last visit descending.
 */
export async function getDormantMembers(tenantId: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const dormantMembers = await prisma.member.findMany({
    where: {
      tenantId,
      OR: [
        // Members whose last visit was more than 30 days ago
        { lastVisitAt: { lt: thirtyDaysAgo } },
        // Members who have never visited (lastVisitAt is null)
        // but registered more than 30 days ago
        {
          lastVisitAt: null,
          registeredAt: { lt: thirtyDaysAgo },
        },
      ],
    },
    orderBy: {
      lastVisitAt: 'asc', // null (never visited) first, then oldest visit
    },
    take: 50,
  });

  return dormantMembers;
}
