# Testing

Session-level fixtures and harness. Commands: see CLAUDE.md.

Session protocol seam: `cd apps/server && bun test src/__tests__/session-protocol.test.ts`. `SessionHarness` in `src/__tests__/fixtures/session-harness.ts` drives the real SessionManager: `await harness.send(clientMessage)` then `await harness.waitFor("result", message => message.requestId === id, 3000)`. Waits consume matching events once, including already emitted events; `messages` retains the full stream for diagnostics. Start waits before sending when observing events during an unfinished Call; always close the harness and HTTP fixture in `finally`.

`stdioFixture` launches the SDK fixture subprocess; `startHTTPFixture()` provides an isolated Streamable HTTP endpoint on an ephemeral loopback port and `close()`. Catalogue: echo (`text`), error (tool result with `isError`), slow (`steps`, 50ms ticks, progress when `_meta.progressToken` supplied, AbortSignal cancellation), structured (`answer: 42` + outputSchema), elicit (name form), log (info notification), stderr, crash (exit 23); prompt: greet (`name`). `runtime-server.ts` is a STDIO-only fixture whose `runtime` tool reports subprocess cwd/env (`session-stdio-config.test.ts`). Live Call coverage: `session-live-calls.test.ts` verifies ordered progress, concurrent cancellation and timeouts against STDIO/HTTP fixtures; the slow fixture logs when its AbortSignal fires. Run crash only over STDIO: the in-process HTTP fixture would exit the test runner. `startHTTPFixture("sse")` runs the SDK legacy SSE transport at `/sse` with a separate POST endpoint. HTTP tries Streamable HTTP first and falls back on 400/404/405 rejection; `connected.httpVariant` carries `streamable` or `sse` to the status bar.

Form elicitation: MCP clients advertise `elicitation.form`; SessionManager bridges `elicitation_request`/`elicitation_response` with unique elicitation IDs. Pending forms cancel after 120 seconds or Session closure; `elicitation_closed` removes expired dialogs. The browser queues forms and reuses ToolArgsEditor.

OAuth: `fixtures/oauth-fixture.ts` — `startOAuthFixture()` (protected `/mcp` + minimal AS: metadata, DCR, PKCE, refresh; `counts`, `issued`, `presented`, `expireAccessTokens()`, `revokeTokens()`), `startOAuthCallback()` (real callback route), `approveInBrowser(url)`. `new SessionHarness({ oauth })` enables sign-in.

OAuth lifecycle: credential storage adapters share a per-Connection generation, retired on sign-out or URL change; saves reject stale generations, and aborted Sessions cannot reconnect. The SDK auth flow is coalesced per generation across Sessions, uses a separate fetch for auth traffic, and exposes safe errors without endpoint bodies; file-backed DBs use private permissions (0700 directory, 0600 file).

## Packaged app browser suites

Install Bun and Node/npm (`npx` is required for public STDIO packages), then:

```sh
bun install --frozen-lockfile
bun --cwd e2e playwright install --with-deps chromium
bun run e2e
bun run e2e:live  # optional: public internet; never runs in CI
```

Both commands build the distributable and launch `bun dist/cli.js --no-open`
with a fresh temporary `STUDIO_DB_PATH`. They serve the built UI, REST and
WebSocket on `http://localhost:47831`; a test-only lifecycle controller uses
`47832`. Override them with `E2E_PORT` and `E2E_FIXTURE_PORT` (for example,
`E2E_PORT=48831 E2E_FIXTURE_PORT=48832 bun run e2e`). Keep these ports free and run one suite at a time. The controller
terminates the CLI and fixture transports and deletes its temporary database
on exit. It never uses `~/.mcp-studio`. No dev server or mocked Studio APIs.

The local Chromium project covers Collection/Connection create, rename and
delete, STDIO + Streamable HTTP + legacy SSE, form/JSON Calls and invalid JSON,
prompts, structured output, images, progress/Cancel, timeout, all elicitation
responses, Environments/Variables, unresolved references, verbose log filters,
config import, failure visibility, theme persistence, and saved entities after
a real CLI restart. It uses the repository protocol fixture and
`npx -y @modelcontextprotocol/server-everything@2.2.1` (also installed and locked
as a dev dependency so CI does not depend on an unpinned registry version).
Browser locators use roles, labels, text and placeholders, never styling classes.

The live project tries DeepWiki, remote fetch, GitMCP's TypeScript SDK endpoint
and Cloudflare docs without credentials, plus the public memory, filesystem
and sequential-thinking STDIO packages. Each successful Session must discover
tools and complete a representative Call without an MCP error and with nonempty
content. Filesystem reads only its temporary directory; memory reads an empty
graph; sequential thinking performs one transient reasoning step. No remote
write tools run. HTTP candidates are skipped only when the surfaced connection error identifies
remote/network unavailability (ENOTFOUND, ECONNREFUSED, ETIMEDOUT/timeout, or
remote HTTP 4xx/5xx). An unexplained 60-second connection deadline fails. At least
one HTTP candidate must connect; tool discovery/Call/UI failures remain failures.
STDIO failures always fail. Endpoints and package catalogues can change, so this
suite stays opt-in. Results include tool counts, actual Call names and per-server
PASS/FAIL/SKIPPED reasons in `e2e/test-results/live-results.md` and JSON attachments.

Inspect `e2e/playwright-report/index.html` with
`bun --cwd e2e playwright show-report`. Failures retain screenshots, traces and
accessibility snapshots in `e2e/test-results/`; open a trace with
`bun --cwd e2e playwright show-trace test-results/<test>/trace.zip`.
The CI `e2e` job runs only the local project and uploads both directories on failure.
For one case after building, use
`bun --cwd e2e playwright test --project=local -g 'elicitation'`.
