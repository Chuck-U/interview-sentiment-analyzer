import { useCallback, useMemo } from "react";
import type { CSSProperties } from "react";

import { AgentNavigationMenu } from "@/components/ui/navigation-menu";
import type { WindowSizePreset } from "@/shared/window-controls";
import { Options } from "./Slot/Options";
import type { SessionSnapshot } from "@/shared/session-lifecycle";
import {
  DEFAULT_SHORTCUT_ID_RECORDING_TOGGLE,
  formatElectronAcceleratorLabel,
} from "@/shared/shortcuts";
import { useCaptureOptions } from "./capture-options/useCaptureOptions";
import { WindowResizeControl } from "./window-controls/window-resize-control";
import { useRecordingSession } from "./hooks/useRecordingSession";
import { useShortcutsWindowEffects } from "./hooks/useShortcutsWindowEffects";
import { useViews } from "./hooks/useViews";
import { useAppDispatch, useAppSelector } from "./store/hooks";
import { setFeedbackMessage } from "./store/slices/sessionRecordingSlice";
import {
  setShortcutEnabled,
} from "./store/slices/shortcutsWindowSlice";

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

function Main() {
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

  const { activeView, handleSetActiveView, resizePresetOptions } = useViews();

  const handleCaptureOptionsError = useCallback(
    (message: string) => {
      dispatch(setFeedbackMessage(message));
    },
    [dispatch],
  );

  const captureOptions = useCaptureOptions({
    isMenuActive: activeView === "options",
    onError: handleCaptureOptionsError,
  });

  const shortcutLabel = useMemo(
    () =>
      formatElectronAcceleratorLabel(
        recordingShortcutAccelerator,
        platformLabel,
      ),
    [platformLabel, recordingShortcutAccelerator],
  );

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
            { id: "start-recording", label: "Start Recording" },
            { id: "resize-window", label: "Resize Window" },
            { id: "toggle-visibility", label: "Toggle Visibility" },
            { id: "close", label: "Close App" },
          ]}
          value={activeView}
          onValueChange={(value) => {
            if (value === "controls" || value === "options") {
              handleSetActiveView(value);
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
        className="mt-4 flex flex-1 min-h-0 overflow-hidden bg-transparent px-10 pb-6 size-full"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      >
        <Options
          view={activeView}
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

export default Main;
