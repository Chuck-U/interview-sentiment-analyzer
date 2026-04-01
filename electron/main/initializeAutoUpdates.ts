import { app } from "electron";
import { autoUpdater } from "electron-updater";
import { log } from "@/lib/logger";

export function initializeAutoUpdates(): void {
    if (!app.isPackaged) {
        return;
    }

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on("checking-for-update", () => {
        log.ger({ type: "info", message: "[autoUpdater] checking-for-update" });
    });

    autoUpdater.on("update-available", (info) => {
        log.ger({
            type: "info",
            message: `[autoUpdater] update-available ${info.version}`,
        });
    });

    autoUpdater.on("update-not-available", () => {});

    autoUpdater.on("error", (error) => {
        log.ger({
            type: "warn",
            message: `[autoUpdater] ${error.message}`,
        });
    });

    autoUpdater.on("update-downloaded", (info) => {
        log.ger({
            type: "info",
            message: `[autoUpdater] update-downloaded ${info.version}`,
        });
    });

    void autoUpdater.checkForUpdatesAndNotify().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        log.ger({
            type: "warn",
            message: `[autoUpdater] check failed: ${message}`,
        });
    });
}
