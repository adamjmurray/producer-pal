// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { lastCriteriaChange } from "../jev-criteria-dates.ts";

const mocks = vi.hoisted(() => ({ execFileSync: vi.fn() }));

vi.mock(import("node:child_process"), () => ({
  execFileSync: mocks.execFileSync,
}));

describe("lastCriteriaChange", () => {
  beforeEach(() => mocks.execFileSync.mockReset());

  it("returns the newest date over the long lines only", () => {
    mocks.execFileSync
      .mockReturnValueOnce("2026-03-01T10:00:00+01:00\n")
      .mockReturnValueOnce("2026-05-01T10:00:00+00:00\n");

    const date = lastCriteriaChange(
      "This line is long enough.\nshort\n  Another long enough line.  ",
    );

    expect(date).toBe("2026-05-01T10:00:00.000Z");
    expect(mocks.execFileSync).toHaveBeenCalledTimes(2);
    expect(mocks.execFileSync.mock.calls[1]?.[1]).toContain(
      "Another long enough line.",
    );
  });

  it("returns undefined when no line is in history", () => {
    mocks.execFileSync.mockReturnValue("\n");

    expect(lastCriteriaChange("This line is long enough.")).toBeUndefined();
  });
});
