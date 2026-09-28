import { describe, expect, it } from "vitest";
import type { CodexAppServerThreadBinding } from "./session-binding.js";
import { fingerprintRestrictedThreadConfig } from "./thread-fingerprints.js";
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

describe("restricted thread config fingerprint", () => {
  const attempt = {
    sessionId: "s",
    sessionKey: "agent:dev:s",
    pluginHarnessToolPolicyRestricted: true,
  };
  const fingerprint = (config: Record<string, unknown>, sandbox = "workspace-write") =>
    fingerprintRestrictedThreadConfig(
      { model: "m", cwd: "/w", sandbox, approvalPolicy: "never", config } as never,
      undefined,
      "tools",
      attempt,
      false,
    );

  it("ignores the per-process port and transport token of the loopback inference proxy", () => {
    expect(fingerprint({ openai_base_url: "http://127.0.0.1:51001/v1/openai" })).toBe(
      fingerprint({ openai_base_url: "http://127.0.0.1:60123/v1/openai" }),
    );
    expect(fingerprint({ openai_base_url: "http://127.0.0.1:51001/tokenAAAA/azure-api./v1" })).toBe(
      fingerprint({ openai_base_url: "http://127.0.0.1:60123/tokenBBBB/azure-api./v1" }),
    );
    expect(fingerprint({ "model_providers.local.base_url": "http://localhost:4000/route" })).toBe(
      fingerprint({ "model_providers.local.base_url": "http://localhost:4999/route" }),
    );
    expect(
      fingerprint({ model_providers: { local: { base_url: "http://[::1]:1/r", name: "x" } } }),
    ).toBe(
      fingerprint({ model_providers: { local: { base_url: "http://[::1]:2/r", name: "x" } } }),
    );
  });

  it("still detects a different route, remote endpoint or policy", () => {
    const base = fingerprint({ openai_base_url: "http://127.0.0.1:51001/v1/openai" });
    expect(fingerprint({ openai_base_url: "http://127.0.0.1:51001/v1/other" })).not.toBe(base);
    expect(fingerprint({ openai_base_url: "https://api.example.invalid/v1" })).not.toBe(
      fingerprint({ openai_base_url: "https://api.example.invalid:8443/v1" }),
    );
    expect(
      fingerprint({ openai_base_url: "http://127.0.0.1:51001/v1/openai" }, "read-only"),
    ).not.toBe(base);
  });
});
