// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { MAX_SINGLE_MESSAGE_BYTES } from "#src/shared/mcp-responses.ts";
import { folderFileIds } from "../../helpers/library/library-folder-overlap.ts";

describe("folderFileIds", () => {
  it("asks for nothing when there are no paths", async () => {
    const resolve = vi.fn();

    await expect(folderFileIds([], resolve)).resolves.toStrictEqual([]);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("sends a short list as one batch", async () => {
    const resolve = vi.fn().mockResolvedValue([3, 4]);

    await expect(
      folderFileIds(["/a/1.wav", "/a/2.wav"], resolve),
    ).resolves.toStrictEqual([3, 4]);
    expect(resolve).toHaveBeenCalledExactlyOnceWith(["/a/1.wav", "/a/2.wav"]);
  });

  it("splits a long list so each request fits one message, keeping the ids in order", async () => {
    const paths = Array.from(
      { length: 1000 },
      (_, i) => `/Users/someone/Samples/Drums/Kicks/kick ${i}.wav`,
    );
    const resolve = vi
      .fn()
      .mockImplementation(async (batch: string[]) =>
        batch.map((p) => Number(/kick (\d+)/.exec(p)?.[1])),
      );

    const ids = await folderFileIds(paths, resolve);

    expect(ids).toStrictEqual(paths.map((_, i) => i));
    expect(resolve.mock.calls.length).toBeGreaterThan(1);

    for (const [batch] of resolve.mock.calls as string[][][]) {
      expect(JSON.stringify({ paths: batch }).length).toBeLessThan(
        MAX_SINGLE_MESSAGE_BYTES - 500,
      );
    }
  });

  it("counts what JSON escaping adds", async () => {
    const path = `/${'\\"'.repeat(5000)}`;
    const resolve = vi.fn().mockResolvedValue([]);

    await folderFileIds([path, path, path], resolve);

    expect(resolve.mock.calls.length).toBeGreaterThan(1);

    for (const [batch] of resolve.mock.calls as string[][][]) {
      expect(JSON.stringify({ paths: batch }).length).toBeLessThan(
        MAX_SINGLE_MESSAGE_BYTES - 500,
      );
    }
  });

  it("counts bytes, not characters", async () => {
    const path = `/${"é".repeat(9000)}`;
    const resolve = vi.fn().mockResolvedValue([]);

    await folderFileIds([path, path], resolve);

    expect(resolve).toHaveBeenCalledTimes(2);
  });
});
