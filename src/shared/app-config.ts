import { z } from "zod";

import {
  DEFAULT_CAPTURE_OPTIONS_CONFIG,
  captureOptionsConfigSchema,
  type CaptureOptionsConfig,
} from "./capture-options";
import {
  DEFAULT_AI_PROVIDER_CONFIG,
  aiProviderConfigSchema,
  type AiProviderConfig,
} from "./ai-provider";
import {
  DEFAULT_SHORTCUT_ID_PING_WINDOWS,
  DEFAULT_SHORTCUT_ID_RECORDING_TOGGLE,
  SHORTCUT_ACTIONS,
  type ShortcutAction,
  type ShortcutConfigEntry,
} from "./shortcuts";
import {
  DEFAULT_WINDOW_PREFERENCES_CONFIG,
  windowPreferencesConfigSchema,
  type WindowPreferencesConfig,
} from "./window-preferences";

export const APP_CONFIG_SCHEMA_VERSION = 1 as const;

export type AppConfig = {
  readonly schemaVersion: typeof APP_CONFIG_SCHEMA_VERSION;
  readonly shortcuts: Record<string, ShortcutConfigEntry>;
  readonly captureOptions: CaptureOptionsConfig;
  readonly aiProvider: AiProviderConfig;
  readonly windowPreferences: WindowPreferencesConfig;
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
  aiProvider: aiProviderConfigSchema.default(DEFAULT_AI_PROVIDER_CONFIG),
  windowPreferences: windowPreferencesConfigSchema,
});

export const DEFAULT_APP_CONFIG: AppConfig = {
  schemaVersion: APP_CONFIG_SCHEMA_VERSION,
  shortcuts: {
    [DEFAULT_SHORTCUT_ID_RECORDING_TOGGLE]: {
      enabled: true,
      accelerator: "CommandOrControl+Shift+R",
      actions: ["focusWindow", "toggleRecording"],
    },
    [DEFAULT_SHORTCUT_ID_PING_WINDOWS]: {
      enabled: true,
      accelerator: "CommandOrControl+Shift+Y",
      actions: ["pingAllWindows"],
    },
  },
  captureOptions: DEFAULT_CAPTURE_OPTIONS_CONFIG,
  aiProvider: DEFAULT_AI_PROVIDER_CONFIG,
  windowPreferences: DEFAULT_WINDOW_PREFERENCES_CONFIG,
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
