import { useCallback, useMemo } from "react";

import {
  RiArrowDownSLine,
  RiArrowUpSLine,
  RiCloseFill,
  RiPauseFill,
  RiPlayFill,
  RiStopFill,
  RiRefreshLine,
} from "@remixicon/react";

import toast from "@/components/molecules/Toast";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { WINDOW_ROLES, type CardWindowRole } from "@/shared/window-registry";
import type { SessionSnapshot } from "@/shared/session-lifecycle";
import {
  DEFAULT_SHORTCUT_ID_PING_WINDOWS,
  DEFAULT_SHORTCUT_ID_RECORDING_TOGGLE,
  formatElectronAcceleratorLabel,
} from "@/shared/shortcuts";
import { QuestionBoxMain } from "../components/QuestionBoxMain";
import { useQuestionBox } from "./hooks/useQuestionBox";
import { OptionsWorkspace } from "./Slot/OptionsWorkspace";
import { useCaptureOptions } from "./capture-options/useCaptureOptions";
import { usePinnedWindowBehavior } from "./hooks/usePinnedWindowBehavior";
import { useRecordingSession } from "./hooks/useRecordingSession";
import { useShortcutsWindowEffects } from "./hooks/useShortcutsWindowEffects";
import { useAppDispatch, useAppSelector } from "./store/hooks";
import { setFeedbackMessage } from "./store/slices/sessionRecordingSlice";
import {
  setPingShortcutAccelerator,
  setPingShortcutEnabled,
  setRecordingShortcutAccelerator,
  setShortcutEnabled,
} from "./store/slices/shortcutsWindowSlice";
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

function UnsupportedCardWindow({
  role,
}: {
  readonly role: Exclude<
    CardWindowRole,
    typeof WINDOW_ROLES.options | typeof WINDOW_ROLES.questionBox
  >;
}) {
  return (
    <div className="flex min-h-0 w-full flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
      `{role}` is not implemented yet.
    </div>
  );
}

function QuestionBoxNavControls() {
  const {
    allQuestions,
    viewIndex,
    isPaused,
    isMockRunning,
    togglePauseResume,
    goPrevious,
    goNext,
    startMockStream,
    stopMockStream,
    resetQuestions,
  } = useQuestionBox();

  const n = allQuestions.length;
  const canPrev = viewIndex > 0;
  const canNext = viewIndex < n - 1;

  const handleMockStream = () => {
    if (isMockRunning) {
      stopMockStream();
    } else {
      startMockStream();
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-0 items-center justify-center gap-0.5 px-1 [&>button]:[webkit-app-region:no-drag] [&>button]:[webkit-app-region:no-drag] ">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground hover:text-foreground"
              onClick={togglePauseResume}
              aria-label={isPaused ? "Resume" : "Pause"}
            >
              {isPaused ? (
                <RiPlayFill className="size-4" />
              ) : (
                <RiPauseFill className="size-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {isPaused ? "Resume (jump to latest)" : "Pause new cards on top"}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground hover:text-foreground"
              disabled={!canPrev}
              onClick={goPrevious}
              aria-label="Previous question"
            >
              <RiArrowUpSLine className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Previous</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground hover:text-foreground"
              disabled={!canNext}
              onClick={goNext}
              aria-label="Next question"
            >
              <RiArrowDownSLine className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Next</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground hover:text-foreground"
              onClick={handleMockStream}
              aria-label={
                isMockRunning
                  ? "Cancel mock classification test"
                  : "Run bundled speech sample through ASR and question classifier"
              }
            >
              {isMockRunning ? <RiStopFill className="size-3.5" /> : <RiPlayFill className="size-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {isMockRunning
              ? "Cancel in-flight mock test"
              : "Decode bundled WAV (HF transformers.js jfk sample) and transcribe"}
          </TooltipContent>

        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground hover:text-foreground"
              onClick={resetQuestions}
              aria-label="clear questions"
            >
              <RiRefreshLine className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Clear questions</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

function CardWindowMainInner({ role }: { readonly role: CardWindowRole }) {
  const dispatch = useAppDispatch();
  useShortcutsWindowEffects();
  const {
    handleToggleRecording,
    handleExportRecording,
    handleCloseApplication,
  } = useRecordingSession({ manageCapture: false });

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
  const isRecordingShortcutEnabled = useAppSelector(
    (state) => state.shortcutsWindow.isShortcutEnabled,
  );
  const pingShortcutAccelerator = useAppSelector(
    (state) => state.shortcutsWindow.pingShortcutAccelerator,
  );
  const isPingShortcutEnabled = useAppSelector(
    (state) => state.shortcutsWindow.isPingShortcutEnabled,
  );
  const windowBounds = useAppSelector(
    (state) => state.shortcutsWindow.windowBounds,
  );
  const { dragRegionStyle, noDragRegionStyle, isPinned, pinControlProps } =
    usePinnedWindowBehavior();

  const handleCaptureOptionsError = useCallback(
    (message: string) => {
      dispatch(setFeedbackMessage(message));
    },
    [dispatch],
  );

  const captureOptions = useCaptureOptions({
    isMenuActive: role === WINDOW_ROLES.options,
    onError: handleCaptureOptionsError,
  });

  const handleSetRecordingShortcutEnabled = useCallback(
    (enabled: boolean) => {
      const previous = isRecordingShortcutEnabled;
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
    [dispatch, isRecordingShortcutEnabled],
  );

  const handleSaveRecordingAccelerator = useCallback(
    (accelerator: string) => {
      const previous = recordingShortcutAccelerator;
      dispatch(setRecordingShortcutAccelerator(accelerator));

      void window.electronApp.shortcuts
        .setShortcutAccelerator({
          shortcutId: DEFAULT_SHORTCUT_ID_RECORDING_TOGGLE,
          accelerator,
        })
        .catch((error: unknown) => {
          dispatch(setRecordingShortcutAccelerator(previous));
          dispatch(
            setFeedbackMessage(
              error instanceof Error
                ? error.message
                : "Unable to update recording shortcut.",
            ),
          );
        });
    },
    [dispatch, recordingShortcutAccelerator],
  );

  const handleSetPingShortcutEnabled = useCallback(
    (enabled: boolean) => {
      const previous = isPingShortcutEnabled;
      dispatch(setPingShortcutEnabled(enabled));

      void window.electronApp.shortcuts
        .setShortcutEnabled({
          shortcutId: DEFAULT_SHORTCUT_ID_PING_WINDOWS,
          enabled,
        })
        .catch((error: unknown) => {
          dispatch(setPingShortcutEnabled(previous));
          dispatch(
            setFeedbackMessage(
              error instanceof Error
                ? error.message
                : "Unable to update ping shortcut.",
            ),
          );
        });
    },
    [dispatch, isPingShortcutEnabled],
  );

  const handleSavePingAccelerator = useCallback(
    (accelerator: string) => {
      const previous = pingShortcutAccelerator;
      dispatch(setPingShortcutAccelerator(accelerator));

      void window.electronApp.shortcuts
        .setShortcutAccelerator({
          shortcutId: DEFAULT_SHORTCUT_ID_PING_WINDOWS,
          accelerator,
        })
        .catch((error: unknown) => {
          dispatch(setPingShortcutAccelerator(previous));
          dispatch(
            setFeedbackMessage(
              error instanceof Error
                ? error.message
                : "Unable to update ping shortcut.",
            ),
          );
        });
    },
    [dispatch, pingShortcutAccelerator],
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
  const recordingShortcutLabel = useMemo(
    () =>
      formatElectronAcceleratorLabel(
        recordingShortcutAccelerator,
        platformLabel,
      ),
    [platformLabel, recordingShortcutAccelerator],
  );

  const pingShortcutLabel = useMemo(
    () =>
      formatElectronAcceleratorLabel(pingShortcutAccelerator, platformLabel),
    [platformLabel, pingShortcutAccelerator],
  );

  const handleAttemptDrag = useCallback(
    (
      event:
        | React.DragEvent<HTMLElement>
        | React.MouseEvent<HTMLElement>
        | React.PointerEvent<HTMLElement>,
    ) => {
      if (!isPinned) {
        return;
      }

      event.preventDefault();
      toast();
    },
    [isPinned],
  );

  let content: React.ReactNode;
  switch (role) {
    case WINDOW_ROLES.options:
      content = (
        <OptionsWorkspace
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
          recordingShortcutLabel={recordingShortcutLabel}
          recordingAccelerator={recordingShortcutAccelerator}
          isRecordingShortcutEnabled={isRecordingShortcutEnabled}
          onSetRecordingShortcutEnabled={handleSetRecordingShortcutEnabled}
          onSaveRecordingAccelerator={handleSaveRecordingAccelerator}
          pingShortcutLabel={pingShortcutLabel}
          pingAccelerator={pingShortcutAccelerator}
          isPingShortcutEnabled={isPingShortcutEnabled}
          onSetPingShortcutEnabled={handleSetPingShortcutEnabled}
          onSavePingAccelerator={handleSavePingAccelerator}
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
            const sessionId = recordingState?.sessionId ?? currentSession?.id;
            // if (!sessionId) {
            //   dispatch(setFeedbackMessage("No recording session is available yet."));
            //   return;
            // }

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
      );
      break;
    case WINDOW_ROLES.questionBox:
      content = <QuestionBoxMain />;
      break;
    case WINDOW_ROLES.controls:
    case WINDOW_ROLES.sandbox:
    case WINDOW_ROLES.speechBox:
      content = <UnsupportedCardWindow role={role} />;
      break;
    default: {
      const exhaustiveRole: never = role;
      throw new Error(`Unhandled card window role: ${String(exhaustiveRole)}`);
    }
  }

  return (
    <div
      className="flex h-fit min-h-0 w-full flex-col bg-transparent"
      id={role}
    >
      <nav
        className={cn(
          "relative z-[70] mb-px flex w-full shrink-0 flex-col items-end justify-baseline rounded-md shadow-b-md transition-colors duration-200 ease-in-out group-hover:border-yellow-a10",
          isPinned
            ? "border-dashed border-yellow-a10"
            : "border-transparent from-bg-yellow-a1/5 to-transparent linear-gradient-to-b",
        )}
        draggable={!isPinned}
        style={dragRegionStyle}
        onDragCapture={handleAttemptDrag}
        onMouseDown={handleAttemptDrag}
      >
        <div
          className="mx-2 flex w-full items-center justify-between gap-2 py-1 leading-7"
          style={dragRegionStyle}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div style={noDragRegionStyle}>
              <WindowPinControl {...pinControlProps} />
            </div>
            {role === WINDOW_ROLES.questionBox ? (
              <div className="min-w-0 flex-1" style={dragRegionStyle}>
                <QuestionBoxNavControls />
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="cursor-pointer rounded-full p-2 text-muted-foreground transition-colors duration-200 ease-in-out hover:bg-red-900/5 hover:text-red-500/50"
            onClick={() => {
              void window.electronApp.windowRegistry.closeWindow(role);
            }}
            style={noDragRegionStyle}
            aria-label={`Close ${role} window`}
          >
            <RiCloseFill className="size-6" />
          </button>
        </div>
      </nav>
      <div
        className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-transparent"
        draggable={!isPinned}
        style={dragRegionStyle}
      >
        <div className="flex min-h-0 flex-1">
          <div
            className="flex min-h-0 flex-1 overflow-hidden"
            style={noDragRegionStyle}
          >
            {content}
          </div>
          <div className="w-1 shrink-0" style={dragRegionStyle} />
        </div>
        <div className="h-4 shrink-0" style={dragRegionStyle} />
      </div>
    </div>
  );
}

export function CardWindowMain({ role }: { readonly role: CardWindowRole }) {
  return <CardWindowMainInner role={role} />;
}
