import { isRecord, parseFiniteInteger } from "@/backend/guards/checks";
import type { Unsubscribe } from "./session-lifecycle";

export const WINDOW_CONTROL_CHANNELS = {
  moveWindowBy: "window-controls:move-window-by",
  resizeWindowBy: "window-controls:resize-window-by",
  setWindowSize: "window-controls:set-window-size",
  setWindowSizePreset: "window-controls:set-window-size-preset",
  getWindowBounds: "window-controls:get-window-bounds",
  getAlwaysOnTop: "window-controls:get-always-on-top",
  setAlwaysOnTop: "window-controls:set-always-on-top",
  getPinned: "window-controls:get-pinned",
  setPinned: "window-controls:set-pinned",
  bringToFront: "window-controls:bring-to-front",
  sendToBack: "window-controls:send-to-back",
  toggleDeveloperTools: "window-controls:toggle-developer-tools",
} as const;

export const WINDOW_CONTROL_EVENT_CHANNELS = {
  boundsChanged: "window-controls:event-bounds-changed",
  alwaysOnTopChanged: "window-controls:event-always-on-top-changed",
  pinnedChanged: "window-controls:event-pinned-changed",
  borderPingFlash: "window-controls:event-border-ping-flash",
} as const;

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

export type MoveWindowToRequest = {
  readonly x: number;
  readonly y: number;
  readonly screenId?: string;
};

export type ResizeWindowByRequest = {
  readonly deltaWidth: number;
  readonly deltaHeight: number;
};

export type SetWindowSizeRequest = {
  readonly width: number;
  readonly height: number;
};

export function WindowPresetUtil<T extends number>(value: T): `${T}%` {
  return `${value}%`
};
type WindowPresetUtilType = ReturnType<typeof WindowPresetUtil>;

export type WindowSizePreset = "50%" | "75%" | "90%" | WindowPresetUtilType;

export type SetWindowSizePresetRequest = {
  readonly preset: WindowSizePreset;
};

export type SetAlwaysOnTopRequest = {
  readonly alwaysOnTop: boolean;
};

export type SetPinnedRequest = {
  readonly pinned: boolean;
};

export type WindowControlsBridge = {
  toggleDeveloperTools(): void;
  moveWindowBy(request: MoveWindowByRequest): void;
  resizeWindowBy(request: ResizeWindowByRequest): void;
  setWindowSize(request: SetWindowSizeRequest): Promise<WindowBoundsSnapshot>;
  setWindowSizePreset(
    request: SetWindowSizePresetRequest,
  ): Promise<WindowBoundsSnapshot>;
  getWindowBounds(): Promise<WindowBoundsSnapshot>;
  getAlwaysOnTop(): Promise<boolean>;
  setAlwaysOnTop(request: SetAlwaysOnTopRequest): Promise<boolean>;
  getPinned(): Promise<boolean>;
  setPinned(request: SetPinnedRequest): Promise<boolean>;
  onWindowBoundsChanged(
    listener: (bounds: WindowBoundsSnapshot) => void,
  ): Unsubscribe;
  onAlwaysOnTopChanged(listener: (alwaysOnTop: boolean) => void): Unsubscribe;
  onPinnedChanged(listener: (pinned: boolean) => void): Unsubscribe;
  onBorderPingFlash(listener: () => void): Unsubscribe;
  bringToFront(): void;
  sendToBack(): void;
  // moveWindowTo(request: MoveWindowToRequest): Promise<void>;
};

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

export function parseSetWindowSizeRequest(
  input: unknown,
): SetWindowSizeRequest {
  if (!isRecord(input)) {
    throw new Error("setWindowSize request must be an object");
  }

  return {
    width: parseFiniteInteger(input.width, "width"),
    height: parseFiniteInteger(input.height, "height"),
  };
}

export function parseSetWindowSizePresetRequest(
  input: unknown,
): SetWindowSizePresetRequest {
  if (!isRecord(input)) {
    throw new Error("setWindowSizePreset request must be an object");
  }

  const { preset } = input;
  if (typeof preset !== "string" ||
    isNaN(parseInt(preset)) || parseInt(preset) < 20 || parseInt(preset) > 100
  ) {
    throw new Error("preset must be a number between 20 and 100");
  }

  return { preset: preset as WindowSizePreset };
}

export function parseSetAlwaysOnTopRequest(
  input: unknown,
): SetAlwaysOnTopRequest {
  if (!isRecord(input)) {
    throw new Error("setAlwaysOnTop request must be an object");
  }

  if (typeof input.alwaysOnTop !== "boolean") {
    throw new Error("alwaysOnTop must be a boolean");
  }

  return { alwaysOnTop: input.alwaysOnTop };
}

export function parseSetPinnedRequest(
  input: unknown,
): SetPinnedRequest {
  if (!isRecord(input)) {
    throw new Error("setPinned request must be an object");
  }

  if (typeof input.pinned !== "boolean") {
    throw new Error("pinned must be a boolean");
  }

  return { pinned: input.pinned };
}

type WindowSizeSnapshot = {
  readonly width: number;
  readonly height: number;
};

export function clampWindowSize(
  size: WindowSizeSnapshot,
  minimumSize: WindowSizeSnapshot,
): WindowSizeSnapshot {
  return {
    width: Math.max(size.width, minimumSize.width),
    height: Math.max(size.height, minimumSize.height),
  };
}

export function applyResizeWindowByRequest(
  currentSize: WindowSizeSnapshot,
  minimumSize: WindowSizeSnapshot,
  request: ResizeWindowByRequest,
): WindowSizeSnapshot {
  return clampWindowSize(
    {
      width: currentSize.width + request.deltaWidth,
      height: currentSize.height + request.deltaHeight,
    },
    minimumSize,
  );
}
