import type { AgentMessage } from "openclaw/plugin-sdk/agent-harness-runtime";
import { expect, it } from "vitest";
import { attachCodexMirrorRunId } from "./transcript-mirror-attestation.js";

it("only a terminal owner can attach current native execution evidence", () => {
  const message: AgentMessage = { role: "user", content: "synthetic", timestamp: 1 };
  const execution = {
    sessionId: "generation",
    threadId: "thread",
    turnId: "turn",
    nativeStatus: "completed",
  };
  const terminal = attachCodexMirrorRunId(message, "run", true, undefined, execution);
  expect(terminal).toMatchObject({ __openclaw: { runId: "run", runTerminal: true, execution } });
  const next = attachCodexMirrorRunId(terminal, "next", false);
  expect(Reflect.get(next, "__openclaw")).toEqual({ runId: "next" });
});
