import { z } from "zod";

import type { CardWindowRole } from "./window-roles";

export const cardWindowBoundsSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export type CardWindowBounds = z.infer<typeof cardWindowBoundsSchema>;

export const cardWindowPreferencesSchema = z.object({
  bounds: cardWindowBoundsSchema.optional(),
  pinned: z.boolean().optional(),
});

export type CardWindowPreferences = z.infer<typeof cardWindowPreferencesSchema>;

export const windowPreferencesConfigSchema = z
  .record(z.string(), cardWindowPreferencesSchema)
  .default({});

export type WindowPreferencesConfig = Partial<
  Record<CardWindowRole, CardWindowPreferences>
>;

export const DEFAULT_WINDOW_PREFERENCES_CONFIG: WindowPreferencesConfig = {};
