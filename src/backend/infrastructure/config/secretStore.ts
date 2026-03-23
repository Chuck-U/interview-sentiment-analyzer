import path from "node:path";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { logger } from "../../../lib/logger";
import { safeStorage, type App } from "electron";
import { z } from "zod";

const APP_DATA_SUBDIR = "interview-sentiment-analyzer";
const SECRETS_FILE_NAME = "secrets.json";

const SECRET_STORE_PROVIDERS = ["openai", "anthropic", "google"] as const;
export const secretStoreProviderSchema = z.enum(SECRET_STORE_PROVIDERS);
const secretsFileSchema = z.object({
  openai: z.string().optional(),
  anthropic: z.string().optional(),
  google: z.string().optional(),
});

export type SecretStoreProvider = z.infer<typeof secretStoreProviderSchema>;

type SecretsFile = z.infer<typeof secretsFileSchema>;
export type SecretStore = {
  ensureSecretsFileExists(): Promise<void>;
  getApiKey(provider: SecretStoreProvider): Promise<string | null>;
  setApiKey(provider: SecretStoreProvider, apiKey: string): Promise<boolean>;
  deleteApiKey(provider: SecretStoreProvider): Promise<void>;
};

function createAppDataRoot(app: Pick<App, "getPath">): string {
  return path.join(app.getPath("appData"), APP_DATA_SUBDIR);
}

function createSecretsFilePath(appDataRoot: string): string {
  return path.join(appDataRoot, SECRETS_FILE_NAME);
}

function createEmptySecretsFile(): SecretsFile {
  return {};
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

function safeParseSecretsFile(input: unknown): SecretsFile | null {
  const result = secretsFileSchema.safeParse(input);
  return result.success ? result.data : null;
}

export function createSecretStore(app: Pick<App, "getPath">): SecretStore {
  const appDataRoot = createAppDataRoot(app);
  const secretsPath = createSecretsFilePath(appDataRoot);
  let hasWarnedAboutUnavailableEncryption = false;

  function warnEncryptionUnavailable(): void {
    if (hasWarnedAboutUnavailableEncryption) {
      return;
    }

    hasWarnedAboutUnavailableEncryption = true;
    console.warn(
      "[secretStore] electron safeStorage is unavailable; API keys cannot be persisted.",
    );
  }

  async function ensureSecretsFileExists(): Promise<void> {
    await mkdir(appDataRoot, { recursive: true });

    try {
      const raw = await readFile(secretsPath, { encoding: "utf8" });
      const parsed = JSON.parse(raw) as unknown;

      if (safeParseSecretsFile(parsed)) {
        return;
      }

      const backupPath = `${secretsPath}.corrupt-${process.pid}-${Date.now()}`;
      try {
        await rename(secretsPath, backupPath);
      } catch {
        throw new Error(`Failed to rename secrets file to backup path: ${backupPath}`);
      }

      await writeAtomicJsonFile(secretsPath, createEmptySecretsFile());
      return;
    } catch {
      const backupPath = `${secretsPath}.corrupt-${process.pid}-${Date.now()}`;
      try {
        await rename(secretsPath, backupPath);
      } catch {
        logger.ger({
          type: "warn",
          source: __filename,
          message: `Failed to rename secrets file to backup path: ${backupPath}`,
        });
      }

      await writeAtomicJsonFile(secretsPath, createEmptySecretsFile());
    }
  }

  async function loadSecretsFile(): Promise<SecretsFile> {
    await ensureSecretsFileExists();
    const raw = await readFile(secretsPath, { encoding: "utf8" });
    const parsed = JSON.parse(raw) as unknown;
    const secrets = safeParseSecretsFile(parsed);

    if (secrets) {
      return secrets;
    }

    const emptySecrets = createEmptySecretsFile();
    await writeAtomicJsonFile(secretsPath, emptySecrets);
    return emptySecrets;
  }

  async function saveSecretsFile(secrets: SecretsFile): Promise<void> {
    await ensureSecretsFileExists();
    await writeAtomicJsonFile(secretsPath, secrets);
  }

  return {
    ensureSecretsFileExists,
    async getApiKey(provider) {
      if (!safeStorage.isEncryptionAvailable()) {
        warnEncryptionUnavailable();
        return null;
      }

      const encodedSecret = (await loadSecretsFile())[provider];
      if (!encodedSecret) {
        return null;
      }

      try {
        return safeStorage.decryptString(Buffer.from(encodedSecret, "base64"));
      } catch (error) {
        logger.ger({
          type: "warn",
          source: __filename,
          message: `Failed to decrypt API key for '${provider}'.`,
          data: error,
        });
        return null;
      }
    },
    async setApiKey(provider, apiKey) {
      if (!safeStorage.isEncryptionAvailable()) {
        warnEncryptionUnavailable();
        return false;
      }

      const currentSecrets = await loadSecretsFile();
      const encryptedApiKey = safeStorage.encryptString(apiKey);

      await saveSecretsFile({
        ...currentSecrets,
        [provider]: encryptedApiKey.toString("base64"),
      });

      return true;
    },
    async deleteApiKey(provider) {
      const currentSecrets = await loadSecretsFile();

      if (!currentSecrets[provider]) {
        return;
      }

      const { [provider]: _removedSecret, ...remainingSecrets } = currentSecrets;
      await saveSecretsFile(remainingSecrets);
    },
  };
}
