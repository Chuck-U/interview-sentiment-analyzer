export const WINDOW_CONTROL_CHANNELS = {
  moveWindowBy: "window-controls:move-window-by",
  resizeWindowBy: "window-controls:resize-window-by",
  getWindowBounds: "window-controls:get-window-bounds",
} as const;

export const WINDOW_CONTROL_EVENT_CHANNELS = {
  boundsChanged: "window-controls:event-bounds-changed",
} as const;

export type Unsubscribe = () => void;

export type WindowBoundsSnapshot = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly minWidth: number;
  readonly minHeight: number;
};

export type MoveWindowByRequest = {
  readonly deltaX: number;
  readonly deltaY: number;
};

export type ResizeWindowByRequest = {
  readonly deltaWidth: number;
  readonly deltaHeight: number;
};

export type WindowControlsBridge = {
  moveWindowBy(request: MoveWindowByRequest): void;
  resizeWindowBy(request: ResizeWindowByRequest): void;
  getWindowBounds(): Promise<WindowBoundsSnapshot>;
  onWindowBoundsChanged(
    listener: (bounds: WindowBoundsSnapshot) => void,
  ): Unsubscribe;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseFiniteInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`);
  }

  return Math.round(value);
}

export function parseMoveWindowByRequest(input: unknown): MoveWindowByRequest {
  if (!isRecord(input)) {
    throw new Error("moveWindowBy request must be an object");
  }

  return {
    deltaX: parseFiniteInteger(input.deltaX, "deltaX"),
    deltaY: parseFiniteInteger(input.deltaY, "deltaY"),
  };
}

export function parseResizeWindowByRequest(
  input: unknown,
): ResizeWindowByRequest {
  if (!isRecord(input)) {
    throw new Error("resizeWindowBy request must be an object");
  }

  return {
    deltaWidth: parseFiniteInteger(input.deltaWidth, "deltaWidth"),
    deltaHeight: parseFiniteInteger(input.deltaHeight, "deltaHeight"),
  };
}
