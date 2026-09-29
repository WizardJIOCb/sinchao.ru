import { z } from "zod";
export const cartItemSchema = z.object({
  id: z.string().uuid().optional(),
  dishId: z.string().min(1).max(80),
  quantity: z.number().int().min(1).max(20),
  modifiers: z.array(z.string().max(80)).max(20).default([]),
  notes: z.string().max(300).default(""),
});
export const checkoutSchema = z.object({
  fulfillment: z.enum(["DELIVERY", "PICKUP"]),
  zoneId: z.string().max(80).default(""),
  promo: z.string().max(30).default(""),
  points: z.number().int().min(0).max(100000).default(0),
  name: z.string().trim().min(2).max(100),
  phone: z.string().regex(/^\+?[\d ()-]{10,20}$/, "Укажите телефон для связи"),
  address: z.string().max(300).default(""),
  time: z.string().max(30).default("ASAP"),
  notes: z.string().max(500).default(""),
});
export const quoteSchema = checkoutSchema.pick({
  fulfillment: true,
  zoneId: true,
  promo: true,
  points: true,
});
export const reservationSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  partySize: z.number().int().min(1).max(20),
  seating: z.string().max(50),
  name: z.string().trim().min(2).max(100),
  phone: z.string().regex(/^\+?[\d ()-]{10,20}$/),
  notes: z.string().max(500).default(""),
});
export const dishSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,80}$/),
  categoryId: z.string().max(80),
  name: z.string().min(1).max(100),
  localizedName: z.string().min(1).max(100),
  description: z.string().max(1500),
  ingredients: z.array(z.string().max(100)).max(30),
  price: z.number().int().min(0).max(10000000),
  portion: z.string().max(60),
  image: z
    .string()
    .max(1000)
    .refine((v) => v.startsWith("/images/") || v.startsWith("https://")),
  allergens: z.array(z.string().max(60)).max(30),
  orderable: z.boolean().optional(),
  imageCrop: z
    .object({
      x: z.number().nonnegative(),
      y: z.number().nonnegative(),
      width: z.number().positive(),
      height: z.number().positive(),
      sourceWidth: z.number().positive(),
      sourceHeight: z.number().positive(),
    })
    .refine(
      (c) => c.x + c.width <= c.sourceWidth && c.y + c.height <= c.sourceHeight,
    )
    .optional(),
  tags: z.array(z.string().max(60)).max(30),
  spice: z.number().int().min(0).max(3),
  available: z.boolean(),
  featured: z.boolean(),
  region: z.string().max(60),
  modifiers: z
    .array(
      z
        .object({
          id: z.string(),
          name: z.string().max(80),
          min: z.number().int().min(0),
          max: z.number().int().min(0).max(10),
          options: z
            .array(
              z.object({
                id: z.string(),
                name: z.string().max(80),
                price: z.number().int().min(0).max(1000000),
                available: z.boolean(),
              }),
            )
            .max(20),
        })
        .refine((g) => g.min <= g.max && g.max <= g.options.length),
    )
    .max(10),
});
