// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Only GitHub itself is mocked — the memo in update-check.ts is the real one, so
// the call counts below are the end-to-end guarantee, not a restatement of it.
const { mockCheckForUpdate } = vi.hoisted(() => ({
  mockCheckForUpdate: vi.fn(),
}));

vi.mock(import("#src/shared/version-check.ts"), () => ({
  checkForUpdate: mockCheckForUpdate,
  isNewerVersion: vi.fn(),
}));

/**
 * Start a fresh app and GET /update the given number of times.
 * @param times - How many requests to make
 * @returns Each response's status, cache-control header, and parsed body
 */
async function getUpdateTimes(
  times: number,
): Promise<{ status: number; cacheControl: string | null; body: unknown }[]> {
  const { createExpressApp } = await import("../../create-express-app.ts");
  const app = createExpressApp();
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const url = `http://localhost:${(server.address() as AddressInfo).port}/update`;

  try {
    const responses = [];

    for (let i = 0; i < times; i++) {
      const response = await fetch(url);

      responses.push({
        status: response.status,
        cacheControl: response.headers.get("cache-control"),
        body: await response.json(),
      });
    }

    return responses;
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("GET /update", () => {
  beforeEach(() => {
    // Fresh module graph per test, so each starts with an unprimed memo.
    vi.resetModules();
    mockCheckForUpdate.mockReset();
  });

  it("serves the available update without re-checking GitHub", async () => {
    // The chat UI used to fetch GitHub itself on every mount, against a limit
    // that is 60/hr per IP. However many times this endpoint is hit, the process
    // makes ONE GitHub request — see src/mcp-server/helpers/http/update-check.ts.
    mockCheckForUpdate.mockResolvedValue({ version: "9.9.9" });

    const responses = await getUpdateTimes(3);

    expect(responses).toStrictEqual(
      Array.from({ length: 3 }, () => ({
        status: 200,
        // No network cost to re-asking a local route, and a cached answer would
        // survive a restart onto a different version.
        cacheControl: "no-store",
        body: { version: "9.9.9" },
      })),
    );
    expect(mockCheckForUpdate).toHaveBeenCalledTimes(1);
  });

  it("serves a literal null when up to date", async () => {
    // The shape use-update-check.ts parses. A failed check caches its null too,
    // so this is also the "GitHub was unreachable" response.
    mockCheckForUpdate.mockResolvedValue(null);

    const responses = await getUpdateTimes(2);

    expect(responses.map((r) => r.body)).toStrictEqual([null, null]);
    expect(mockCheckForUpdate).toHaveBeenCalledTimes(1);
  });
});
