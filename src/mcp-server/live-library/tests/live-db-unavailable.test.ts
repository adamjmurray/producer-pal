// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  ensureSqliteAvailable,
  openLiveDb,
  SQLITE_UNAVAILABLE_MESSAGE,
  SqliteUnavailableError,
} from "../live-db.ts";

// Simulate a runtime without `node:sqlite` (Node-for-Max older than the one
// bundled with Live 12.4, e.g. an older or standalone Max): the dynamic import
// rejects. Kept in its own file because this mock is hoisted file-wide and
// would break the real-DB success tests in live-db.test.ts.
vi.mock(import("node:sqlite"), () => {
  throw new Error("No such built-in module: node:sqlite");
});

describe("node:sqlite unavailable runtime", () => {
  it("ensureSqliteAvailable rejects with SqliteUnavailableError + upgrade-Max guidance", async () => {
    await expect(ensureSqliteAvailable()).rejects.toThrow(
      SqliteUnavailableError,
    );
    await expect(ensureSqliteAvailable()).rejects.toThrow(
      SQLITE_UNAVAILABLE_MESSAGE,
    );
  });

  it("openLiveDb rejects rather than returning a handle", async () => {
    await expect(openLiveDb("/anything/files.db")).rejects.toThrow(
      SQLITE_UNAVAILABLE_MESSAGE,
    );
  });
});
