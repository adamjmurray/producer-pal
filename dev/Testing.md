# Testing

## What counts as a test file

A file is a test file if its name ends with `*.test.ts`, `*.test.tsx`,
`*.spec.ts`, `*.spec.tsx`, `*-test-cases.ts`, `*-test-helpers.ts`, or
`*-test-helpers.tsx`, or if it lives under a `test/`, `tests/`, `test-cases/`,
or `test-utils/` directory.

`*.test.*` is a vitest suite; `*.spec.*` is a Playwright suite (`e2e/` only).
The split matters because vitest's lint rules misfire on a Playwright spec.

**That list is the whole vocabulary — don't invent another category.** A
fixture, mock, or case table has to use one of those names. A suffix that only
one config recognizes reads as a test there and as source everywhere else, which
is exactly how these definitions came apart before. `*-test-fixtures.ts`,
`*-mock-helpers.ts`, and the singular `*-test-case.ts` are retired and rejected
by a meta test.

The definition lives in `src/test/helpers/test-file-classification.ts`.
`.oxlintrc.json`, `config/.jscpd*.json`, `vitest.config.ts`, and this section
are held in step with it by `src/test/meta/test-file-classification.test.ts`.
Change the module first, then let that test tell you which configs fell out of
step.

### What the classification controls

- **Line limits**: whole test suites (`*.test.*`, `*.spec.*`, `*-test-cases.ts`)
  get 650 lines per file and 630 per function. Test helpers and fixtures use the
  standard 325 / 115.
- **Duplication**: `src/`, `webui/`, `scripts/`, and `evals/` scan tests
  separately at a looser threshold (`config/.jscpd-tests.json`). `e2e/` doesn't
  split — 67 of its 85 files are tests, so `config/.jscpd-e2e.json` covers the
  whole tree at one threshold.
- **Coverage**: test files are excluded.
- **Suppression budgets**: counted against the `…Tests` tree in
  `src/test/lint-suppression-limits.test.ts`, so no test file goes unbudgeted.
- **Layering**: test files are exempt from the `src/` layering contract, which
  only governs the shipped dependency graph.

## Live API tests

Use the mock registry (`src/test/mocks/mock-registry.ts`):

- `registerMockObject(id, { path, type, properties, methods })` returns a mock
  with instance-level `get`/`set`/`call` spies. Assert on it directly:
  `expect(track.set).toHaveBeenCalledWith(...)`.
- `mockNonExistentObjects()` makes unregistered IDs non-existent, for invalid-ID
  tests.
- Domain helpers like `setupTrackMock()` wrap `registerMockObject()` for common
  object graphs.

## Webui tests

Colocated with the source, using vitest + @testing-library/preact
(`ChatHeader.tsx` → `ChatHeader.test.tsx`).

**Mock the transport in any test that mounts a component which fetches.** Under
happy-dom the page origin is `http://localhost:3000`, so an unmocked same-origin
`fetch` hits the real network and fails with `ECONNREFUSED`. These leaks are
invisible in plain `npm test` — the process exits before slow polls fire — and
only show up under `npm run check`.

The helpers are in
`webui/src/hooks/context/tests/doc-transport-test-helpers.ts`:
`installJsonFetchMock(body)` when the test doesn't care about the traffic,
`installFetchMock()` when it does.

**A stub that answers a save must echo back what the save wrote.** The autosave
baseline adopts the server's echo, so a stub returning fixed content leaves the
draft dirty and the editor flushes it on unmount — after the test ended and the
real `fetch` is back.

Tests rendering the real `<App>` must mock `use-system-prompt` and
`ContextTabs`, because the `use-doc.ts` hooks fetch on mount and again on a 5s
poll. Reuse the shared payloads in
`webui/src/components/tests/App-context-mocks.tsx`.

The stubbed Playwright suite is `npm run ui:test` (no Ableton or API keys
needed); `npm run check` doesn't include it, so run it yourself after touching
`webui/**`.

## Coverage

Function coverage is enforced at 100%. `npm run check` prints totals only — the
per-file breakdown is in `coverage/coverage-summary.txt`.

For a genuinely untestable function (IDB error callbacks, exhaustive `never`
branches, no-op stubs), use `/* v8 ignore start -- reason */` …
`/* v8 ignore stop */`. Use `start`/`stop` rather than `next`, which only
excludes line and branch coverage, not function coverage. The `-- reason` is
required, and per-tree counts are ratcheted in
`src/test/lint-suppression-limits.test.ts` — raising a limit needs user
approval.

## E2E

`e2e/mcp/` drives a real Ableton Live; see `e2e/mcp/README.md`. Always ask
before running these, and always run a single file — the full suite takes
minutes.
