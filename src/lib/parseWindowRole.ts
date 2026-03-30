import {
  WINDOW_ROLES,
  type WindowRole,
  parseWindowRoleFromHash,
} from "@/shared/window-registry";

export function parseWindowRoleFromLocation(): WindowRole {
  if (typeof window === "undefined") {
    return WINDOW_ROLES.launcher;
  }

  return parseWindowRoleFromHash(window.location.hash);
}
