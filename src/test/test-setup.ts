// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, vi } from "vitest";
import { beginLiveApiBuildStats } from "#src/live-api-adapter/live-api-build-stats.ts";
import { resetLiveApiTracking } from "#src/live-api-adapter/live-api-release.ts";
import { Folder, clearMockFolderStructure } from "./mocks/mock-folder.ts";
import { LiveAPI } from "./mocks/mock-live-api.ts";
import { Max, resetMaxMock } from "./mocks/mock-max.ts";
import { clearMockRegistry } from "./mocks/mock-registry.ts";
import { Task } from "./mocks/mock-task.ts";

const g = globalThis as Record<string, unknown>;

g.LiveAPI = LiveAPI;
g.Folder = Folder;
await import("#src/live-api-adapter/live-api-extensions.ts");

g.Task = Task;
g.outlet = vi.fn();
// Max V8 outlet-configuration globals used at module load by live-api-adapter.ts
// (`outlets = 2; setoutletassist(...)`). Mocked so that module is importable.
g.outlets = 0;
g.setoutletassist = vi.fn();

// eslint-disable-next-line vitest/prefer-import-in-mock -- max-api is an external module with strict types that would require comprehensive mock
vi.mock("max-api", () => ({ default: Max }));

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
});
