import prisma from '../config/database';
import { ApiError } from '../utils/api-error';

/**
 * Minimum and maximum allowed quantity per cart item.
 * Req 5.5: Quantity range [1, 99].
 */
const MIN_QUANTITY = 1;
const MAX_QUANTITY = 99;

export interface CartItem {
  menuItemId: string;
  quantity: number;
  price: number;
  isAvailable: boolean;
}

export interface CartInputItem {
  menuItemId: string;
  quantity: number;
}

export interface ValidatedCartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  isAvailable: boolean;
}

export interface CartValidationResult {
  validItems: ValidatedCartItem[];
  hasUnavailableItems: boolean;
  total: number;
}

/**
 * Calculates the cart total by summing price × quantity for available items only.
 * Returns total as integer (IDR, no decimals).
 *
 * Req 5.4: Cart displays items with individual prices, quantities, total in IDR.
 * Req 5.9: If item becomes unavailable, exclude from total.
 *
 * Validates: Requirements 5.4, 5.9
 */
export function calculateCartTotal(items: CartItem[]): number {
  return items.reduce((total, item) => {
    if (item.isAvailable) {
      return total + item.price * item.quantity;
    }
    return total;
  }, 0);
}

/**
 * Validates cart items against the database:
 * - Looks up each menuItemId in the MenuItem model
 * - Validates all items exist (throws if any menuItemId not found)
 * - Validates all items belong to the specified tenant
 * - Validates quantities are in [1, 99]
 * - Returns enriched items with availability status, unavailable flag, and total
 *
 * Req 5.3: Add item to cart with quantity, allow adjustment before confirming.
 * Req 5.5: Quantity range [1, 99].
 * Req 5.9: If item becomes unavailable, flag it in cart, exclude from total.
 *
 * Validates: Requirements 5.3, 5.4, 5.5, 5.9
 */
export async function validateCartItems(
  tenantId: string,
  items: CartInputItem[]
): Promise<CartValidationResult> {
  if (!items || items.length === 0) {
    throw ApiError.badRequest('Keranjang tidak boleh kosong');
  }

  // Validate quantities are within allowed range
  for (const item of items) {
    if (item.quantity < MIN_QUANTITY || item.quantity > MAX_QUANTITY) {
      throw ApiError.badRequest(
        `Jumlah item harus antara ${MIN_QUANTITY} dan ${MAX_QUANTITY}`
      );
    }
  }

  // Fetch all menu items in a single query
  const menuItemIds = items.map((item) => item.menuItemId);
  const menuItems = await prisma.menuItem.findMany({
    where: {
      id: { in: menuItemIds },
    },
  });

  // Check all items exist
  const foundIds = new Set(menuItems.map((mi) => mi.id));
  for (const item of items) {
    if (!foundIds.has(item.menuItemId)) {
      throw ApiError.notFound(
        `Item menu dengan ID ${item.menuItemId} tidak ditemukan`
      );
    }
  }

  // Check all items belong to the same tenant
  for (const menuItem of menuItems) {
    if (menuItem.tenantId !== tenantId) {
      throw ApiError.badRequest(
        `Item menu "${menuItem.name}" bukan milik tenant ini`
      );
    }
  }

  // Build a lookup map for menu items
  const menuItemMap = new Map(menuItems.map((mi) => [mi.id, mi]));

  // Enrich cart items with database info
  const validItems: ValidatedCartItem[] = items.map((item) => {
    const menuItem = menuItemMap.get(item.menuItemId)!;
    return {
      menuItemId: menuItem.id,
      name: menuItem.name,
      price: menuItem.price,
      quantity: item.quantity,
      isAvailable: menuItem.isAvailable,
    };
  });

  const hasUnavailableItems = validItems.some((item) => !item.isAvailable);

  // Calculate total only from available items
  const total = calculateCartTotal(
    validItems.map((item) => ({
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      price: item.price,
      isAvailable: item.isAvailable,
    }))
  );

  return {
    validItems,
    hasUnavailableItems,
    total,
  };
}
