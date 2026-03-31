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

export const CARD_WINDOW_ROLES: readonly CardWindowRole[] = [
  WINDOW_ROLES.controls,
  WINDOW_ROLES.options,
  WINDOW_ROLES.sandbox,
  WINDOW_ROLES.questionBox,
  WINDOW_ROLES.speechBox,
] as const;

export function isCardWindowRole(value: string): value is CardWindowRole {
  return (CARD_WINDOW_ROLES as readonly string[]).includes(value);
}

export function isKnownWindowRole(value: string): value is WindowRole {
  return value === WINDOW_ROLES.launcher || isCardWindowRole(value);
}

export function parseWindowRoleFromHash(hash: string): WindowRole {
  const trimmed = hash.replace(/^#/, "").trim();
  if (isKnownWindowRole(trimmed)) {
    return trimmed;
  }
  return WINDOW_ROLES.launcher;
}
