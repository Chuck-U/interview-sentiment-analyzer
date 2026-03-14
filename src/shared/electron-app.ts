import type { AppControlsBridge } from "./app-controls";
import type {
  SessionLifecycleBridge,
  SessionLifecycleEventsBridge,
} from "./session-lifecycle";

export type ElectronAppBridge = {
  readonly platform: NodeJS.Platform;
  readonly sessionLifecycle: SessionLifecycleBridge;
  readonly sessionLifecycleEvents: SessionLifecycleEventsBridge;
  readonly appControls: AppControlsBridge;
};
