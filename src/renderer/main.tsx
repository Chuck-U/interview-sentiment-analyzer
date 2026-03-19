import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import type { CSSProperties } from "react";
import { AgentNavigationMenu } from "@/components/ui/navigation-menu";
import type { WindowBoundsSnapshot, WindowSizePreset } from "@/shared/window-controls";
import { Options } from "./Slot/Options";
import type { SessionSnapshot } from "@/shared/session-lifecycle";
import type { RecordingStateSnapshot } from "@/shared/recording";
import {
  DEFAULT_SHORTCUT_ID_RECORDING_TOGGLE,
  formatElectronAcceleratorLabel,
} from "@/shared/shortcuts";
import { useCaptureOptions } from "./capture-options/useCaptureOptions";
import { CaptureManager } from "./recording/capture-manager";
import { WindowResizeControl } from "./window-controls/window-resize-control";
import { useViews } from "./hooks/useViews";

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
  const currentSessionRef = useRef<SessionSnapshot | null>(null);
  const captureManagerRef = useRef<CaptureManager | null>(null);
  const platformLabel = useMemo(() => window.electronApp.platform, []);
  const [recordingShortcutAccelerator, setRecordingShortcutAccelerator] =
    useState<string>("CommandOrControl+Shift+R");
  const shortcutLabel = useMemo(
    () =>
      formatElectronAcceleratorLabel(
        recordingShortcutAccelerator,
        platformLabel,
      ),
    [platformLabel, recordingShortcutAccelerator],
  );
  const [currentSession, setCurrentSession] = useState<SessionSnapshot | null>(
    null,
  );
  const [feedbackMessage, setFeedbackMessage] = useState(
    "Ready to start a local recording session.",
  );
  const [isShortcutEnabled, setIsShortcutEnabled] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [windowBounds, setWindowBounds] = useState<WindowBoundsSnapshot | null>(
    null,
  );
  const [recordingState, setRecordingState] =
    useState<RecordingStateSnapshot | null>(null);
  const { activeView, handleSetActiveView, resizePresetOptions } = useViews();

  currentSessionRef.current = currentSession;

  const captureOptions = useCaptureOptions({
    isMenuActive: activeView === "options",
    recordingState,
    onError: setFeedbackMessage,
  });

  const syncIncomingSession = useCallback((session: SessionSnapshot) => {
    setCurrentSession((previousSession) => {
      if (
        previousSession &&
        previousSession.id !== session.id &&
        session.status !== "active"
      ) {
        return previousSession;
      }

      return session;
    });
  }, []);

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

  const createCaptureManager = useCallback(() => {
    return new CaptureManager({
      onChunkAvailable(sessionId, source, sequenceNumber, mimeType, recordedAt, buffer) {
        return window.electronApp.recording.persistChunk({
          sessionId,
          source,
          sequenceNumber,
          mimeType,
          recordedAt,
          buffer,
        });
      },
      onScreenshotAvailable(sessionId, sequenceNumber, mimeType, capturedAt, buffer) {
        return window.electronApp.recording.persistScreenshot({
          sessionId,
          sequenceNumber,
          mimeType,
          capturedAt,
          buffer,
        });
      },
      onStateChanged(state) {
        setRecordingState(state);
      },
      onCaptureError(_sessionId, source, _errorCode, errorMessage) {
        setFeedbackMessage(`Capture error (${source}): ${errorMessage}`);
      },
    });
  }, []);

  const handleStartRecording = useCallback(async () => {
    if (isBusy || currentSessionRef.current?.status === "active") {
      return;
    }

    if (captureOptions.captureSources.length === 0) {
      setFeedbackMessage("Enable at least one capture source before recording.");
      return;
    }

    setIsStarting(true);
    setFeedbackMessage("Starting recording session.");

    try {
      const response = await window.electronApp.sessionLifecycle.startSession({
        captureSources: captureOptions.captureSources,
      });

      syncIncomingSession(response.session);
      setFeedbackMessage(
        `Recording started for session ${response.session.id.slice(0, 8)}.`,
      );

      if (captureManagerRef.current) {
        captureManagerRef.current.destroy();
      }

      const manager = createCaptureManager();

      captureManagerRef.current = manager;
      await manager.startCapture(
        response.session.id,
        captureOptions.captureSources,
        captureOptions.config,
      );
    } catch (error) {
      setFeedbackMessage(
        error instanceof Error ? error.message : "Unable to start recording.",
      );
    } finally {
      setIsStarting(false);
    }
  }, [captureOptions.captureSources, captureOptions.config, createCaptureManager, isBusy, syncIncomingSession]);

  const handleStopRecording = useCallback(async () => {
    const session = currentSessionRef.current;

    if (isBusy || session?.status !== "active") {
      return;
    }

    setIsStopping(true);
    setFeedbackMessage("Stopping recording session.");

    try {
      if (captureManagerRef.current) {
        await captureManagerRef.current.stopCapture();
      }

      const response =
        await window.electronApp.sessionLifecycle.finalizeSession({
          sessionId: session.id,
        });

      syncIncomingSession(response.session);
      setFeedbackMessage(
        `Recording stopped. Session ${session.id.slice(0, 8)} is finalizing.`,
      );
    } catch (error) {
      setFeedbackMessage(
        error instanceof Error ? error.message : "Unable to stop recording.",
      );
    } finally {
      setIsStopping(false);
    }
  }, [isBusy, syncIncomingSession]);

  const handleExportRecording = useCallback(async () => {
    const session = currentSessionRef.current;
    if (!session) {
      return;
    }

    if (captureManagerRef.current) {
      captureManagerRef.current.setExportStatus("assembling");
    }

    try {

      const result = await window.electronApp.recording.exportRecording({
        sessionId: session.id,
      });

      if (captureManagerRef.current) {
        captureManagerRef.current.setExportStatus(
          result.exportStatus as "completed" | "failed",
          result.exportFilePath,
        );
      }

      if (result.exportStatus === "completed") {
        setFeedbackMessage("Recording exported successfully.");
      } else {
        setFeedbackMessage("Recording export failed.");
      }
    } catch (error) {
      if (captureManagerRef.current) {
        captureManagerRef.current.setExportStatus(
          "failed",
          undefined,
          error instanceof Error ? error.message : "Export failed",
        );
      }
      setFeedbackMessage(
        error instanceof Error ? error.message : "Unable to export recording.",
      );
    }
  }, []);

  const handleCloseApplication = useCallback(async () => {
    setFeedbackMessage("Closing application.");
    await window.electronApp.appControls.closeApplication();
  }, []);

  const handleToggleRecording = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        await handleStartRecording();
        return;
      }

      await handleStopRecording();
    },
    [handleStartRecording, handleStopRecording],
  );

  const handleSetShortcutEnabled = useCallback(
    (enabled: boolean) => {
      const previous = isShortcutEnabled;
      setIsShortcutEnabled(enabled);

      void window.electronApp.shortcuts
        .setShortcutEnabled({
          shortcutId: DEFAULT_SHORTCUT_ID_RECORDING_TOGGLE,
          enabled,
        })
        .catch((error: unknown) => {
          setIsShortcutEnabled(previous);
          setFeedbackMessage(
            error instanceof Error ? error.message : "Unable to update shortcut.",
          );
        });
    },
    [isShortcutEnabled],
  );

  useEffect(() => {
    let isSubscribed = true;

    void window.electronApp.shortcuts
      .getConfig()
      .then((config) => {
        if (!isSubscribed) {
          return;
        }

        const entry =
          config.shortcuts[DEFAULT_SHORTCUT_ID_RECORDING_TOGGLE];

        if (!entry) {
          return;
        }

        setIsShortcutEnabled(entry.enabled);
        setRecordingShortcutAccelerator(entry.accelerator);
      })
      .catch((error: unknown) => {
        if (!isSubscribed) {
          return;
        }

        setFeedbackMessage(
          error instanceof Error ? error.message : "Unable to load shortcuts.",
        );
      });

    return () => {
      isSubscribed = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribeSessionChanged =
      window.electronApp.sessionLifecycleEvents.onSessionChanged((session) => {
        syncIncomingSession(session);

        if (session.status === "active") {
          setFeedbackMessage(
            `Recording started for session ${session.id.slice(0, 8)}.`,
          );
        }

        if (session.status === "finalizing") {
          setFeedbackMessage(
            `Recording stopped. Session ${session.id.slice(0, 8)} is finalizing.`,
          );
        }
      });
    const unsubscribeSessionFinalized =
      window.electronApp.sessionLifecycleEvents.onSessionFinalized(
        (session) => {
          syncIncomingSession(session);
          setFeedbackMessage(`Session ${session.id.slice(0, 8)} finalized.`);
        },
      );
    const unsubscribeRecoveryIssue =
      window.electronApp.sessionLifecycleEvents.onRecoveryIssue((issue) => {
        setFeedbackMessage(issue.message);
      });

    return () => {
      unsubscribeSessionChanged();
      unsubscribeSessionFinalized();
      unsubscribeRecoveryIssue();
    };
  }, [syncIncomingSession]);

  useEffect(() => {
    const unsubscribeRecordingState =
      window.electronApp.recordingEvents.onRecordingStateChanged((state) => {
        setRecordingState(state);
      });
    const unsubscribeExportProgress =
      window.electronApp.recordingEvents.onExportProgress((progress) => {
        if (progress.exportStatus === "completed" && progress.exportFilePath) {
          setFeedbackMessage("Recording exported successfully.");
        } else if (progress.exportStatus === "failed") {
          setFeedbackMessage(
            progress.errorMessage ?? "Recording export failed.",
          );
        }
      });

    return () => {
      unsubscribeRecordingState();
      unsubscribeExportProgress();
    };
  }, []);

  useEffect(() => {
    const session = currentSession;

    if (!session) {
      return;
    }

    if (session.status === "active") {
      if (captureManagerRef.current || isStarting) {
        return;
      }

      const manager = createCaptureManager();
      captureManagerRef.current = manager;

      void manager
        .startCapture(session.id, session.captureSources, captureOptions.config)
        .catch((error: unknown) => {
          setFeedbackMessage(
            error instanceof Error ? error.message : "Unable to attach capture.",
          );
          if (captureManagerRef.current === manager) {
            captureManagerRef.current = null;
          }
        });
      return;
    }

    if (session.status === "finalizing" && captureManagerRef.current && !isStopping) {
      void captureManagerRef.current.stopCapture().catch((error: unknown) => {
        setFeedbackMessage(
          error instanceof Error ? error.message : "Unable to stop capture.",
        );
      });
    }
  }, [captureOptions.config, createCaptureManager, currentSession, isStarting, isStopping]);

  useEffect(() => {
    return () => {
      if (captureManagerRef.current) {
        captureManagerRef.current.destroy();
        captureManagerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let isSubscribed = true;

    void window.electronApp.windowControls
      .getWindowBounds()
      .then((bounds: WindowBoundsSnapshot) => {
        if (isSubscribed) {
          setWindowBounds(bounds);
        }
      })
      .catch((error: unknown) => {
        if (isSubscribed) {
          setFeedbackMessage(
            error instanceof Error
              ? error.message
              : "Unable to sync overlay window size.",
          );
        }
      });

    const unsubscribe =
      window.electronApp.windowControls.onWindowBoundsChanged(setWindowBounds);

    return () => {
      isSubscribed = false;
      unsubscribe();
    };
  }, []);

  // Render the refactored agent UI first; the legacy UI below is kept for
  // now to minimize risky deletions during the refactor.
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