/// <reference types="vite/client" />

import type { ElectronAppBridge } from "../shared/electron-app";

declare global {
  interface Window {
    electronApp: ElectronAppBridge;
  }
}

export {};
