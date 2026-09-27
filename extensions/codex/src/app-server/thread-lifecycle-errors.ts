import {
  AgentHarnessPreflightError,
  formatErrorMessage,
} from "openclaw/plugin-sdk/agent-harness-runtime";

export class CodexThreadStartRequestError extends Error {
  constructor(cause: unknown) {
    super(`thread/start: ${formatErrorMessage(cause)}`, { cause });
    this.name = "CodexThreadStartRequestError";
  }
}

export class CodexThreadClientReplacementError extends AgentHarnessPreflightError {
  constructor() {
    super(
      "Codex did not confirm unloading its previous configuration after a settled failure; a fresh client is required.",
    );
    this.name = "CodexThreadClientReplacementError";
  }
}

export type CodexRestrictedContinuationReason =
  | "policy_changed"
  | "attestation_unavailable"
  | "pending_native_transition"
  | "binding_replace_denied";

/** Fail-closed restricted continuation with a machine-readable reason. */
export class CodexRestrictedContinuationError extends Error {
  readonly code = "codex_restricted_continuation";
  readonly reason: CodexRestrictedContinuationReason;

  constructor(reason: CodexRestrictedContinuationReason, detail: string) {
    super(`codex_restricted_continuation:${reason}: ${detail}`);
    this.name = "CodexRestrictedContinuationError";
    this.reason = reason;
  }
}

export class CodexThreadBindingConflictError extends Error {
  constructor(threadId: string, operation: string) {
    super(`Codex thread binding changed while ${operation}: ${threadId}`);
    this.name = "CodexThreadBindingConflictError";
  }
}

export class CodexAdoptedThreadActiveError extends AgentHarnessPreflightError {
  constructor(
    message = "Codex session became active in another runner; wait for it to finish before continuing",
  ) {
    super(message);
    this.name = "CodexAdoptedThreadActiveError";
  }
}
