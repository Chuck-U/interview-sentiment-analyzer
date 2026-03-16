import  {  useEffect, useState, useRef, useCallback, useMemo } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type {
  MediaChunkSource,
  SessionSnapshot,
} from "@/shared/session-lifecycle";
import type { WindowBoundsSnapshot } from "@/shared/window-controls";

const DEFAULT_CAPTURE_SOURCES: readonly MediaChunkSource[] = [
  "microphone",
  "screen-video",
  "screenshot",
];
const CAPTURE_SOURCE_LABELS: Record<MediaChunkSource, string> = {
  microphone: "Microphone",
  "screen-video": "Screen video",
  screenshot: "Screenshot",
  "system-audio": "System audio",
};

type InteractionMode = "move" | "resize";

type ActivePointerGesture = {
  readonly pointerId: number;
  readonly mode: InteractionMode;
  readonly screenX: number;
  readonly screenY: number;
};

function matchesRecordingShortcut(event: KeyboardEvent): boolean {
  return (
    event.key.toLowerCase() === "r" &&
    (event.metaKey || event.ctrlKey) &&
    event.shiftKey &&
    !event.altKey
  );
}

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
  const shortcutLabel = useMemo(
    () => (platformLabel === "darwin" ? "Cmd+Shift+R" : "Ctrl+Shift+R"),
    [platformLabel],
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

  const handleMoveStart = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      beginPointerGesture("move", event);
    },
    [beginPointerGesture],
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

  const handleToggleRecording = useCallback(async () => {
    if (currentSessionRef.current?.status === "active") {
      await handleStopRecording();
      return;
    }

    await handleStartRecording();
  }, [handleStartRecording, handleStopRecording]);

  const handleCloseApplication = useCallback(async () => {
    setFeedbackMessage("Closing application.");
    await window.electronApp.appControls.closeApplication();
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

    void window.electronApp.windowControls
      .getWindowBounds()
      .then((bounds) => {
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
        window.electronApp.windowControls.moveWindowBy({
          deltaX,
          deltaY,
        });
        return;
      }

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

  useEffect(() => {
    if (!isShortcutEnabled) {
      return;
    }

    const handleShortcut = (event: KeyboardEvent) => {
      if (!matchesRecordingShortcut(event)) {
        return;
      }

      event.preventDefault();
      void handleToggleRecording();
    };

    window.addEventListener("keydown", handleShortcut);

    return () => {
      window.removeEventListener("keydown", handleShortcut);
    };
  }, [handleToggleRecording, isShortcutEnabled]);

  return (
    <main className="dark min-h-screen bg-transparent text-foreground">
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
                  onClick={() => {
                    void handleStopRecording();
                  }}
                >
                  Stop recording
                </Button>
                {currentSession ? (
                  <Badge variant="outline">
                    Session {currentSession.id.slice(0, 8)}
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
                <Switch
                  checked={isShortcutEnabled}
                  aria-label="Toggle recording keyboard shortcut"
                  onCheckedChange={setIsShortcutEnabled}
                />
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
                    Position {windowBounds.x}, {windowBounds.y}
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
                  ? `${windowBounds.minWidth} x ${windowBounds.minHeight}`
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
}

export default Main;