import type { Unsubscribe } from "./session-lifecycle";

export const WINDOW_ROLES = {
  launcher: "launcher",
  controls: "controls",
  options: "options",
  sandbox: "sandbox",
  questionBox: "question-box",
  speechBox: "speech-box",
} as const;

export type WindowRole = (typeof WINDOW_ROLES)[keyof typeof WINDOW_ROLES];

export type CardWindowRole = Exclude<WindowRole, "launcher">;

export function isCardWindowRole(value: string): value is CardWindowRole {
  return (
    value === WINDOW_ROLES.controls ||
    value === WINDOW_ROLES.options ||
    value === WINDOW_ROLES.sandbox ||
    value === WINDOW_ROLES.questionBox ||
    value === WINDOW_ROLES.speechBox
  );
}

export function parseWindowRoleFromHash(hash: string): WindowRole {
  const trimmed = hash.replace(/^#/, "").trim();
  if (
    trimmed === WINDOW_ROLES.launcher ||
    trimmed === WINDOW_ROLES.controls ||
    trimmed === WINDOW_ROLES.options ||
    trimmed === WINDOW_ROLES.sandbox
  ) {
    return trimmed;
  }

  return WINDOW_ROLES.launcher;
}

export const WINDOW_REGISTRY_CHANNELS = {
  getContext: "window-registry:get-context",
  getOpenState: "window-registry:get-open-state",
  openWindow: "window-registry:open-window",
  closeWindow: "window-registry:close-window",
  focusWindow: "window-registry:focus-window",
} as const;

export const WINDOW_REGISTRY_EVENT_CHANNELS = {
  openStateChanged: "window-registry:event-open-state-changed",
} as const;

export type CardWindowsOpenState = {
  readonly openIds: Record<CardWindowRole, boolean>;
};

export type WindowRegistryContext = {
  readonly role: WindowRole;
};

export type WindowRegistryBridge = {
  getContext(): Promise<WindowRegistryContext>;
  getOpenState(): Promise<CardWindowsOpenState>;
  openWindow(role: CardWindowRole): Promise<void>;
  closeWindow(role: CardWindowRole): Promise<void>;
  focusWindow(role: CardWindowRole): Promise<void>;
  onOpenStateChanged(listener: (state: CardWindowsOpenState) => void): Unsubscribe;
};
