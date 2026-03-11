/// <reference types="vite/client" />

declare global {
  interface Window {
    electronApp: {
      platform: NodeJS.Platform;
    };
  }
}

export {};
