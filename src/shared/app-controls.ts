export const APP_CONTROL_CHANNELS = {
  bringToFront: "app-controls:bring-to-front",
  sendToBack: "app-controls:send-to-back",
  closeApplication: "app-controls:close-application",
  toggleVisibility: "app-controls:toggle-visibility",
} as const;

export type AppControlsBridge = {
  closeApplication(): Promise<void>;
  toggleVisibility(): Promise<void>;
};
