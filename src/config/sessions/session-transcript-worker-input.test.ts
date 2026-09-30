import path from "node:path";
import { expect, it } from "vitest";
import { createSessionHistoryWorkerReaders } from "./session-transcript-worker-readers.js";

it("captures proxy environment through actual exact-entry worker preparation", async () => {
  const env = new Proxy({ OPENCLAW_STATE_DIR: path.resolve("synthetic-state") }, {});
  expect(() => structuredClone(env)).toThrow();
  let prepared: unknown;
  const reader = createSessionHistoryWorkerReaders(async (prepare) => {
    prepared = structuredClone(prepare());
    throw new Error("captured-before-worker");
  });
  await expect(
    reader.readExactEntries({ env, sessionKeys: ["agent:synthetic:new"] }),
  ).rejects.toThrow("captured-before-worker");
  expect(prepared).toMatchObject({
    kind: "session-exact-entries",
    env: { OPENCLAW_STATE_DIR: env.OPENCLAW_STATE_DIR },
  });
});
