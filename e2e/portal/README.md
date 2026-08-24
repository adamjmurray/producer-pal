# Portal E2E Tests (stubbed device, CI)

End-to-end tests for the **portal binary** — the npx/Claude-Desktop bridge that
turns stdio MCP into HTTP calls to the Max device. Each test spawns
`npm/producer-pal-portal.js` as a real subprocess and speaks MCP to it over
stdio, the way a client does.

No Ableton Live and no network: the device end is a stub HTTP server the test
switches on and off.

## Running Tests

```bash
npm run build     # produces npm/producer-pal-portal.js
npm run e2e:portal
```

The suite fails with a clear message if the bundle isn't built. In CI it runs in
the build-verification job, right after the build that produces it.

## Test Files

- `tests/portal-toolset.test.ts` — `--tools` / `--disable-tools` /
  `--list-tools`: the header every request carries to the device, and the
  offline list the portal serves on its own.
- `tests/portal-reconnect.test.ts` — a portal that came up before the device:
  the fallback list, then the `tools/list_changed` nudge once the device answers
  (and no nudge when it was there all along).

Unit tests in `src/portal/tests/` already cover how tool names and group aliases
resolve. These cover what only a real process can show: argv parsed by the
shipped bundle, and the result on the wire.

## The stub device

`stub-device.ts` serves POST `/mcp` on a reserved port, so a test can decide
when the device becomes reachable — the offline→online transition is the point,
and no real Live can be switched on mid-test.

It records the requests it receives instead of acting on them, and answers
`tools/list` with a single marker tool. Narrowing a tool list by the
disabled-tools header is the device's job, tested on that side; what the portal
owes is the header itself.

Assertions stay at the level of tool **names**, so a debug build (which adds
parameters to some tool schemas) passes the same as a release build.
