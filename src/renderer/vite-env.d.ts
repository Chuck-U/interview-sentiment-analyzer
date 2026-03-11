/// <reference types="vite/client" />

import type { ElectronAppBridge } from "../shared/session-lifecycle";

declare global {
  interface Window {
    electronApp: ElectronAppBridge;
  }
}

export {};
