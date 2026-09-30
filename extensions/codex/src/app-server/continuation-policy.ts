import { codexSandboxPolicyForTurn, type CodexAppServerRuntimeOptions } from "./config.js";
import type { CodexSandboxPolicy } from "./protocol.js";

// Narrow permission snapshot; existing tool/MCP/web-search attestations stay authoritative.
// Missing snapshots are not migrated into compatible evidence.
export function codexContinuationPolicy(options: {
  appServer: CodexAppServerRuntimeOptions;
  cwd: string;
  sandboxPolicy?: CodexSandboxPolicy;
}): string {
  return JSON.stringify({
    approvalPolicy: options.appServer.approvalPolicy,
    approvalsReviewer: options.appServer.approvalsReviewer,
    cwd: options.cwd,
    sessionRoot: options.appServer.sessionRoot,
    sandboxPolicy:
      options.sandboxPolicy ??
      codexSandboxPolicyForTurn(
        options.appServer.sandbox,
        options.appServer.sessionRoot ?? options.cwd,
        options.appServer.start.args,
      ),
  });
}
