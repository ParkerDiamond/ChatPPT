export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNSUPPORTED_CONTENT"
  | "IO_ERROR";

export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(`${code}: ${message}`);
    this.name = "DomainError";
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, id: string) {
    super("NOT_FOUND", `${resource} '${id}' does not exist`, { resource, id });
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION_ERROR", message, details);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, details?: unknown) {
    super("CONFLICT", message, details);
  }
}
