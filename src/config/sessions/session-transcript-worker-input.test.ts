import { describe, expect, it } from "vitest";
import { toSessionHistoryWorkerTaskInput } from "./session-transcript-worker-input.js";

describe("toSessionHistoryWorkerTaskInput", () => {
  it("copies a proxied process environment into a structured-cloneable plain object", () => {
    // The Gateway wraps process.env in a Proxy; a Proxy can never be structured-cloned.
    const env = new Proxy({ PATH: "C:/bin", OPENCLAW_STATE_DIR: "C:/state" }, {});
    const database = { agentId: "voice-dispatcher", path: "C:/state/agent.sqlite" };
    const request = toSessionHistoryWorkerTaskInput(
      {
        kind: "session-exact-entries" as const,
        sessionKeys: ["agent:voice-dispatcher:main"],
        env,
        includeAuthorization: true,
      },
      database,
    );
    expect(() => structuredClone(env)).toThrow();
    expect(() => structuredClone(request)).not.toThrow();
    expect(request.database).toBe(database);
    expect(request.env).not.toBe(env);
    expect(request.env).toEqual({ PATH: "C:/bin", OPENCLAW_STATE_DIR: "C:/state" });
    expect(request.sessionKeys).toEqual(["agent:voice-dispatcher:main"]);
    expect(request.includeAuthorization).toBe(true);
  });

  it("leaves requests without an env object untouched", () => {
    const request = toSessionHistoryWorkerTaskInput(
      { kind: "cold-metadata" as const },
      { agentId: "main", path: "p" },
    );
    expect(request).toEqual({ kind: "cold-metadata", database: { agentId: "main", path: "p" } });
    expect("env" in request).toBe(false);
  });
});
