import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_CAPTURE_OPTIONS_CONFIG,
  type CaptureOptionsConfig,
} from "../../shared/capture-options";
import {
  loadCaptureOptionsBundle,
  normalizeDeviceInfosToSnapshots,
} from "../../shared/capture-options-load";
import {
  cloneSessionSnapshot,
  shouldAcceptIncomingSession,
} from "../../shared/session-incoming-sync";
import type { SessionSnapshot } from "../../shared/session-lifecycle";
import viewsReducer, {
  closeView,
  openView,
  setActiveView,
  toggleView,
} from "../../renderer/store/slices/viewsSlice";

function sessionFixture(
  overrides: Partial<SessionSnapshot> = {},
): SessionSnapshot {
  const storageLayout = {
    appDataRoot: "/a",
    sessionRoot: "/a/s",
    chunksRoot: "/a/c",
    recordingsRoot: "/a/r",
    transcriptsRoot: "/a/t",
    summariesRoot: "/a/su",
    tempRoot: "/a/tmp",
  };

  return {
    id: "session-1",
    status: "active",
    captureSources: ["microphone"],
    startedAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    storageLayout,
    ...overrides,
  };
}

test("shouldAcceptIncomingSession rejects stale non-active session id change", () => {
  const previous = sessionFixture({ id: "a", status: "active" });
  const incoming = sessionFixture({ id: "b", status: "finalizing" });

  assert.equal(shouldAcceptIncomingSession(previous, incoming), false);
});

test("shouldAcceptIncomingSession accepts active session even when id changes", () => {
  const previous = sessionFixture({ id: "a", status: "active" });
  const incoming = sessionFixture({ id: "b", status: "active" });

  assert.equal(shouldAcceptIncomingSession(previous, incoming), true);
});

test("cloneSessionSnapshot deep-copies captureSources and storageLayout", () => {
  const session = sessionFixture();
  const clone = cloneSessionSnapshot(session);

  assert.notEqual(clone.captureSources, session.captureSources);
  assert.notEqual(clone.storageLayout, session.storageLayout);
  assert.deepEqual(clone.captureSources, session.captureSources);
});

test("normalizeDeviceInfosToSnapshots maps audio/video devices", () => {
  const snapshots = normalizeDeviceInfosToSnapshots([
    {
      kind: "audioinput",
      deviceId: "m1",
      label: "",
      groupId: "g",
    },
    {
      kind: "videoinput",
      deviceId: "v1",
      label: "Cam",
    },
  ]);

  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[0]?.kind, "audioinput");
  assert.equal(snapshots[0]?.isDefault, true);
  assert.equal(snapshots[1]?.isDefault, true);
});

test("loadCaptureOptionsBundle reconciles and persists when drifted", async () => {
  const base: CaptureOptionsConfig = {
    ...DEFAULT_CAPTURE_OPTIONS_CONFIG,
    microphone: {
      ...DEFAULT_CAPTURE_OPTIONS_CONFIG.microphone,
      deviceId: "missing",
    },
  };

  let savedConfig = base;
  const result = await loadCaptureOptionsBundle({
    getConfig: async () => savedConfig,
    getPermissions: async () => ({
      microphone: "granted",
      camera: "granted",
      screen: "granted",
      systemAudio: "granted",
    }),
    listDisplays: async () => [
      {
        displayId: "1",
        label: "Main",
        isPrimary: true,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        sourceId: "s1",
      },
    ],
    enumerateDevices: async () => [
      {
        kind: "audioinput",
        deviceId: "mic-a",
        label: "Mic A",
      },
    ],
    setConfig: async (config) => {
      savedConfig = config;
      return config;
    },
  });

  assert.equal(result.devices[0]?.deviceId, "mic-a");
  assert.notEqual(result.config.microphone.deviceId, "missing");
});

test("viewsReducer toggles and tracks open windows", () => {
  let state = viewsReducer(undefined, { type: "@@INIT" });

  state = viewsReducer(state, closeView("controls"));
  assert.equal(state.openWindowIds.controls, false);

  state = viewsReducer(state, openView("controls"));
  assert.equal(state.openWindowIds.controls, true);

  state = viewsReducer(state, openView("options"));
  assert.equal(state.openWindowIds.options, true);
  state = viewsReducer(state, toggleView("options"));
  assert.equal(state.openWindowIds.options, false);

  state = viewsReducer(state, setActiveView("options"));
  assert.equal(state.activeView, "options");
});
