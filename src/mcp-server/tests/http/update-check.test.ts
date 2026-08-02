// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import { type UpdateInfo } from "#src/shared/version-check.ts";

const { mockCheckForUpdate } = vi.hoisted(() => ({
  mockCheckForUpdate: vi.fn(),
}));

vi.mock(import("#src/shared/version-check.ts"), () => ({
  checkForUpdate: mockCheckForUpdate,
  isNewerVersion: vi.fn(),
}));

/**
 * Load a fresh copy of the module so its memo starts empty.
 * @returns The module's getUpdate
 */
async function freshGetUpdate(): Promise<() => Promise<UpdateInfo | null>> {
  vi.resetModules();

  const module = await import("../../helpers/http/update-check.ts");

  return module.getUpdate;
}

describe("getUpdate", () => {
  beforeEach(() => {
    mockCheckForUpdate.mockReset();
  });

  it("checks GitHub for the running version", async () => {
    mockCheckForUpdate.mockResolvedValue(null);
    const getUpdate = await freshGetUpdate();

    await getUpdate();

    expect(mockCheckForUpdate).toHaveBeenCalledWith(VERSION);
  });

  it("checks once and reuses the answer forever after", async () => {
    // GitHub's unauthenticated limit is per IP, and `GET /update` is hit on
    // every chat-UI mount. Anything but one call here is a regression.
    mockCheckForUpdate.mockResolvedValue({ version: "9.9.9" });
    const getUpdate = await freshGetUpdate();

    const results = [await getUpdate(), await getUpdate(), await getUpdate()];

    expect(mockCheckForUpdate).toHaveBeenCalledTimes(1);
    expect(results).toStrictEqual([
      { version: "9.9.9" },
      { version: "9.9.9" },
      { version: "9.9.9" },
    ]);
  });

  it("shares one in-flight request between concurrent callers", async () => {
    // The startup check and an immediate `GET /update` can overlap. Memoizing
    // the PROMISE (not the resolved value) is what keeps that a single request.
    let resolveCheck: (value: { version: string } | null) => void = () => {};

    mockCheckForUpdate.mockReturnValue(
      new Promise((resolve) => (resolveCheck = resolve)),
    );

    const getUpdate = await freshGetUpdate();
    const both = Promise.all([getUpdate(), getUpdate()]);

    resolveCheck({ version: "9.9.9" });

    expect(await both).toStrictEqual([
      { version: "9.9.9" },
      { version: "9.9.9" },
    ]);
    expect(mockCheckForUpdate).toHaveBeenCalledTimes(1);
  });

  it("caches a failed check too, rather than retrying", async () => {
    // Deliberate: retrying is what turns one request into many. A check that
    // failed (offline at Live startup) stays failed until the next Live session.
    mockCheckForUpdate.mockResolvedValue(null);
    const getUpdate = await freshGetUpdate();

    expect(await getUpdate()).toBeNull();
    expect(await getUpdate()).toBeNull();
    expect(mockCheckForUpdate).toHaveBeenCalledTimes(1);
  });

  it("resolves null when the check rejects", async () => {
    // checkForUpdate swallows its own failures today, so this is insurance: the
    // rejected promise would be cached, and every `GET /update` for the rest of
    // the session would hang on a route with no catch of its own.
    mockCheckForUpdate.mockRejectedValue(new Error("network down"));
    const getUpdate = await freshGetUpdate();

    expect(await getUpdate()).toBeNull();
    expect(await getUpdate()).toBeNull();
  });
});
