import type { AppControlsBridge } from "./app-controls";
import type { CaptureOptionsBridge } from "./capture-options";
import type { RecordingBridge, RecordingEventsBridge } from "./recording";
import type {
  SessionLifecycleBridge,
  SessionLifecycleEventsBridge,
} from "./session-lifecycle";
import type { ShortcutsBridge } from "./shortcuts";
import type { WindowControlsBridge } from "./window-controls";
import type { WindowRegistryBridge } from "./window-registry";

export type ElectronAppBridge = {
  readonly platform: NodeJS.Platform;
  readonly sessionLifecycle: SessionLifecycleBridge;
  readonly sessionLifecycleEvents: SessionLifecycleEventsBridge;
  readonly recording: RecordingBridge;
  readonly recordingEvents: RecordingEventsBridge;
  readonly captureOptions: CaptureOptionsBridge;
  readonly appControls: AppControlsBridge;
  readonly windowControls: WindowControlsBridge;
  readonly shortcuts: ShortcutsBridge;
  readonly windowRegistry: WindowRegistryBridge;
};
