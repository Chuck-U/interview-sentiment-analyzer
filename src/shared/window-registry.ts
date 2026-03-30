import type { Unsubscribe } from "./session-lifecycle";
import type { CardWindowRole, WindowRole } from "./window-roles";

export {
  WINDOW_ROLES,
  CARD_WINDOW_ROLES,
  type WindowRole,
  type CardWindowRole,
  isCardWindowRole,
  isKnownWindowRole,
  parseWindowRoleFromHash,
} from "./window-roles";

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
