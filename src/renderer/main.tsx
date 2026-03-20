import { useCallback, useMemo } from "react";
import type { CSSProperties } from "react";

import { AgentNavigationMenu } from "@/components/ui/navigation-menu";
import type { WindowSizePreset } from "@/shared/window-controls";
import { WINDOW_ROLES } from "@/shared/window-registry";
import { Options } from "./Slot/Options";
import type { OptionsCardLayout } from "./Slot/Options";
import type { SessionSnapshot } from "@/shared/session-lifecycle";
import {
  DEFAULT_SHORTCUT_ID_RECORDING_TOGGLE,
  formatElectronAcceleratorLabel,
} from "@/shared/shortcuts";
import { useCaptureOptions } from "./capture-options/useCaptureOptions";
import { WindowResizeControl } from "./window-controls/window-resize-control";
import { useRecordingSession } from "./hooks/useRecordingSession";
import { useShortcutsWindowEffects } from "./hooks/useShortcutsWindowEffects";
import { useViews, VIEW_OPTIONS } from "./hooks/useViews";
import { useWindowRegistrySync } from "./hooks/useWindowRegistrySync";
import { parseWindowRoleFromLocation } from "./parseWindowRole";
import { useAppDispatch, useAppSelector } from "./store/hooks";
import { setFeedbackMessage } from "./store/slices/sessionRecordingSlice";
import { setShortcutEnabled } from "./store/slices/shortcutsWindowSlice";
import { RESIZE_PRESET_OPTIONS } from "./store/slices/viewsSlice";

function getStatusCopy(session: SessionSnapshot | null): {
  readonly label: string;
  readonly variant: "default" | "secondary" | "outline";
} {
  if (!session) {
    return {
      label: "Idle",
      variant: "outline",
    };
  }

  if (session.status === "active") {
    return {
      label: "Recording",
      variant: "default",
    };
  }

  if (session.status === "finalizing") {
    return {
      label: "Stopping",
      variant: "secondary",
    };
  }

  return {
    label: "Ready",
    variant: "outline",
  };
}

function LauncherMain() {
  const dispatch = useAppDispatch();
  useShortcutsWindowEffects();
  useWindowRegistrySync();
  const {
    handleToggleRecording,
    handleExportRecording: _handleExportRecording,
    handleCloseApplication,
  } = useRecordingSession();

  const platformLabel = useMemo(() => window.electronApp.platform, []);
  const currentSession = useAppSelector(
    (state) => state.sessionRecording.currentSession,
  );
  const feedbackMessage = useAppSelector(
    (state) => state.sessionRecording.feedbackMessage,
  );
  const isStarting = useAppSelector(
    (state) => state.sessionRecording.isStarting,
  );
  const isStopping = useAppSelector(
    (state) => state.sessionRecording.isStopping,
  );
  const recordingState = useAppSelector(
    (state) => state.sessionRecording.recordingState,
  );
  const recordingShortcutAccelerator = useAppSelector(
    (state) => state.shortcutsWindow.recordingShortcutAccelerator,
  );
  const isShortcutEnabled = useAppSelector(
    (state) => state.shortcutsWindow.isShortcutEnabled,
  );
  const windowBounds = useAppSelector(
    (state) => state.shortcutsWindow.windowBounds,
  );

  const { activeView, handleSetActiveView, resizePresetOptions } = useViews();

  const handleResizePreset = useCallback(
    async (preset: WindowSizePreset) => {
      return window.electronApp.windowControls.setWindowSizePreset({
        preset,
      });
    },
    [],
  );

  const handleSetShortcutEnabled = useCallback(
    (enabled: boolean) => {
      const previous = isShortcutEnabled;
      dispatch(setShortcutEnabled(enabled));

      void window.electronApp.shortcuts
        .setShortcutEnabled({
          shortcutId: DEFAULT_SHORTCUT_ID_RECORDING_TOGGLE,
          enabled,
        })
        .catch((error: unknown) => {
          dispatch(setShortcutEnabled(previous));
          dispatch(
            setFeedbackMessage(
              error instanceof Error
                ? error.message
                : "Unable to update shortcut.",
            ),
          );
        });
    },
    [dispatch, isShortcutEnabled],
  );

  const isRecording = currentSession?.status === "active";
  const statusCopy = getStatusCopy(currentSession);
  const isBusy = isStarting || isStopping;
  const windowSizeLabel = windowBounds
    ? `${windowBounds.width} x ${windowBounds.height}`
    : "Syncing window";

  const windowBoundsLabel = windowBounds
    ? `Position ${windowBounds.x}, ${windowBounds.y}`
    : undefined;

  const shortcutLabel = useMemo(
    () =>
      formatElectronAcceleratorLabel(
        recordingShortcutAccelerator,
        platformLabel,
      ),
    [platformLabel, recordingShortcutAccelerator],
  );

  return (
    <div className="size-full bg-transparent">
      <nav
        className="sticky top-0 z-[70] flex w-full shrink-0 flex-col gap-3 bg-background/15"
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
      >
        <AgentNavigationMenu
          items={[
            { id: "controls", label: "Controls", group: "menuGroup" },
            { id: "options", label: "Options", group: "menuGroup" },
            { id: "sandbox", label: "Sandbox", group: "menuGroup" },
            { id: "start-recording", label: "Start Recording" },
            { id: "resize-window", label: "Resize Window" },
            { id: "toggle-visibility", label: "Toggle Visibility" },
            { id: "close", label: "Close App" },
          ]}
          value={activeView}
          onValueChange={(value) => {
            if (
              value === VIEW_OPTIONS.controls ||
              value === VIEW_OPTIONS.options ||
              value === VIEW_OPTIONS.sandbox
            ) {
              handleSetActiveView(value);
              void window.electronApp.windowRegistry.openWindow(value);
            }
          }}
          isRecording={isRecording}
          isBusy={isBusy}
          onRecordingToggle={(start) => {
            void handleToggleRecording(start);
          }}
          onToggleVisibility={() => {
            void window.electronApp.appControls.toggleVisibility();
          }}
          resizeControl={(
            <WindowResizeControl
              windowBounds={windowBounds}
              presetOptions={resizePresetOptions}
              onSelectPreset={handleResizePreset}
            />
          )}
          onClose={() => {
            void handleCloseApplication();
          }}
        />
      </nav>
      <main
        className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent px-10 pb-6"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-md border border-border/40 bg-background/20 p-4">
          <p className="text-sm text-muted-foreground">
            Open Controls, Options, or Sandbox from the menu. Each panel runs in
            its own window so you can resize and position them independently.
          </p>
          <div className="rounded-md border border-border/50 bg-background/35 p-3 text-sm">
            <p className="font-medium">Session</p>
            <p className="mt-1 text-muted-foreground">{feedbackMessage}</p>
            {recordingState && recordingState.sources.length > 0 ? (
              <p className="mt-2 text-muted-foreground">
                {recordingState.totalChunkCount} chunks captured
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <p className="text-xs text-muted-foreground">
              Shortcut: {shortcutLabel} —{" "}
              <button
                type="button"
                className="underline"
                style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
                onClick={() => {
                  void handleSetShortcutEnabled(!isShortcutEnabled);
                }}
              >
                {isShortcutEnabled ? "enabled" : "disabled"}
              </button>
            </p>
            <span className="text-xs text-muted-foreground">
              Status: {statusCopy.label} ({windowSizeLabel}
              {windowBoundsLabel ? `, ${windowBoundsLabel}` : ""})
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}

function CardWindowMain({ layout }: { readonly layout: OptionsCardLayout }) {
  const dispatch = useAppDispatch();
  useShortcutsWindowEffects();
  const {
    handleToggleRecording,
    handleExportRecording,
    handleCloseApplication,
  } = useRecordingSession();

  const platformLabel = useMemo(() => window.electronApp.platform, []);
  const currentSession = useAppSelector(
    (state) => state.sessionRecording.currentSession,
  );
  const feedbackMessage = useAppSelector(
    (state) => state.sessionRecording.feedbackMessage,
  );
  const isStarting = useAppSelector(
    (state) => state.sessionRecording.isStarting,
  );
  const isStopping = useAppSelector(
    (state) => state.sessionRecording.isStopping,
  );
  const recordingState = useAppSelector(
    (state) => state.sessionRecording.recordingState,
  );
  const recordingShortcutAccelerator = useAppSelector(
    (state) => state.shortcutsWindow.recordingShortcutAccelerator,
  );
  const isShortcutEnabled = useAppSelector(
    (state) => state.shortcutsWindow.isShortcutEnabled,
  );
  const windowBounds = useAppSelector(
    (state) => state.shortcutsWindow.windowBounds,
  );

  const handleCaptureOptionsError = useCallback(
    (message: string) => {
      dispatch(setFeedbackMessage(message));
    },
    [dispatch],
  );

  const captureOptions = useCaptureOptions({
    isMenuActive: layout === "options",
    onError: handleCaptureOptionsError,
  });

  const handleResizePreset = useCallback(
    async (preset: WindowSizePreset) => {
      return window.electronApp.windowControls.setWindowSizePreset({
        preset,
      });
    },
    [],
  );

  const handleSetShortcutEnabled = useCallback(
    (enabled: boolean) => {
      const previous = isShortcutEnabled;
      dispatch(setShortcutEnabled(enabled));

      void window.electronApp.shortcuts
        .setShortcutEnabled({
          shortcutId: DEFAULT_SHORTCUT_ID_RECORDING_TOGGLE,
          enabled,
        })
        .catch((error: unknown) => {
          dispatch(setShortcutEnabled(previous));
          dispatch(
            setFeedbackMessage(
              error instanceof Error
                ? error.message
                : "Unable to update shortcut.",
            ),
          );
        });
    },
    [dispatch, isShortcutEnabled],
  );

  const isRecording = currentSession?.status === "active";
  const statusCopy = getStatusCopy(currentSession);
  const isBusy = isStarting || isStopping;
  const windowSizeLabel = windowBounds
    ? `${windowBounds.width} x ${windowBounds.height}`
    : "Syncing window";

  const windowBoundsLabel = windowBounds
    ? `Position ${windowBounds.x}, ${windowBounds.y}`
    : undefined;

  const shortcutLabel = useMemo(
    () =>
      formatElectronAcceleratorLabel(
        recordingShortcutAccelerator,
        platformLabel,
      ),
    [platformLabel, recordingShortcutAccelerator],
  );

  return (
    <div className="size-full bg-transparent">
      <nav
        className="sticky top-0 z-[70] flex w-full shrink-0 flex-col gap-2 bg-background/15 px-2 pt-2"
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
      >
        <div
          className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          <span className="capitalize">{layout} window</span>
          <button
            type="button"
            className="rounded border border-border/60 px-2 py-1 hover:bg-muted/50"
            onClick={() => {
              void window.electronApp.windowRegistry.closeWindow(layout);
            }}
          >
            Close window
          </button>
        </div>
        <AgentNavigationMenu
          items={[
            { id: "controls", label: "Controls", group: "menuGroup" },
            { id: "options", label: "Options", group: "menuGroup" },
            { id: "sandbox", label: "Sandbox", group: "menuGroup" },
            { id: "start-recording", label: "Start Recording" },
            { id: "resize-window", label: "Resize Window" },
            { id: "toggle-visibility", label: "Toggle Visibility" },
            { id: "close", label: "Close App" },
          ]}
          value={layout}
          onValueChange={(value) => {
            if (
              value === VIEW_OPTIONS.controls ||
              value === VIEW_OPTIONS.options ||
              value === VIEW_OPTIONS.sandbox
            ) {
              void window.electronApp.windowRegistry.openWindow(value);
              void window.electronApp.windowRegistry.focusWindow(value);
            }
          }}
          isRecording={isRecording}
          isBusy={isBusy}
          onRecordingToggle={(start) => {
            void handleToggleRecording(start);
          }}
          onToggleVisibility={() => {
            void window.electronApp.appControls.toggleVisibility();
          }}
          resizeControl={(
            <WindowResizeControl
              windowBounds={windowBounds}
              presetOptions={RESIZE_PRESET_OPTIONS}
              onSelectPreset={handleResizePreset}
            />
          )}
          onClose={() => {
            void handleCloseApplication();
          }}
        />
      </nav>
      <main
        className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent px-4 pb-4 pt-2"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      >
        <Options
          layout={layout}
          statusLabel={statusCopy.label}
          statusVariant={statusCopy.variant}
          platformLabel={platformLabel}
          windowSizeLabel={windowSizeLabel}
          windowBoundsLabel={windowBoundsLabel}
          currentSessionId={currentSession?.id.slice(0, 8)}
          feedbackMessage={feedbackMessage}
          isRecording={isRecording}
          isBusy={isBusy}
          onToggleRecording={(enabled) => {
            void handleToggleRecording(enabled);
          }}
          shortcutLabel={shortcutLabel}
          isShortcutEnabled={isShortcutEnabled}
          onSetShortcutEnabled={handleSetShortcutEnabled}
          recordingState={recordingState}
          onExportRecording={() => {
            void handleExportRecording();
          }}
          permissions={captureOptions.permissions}
          microphoneDevices={captureOptions.microphoneDevices}
          webcamDevices={captureOptions.webcamDevices}
          displays={captureOptions.displays}
          microphoneEnabled={captureOptions.config.microphone.enabled}
          webcamEnabled={captureOptions.config.webcam.enabled}
          screenEnabled={captureOptions.config.screen.enabled}
          systemAudioEnabled={captureOptions.config.systemAudio.enabled}
          screenshotEnabled={captureOptions.config.screenshot.enabled}
          microphoneLevel={captureOptions.microphoneLevel}
          isWebcamPreviewVisible={captureOptions.isWebcamPreviewVisible}
          webcamPreviewStream={captureOptions.webcamPreviewStream}
          isDesktopPreviewVisible={captureOptions.isDesktopPreviewVisible}
          desktopPreviewStream={captureOptions.desktopPreviewStream}
          hasCaptureSourceEnabled={captureOptions.hasCaptureSourceEnabled}
          onSetMicrophoneEnabled={captureOptions.setMicrophoneEnabled}
          onSetWebcamEnabled={captureOptions.setWebcamEnabled}
          onSetScreenEnabled={captureOptions.setScreenEnabled}
          onSetSystemAudioEnabled={captureOptions.setSystemAudioEnabled}
          onSetScreenshotEnabled={captureOptions.setScreenshotEnabled}
          onSetMicrophoneDeviceId={captureOptions.setMicrophoneDeviceId}
          onSetWebcamDeviceId={captureOptions.setWebcamDeviceId}
          onSetDisplayId={captureOptions.setDisplayId}
          onSetWebcamPreviewVisible={captureOptions.setWebcamPreviewVisible}
          onSetDesktopPreviewVisible={captureOptions.setDesktopPreviewVisible}
          onOpenMonitorPicker={() => {
            void captureOptions.openMonitorPicker();
          }}
          onQuit={() => {
            void handleCloseApplication();
          }}
        />
      </main>
    </div>
  );
}

function Main() {
  const role = parseWindowRoleFromLocation();

  if (role === WINDOW_ROLES.launcher) {
    return <LauncherMain />;
  }

  const layout: OptionsCardLayout =
    role === WINDOW_ROLES.controls
      ? "controls"
      : role === WINDOW_ROLES.options
        ? "options"
        : "sandbox";

  return <CardWindowMain layout={layout} />;
}

export default Main;
