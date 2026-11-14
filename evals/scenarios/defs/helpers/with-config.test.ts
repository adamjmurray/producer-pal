// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLiveApiEnabled,
  getSmallModelMode,
  setConfig,
} from "#evals/shared/config.ts";
import { withConfig } from "./with-config.ts";

vi.mock(import("#evals/shared/config.ts"), () => ({
  getLiveApiEnabled: vi.fn(),
  getSmallModelMode: vi.fn(),
  setConfig: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(getLiveApiEnabled).mockReset().mockResolvedValue(false);
  vi.mocked(getSmallModelMode).mockReset().mockResolvedValue(true);
  vi.mocked(setConfig).mockReset().mockResolvedValue(undefined);
});

describe("withConfig", () => {
  it("holds the config during the callback, then restores what it found", async () => {
    const seen: unknown[] = [];

    const result = await withConfig(
      { liveApiEnabled: true, smallModelMode: false },
      () => {
        seen.push([...vi.mocked(setConfig).mock.calls]);

        return Promise.resolve("done");
      },
    );

    expect(result).toBe("done");
    expect(seen).toStrictEqual([
      [[{ liveApiEnabled: true, smallModelMode: false }]],
    ]);
    expect(vi.mocked(setConfig).mock.calls).toStrictEqual([
      [{ liveApiEnabled: true, smallModelMode: false }],
      [{ liveApiEnabled: false, smallModelMode: true }],
    ]);
  });

  it("only reads and restores the switches it was given", async () => {
    await withConfig({ smallModelMode: false }, () => Promise.resolve());

    expect(getLiveApiEnabled).not.toHaveBeenCalled();
    expect(vi.mocked(setConfig).mock.calls).toStrictEqual([
      [{ smallModelMode: false }],
      [{ smallModelMode: true }],
    ]);
  });

  it("restores the config and rethrows when the callback throws", async () => {
    await expect(
      withConfig({ smallModelMode: false }, () =>
        Promise.reject(new Error("setup broke")),
      ),
    ).rejects.toThrow("setup broke");

    expect(vi.mocked(setConfig)).toHaveBeenLastCalledWith({
      smallModelMode: true,
    });
  });
});
