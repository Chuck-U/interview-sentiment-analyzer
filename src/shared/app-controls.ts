export const APP_CONTROL_CHANNELS = {
  closeApplication: "app-controls:close-application",
} as const;

export type AppControlsBridge = {
  closeApplication(): Promise<void>;
};
