// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { stat } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fileExistsOnDisk } from "../file-exists-on-disk.ts";

vi.mock(import("node:fs/promises"), () => ({ stat: vi.fn() }));

/**
 * @param code - The error code stat fails with
 */
function statFailsWith(code: string | undefined): void {
  vi.mocked(stat).mockRejectedValue(
    Object.assign(new Error("stat failed"), { code }),
  );
}

describe("fileExistsOnDisk", () => {
  beforeEach(() => {
    vi.mocked(stat).mockReset();
  });

  it("is true for a file that stat finds", async () => {
    vi.mocked(stat).mockResolvedValue({} as Awaited<ReturnType<typeof stat>>);

    expect(await fileExistsOnDisk("/Live/a.adv")).toBe(true);
    expect(stat).toHaveBeenCalledExactlyOnceWith("/Live/a.adv");
  });

  it.each(["ENOENT", "ENOTDIR"])(
    "is false when stat fails with %s",
    async (code) => {
      statFailsWith(code);

      expect(await fileExistsOnDisk("/Live/a.adv")).toBe(false);
    },
  );

  it.each(["EACCES", "EIO", "ETIMEDOUT", undefined])(
    "is true when stat fails with %s, which doesn't say the file is gone",
    async (code) => {
      statFailsWith(code);

      expect(await fileExistsOnDisk("/Live/a.adv")).toBe(true);
    },
  );
});
