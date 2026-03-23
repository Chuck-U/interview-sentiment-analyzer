import path from "node:path";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";

import type { App } from "electron";

import {
  cloneDefaultAppConfig,
  safeParseAppConfig,
  type AppConfig,
} from "../../../shared/app-config";
import type { CaptureOptionsConfig } from "../../../shared/capture-options";
import {
  SHORTCUTS_CONFIG_SCHEMA_VERSION,
  type SetShortcutEnabledRequest,
  type ShortcutsConfig,
  safeParseShortcutsConfig,
} from "../../../shared/shortcuts";

const APP_DATA_SUBDIR = "interview-sentiment-analyzer";
const CONFIG_FILE_NAME = "config.json";

function createAppDataRoot(app: Pick<App, "getPath">): string {
  return path.join(app.getPath("appData"), APP_DATA_SUBDIR);
}

function createConfigFilePath(appDataRoot: string): string {
  return path.join(appDataRoot, CONFIG_FILE_NAME);
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

function toShortcutsConfig(config: AppConfig): ShortcutsConfig {
  return {
    schemaVersion: SHORTCUTS_CONFIG_SCHEMA_VERSION,
    shortcuts: config.shortcuts,
  };
}

function tryMigrateLegacyConfig(input: unknown): AppConfig | null {
  const legacyResult = safeParseShortcutsConfig(input);
  if (!legacyResult.success) {
    return null;
  }

  const defaults = cloneDefaultAppConfig();
  return {
    ...defaults,
    shortcuts: legacyResult.data.shortcuts,
  };
}

export type AppConfigStore = {
  ensureConfigExists(): Promise<void>;
  loadConfig(): Promise<AppConfig>;
  saveConfig(config: AppConfig): Promise<void>;
  loadShortcutsConfig(): Promise<ShortcutsConfig>;
  loadCaptureOptionsConfig(): Promise<CaptureOptionsConfig>;
  loadAiProviderConfig(): Promise<AppConfig["aiProvider"]>;
  updateShortcutEnabled(args: SetShortcutEnabledRequest): Promise<void>;
  saveCaptureOptionsConfig(config: CaptureOptionsConfig): Promise<CaptureOptionsConfig>;
  saveAiProviderConfig(config: AppConfig["aiProvider"]): Promise<AppConfig["aiProvider"]>;
};

export function createAppConfigStore(
  app: Pick<App, "getPath">,
): AppConfigStore {
  const appDataRoot = createAppDataRoot(app);
  const configPath = createConfigFilePath(appDataRoot);

  async function ensureConfigExists(): Promise<void> {
    await mkdir(appDataRoot, { recursive: true });

    try {
      const raw = await readFile(configPath, { encoding: "utf8" });
      const parsed = JSON.parse(raw) as unknown;
      const result = safeParseAppConfig(parsed);

      if (result.success) {
        return;
      }

      const migrated = tryMigrateLegacyConfig(parsed);
      if (migrated) {
        await writeAtomicJsonFile(configPath, migrated);
        return;
      }

      const backupPath = `${configPath}.corrupt-${process.pid}-${Date.now()}`;
      try {
        await rename(configPath, backupPath);
      } catch {
        // ignore if rename fails
      }

      await writeAtomicJsonFile(configPath, cloneDefaultAppConfig());
      return;
    } catch {
      const backupPath = `${configPath}.corrupt-${process.pid}-${Date.now()}`;
      try {
        await rename(configPath, backupPath);
      } catch {
        // ignore if rename fails
      }

      await writeAtomicJsonFile(configPath, cloneDefaultAppConfig());
    }
  }

  async function loadConfig(): Promise<AppConfig> {
    await ensureConfigExists();
    const raw = await readFile(configPath, { encoding: "utf8" });
    const parsed = JSON.parse(raw) as unknown;
    const result = safeParseAppConfig(parsed);

    if (result.success) {
      return result.data;
    }

    const migrated = tryMigrateLegacyConfig(parsed);
    if (migrated) {
      await writeAtomicJsonFile(configPath, migrated);
      return migrated;
    }

    const defaults = cloneDefaultAppConfig();
    await writeAtomicJsonFile(configPath, defaults);
    return defaults;
  }

  async function saveConfig(config: AppConfig): Promise<void> {
    await ensureConfigExists();
    await writeAtomicJsonFile(configPath, config);
  }

  return {
    ensureConfigExists,
    loadConfig,
    saveConfig,
    async loadShortcutsConfig() {
      return toShortcutsConfig(await loadConfig());
    },
    async loadCaptureOptionsConfig() {
      const config = await loadConfig();
      return config.captureOptions;
    },
    async loadAiProviderConfig() {
      const config = await loadConfig();
      return config.aiProvider;
    },
    async updateShortcutEnabled(args) {
      const current = await loadConfig();
      const existingEntry = current.shortcuts[args.shortcutId];

      if (!existingEntry) {
        throw new Error(`Unknown shortcutId '${args.shortcutId}'`);
      }

      const updated: AppConfig = {
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
    },
    async saveCaptureOptionsConfig(config) {
      const current = await loadConfig();
      const updated: AppConfig = {
        ...current,
        captureOptions: config,
      };

      await saveConfig(updated);
      return updated.captureOptions;
    },
    async saveAiProviderConfig(config) {
      const current = await loadConfig();
      const updated: AppConfig = {
        ...current,
        aiProvider: config,
      };

      await saveConfig(updated);
      return updated.aiProvider;
    },
  };
}
