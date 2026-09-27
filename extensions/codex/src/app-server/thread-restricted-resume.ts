import type { JsonObject } from "./protocol.js";
import type { CodexAppServerThreadBinding } from "./session-binding.js";
import { fingerprintRestrictedThreadConfig } from "./thread-fingerprints.js";
import { CodexRestrictedContinuationError } from "./thread-lifecycle-errors.js";
import type {
  CodexResumeThreadContext,
  CodexStartOrResumeThreadParams,
  CodexStartThreadContext,
} from "./thread-lifecycle-types.js";

export function resolveStrictRestrictedContinuation(options: {
  binding?: CodexAppServerThreadBinding;
  nativeCodeModeEnabled?: boolean;
  webSearchAllowed?: boolean;
  persistentWebSearchAllowed?: boolean;
  ringZeroActive: boolean;
}): boolean {
  // Persistently denied web search (a finite agent tool allowlist) is still a
  // restricted surface: its attested thread must never rotate silently either.
  const strict = Boolean(
    options.binding?.threadId &&
    options.binding.nativeToolPolicyRestricted === true &&
    options.binding.restrictedThreadConfigFingerprint !== undefined &&
    options.nativeCodeModeEnabled === false &&
    !options.ringZeroActive,
  );
  if (
    strict &&
    (options.binding?.pendingSupervisionBranch || options.binding?.pendingResumeConfiguration)
  ) {
    throw new CodexRestrictedContinuationError(
      "pending_native_transition",
      "Codex restricted continuation has a pending native transition; no thread was started",
    );
  }
  return strict;
}

export function assertRestrictedBindingMayBeCleared(
  strictRestrictedContinuation: boolean,
  incognito: boolean,
): void {
  if (strictRestrictedContinuation && !incognito) {
    throw new CodexRestrictedContinuationError(
      "binding_replace_denied",
      "Codex restricted continuation cannot replace its native binding; no thread was started",
    );
  }
}

export function classifyRestrictedBoundTurn(options: {
  binding: CodexAppServerThreadBinding;
  restrictedToolSurface: boolean;
  transientDelegationRestriction: boolean;
}): "resume" | "transient" {
  if (
    options.binding.nativeToolPolicyRestricted !== true ||
    !options.binding.restrictedThreadConfigFingerprint
  ) {
    return "transient";
  }
  if (!options.restrictedToolSurface || options.transientDelegationRestriction) {
    throw new CodexRestrictedContinuationError(
      "attestation_unavailable",
      "Codex restricted continuation lacks an attested compatible native thread; no thread was started",
    );
  }
  return "resume";
}

export function assertRestrictedThreadCanStartFresh(strictRestrictedContinuation: boolean): void {
  if (strictRestrictedContinuation) {
    throw new CodexRestrictedContinuationError(
      "binding_replace_denied",
      "Codex restricted continuation cannot start a separate native thread",
    );
  }
}

export function assertRestrictedThreadConfigFingerprint(
  params: CodexStartOrResumeThreadParams,
  context: CodexResumeThreadContext,
  request: JsonObject,
  authProfileId: string | undefined,
): void {
  if (!context.requireRestrictedThreadConfigFingerprint) {
    return;
  }
  const binding = context.binding;
  if (
    !context.restrictedToolSurface ||
    binding.nativeToolPolicyRestricted !== true ||
    params.nativeCodeModeEnabled !== false ||
    !binding.restrictedThreadConfigFingerprint
  ) {
    throw new CodexRestrictedContinuationError(
      "attestation_unavailable",
      "Codex restricted thread policy attestation is unavailable; no thread was started",
    );
  }
  const candidate = fingerprintRestrictedThreadConfig(
    request,
    authProfileId,
    context.dynamicToolsFingerprint,
    params.params,
    context.hostSystemAgentActive,
    context.environmentSelectionFingerprint,
  );
  if (candidate !== binding.restrictedThreadConfigFingerprint) {
    throw new CodexRestrictedContinuationError(
      "policy_changed",
      "Codex restricted thread policy changed; no thread was started",
    );
  }
}

export function buildRestrictedThreadConfigFingerprint(
  params: CodexStartOrResumeThreadParams,
  context: CodexStartThreadContext,
  request: JsonObject,
  modelProvider: string | undefined,
): string | undefined {
  if (!context.restrictedToolSurface || context.preserveExistingBinding) {
    return undefined;
  }
  return fingerprintRestrictedThreadConfig(
    { ...request, modelProvider: modelProvider ?? null },
    params.params.authProfileId,
    context.dynamicToolsFingerprint,
    params.params,
    context.hostSystemAgentActive,
    context.environmentSelectionFingerprint,
  );
}
