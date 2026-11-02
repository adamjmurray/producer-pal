// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, vi } from "vitest";
import { beginLiveApiBuildStats } from "#src/live-api-adapter/live-api-build-stats.ts";
import { resetLiveApiTracking } from "#src/live-api-adapter/live-api-release.ts";
import { beginWarningCapture } from "#src/shared/max/v8-warning-capture.ts";
import { Folder, clearMockFolderStructure } from "./mocks/mock-folder.ts";
import { LiveAPI } from "./mocks/mock-live-api.ts";
import { Max, resetMaxMock } from "./mocks/mock-max.ts";
import { clearMockRegistry } from "./mocks/mock-registry.ts";
import { Task } from "./mocks/mock-task.ts";

const g = globalThis as Record<string, unknown>;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

g.LiveAPI = LiveAPI;
g.Folder = Folder;
await import("#src/live-api-adapter/live-api-extensions.ts");

// Nothing answers on port 0, so no unit test reaches a real Producer Pal
// remote script, even with Live running on this machine.
process.env.PPAL_REMOTE_SCRIPT_PORT = "0";

// No unit test reaches a real remote host. Whether such a call succeeds, and
// how fast, decides which branches run, so the same commit would report
// different coverage from one CI run to the next. Local servers stay reachable.
const realFetch = globalThis.fetch;

globalThis.fetch = (input, init) => {
  // String() also covers a URL from another realm, so it can't pass as local.
  const url = new URL(
    input instanceof Request ? input.url : String(input),
    "http://localhost",
  );

  if (!LOCAL_HOSTS.has(url.hostname)) {
    return Promise.reject(
      new TypeError(`Unit tests must not reach the network: ${url.href}`),
    );
  }

  return realFetch(input, init);
};

g.Task = Task;
g.outlet = vi.fn();
g.messnamed = vi.fn();
// Max V8 outlet-configuration globals used at module load by live-api-adapter.ts
// (`outlets = 1; setoutletassist(...)`). Mocked so that module is importable.
g.outlets = 0;
g.setoutletassist = vi.fn();

// eslint-disable-next-line vitest/prefer-import-in-mock -- max-api is an external module with strict types that would require comprehensive mock
vi.mock("max-api", () => ({ default: Max }));

// Preact 11 runs useEffect cleanups after paint; unmount inside act() so they
// run before the test asserts. Our wrapper does the per-test cleanup instead.
process.env.PTL_SKIP_AUTO_CLEANUP = "true";
vi.mock(import("@testing-library/preact"), async (importOriginal) => {
  const { withTestingLibraryAct } =
    await import("#webui/test-utils/testing-library-act.ts");

  return withTestingLibraryAct(await importOriginal());
});

beforeEach(() => {
  // Restore the default mcp_response handler and responder, clear recorded requests
  resetMaxMock();

  // Clear mock folder structure
  clearMockFolderStructure();

  // Clear registered mock objects
  clearMockRegistry();

  // Drop LiveAPI objects left tracked by the previous test, so a test that
  // closes a request scope doesn't clear their paths out from under it.
  resetLiveApiTracking();

  // Tests run the real recorder (the stub is a build-time substitution), so
  // without this its per-target map would grow across the whole suite. Also
  // what lets a budget test read liveApiBuildStats() for its own call alone.
  beginLiveApiBuildStats();

  // Tool code only ever runs inside a request, so give every test one to warn
  // into. Without it emitWarning() takes the no-request-in-flight path and
  // reports to the Max console instead. A test covering that path ends the
  // capture itself.
  beginWarningCapture();
});
