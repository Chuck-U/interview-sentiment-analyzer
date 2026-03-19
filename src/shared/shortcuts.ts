import { z } from "zod";

import {
  MEDIA_CHUNK_SOURCES,
  type MediaChunkSource,
  type SessionSnapshot,
} from "./session-lifecycle";

export const SHORTCUTS_CONFIG_SCHEMA_VERSION = 1 as const;

export const SHORTCUT_ACTIONS = [
  "toggleRecording",
  "focusWindow",
] as const;

export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];

export type ShortcutConfigEntry = {
  readonly enabled: boolean;
  readonly accelerator: string;
  readonly actions: readonly ShortcutAction[];
};

export type ShortcutsConfig = {
  readonly schemaVersion: typeof SHORTCUTS_CONFIG_SCHEMA_VERSION;
  readonly shortcuts: Record<string, ShortcutConfigEntry>;
};

export type SetShortcutEnabledRequest = {
  readonly shortcutId: string;
  readonly enabled: boolean;
};

export const DEFAULT_RECORDING_CAPTURE_SOURCES: readonly MediaChunkSource[] = [
  "microphone",
  "screen-video",
  "screenshot",
];

export const DEFAULT_SHORTCUT_ID_RECORDING_TOGGLE = "recording-toggle";

export const DEFAULT_SHORTCUTS_CONFIG: ShortcutsConfig = {
  schemaVersion: SHORTCUTS_CONFIG_SCHEMA_VERSION,
  shortcuts: {
    [DEFAULT_SHORTCUT_ID_RECORDING_TOGGLE]: {
      enabled: true,
      accelerator: "CommandOrControl+Shift+R",
      actions: ["focusWindow", "toggleRecording"],
    },
  },
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

export const shortcutsConfigSchema = z.object({
  schemaVersion: z.literal(SHORTCUTS_CONFIG_SCHEMA_VERSION),
  shortcuts: z.record(z.string(), shortcutConfigEntrySchema),
});

export function normalizeShortcutsConfig(
  input: unknown,
): ShortcutsConfig {
  return shortcutsConfigSchema.parse(input);
}

export function safeParseShortcutsConfig(
  input: unknown,
): ReturnType<typeof shortcutsConfigSchema.safeParse> {
  return shortcutsConfigSchema.safeParse(input);
}

const setShortcutEnabledRequestSchema = z.object({
  shortcutId: z.string().trim().min(1, "shortcutId must be non-empty"),
  enabled: z.boolean(),
});

export function normalizeSetShortcutEnabledRequest(
  input: unknown,
): SetShortcutEnabledRequest {
  const result = setShortcutEnabledRequestSchema.safeParse(input);
  if (!result.success) {
    throw result.error;
  }

  return result.data;
}

function assertCaptureSourcesAreKnown(
  sources: readonly MediaChunkSource[],
): void {
  if (!sources.every((s) => MEDIA_CHUNK_SOURCES.includes(s))) {
    throw new Error("DEFAULT_RECORDING_CAPTURE_SOURCES contains an unknown source");
  }
}

assertCaptureSourcesAreKnown(DEFAULT_RECORDING_CAPTURE_SOURCES);

export function formatElectronAcceleratorLabel(
  accelerator: string,
  platform: NodeJS.Platform,
): string {
  const trimmed = accelerator.trim();

  if (trimmed.includes("CommandOrControl")) {
    const commandOrControl = platform === "darwin" ? "Cmd" : "Ctrl";
    return trimmed.replaceAll("CommandOrControl", commandOrControl);
  }

  return trimmed;
}

export const SHORTCUTS_IPC_CHANNELS = {
  ensureConfig: "shortcuts:ensure-config",
  getConfig: "shortcuts:get-config",
  setShortcutEnabled: "shortcuts:set-shortcut-enabled",
} as const;

export type ShortcutsBridge = {
  ensureConfig(): Promise<void>;
  getConfig(): Promise<ShortcutsConfig>;
  setShortcutEnabled(request: SetShortcutEnabledRequest): Promise<void>;
};

// For main-process action handlers.
export type ShortcutActionContext = {
  readonly currentSession: SessionSnapshot | null;
};

