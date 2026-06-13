import { z } from 'zod';

/**
 * Cart item schema.
 * Req 5.5: quantity 1-99 per item
 */
const CartItemSchema = z.object({
  menuItemId: z.string().uuid('Menu item ID harus berupa UUID yang valid'),
  quantity: z
    .number()
    .int('Quantity harus bilangan bulat')
    .min(1, 'Quantity minimal 1')
    .max(99, 'Quantity maksimal 99 per item'),
});

/**
 * CheckoutRequest schema
 * Req 5.5: items array with quantity 1-99
 * Req 6.1: optional voucher input field before payment
 */
export const CheckoutRequestSchema = z.object({
  items: z
    .array(CartItemSchema)
    .min(1, 'Minimal 1 item diperlukan untuk checkout'),
  voucherCode: z
    .string()
    .min(1, 'Kode voucher tidak boleh kosong')
    .max(20, 'Kode voucher maksimal 20 karakter')
    .optional(),
});

export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;
