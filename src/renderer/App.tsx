import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

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

const DEFAULT_CAPTURE_SOURCES: readonly MediaChunkSource[] = [
  "microphone",
  "screen-video",
  "screenshot",
];
const DEFAULT_MENU_SIZE = {
  width: 512,
  height: 308,
};
const MENU_MARGIN = 24;
const CAPTURE_SOURCE_LABELS: Record<MediaChunkSource, string> = {
  microphone: "Microphone",
  "screen-video": "Screen video",
  screenshot: "Screenshot",
  "system-audio": "System audio",
};

type MenuPosition = {
  readonly x: number;
  readonly y: number;
};

type DragPointer = {
  readonly pointerId: number;
  readonly offsetX: number;
  readonly offsetY: number;
};

function getMenuSize(menuElement: HTMLDivElement | null): {
  readonly width: number;
  readonly height: number;
} {
  return {
    width: menuElement?.offsetWidth ?? DEFAULT_MENU_SIZE.width,
    height: menuElement?.offsetHeight ?? DEFAULT_MENU_SIZE.height,
  };
}

function clampMenuPosition(
  position: MenuPosition,
  size: {
    readonly width: number;
    readonly height: number;
  },
): MenuPosition {
  const maxX = Math.max(
    MENU_MARGIN,
    window.innerWidth - size.width - MENU_MARGIN,
  );
  const maxY = Math.max(
    MENU_MARGIN,
    window.innerHeight - size.height - MENU_MARGIN,
  );

  return {
    x: Math.min(Math.max(position.x, MENU_MARGIN), maxX),
    y: Math.min(Math.max(position.y, MENU_MARGIN), maxY),
  };
}

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

export default function App() {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const dragPointerRef = useRef<DragPointer | null>(null);
  const currentSessionRef = useRef<SessionSnapshot | null>(null);
  const platformLabel = useMemo(() => window.electronApp.platform, []);
  const shortcutLabel = useMemo(
    () => (platformLabel === "darwin" ? "Cmd+Shift+R" : "Ctrl+Shift+R"),
    [platformLabel],
  );
  const [currentSession, setCurrentSession] = useState<SessionSnapshot | null>(
    null,
  );
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({
    x: 32,
    y: 32,
  });
  const [feedbackMessage, setFeedbackMessage] = useState(
    "Ready to start a local recording session.",
  );
  const [isDragging, setIsDragging] = useState(false);
  const [isShortcutEnabled, setIsShortcutEnabled] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

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

  const isRecording = currentSession?.status === "active";
  const statusCopy = getStatusCopy(currentSession);
  const isBusy = isStarting || isStopping;

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

  const handleDragStart = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) {
        return;
      }

      const rect = menuRef.current?.getBoundingClientRect();

      if (!rect) {
        return;
      }

      dragPointerRef.current = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };
      setIsDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [],
  );

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
    if (!isDragging) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const dragPointer = dragPointerRef.current;

      if (!dragPointer || event.pointerId !== dragPointer.pointerId) {
        return;
      }

      setMenuPosition(
        clampMenuPosition(
          {
            x: event.clientX - dragPointer.offsetX,
            y: event.clientY - dragPointer.offsetY,
          },
          getMenuSize(menuRef.current),
        ),
      );
    };

    const stopDragging = (event: PointerEvent) => {
      const dragPointer = dragPointerRef.current;

      if (!dragPointer || event.pointerId !== dragPointer.pointerId) {
        return;
      }

      dragPointerRef.current = null;
      setIsDragging(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [isDragging]);

  useEffect(() => {
    const handleResize = () => {
      setMenuPosition((position) =>
        clampMenuPosition(position, getMenuSize(menuRef.current)),
      );
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

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
    <main className="dark min-h-screen bg-background text-foreground">
      <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,oklch(0.33_0.05_248)_0%,oklch(0.16_0.01_326)_55%,oklch(0.12_0.01_326)_100%)]">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_0%,oklch(1_0_0_/_0.04)_100%)]" />

        <section
          ref={menuRef}
          className="absolute w-[min(32rem,calc(100vw-3rem))]"
          style={{
            transform: `translate3d(${menuPosition.x}px, ${menuPosition.y}px, 0)`,
          }}
        >
          <Card
            size="sm"
            className="border border-border/60 bg-card/55 shadow-2xl backdrop-blur-xl"
          >
            <CardHeader className="border-b border-border/50">
              <CardAction className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className={cn(
                    "touch-none",
                    isDragging ? "cursor-grabbing" : "cursor-grab",
                  )}
                  onPointerDown={handleDragStart}
                >
                  Move menu
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="xs"
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
              </div>

              <CardTitle>Interview recording menu bar</CardTitle>
              <CardDescription>
                Floating session controls for start, stop, quit, and a
                toggleable {shortcutLabel} shortcut while the app is focused.
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

                <p className="text-sm text-muted-foreground">
                  {feedbackMessage}
                </p>
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
            </CardContent>

            <CardFooter className="justify-between gap-3 border-border/50">
              <p className="text-xs text-muted-foreground">
                {isShortcutEnabled
                  ? `${shortcutLabel} is enabled.`
                  : `${shortcutLabel} is disabled.`}
              </p>
              <p className="text-xs text-muted-foreground">
                {isDragging
                  ? "Dragging menu."
                  : "Drag the menu to reposition it."}
              </p>
            </CardFooter>
          </Card>
        </section>
      </div>
    </main>
  );
}
