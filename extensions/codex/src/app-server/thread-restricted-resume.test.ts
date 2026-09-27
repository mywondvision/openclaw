import { describe, expect, it } from "vitest";
import type { CodexAppServerThreadBinding } from "./session-binding.js";
import { CodexRestrictedContinuationError } from "./thread-lifecycle-errors.js";
import {
  assertRestrictedBindingMayBeCleared,
  assertRestrictedThreadCanStartFresh,
  classifyRestrictedBoundTurn,
  resolveStrictRestrictedContinuation,
} from "./thread-restricted-resume.js";

const attested = {
  threadId: "thread-restricted",
  cwd: "/workspace",
  nativeToolPolicyRestricted: true,
  restrictedThreadConfigFingerprint: "fingerprint",
} as CodexAppServerThreadBinding;

function reasonOf(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(CodexRestrictedContinuationError);
    const typed = error as CodexRestrictedContinuationError;
    expect(typed.code).toBe("codex_restricted_continuation");
    expect(typed.message.startsWith(`codex_restricted_continuation:${typed.reason}: `)).toBe(true);
    return typed.reason;
  }
  return undefined;
}

describe("restricted continuation reasons", () => {
  const strict = { nativeCodeModeEnabled: false, ringZeroActive: false };

  it("reports a pending native transition before any thread operation", () => {
    expect(
      reasonOf(() =>
        resolveStrictRestrictedContinuation({
          ...strict,
          binding: { ...attested, pendingResumeConfiguration: {} } as CodexAppServerThreadBinding,
        }),
      ),
    ).toBe("pending_native_transition");
  });

  it("denies replacing or bypassing an attested restricted binding", () => {
    expect(resolveStrictRestrictedContinuation({ ...strict, binding: attested })).toBe(true);
    expect(reasonOf(() => assertRestrictedBindingMayBeCleared(true, false))).toBe(
      "binding_replace_denied",
    );
    expect(reasonOf(() => assertRestrictedThreadCanStartFresh(true))).toBe(
      "binding_replace_denied",
    );
    expect(reasonOf(() => assertRestrictedBindingMayBeCleared(true, true))).toBeUndefined();
  });

  it("requires an attested compatible surface for a restricted bound turn", () => {
    expect(
      reasonOf(() =>
        classifyRestrictedBoundTurn({
          binding: attested,
          restrictedToolSurface: false,
          transientDelegationRestriction: false,
        }),
      ),
    ).toBe("attestation_unavailable");
    expect(
      classifyRestrictedBoundTurn({
        binding: attested,
        restrictedToolSurface: true,
        transientDelegationRestriction: false,
      }),
    ).toBe("resume");
  });

  it("keeps the upstream transient path for legacy bindings without a fingerprint", () => {
    const legacy = { ...attested, restrictedThreadConfigFingerprint: undefined };
    expect(
      classifyRestrictedBoundTurn({
        binding: legacy,
        restrictedToolSurface: true,
        transientDelegationRestriction: false,
      }),
    ).toBe("transient");
    expect(resolveStrictRestrictedContinuation({ ...strict, binding: legacy })).toBe(false);
  });
});
