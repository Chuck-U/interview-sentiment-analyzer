import { z } from "zod";

import {
  DEFAULT_CAPTURE_OPTIONS_CONFIG,
  captureOptionsConfigSchema,
  type CaptureOptionsConfig,
} from "./capture-options";
import {
  DEFAULT_SHORTCUT_ID_RECORDING_TOGGLE,
  SHORTCUT_ACTIONS,
  type ShortcutAction,
  type ShortcutConfigEntry,
} from "./shortcuts";

export const APP_CONFIG_SCHEMA_VERSION = 1 as const;

export type AppConfig = {
  readonly schemaVersion: typeof APP_CONFIG_SCHEMA_VERSION;
  readonly shortcuts: Record<string, ShortcutConfigEntry>;
  // Future schema versions can add per-window pin and bounds preferences here
  // so launcher/card lock state survives reopen without coupling it to capture options.
  readonly captureOptions: CaptureOptionsConfig;
};

const shortcutActionSchema = z.enum(SHORTCUT_ACTIONS);

const shortcutConfigEntrySchema = z.object({
  enabled: z.boolean(),
  accelerator: z
    .string()
    .trim()
    .min(1, "shortcut accelerator must be a non-empty string"),
  actions: z
    .array(shortcutActionSchema)
    .min(1, "shortcut actions must contain at least one action"),
});

export const appConfigSchema = z.object({
  schemaVersion: z.literal(APP_CONFIG_SCHEMA_VERSION),
  shortcuts: z.record(z.string(), shortcutConfigEntrySchema),
  captureOptions: captureOptionsConfigSchema,
});

export const DEFAULT_APP_CONFIG: AppConfig = {
  schemaVersion: APP_CONFIG_SCHEMA_VERSION,
  shortcuts: {
    [DEFAULT_SHORTCUT_ID_RECORDING_TOGGLE]: {
      enabled: true,
      accelerator: "CommandOrControl+Shift+R",
      actions: ["focusWindow", "toggleRecording"],
    },
  },
  captureOptions: DEFAULT_CAPTURE_OPTIONS_CONFIG,
};

export function normalizeAppConfig(input: unknown): AppConfig {
  return appConfigSchema.parse(input);
}

export function safeParseAppConfig(
  input: unknown,
): ReturnType<typeof appConfigSchema.safeParse> {
  return appConfigSchema.safeParse(input);
}

export function cloneDefaultAppConfig(): AppConfig {
  return JSON.parse(JSON.stringify(DEFAULT_APP_CONFIG)) as AppConfig;
}

export function isShortcutAction(value: unknown): value is ShortcutAction {
  return (
    typeof value === "string" &&
    SHORTCUT_ACTIONS.includes(value as ShortcutAction)
  );
}
