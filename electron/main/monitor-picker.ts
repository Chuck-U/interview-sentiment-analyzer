import { BrowserWindow, ipcMain, screen } from "electron";
type MonitorPickerSelectionChangedHandler = (displayId?: string) => void;

type MonitorPickerController = {
  open(args: { readonly selectedDisplayId?: string }): Promise<string | undefined>;
  close(): void;
  isOpen(): boolean;
};

type PointerEventPayload = {
  readonly phase: "pointerdown" | "pointermove" | "pointerup" | "pointercancel";
  readonly displayId: string;
  readonly screenX: number;
  readonly screenY: number;
};


const POINTER_EVENT_CHANNEL = "capture-options:monitor-picker:pointer";
const WINDOW_STATE_CHANNEL = "capture-options:monitor-picker:state";
const ESCAPE_CHANNEL = "capture-options:monitor-picker:escape";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildOverlayHtml(displayId: string, label: string): string {
  const safeDisplayId = escapeHtml(displayId);
  const safeLabel = escapeHtml(label);

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Monitor Picker</title>
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: transparent;
      }

      body {
        position: relative;
        cursor: grab;
        user-select: none;
        font-family: "Segoe UI", sans-serif;
      }

      body[data-dragging="true"] {
        cursor: grabbing;
      }

      .frame {
        position: absolute;
        inset: 8px;
        border: 4px dashed rgba(148, 163, 184, 0.7);
        outline: 2px solid transparent;
        transition: border-color 120ms ease, outline-color 120ms ease, background 120ms ease;
        background: rgba(15, 23, 42, 0.08);
      }

      body[data-selected="true"] .frame {
        border-color: rgba(96, 165, 250, 0.95);
        outline-color: rgba(96, 165, 250, 0.45);
        background: rgba(96, 165, 250, 0.12);
      }

      .badge {
        position: absolute;
        top: 16px;
        left: 16px;
        padding: 8px 10px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(15, 23, 42, 0.8);
        color: #f8fafc;
        font-size: 12px;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }

      .hint {
        position: absolute;
        right: 16px;
        bottom: 16px;
        padding: 8px 10px;
        background: rgba(15, 23, 42, 0.8);
        color: #cbd5e1;
        font-size: 12px;
      }
    </style>
  </head>
  <body data-display-id="${safeDisplayId}">
    <div class="frame"></div>
    <div class="badge">${safeLabel}</div>
    <div class="hint">Drag to another monitor and release to select</div>
    <script>
      const { ipcRenderer } = require("electron");
      const displayId = document.body.dataset.displayId;
      let dragging = false;

      function sendPointer(phase, event) {
        ipcRenderer.send("${POINTER_EVENT_CHANNEL}", {
          phase,
          displayId,
          screenX: event.screenX,
          screenY: event.screenY,
        });
      }

      ipcRenderer.on("${WINDOW_STATE_CHANNEL}", (_event, payload) => {
        document.body.dataset.selected = String(payload.selectedDisplayId === displayId);
        document.body.dataset.dragging = String(Boolean(payload.dragging));
      });

      window.addEventListener("pointerdown", (event) => {
        dragging = true;
        sendPointer("pointerdown", event);
      });

      window.addEventListener("pointermove", (event) => {
        if (!dragging) {
          return;
        }

        sendPointer("pointermove", event);
      });

      function stopDragging(phase, event) {
        if (!dragging) {
          return;
        }

        dragging = false;
        sendPointer(phase, event);
      }

      window.addEventListener("pointerup", (event) => stopDragging("pointerup", event));
      window.addEventListener("pointercancel", (event) => stopDragging("pointercancel", event));
      window.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          ipcRenderer.send("${ESCAPE_CHANNEL}");
        }
      });
    </script>
  </body>
</html>`;
}

export function createMonitorPickerController(args: {
  readonly onSelectionChanged: MonitorPickerSelectionChangedHandler;
}): MonitorPickerController {
  const overlayWindows = new Map<string, BrowserWindow>();
  let initialDisplayId: string | undefined;
  let selectedDisplayId: string | undefined;
  let isDragging = false;
  let resolvePendingOpen:
    | ((displayId: string | undefined) => void)
    | undefined;

  function settlePendingOpen(displayId: string | undefined): void {
    resolvePendingOpen?.(displayId);
    resolvePendingOpen = undefined;
  }

  function broadcastState(): void {
    for (const window of overlayWindows.values()) {
      window.webContents.send(WINDOW_STATE_CHANNEL, {
        selectedDisplayId,
        dragging: isDragging,
      });
    }
  }

  function updateSelectedDisplay(nextDisplayId: string | undefined): void {
    selectedDisplayId = nextDisplayId;
    broadcastState();
  }

  function commitSelectedDisplay(nextDisplayId: string | undefined): void {
    selectedDisplayId = nextDisplayId;
    args.onSelectionChanged(selectedDisplayId);
    broadcastState();
  }

  function resolveDisplayIdAtPoint(x: number, y: number): string | undefined {
    const display = screen.getDisplayNearestPoint({
      x: Math.round(x),
      y: Math.round(y),
    });

    return display ? String(display.id) : undefined;
  }

  function close(resolvedDisplayId: string | undefined = initialDisplayId): void {
    for (const window of overlayWindows.values()) {
      window.removeAllListeners("closed");
      window.close();
    }

    overlayWindows.clear();
    isDragging = false;
    settlePendingOpen(resolvedDisplayId);
  }

  ipcMain.removeAllListeners(POINTER_EVENT_CHANNEL);
  ipcMain.on(
    POINTER_EVENT_CHANNEL,
    (_event, payload: PointerEventPayload) => {
      if (!overlayWindows.size) {
        return;
      }

      const hoveredDisplayId = resolveDisplayIdAtPoint(
        payload.screenX,
        payload.screenY,
      );

      if (payload.phase === "pointerdown") {
        isDragging = true;
        updateSelectedDisplay(hoveredDisplayId ?? payload.displayId);
        return;
      }

      if (payload.phase === "pointermove" && isDragging) {
        updateSelectedDisplay(hoveredDisplayId ?? payload.displayId);
        return;
      }

      if (payload.phase === "pointerup" && isDragging) {
        isDragging = false;
        const nextDisplayId = hoveredDisplayId ?? payload.displayId;
        commitSelectedDisplay(nextDisplayId);
        close(nextDisplayId);
        return;
      }

      if (payload.phase === "pointercancel" && isDragging) {
        isDragging = false;
        updateSelectedDisplay(initialDisplayId);
        close(initialDisplayId);
      }
    },
  );

  ipcMain.removeAllListeners(ESCAPE_CHANNEL);
  ipcMain.on(ESCAPE_CHANNEL, () => {
    updateSelectedDisplay(initialDisplayId);
    close(initialDisplayId);
  });

  return {
    open({ selectedDisplayId: requestedDisplayId }) {
      close();

      const displays = screen.getAllDisplays();
      initialDisplayId =
        requestedDisplayId ??
        (displays.length > 0 ? String(displays[0].id) : undefined);
      selectedDisplayId = initialDisplayId;

      if (displays.length === 0) {
        return Promise.resolve(undefined);
      }

      const pendingOpen = new Promise<string | undefined>((resolve) => {
        resolvePendingOpen = resolve;
      });

      for (const display of displays) {
        const displayId = String(display.id);
        const overlayWindow = new BrowserWindow({
          x: display.bounds.x,
          y: display.bounds.y,
          width: display.bounds.width,
          height: display.bounds.height,
          frame: false,
          transparent: true,
          resizable: false,
          movable: false,
          minimizable: false,
          maximizable: false,
          focusable: true,
          skipTaskbar: true,
          fullscreenable: false,
          hasShadow: false,
          alwaysOnTop: true,
          roundedCorners: false,
          webPreferences: {
            contextIsolation: false,
            nodeIntegration: true,
            sandbox: false,
          },
        });

        overlayWindow.setVisibleOnAllWorkspaces(true, {
          visibleOnFullScreen: true,
        });
        overlayWindow.setAlwaysOnTop(true, "torn-off-menu");
        overlayWindow.loadURL(
          `data:text/html;charset=utf-8,${encodeURIComponent(
            buildOverlayHtml(displayId, display.label || `Display ${displayId}`),
          )}`,
        );
        overlayWindow.on("closed", () => {
          overlayWindows.delete(displayId);
        });

        overlayWindows.set(displayId, overlayWindow);
      }

      broadcastState();
      return pendingOpen;
    },
    close,
    isOpen() {
      return overlayWindows.size > 0;
    },
  };
}
