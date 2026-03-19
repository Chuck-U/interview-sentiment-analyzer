import  {  useEffect, useState, useRef, useCallback, useMemo } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { AgentNavigationMenu } from "@/components/ui/navigation-menu";
import { Options } from "./Slot/Options";
import type {
  MediaChunkSource,
  SessionSnapshot,
} from "@/shared/session-lifecycle";
import type { WindowBoundsSnapshot } from "@/shared/window-controls";
import {
  DEFAULT_SHORTCUT_ID_RECORDING_TOGGLE,
  formatElectronAcceleratorLabel,
} from "@/shared/shortcuts";




// interface ElectronAppBridgeType extends ElectronAppBridge {
//   readonly windowControls: WindowControlsBridge;
//   readonly appControls: AppControlsBridge;
//   readonly sessionLifecycle: SessionLifecycleBridge;
//   readonly sessionLifecycleEvents: SessionLifecycleEventsBridge;
// }




const DEFAULT_CAPTURE_SOURCES: readonly MediaChunkSource[] = [
  "microphone",
  "screen-video",
  "screenshot",
];


type InteractionMode = "move" | "resize";

type ActivePointerGesture = {
  readonly pointerId: number;
  readonly mode: InteractionMode;
  readonly screenX: number;
  readonly screenY: number;
};

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
  const pointerGestureRef = useRef<ActivePointerGesture | null>(null);
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
  const [activeInteraction, setActiveInteraction] =
    useState<InteractionMode | null>(null);
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

  currentSessionRef.current = currentSession;

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

  const beginPointerGesture = useCallback(
    (mode: InteractionMode, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) {
        return;
      }

      pointerGestureRef.current = {
        pointerId: event.pointerId,
        mode,
        screenX: event.screenX,
        screenY: event.screenY,
      };
      setActiveInteraction(mode);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [],
  );

  const handleResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      beginPointerGesture("resize", event);
    },
    [beginPointerGesture],
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

  const handleStartRecording = useCallback(async () => {
    if (isBusy || currentSessionRef.current?.status === "active") {
      return;
    }

    setIsStarting(true);
    setFeedbackMessage("Starting recording session.");

    try {
      const response = await window.electronApp.sessionLifecycle.startSession({
        captureSources: DEFAULT_CAPTURE_SOURCES,
      });

      syncIncomingSession(response.session);
      setFeedbackMessage(
        `Recording started for session ${response.session.id.slice(0, 8)}.`,
      );
    } catch (error) {
      setFeedbackMessage(
        error instanceof Error ? error.message : "Unable to start recording.",
      );
    } finally {
      setIsStarting(false);
    }
  }, [isBusy, syncIncomingSession]);

  const handleStopRecording = useCallback(async () => {
    const session = currentSessionRef.current;

    if (isBusy || session?.status !== "active") {
      return;
    }

    setIsStopping(true);
    setFeedbackMessage("Stopping recording session.");

    try {
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
    let isSubscribed = true;

    // @ts-expect-error windowControls is not defined
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
    // @ts-expect-error windowControls is not defined
      window.electronApp.windowControls.onWindowBoundsChanged(setWindowBounds);

    return () => {
      isSubscribed = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!activeInteraction) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const gesture = pointerGestureRef.current;

      if (!gesture || event.pointerId !== gesture.pointerId) {
        return;
      }

      const deltaX = Math.round(event.screenX - gesture.screenX);
      const deltaY = Math.round(event.screenY - gesture.screenY);

      if (deltaX === 0 && deltaY === 0) {
        return;
      }

      pointerGestureRef.current = {
        ...gesture,
        screenX: event.screenX,
        screenY: event.screenY,
      };

      if (gesture.mode === "move") {
        // @ts-expect-error windowControls is not defined
        window.electronApp.windowControls.moveWindowBy({
          deltaX,
          deltaY,
        });
        return;
      }
// @ts-expect-error windowControls is not defined
      window.electronApp.windowControls.resizeWindowBy({
        deltaWidth: deltaX,
        deltaHeight: deltaY,
      });
    };

    const stopPointerGesture = (event: PointerEvent) => {
      const gesture = pointerGestureRef.current;

      if (!gesture || event.pointerId !== gesture.pointerId) {
        return;
      }

      pointerGestureRef.current = null;
      setActiveInteraction(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopPointerGesture);
    window.addEventListener("pointercancel", stopPointerGesture);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopPointerGesture);
      window.removeEventListener("pointercancel", stopPointerGesture);
    };
  }, [activeInteraction]);

  const [activeView, setActiveView] = useState<"controls" | "options">(
    "controls",
  );

  // Render the refactored agent UI first; the legacy UI below is kept for
  // now to minimize risky deletions during the refactor.
  if (activeView === "controls" || activeView === "options") {
    return (
      <main
        className="dark bg-transparent text-foreground w-full"
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
      >
        <div className="flex flex-col gap-3 p-3 relative">
          <AgentNavigationMenu
            items={[
              { id: "controls", label: "Controls" },
              { id: "options", label: "Options" },
            ]}
            value={activeView}
            onValueChange={(value) => {
              if (value === "controls" || value === "options") {
                setActiveView(value);
              }
            }}
          />
          <div className="flex-1 min-h-0 size-full">
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
              onResizeStart={handleResizeStart}
              activeInteraction={activeInteraction}
              onQuit={() => {
                void handleCloseApplication();
              }}
            />
          </div>
        </div>
      </main>
    );
  }

  /* legacy UI
  return (
    <main
      className="dark min-h-screen bg-transparent text-foreground w-full"
      style={{ WebkitAppRegion: "drag" } as CSSProperties}
    >
      <div className="min-h-screen bg-transparent p-3">
        <Card
          size="sm"
          className="min-h-[calc(100vh-1.5rem)] border border-border/60 bg-card/60 shadow-2xl backdrop-blur-xl"
        >
          <CardHeader
            className="border-b border-border/50"
            style={{ WebkitAppRegion: "drag" } as CSSProperties}
          >
            <CardAction className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="xs"
                className={cn(
                  "touch-none",
                  activeInteraction === "move"
                    ? "cursor-grabbing"
                    : "cursor-grab",
                )}
                style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
                onPointerDown={handleMoveStart}
              >
                Drag window
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="xs"
                style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
                onClick={() => {
                  void handleCloseApplication();
                }}
              >
                Close app
              </Button>
            </CardAction>

            <div className="flex items-center gap-2">
              <Badge variant={statusCopy.variant}>{statusCopy.label}</Badge>
              <Badge variant="outline" className="capitalize">
                {platformLabel}
              </Badge>
              <Badge variant="outline">{windowSizeLabel}</Badge>
            </div>

            <CardTitle>Interview recording overlay</CardTitle>
            <CardDescription>
              Drag and resize events are sent through IPC so Electron controls
              the frameless overlay window directly while the app stays focused.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 border border-border/50 bg-background/45 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={isBusy || isRecording}
                  style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
                  onClick={() => {
                    void handleStartRecording();
                  }}
                >
                  Start recording
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isBusy || !isRecording}
                  style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
                  onClick={() => {
                    void handleStopRecording();
                  }}
                >
                  Stop recording
                </Button>
                {currentSession ? (
                  <Badge variant="outline">
                    Session {currentSession!.id.slice(0, 8)}
                  </Badge>
                ) : null}
              </div>

              <p className="text-sm text-muted-foreground">{feedbackMessage}</p>
            </div>

            <div className="flex flex-col gap-3 border border-border/50 bg-background/35 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">Keyboard shortcut</p>
                  <p className="text-sm text-muted-foreground">
                    Toggle start and stop with {shortcutLabel}.
                  </p>
                </div>
                <div style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
                  <Switch
                    checked={isShortcutEnabled}
                    aria-label="Toggle recording keyboard shortcut"
                    onCheckedChange={(enabled) => {
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
                            error instanceof Error
                              ? error.message
                              : "Unable to update shortcut.",
                          );
                        });
                    }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {DEFAULT_CAPTURE_SOURCES.map((source) => (
                  <Badge key={source} variant="secondary">
                    {CAPTURE_SOURCE_LABELS[source]}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2 border border-border/50 bg-background/35 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Overlay window controls</p>
                {windowBounds ? (
                  <p className="text-xs text-muted-foreground">
                    Position {windowBounds!.x}, {windowBounds!.y}
                  </p>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                Use the drag button in the header to move the overlay and hold
                the resize handle in the footer to change the Electron window
                size.
              </p>
            </div>
          </CardContent>

          <CardFooter className="justify-between gap-3 border-border/50">
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              <p>
                {isShortcutEnabled
                  ? `${shortcutLabel} is enabled.`
                  : `${shortcutLabel} is disabled.`}
              </p>
              <p>
                Minimum size{" "}
                {windowBounds
                  ? `${windowBounds!.minWidth} x ${windowBounds!.minHeight}`
                  : "syncing"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                {activeInteraction === "resize"
                  ? "Resizing overlay."
                  : activeInteraction === "move"
                    ? "Moving overlay."
                    : "Resize"}
              </p>
              <Button
                type="button"
                variant="outline"
                size="xs"
                className={cn(
                  "touch-none",
                  activeInteraction === "resize"
                    ? "cursor-nwse-resize bg-muted"
                    : "cursor-nwse-resize",
                )}
                style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
                onPointerDown={handleResizeStart}
              >
                Resize window
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
  */

  return null;
}

export default Main;