import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withTempDir } from "openclaw/plugin-sdk/test-env";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCodexAppServerRuntimeOptions } from "./config.js";
import { setManagedCodexPluginRoot } from "./managed-binary.js";
import { sessionBindingIdentity } from "./session-binding.js";
import { testCodexAppServerBindingStore } from "./session-binding.test-helpers.js";
import { createIsolatedCodexAppServerClient } from "./shared-client.js";
import { CodexRestrictedContinuationError } from "./thread-lifecycle-errors.js";
import {
  createParams,
  resetThreadLifecycleTestFixtures,
  startOrResumeThread,
} from "./thread-lifecycle.test-fixtures.js";
import { CODEX_APP_SERVER_VERSION } from "./version.js";

const LIVE =
  process.env.OPENCLAW_LIVE_TEST === "1" &&
  process.env.OPENCLAW_LIVE_CODEX_RESTRICTED_RESUME === "1";
const describeLive = LIVE ? describe : describe.skip;
const methodCount = (request: { mock: { calls: unknown[][] } }, method: string) =>
  request.mock.calls.filter(([name]) => name === method).length;

type Step = { step: string; outcome: string };

// No model turn runs, so no credentials or model cost are involved. A thread
// without a completed turn has no persisted rollout; this proves every lifecycle
// decision against the real managed App Server either keeps the same native
// thread or fails closed with a typed reason, and never starts a replacement.
describeLive("Codex restricted continuation against the real App Server", () => {
  beforeEach(() => {
    setManagedCodexPluginRoot(fileURLToPath(new URL("../../", import.meta.url)));
  });

  afterEach(() => {
    resetThreadLifecycleTestFixtures();
    setManagedCodexPluginRoot(undefined);
  });

  it("keeps the same native thread or fails closed, never silently replacing it", async () => {
    await withTempDir("openclaw-codex-restricted-resume-", async (root) => {
      const agentDir = path.join(root, "agent");
      const workspace = path.join(root, "workspace");
      await fs.mkdir(workspace, { recursive: true });
      const runtime = resolveCodexAppServerRuntimeOptions({ env: {} });
      const params = createParams(path.join(root, "session.jsonl"), workspace);
      params.pluginHarnessToolPolicyRestricted = true;
      const identity = sessionBindingIdentity({
        sessionId: params.sessionId,
        sessionKey: params.sessionKey,
        agentId: params.agentId,
        config: params.config,
      });
      const common = {
        cwd: workspace,
        dynamicTools: [],
        appServer: runtime,
        nativeCodeModeEnabled: false,
      };
      const steps: Step[] = [];
      let threadId = "";
      let attested: unknown;
      const attempt = async (
        step: string,
        client: Parameters<typeof startOrResumeThread>[0]["client"],
        overrides: Record<string, unknown>,
      ) => {
        try {
          const out = await startOrResumeThread({
            ...common,
            client,
            params: { ...params, ...overrides },
          });
          expect(out.threadId).toBe(threadId);
          steps.push({ step, outcome: `same-thread:${out.lifecycle.action}` });
        } catch (error) {
          expect(error).toBeInstanceOf(CodexRestrictedContinuationError);
          steps.push({
            step,
            outcome: `fail-closed:${(error as CodexRestrictedContinuationError).reason}`,
          });
        }
        expect(testCodexAppServerBindingStore.read(identity)).toEqual(attested);
      };

      const client = await createIsolatedCodexAppServerClient({
        startOptions: runtime.start,
        agentDir,
        authProfileId: null,
        timeoutMs: 60_000,
      });
      const request = vi.spyOn(client, "request");
      try {
        expect(client.getServerVersion()).toBe(CODEX_APP_SERVER_VERSION);
        const first = await startOrResumeThread({ ...common, client, params });
        threadId = first.threadId;
        expect(first.lifecycle.action).toBe("started");
        attested = testCodexAppServerBindingStore.read(identity);
        expect(attested).toMatchObject({
          threadId,
          nativeToolPolicyRestricted: true,
          restrictedThreadConfigFingerprint: expect.any(String),
        });
        steps.push({ step: "start", outcome: "started" });

        await attempt("loaded-compatible", client, { runId: "run-2", prompt: "separate turn" });
        await attempt("loaded-drift", client, {
          runId: "run-drift",
          pluginHarnessToolPolicySafeDeniedTools: ["image_generate"],
        });
        expect(steps.at(-1)?.outcome).toBe("fail-closed:policy_changed");
        await client.request("thread/unsubscribe", { threadId }).catch(() => undefined);
        await attempt("unloaded-compatible", client, { runId: "run-3", prompt: "after unload" });
        expect(methodCount(request, "thread/start")).toBe(1);
      } finally {
        await client.closeAndWait();
      }

      const cold = await createIsolatedCodexAppServerClient({
        startOptions: runtime.start,
        agentDir,
        authProfileId: null,
        timeoutMs: 60_000,
      });
      const coldRequest = vi.spyOn(cold, "request");
      try {
        await attempt("cold-client-compatible", cold, { runId: "run-cold", prompt: "cold client" });
        expect(methodCount(coldRequest, "thread/start")).toBe(0);
      } finally {
        await cold.closeAndWait();
        // Windows releases the App Server's home directory handle shortly after exit.
        await new Promise((resolve) => setTimeout(resolve, 3_000));
      }
      console.info(
        `restricted-resume-live ${JSON.stringify({ appServer: CODEX_APP_SERVER_VERSION, steps })}`,
      );
    });
  }, 240_000);
});
