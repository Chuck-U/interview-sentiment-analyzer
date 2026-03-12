import type { ZodError } from "zod";

function formatIssuePath(path: readonly PropertyKey[]): string {
  if (path.length === 0) {
    return "value";
  }

  return path
    .map((segment) =>
      typeof segment === "number" ? `[${segment}]` : String(segment),
    )
    .join(".");
}

export function createPipelineValidationError(message: string): Error {
  const error = new Error(message);
  error.name = "PipelineValidationError";

  return error;
}

export function createMissingChunkIdError(eventType: string): Error {
  return createPipelineValidationError(`${eventType} events require a chunkId`);
}

export function createMissingArtifactKindsError(
  fieldName: string,
  missingKinds: readonly string[],
): Error {
  return createPipelineValidationError(
    `${fieldName} must include artifact kinds: ${missingKinds.join(", ")}`,
  );
}

export function createUnsupportedArtifactKindsError(
  fieldName: string,
  unsupportedKinds: readonly string[],
): Error {
  return createPipelineValidationError(
    `${fieldName} contains unsupported artifact kinds: ${unsupportedKinds.join(", ")}`,
  );
}

export function toPipelineValidationError(
  scope: string,
  error: ZodError,
): Error {
  const issues = error.issues
    .map((issue) => `${formatIssuePath(issue.path)}: ${issue.message}`)
    .join("; ");

  if (issues.length === 0) {
    return createPipelineValidationError(`${scope} is invalid`);
  }

  return createPipelineValidationError(`${scope} is invalid: ${issues}`);
}
