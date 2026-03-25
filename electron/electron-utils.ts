import { clampWindowSize, WINDOW_CONTROL_EVENT_CHANNELS, type WindowBoundsSnapshot, type WindowSizePreset } from "@/shared/window-controls";
import { BrowserWindow, screen } from "electron";
import { MAIN_WINDOW_MIN_WIDTH, MAIN_WINDOW_MIN_HEIGHT, getWindowRole } from "./main";
import { WINDOW_ROLES } from "@/shared/window-registry";


export function createWindowBoundsSnapshot(
    window: BrowserWindow): WindowBoundsSnapshot {
    const bounds = window.getBounds();
    const [rawMinWidth, rawMinHeight] = window.getMinimumSize();
    const minWidth = rawMinWidth > 0 ? rawMinWidth : MAIN_WINDOW_MIN_WIDTH;
    const minHeight = rawMinHeight > 0 ? rawMinHeight : MAIN_WINDOW_MIN_HEIGHT;

    return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        minWidth,
        minHeight,
    };
}
export function getMinimumWindowSize(window: BrowserWindow): {
    readonly width: number;
    readonly height: number;
} {
    const [rawMinWidth, rawMinHeight] = window.getMinimumSize();

    return {
        width: rawMinWidth > 0 ? rawMinWidth : MAIN_WINDOW_MIN_WIDTH,
        height: rawMinHeight > 0 ? rawMinHeight : MAIN_WINDOW_MIN_HEIGHT,
    };
}
export function getWindowSizeForPreset(
    window: BrowserWindow,
    preset: WindowSizePreset): {
        readonly width: number;
        readonly height: number;
    } {
    const display = screen.getDisplayMatching(window.getBounds());
    const { width: workAreaWidth, height: workAreaHeight } = display.workAreaSize;
    const minimumSize = getMinimumWindowSize(window);
    const [, currentHeight] = window.getSize();
    const isLauncher = getWindowRole(window) === WINDOW_ROLES.launcher;

    const widthRatio = preset === "50%" ? 0.5 : preset === "75%" ? 0.75 : 0.9;

    if (isLauncher) {
        return clampWindowSize(
            {
                width: Math.round(workAreaWidth * widthRatio),
                height: currentHeight,
            },
            minimumSize
        );
    }

    switch (preset) {
        case "50%":
            return clampWindowSize(
                {
                    width: Math.round(workAreaWidth * 0.5),
                    height: Math.round(workAreaHeight * 0.5),
                },
                minimumSize
            );
        case "75%":
            return clampWindowSize(
                {
                    width: Math.round(workAreaWidth * 0.75),
                    height: Math.round(workAreaHeight * 0.75),
                },
                minimumSize
            );
        case "90%":
            return clampWindowSize(
                {
                    width: Math.round(workAreaWidth * 0.9),
                    height: Math.round(workAreaHeight * 0.9),
                },
                minimumSize
            );
        default: {
            const parsed = Number.parseFloat(preset);
            const ratio = Number.isFinite(parsed)
                ? Math.min(0.95, Math.max(0.1, parsed / 100))
                : 0.75;
            return clampWindowSize(
                {
                    width: Math.round(workAreaWidth * ratio),
                    height: Math.round(workAreaHeight * ratio),
                },
                minimumSize
            );
        }
    }
}
export function getClampedWindowPositionForSize(
    window: BrowserWindow,
    size: {
        readonly width: number;
        readonly height: number;
    }): {
        readonly x: number;
        readonly y: number;
    } {
    const display = screen.getDisplayMatching(window.getBounds());
    const { x, y, width, height } = display.workArea;
    const [currentX, currentY] = window.getPosition();
    const maxX = Math.max(x, x + width - size.width);
    const maxY = Math.max(y, y + height - size.height);

    return {
        x: Math.min(Math.max(currentX, x), maxX),
        y: Math.min(Math.max(currentY, y), maxY),
    };
}
function getClampedPositionWithinBounds(
    bounds: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    },
    size: {
        readonly width: number;
        readonly height: number;
    },
    preferredPosition: {
        readonly x: number;
        readonly y: number;
    }
): {
    readonly x: number;
    readonly y: number;
} {
    const maxX = Math.max(bounds.x, bounds.x + bounds.width - size.width);
    const maxY = Math.max(bounds.y, bounds.y + bounds.height - size.height);

    return {
        x: Math.min(Math.max(preferredPosition.x, bounds.x), maxX),
        y: Math.min(Math.max(preferredPosition.y, bounds.y), maxY),
    };
}
export function applyOptionsWindowOpenBounds(
    window: BrowserWindow,
    anchorBounds?: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    }): void {
    const display = screen.getDisplayMatching(
        anchorBounds ?? window.getBounds()
    );
    const minimumSize = getMinimumWindowSize(window);
    const targetSize = clampWindowSize(
        {
            width: 560,
            height: 640,
        },
        minimumSize
    );
    const targetPosition = getClampedPositionWithinBounds(
        display.bounds,
        targetSize,
        anchorBounds
            ? {
                x: anchorBounds.x,
                y: anchorBounds.y + 100,
            }
            : {
                x: display.bounds.x,
                y: display.bounds.y,
            }
    );

    window.setBounds({
        x: targetPosition.x,
        y: targetPosition.y,
        width: targetSize.width,
        height: targetSize.height,
    });
}
export function publishWindowBounds(window: BrowserWindow): void {
    if (window.isDestroyed()) {
        return;
    }
    const contents = window.webContents;
    if (contents.isDestroyed()) {
        return;
    }
    try {
        contents.send(
            WINDOW_CONTROL_EVENT_CHANNELS.boundsChanged,
            createWindowBoundsSnapshot(window)
        );
    } catch {
        // Ignore if the window is tearing down.
    }
}

