import type { App } from "electron";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { readFile, rm, rename, writeFile } from "node:fs/promises";

import {
  DEFAULT_SHORTCUTS_CONFIG,
  safeParseShortcutsConfig,
  type ShortcutsConfig,
} from "../../../shared/shortcuts";

const APP_DATA_SUBDIR = "interview-sentiment-analyzer";
const CONFIG_FILE_NAME = "config.json";

function createAppDataRoot(app: Pick<App, "getPath">): string {
  return path.join(app.getPath("appData"), APP_DATA_SUBDIR);
}

function createConfigFilePath(appDataRoot: string): string {
  return path.join(appDataRoot, CONFIG_FILE_NAME);
}

function cloneDefaultConfig(): ShortcutsConfig {
  return JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS_CONFIG)) as ShortcutsConfig;
}

async function writeAtomicJsonFile(
  targetPath: string,
  value: unknown,
): Promise<void> {
  const tmpPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  const content = JSON.stringify(value, null, 2);

  await writeFile(tmpPath, content, { encoding: "utf8" });
  await rm(targetPath, { force: true });
  await rename(tmpPath, targetPath);
}

export type ShortcutsConfigStore = {
  ensureConfigExists(): Promise<void>;
  loadConfig(): Promise<ShortcutsConfig>;
  saveConfig(config: ShortcutsConfig): Promise<void>;
  updateShortcutEnabled(args: {
    shortcutId: string;
    enabled: boolean;
  }): Promise<void>;
};

export function createShortcutsConfigStore(
  app: Pick<App, "getPath">,
): ShortcutsConfigStore {
  const appDataRoot = createAppDataRoot(app);
  const configPath = createConfigFilePath(appDataRoot);

  async function ensureConfigExists(): Promise<void> {
    await mkdir(appDataRoot, { recursive: true });

    try {
      const raw = await readFile(configPath, { encoding: "utf8" });
      const parsed = JSON.parse(raw) as unknown;
      const result = safeParseShortcutsConfig(parsed);

      if (result.success) {
        return;
      }

      const backupPath = `${configPath}.corrupt-${process.pid}-${Date.now()}`;
      try {
        await rename(configPath, backupPath);
      } catch {
        // ignore if rename fails (e.g. file missing / race)
      }

      const defaults = cloneDefaultConfig();
      await writeAtomicJsonFile(configPath, defaults);
      return;
    } catch (_error: unknown) {
      // If the file is missing or malformed, fall back to defaults.
      // (We intentionally do not block startup due to corrupted user config.)
      const backupPath = `${configPath}.corrupt-${process.pid}-${Date.now()}`;
      try {
        // Best-effort rename so users can inspect what went wrong.
        await rename(configPath, backupPath);
      } catch {
        // ignore if rename fails (e.g. file missing)
      }

      const defaults = cloneDefaultConfig();
      await writeAtomicJsonFile(configPath, defaults);
    }
  }

  async function loadConfig(): Promise<ShortcutsConfig> {
    await ensureConfigExists();
    const raw = await readFile(configPath, { encoding: "utf8" });
    const parsed = JSON.parse(raw) as unknown;
    const result = safeParseShortcutsConfig(parsed);

    if (result.success) {
      return result.data;
    }

    // If the config changed between ensureConfigExists() and readFile(),
    // reset to defaults instead of throwing and blocking startup.
    const defaults = cloneDefaultConfig();
    await writeAtomicJsonFile(configPath, defaults);
    return defaults;
  }

  async function saveConfig(config: ShortcutsConfig): Promise<void> {
    await ensureConfigExists();
    await writeAtomicJsonFile(configPath, config);
  }

  async function updateShortcutEnabled(args: {
    shortcutId: string;
    enabled: boolean;
  }): Promise<void> {
    const current = await loadConfig();
    const existingEntry = current.shortcuts[args.shortcutId];

    if (!existingEntry) {
      throw new Error(`Unknown shortcutId '${args.shortcutId}'`);
    }

    const updated: ShortcutsConfig = {
      ...current,
      shortcuts: {
        ...current.shortcuts,
        [args.shortcutId]: {
          ...existingEntry,
          enabled: args.enabled,
        },
      },
    };

    await saveConfig(updated);
  }

  return {
    ensureConfigExists,
    loadConfig,
    saveConfig,
    updateShortcutEnabled,
  };
}

