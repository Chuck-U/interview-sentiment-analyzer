import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  ResizeWindowByRequest,
  WindowBoundsSnapshot,
} from "@/shared/window-controls";
import { RiDragMove2Line } from "@remixicon/react";

type WindowResizeControlProps = {
  readonly activeInteraction: "move" | "resize" | null;
  readonly windowBounds: WindowBoundsSnapshot | null;
  readonly onResizeStart: (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  readonly onResizeByDelta: (
    request: ResizeWindowByRequest,
  ) => Promise<WindowBoundsSnapshot>;
};

type ContextMenuPosition = {
  readonly x: number;
  readonly y: number;
};

function parseDeltaInput(
  rawValue: string,
  fieldLabel: string,
): number {
  const trimmedValue = rawValue.trim();

  if (trimmedValue.length === 0) {
    return 0;
  }

  const parsedValue = Number(trimmedValue);
  if (!Number.isFinite(parsedValue)) {
    throw new Error(`${fieldLabel} must be a valid number.`);
  }

  return Math.round(parsedValue);
}

export function WindowResizeControl({
  activeInteraction,
  windowBounds,
  onResizeStart,
  onResizeByDelta,
}: WindowResizeControlProps) {
  const [contextMenuPosition, setContextMenuPosition] =
    useState<ContextMenuPosition | null>(null);
  const [deltaX, setDeltaX] = useState("0");
  const [deltaY, setDeltaY] = useState("0");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!contextMenuPosition) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) {
        return;
      }

      setContextMenuPosition(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenuPosition(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenuPosition]);

  const previewSize = useMemo(() => {
    if (!windowBounds) {
      return null;
    }

    let parsedDeltaX = 0;
    let parsedDeltaY = 0;

    try {
      parsedDeltaX = parseDeltaInput(deltaX, "X delta");
      parsedDeltaY = parseDeltaInput(deltaY, "Y delta");
    } catch {
      return null;
    }

    return {
      width: Math.max(windowBounds.width + parsedDeltaX, windowBounds.minWidth),
      height: Math.max(windowBounds.height + parsedDeltaY, windowBounds.minHeight),
    };
  }, [deltaX, deltaY, windowBounds]);

  const handleContextMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const menuWidth = 240;
    const menuHeight = 220;
    const maxX = Math.max(window.innerWidth - menuWidth, 12);
    const maxY = Math.max(window.innerHeight - menuHeight, 12);

    setContextMenuPosition({
      x: Math.min(event.clientX, maxX),
      y: Math.min(event.clientY, maxY),
    });
    setErrorMessage(null);
  };

  const handleApply = async () => {
    try {
      const nextDeltaX = parseDeltaInput(deltaX, "X delta");
      const nextDeltaY = parseDeltaInput(deltaY, "Y delta");

      if (nextDeltaX === 0 && nextDeltaY === 0) {
        setErrorMessage("Enter a non-zero X or Y delta.");
        return;
      }

      setIsSubmitting(true);
      setErrorMessage(null);
      await onResizeByDelta({
        deltaWidth: nextDeltaX,
        deltaHeight: nextDeltaY,
      });
      setContextMenuPosition(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to resize window.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
    >
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onPointerDown={onResizeStart}
        onContextMenu={handleContextMenu}
        className="touch-none"
        aria-label="Resize window. Right-click for numeric resize."
        title="Drag to resize. Right-click for numeric X/Y resize."
      >
        <RiDragMove2Line className="size-4" />
      </Button>

      {activeInteraction === "resize" ? (
        <span className="pointer-events-none absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground">
          Resizing
        </span>
      ) : null}

      {contextMenuPosition ? (
        <div
          className="fixed z-[90] w-60 border border-border/70 bg-popover/95 p-3 text-xs text-popover-foreground shadow-lg backdrop-blur-md"
          style={{
            left: contextMenuPosition.x,
            top: contextMenuPosition.y,
            WebkitAppRegion: "no-drag",
          } as CSSProperties}
        >
          <div className="flex flex-col gap-1">
            <p className="font-medium">Resize window</p>
            <p className="text-muted-foreground">
              Positive values expand. Negative values shrink.
            </p>
          </div>

          <div className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">X delta</span>
              <Input
                type="number"
                step="1"
                value={deltaX}
                onChange={(event) => setDeltaX(event.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">Y delta</span>
              <Input
                type="number"
                step="1"
                value={deltaY}
                onChange={(event) => setDeltaY(event.target.value)}
              />
            </label>
          </div>

          {windowBounds ? (
            <div className="mt-3 flex flex-col gap-1 text-[11px] text-muted-foreground">
              <span>
                Current: {windowBounds.width} x {windowBounds.height}
              </span>
              <span>
                Minimum: {windowBounds.minWidth} x {windowBounds.minHeight}
              </span>
              {previewSize ? (
                <span>
                  Result: {previewSize.width} x {previewSize.height}
                </span>
              ) : null}
            </div>
          ) : null}

          {errorMessage ? (
            <p className="mt-3 text-[11px] text-destructive">{errorMessage}</p>
          ) : null}

          <div className="mt-3 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setContextMenuPosition(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="xs"
              disabled={isSubmitting}
              onClick={() => {
                void handleApply();
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
