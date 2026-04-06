import { globalShortcut, type BrowserWindow } from "electron";

import type { SessionLifecycleController } from "../../interfaces/controllers/session-lifecycle-controller";
import {
  type ShortcutAction,
  type ShortcutActionContext,
  SHORTCUT_ACTIONS,
  type ShortcutsConfig,
} from "../../../shared/shortcuts";
import type { MediaChunkSource } from "../../../shared/session-lifecycle";

function isShortcutAction(value: unknown): value is ShortcutAction {
  return typeof value === "string" && SHORTCUT_ACTIONS.includes(value as ShortcutAction);
}

async function focusWindow(args: {
  readonly mainWindow: BrowserWindow;
}): Promise<void> {
  // Use show() + focus() so the overlay comes to front even if it was minimized/behind.
  args.mainWindow.show();
  args.mainWindow.focus();
  args.mainWindow.moveTop();
}

async function toggleRecording(args: {
  readonly controller: SessionLifecycleController;
  readonly currentSession: ShortcutActionContext["currentSession"];
  readonly getCaptureSources: () => Promise<readonly MediaChunkSource[]>;
}): Promise<void> {
  const { currentSession } = args;
  const captureSources = await args.getCaptureSources();

  if (!currentSession) {
    await args.controller.startSession({
      captureSources,
    });
    return;
  }

  if (currentSession.status === "active") {
    await args.controller.finalizeSession({
      sessionId: currentSession.id,
    });
    return;
  }

  if (currentSession.status === "finalizing") {
    // Avoid starting a new session while finalization is in progress.
    return;
  }

  await args.controller.startSession({
    captureSources,
  });
}

async function executeShortcutActionSequentially(args: {
  readonly actions: readonly ShortcutAction[];
  readonly executeAction: (action: ShortcutAction) => Promise<void>;
}): Promise<void> {
  for (const action of args.actions) {
    await args.executeAction(action);
  }
}

export type RegisterConfiguredGlobalShortcutsArgs = {
  readonly config: ShortcutsConfig;
  readonly mainWindow: BrowserWindow;
  readonly controller: SessionLifecycleController;
  readonly getCurrentSession: () => ShortcutActionContext["currentSession"];
  readonly getCaptureSources: () => Promise<readonly MediaChunkSource[]>;
  readonly onActionError?: (error: unknown) => void;
  readonly toggleVisibility?: () => void;
  readonly onPingAllWindows?: () => void;
};

export async function registerConfiguredGlobalShortcuts(
  args: RegisterConfiguredGlobalShortcutsArgs,
): Promise<void> {
  const {
    config,
    mainWindow,
    controller,
    getCurrentSession,
    getCaptureSources,
    onActionError,
    toggleVisibility,
    onPingAllWindows,
  } =
    args;

  // Re-register cleanly on startup/config changes so we don't accumulate handlers.
  globalShortcut.unregisterAll();

  if (toggleVisibility) {
    const ok = globalShortcut.register("CommandOrControl+Shift+V", () => {
      console.log("CommandOrControl+Shift+V pressed");
      toggleVisibility();
    });
    if (!ok) {
      console.warn(`[global shortcut 'toggleVisibility'] was not registered`);
    }
  }

  const entries = Object.entries(config.shortcuts);

  for (const [shortcutId, entry] of entries) {
    if (!entry.enabled) {
      continue;
    }

    const accelerator = entry.accelerator;

    const actions = entry.actions.filter(isShortcutAction);

    const ok = globalShortcut.register(accelerator, () => {
      const currentSession = getCurrentSession();
      const context: ShortcutActionContext = { currentSession };
      void (async () => {
        await executeShortcutActionSequentially({
          actions,
          executeAction: async (action) => {
            if (action === "focusWindow") {
              await focusWindow({ mainWindow });
              return;
            }

            if (action === "toggleRecording") {
              await toggleRecording({
                controller,
                currentSession: context.currentSession,
                getCaptureSources,
              });
              return;
            }

            if (action === "pingAllWindows") {
              onPingAllWindows?.();
              return;
            }

            // Defensive: should be unreachable due to zod.
            throw new Error(`Unsupported shortcut action '${action}'`);
          },
        });
      })().catch((error: unknown) => {
        onActionError?.(error);
        console.error(
          `[global shortcut ${shortcutId}] failed to execute actions`,
          error,
        );
      });
    });

    if (!ok) {
      console.warn(
        `[global shortcut '${shortcutId}'] was not registered (invalid accelerator?)`,
      );
    }
  }
}