// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { clipBatchIndexes } from "#src/tools/clip/update/helpers/batch/clip-batch-indexes.ts";

describe("clipBatchIndexes", () => {
  it("numbers one clip per target by its place in the call", () => {
    expect(clipBatchIndexes([0, 1, 2], 3)).toStrictEqual({
      indexes: [0, 1, 2],
      count: 3,
    });
  });

  it("keeps a number for a target with no clip", () => {
    expect(clipBatchIndexes([1, 2], 3)).toStrictEqual({
      indexes: [1, 2],
      count: 3,
    });
  });

  it("gives each split piece its own number, after an empty target", () => {
    // Empty, split into 2, plain.
    expect(clipBatchIndexes([1, 1, 2], 3)).toStrictEqual({
      indexes: [1, 2, 3],
      count: 4,
    });
  });
});
