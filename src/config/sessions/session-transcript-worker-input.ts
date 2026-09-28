/**
 * Prepares a session history worker request for structured cloning.
 *
 * Callers routinely pass `process.env` as the request `env`. Inside the Gateway
 * `process.env` is a Proxy, and a Proxy can never be structured-cloned, so
 * `worker.postMessage` rejects it with `DataCloneError: #<Object> could not be
 * cloned.` and the whole run fails before any reply (observed on
 * `session-exact-entries` reads with `includeAuthorization`). Copy it into a
 * plain object at the single worker boundary instead of relying on every caller
 * to spread it first.
 */
export function toSessionHistoryWorkerTaskInput<TInput extends { env?: unknown }, TDatabase>(
  input: TInput,
  database: TDatabase,
): TInput & { database: TDatabase } {
  const env = input.env;
  return {
    ...input,
    ...(env !== null && typeof env === "object" ? { env: { ...(env as object) } } : {}),
    database,
  };
}
