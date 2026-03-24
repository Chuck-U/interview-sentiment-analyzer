import { useCallback, useMemo } from "react";

import { RiCloseFill } from "@remixicon/react";

import { AgentNavigationMenu } from "@/components/ui/navigation-menu";
import type { SessionSnapshot } from "@/shared/session-lifecycle";
import {
  DEFAULT_SHORTCUT_ID_RECORDING_TOGGLE,
  formatElectronAcceleratorLabel,
} from "@/shared/shortcuts";
import type { WindowSizePreset } from "@/shared/window-controls";
import { WINDOW_ROLES } from "@/shared/window-registry";
import { Options } from "./Slot/Options";
import type { OptionsCardLayout } from "./Slot/Options";
import { useCaptureOptions } from "./capture-options/useCaptureOptions";
import { usePinnedWindowBehavior } from "./hooks/usePinnedWindowBehavior";
import { useRecordingSession } from "./hooks/useRecordingSession";
import { useShortcutsWindowEffects } from "./hooks/useShortcutsWindowEffects";
import { useViews, VIEW_OPTIONS } from "./hooks/useViews";
import { useWindowRegistrySync } from "./hooks/useWindowRegistrySync";
import { parseWindowRoleFromLocation } from "./parseWindowRole";
import { useAppDispatch, useAppSelector } from "./store/hooks";
import { setFeedbackMessage } from "./store/slices/sessionRecordingSlice";
import { setShortcutEnabled } from "./store/slices/shortcutsWindowSlice";
import { WindowResizeControl } from "./window-controls/window-resize-control";
import { WindowPinControl } from "./window-controls/window-pin-control";

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
  useShortcutsWindowEffects();
  useWindowRegistrySync();

  const { handleToggleRecording, handleCloseApplication } = useRecordingSession();
  const currentSession = useAppSelector(
    (state) => state.sessionRecording.currentSession,
  );
  const isStarting = useAppSelector(
    (state) => state.sessionRecording.isStarting,
  );
  const isStopping = useAppSelector(
    (state) => state.sessionRecording.isStopping,
  );
  const windowBounds = useAppSelector(
    (state) => state.shortcutsWindow.windowBounds,
  );
  const { handleSetActiveView, resizePresetOptions } = useViews();
  const openWindowIds = useAppSelector((state) => state.views.openWindowIds);
  const { dragRegionStyle, pinControlProps } = usePinnedWindowBehavior();

  const handleResizePreset = useCallback(
    async (preset: WindowSizePreset) => {
      return window.electronApp.windowControls.setWindowSizePreset({
        preset,
      });
    },
    [],
  );

  const isRecording = currentSession?.status === "active";
  const isBusy = isStarting || isStopping;

  const platformLabel = useMemo(() => window.electronApp.platform, []);
  const visibilityShortcutLabel = useMemo(
    () => formatElectronAcceleratorLabel("CommandOrControl+Shift+V", platformLabel),
    [platformLabel]
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col justify-start bg-transparent pb-2" id="main-window">
      <nav
        className="z-[70] mx-2 inline-flex max-w-[calc(100vw-16px)] shrink-0 flex-col gap-2 bg-background/15 mt-4"
        style={dragRegionStyle}
      >
        <AgentNavigationMenu
          isRecording={isRecording}
          isBusy={isBusy}
          onRecordingToggle={(start) => {
            void handleToggleRecording(start);
          }}
          onToggleVisibility={() => {
            void window.electronApp.appControls.toggleVisibility();
          }}
          visibilityShortcut={visibilityShortcutLabel}
          pinControl={<WindowPinControl {...pinControlProps} />}
          resizeControl={
            <WindowResizeControl
              windowBounds={windowBounds}
              presetOptions={resizePresetOptions}
              onSelectPreset={handleResizePreset}
            />
          }
          isWorkspaceOpen={openWindowIds.options}
          onWorkspaceToggle={() => {
            handleSetActiveView(VIEW_OPTIONS.options);
            if (openWindowIds.options) {
              void window.electronApp.windowRegistry.closeWindow(
                VIEW_OPTIONS.options,
              );
            } else {
              void window.electronApp.windowRegistry.openWindow(
                VIEW_OPTIONS.options,
              );
            }
          }}
          className="w-auto"
          onClose={() => {
            void handleCloseApplication();
          }}
        />
      </nav>
    </div>
  );
}

function CardWindowMain({ layout, id }: { readonly layout: OptionsCardLayout, id: string }) {
  const dispatch = useAppDispatch();
  useShortcutsWindowEffects();
  const { resizePresetOptions } = useViews();
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
  const { dragRegionStyle, noDragRegionStyle, pinControlProps } =
    usePinnedWindowBehavior();

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

  const handleResizePreset = useCallback(
    async (preset: WindowSizePreset) => {
      return window.electronApp.windowControls.setWindowSizePreset({
        preset,
      });
    },
    [],
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
    <div className="flex h-full min-h-0 w-full flex-1 flex-col bg-transparent" id={id}>
      <nav
        className="relative z-[70] flex w-full shrink-0 flex-col items-end justify-baseline rounded-r-md rounded-bl-md border transition-colors duration-200 ease-in-out group-hover:border-yellow-a10 active:bg-yellow-a10/70"
        style={dragRegionStyle}
      >
        <div className="flex w-full items-center justify-between gap-2 leading-7 px-2 py-1">
          <div className="flex items-center gap-2">
            <WindowPinControl {...pinControlProps} />
            <WindowResizeControl
              windowBounds={windowBounds}
              presetOptions={resizePresetOptions}
              onSelectPreset={handleResizePreset}
            />
          </div>
          <button
            type="button"
            className="cursor-pointer rounded-full p-2 text-muted-foreground transition-colors duration-200 ease-in-out hover:bg-red-900/5 hover:text-red-500/50"
            onClick={() => {
              void window.electronApp.windowRegistry.closeWindow(layout);
            }}
            style={noDragRegionStyle}
            aria-label={`Close ${layout} window`}
          >
            <RiCloseFill className="size-6" />
          </button>
        </div>
      </nav>
      <main
        className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-transparent"
        style={noDragRegionStyle}
      >
        <div className="h-2 shrink-0" style={dragRegionStyle} />
        <div className="flex min-h-0 flex-1">
          <div className="w-4 shrink-0" style={dragRegionStyle} />
          <div className="flex min-h-0 flex-1 overflow-hidden" style={noDragRegionStyle}>
            <Options
              layout={layout}
              statusLabel={statusCopy.label}
              statusVariant={statusCopy.variant}
              platformLabel={platformLabel}
              windowSizeLabel={windowSizeLabel}
              windowBoundsLabel={windowBoundsLabel}
              currentSessionId={currentSession?.id}
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
              audioOutputDevices={captureOptions.audioOutputDevices}
              webcamDevices={captureOptions.webcamDevices}
              displays={captureOptions.displays}
              microphoneEnabled={captureOptions.config.microphone.enabled}
              webcamEnabled={captureOptions.config.webcam.enabled}
              screenEnabled={captureOptions.config.screen.enabled}
              systemAudioEnabled={captureOptions.config.systemAudio.enabled}
              screenshotEnabled={captureOptions.config.screenshot.enabled}
              microphoneLevel={captureOptions.microphoneLevel}
              isWebcamPreviewVisible={captureOptions.isWebcamPreviewVisible}
              isWebcamPreviewLoading={captureOptions.isWebcamPreviewLoading}
              webcamPreviewStream={captureOptions.webcamPreviewStream}
              isDesktopPreviewVisible={captureOptions.isDesktopPreviewVisible}
              isDesktopPreviewLoading={captureOptions.isDesktopPreviewLoading}
              desktopPreviewStream={captureOptions.desktopPreviewStream}
              hasCaptureSourceEnabled={captureOptions.hasCaptureSourceEnabled}
              onSetMicrophoneEnabled={captureOptions.setMicrophoneEnabled}
              onSetWebcamEnabled={captureOptions.setWebcamEnabled}
              onSetScreenEnabled={captureOptions.setScreenEnabled}
              onSetSystemAudioEnabled={captureOptions.setSystemAudioEnabled}
              onSetScreenshotEnabled={captureOptions.setScreenshotEnabled}
              onSetMicrophoneDeviceId={captureOptions.setMicrophoneDeviceId}
              onSetAudioOutputDeviceId={captureOptions.setAudioOutputDeviceId}
              onSetWebcamDeviceId={captureOptions.setWebcamDeviceId}
              onSetDisplayId={captureOptions.setDisplayId}
              onSetWebcamPreviewVisible={captureOptions.setWebcamPreviewVisible}
              onSetDesktopPreviewVisible={captureOptions.setDesktopPreviewVisible}
              onOpenMonitorPicker={() => {
                void captureOptions.openMonitorPicker();
              }}
              onOpenRecordingsFolder={() => {
                const sessionId = recordingState?.sessionId || currentSession?.id;
                if (!sessionId) {
                  dispatch(setFeedbackMessage("No recording session is available yet."));
                  return;
                }

                void window.electronApp.recording
                  .openRecordingsFolder({ sessionId })
                  .catch((error: unknown) => {
                    dispatch(
                      setFeedbackMessage(
                        error instanceof Error
                          ? error.message
                          : "Unable to open recordings folder.",
                      ),
                    );
                  });
              }}
              onQuit={() => {
                void handleCloseApplication();
              }}
            />
          </div>
          <div className="w-4 shrink-0" style={dragRegionStyle} />
        </div>
        <div className="h-4 shrink-0" style={dragRegionStyle} />
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

  return <CardWindowMain layout={layout} id={role as string} />;
}

export default Main;
