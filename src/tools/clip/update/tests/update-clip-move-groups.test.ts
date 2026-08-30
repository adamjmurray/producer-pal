// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emitArrangementWarnings,
  tallyMovedClip,
  type MoveGroup,
} from "../helpers/arrangement/update-clip-move-groups.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  warn: vi.fn(),
  log: vi.fn(),
}));

import * as console from "#src/shared/max/v8-max-console.ts";

/**
 * Tally a run of clips landing on one lane at one position.
 * @param groups - The tally
 * @param trackIndex - The lane's track
 * @param startBeats - The position
 * @param count - How many clips land there
 */
function tallyMany(
  groups: Map<string, MoveGroup>,
  trackIndex: number,
  startBeats: number,
  count: number,
): void {
  for (let i = 0; i < count; i++) {
    tallyMovedClip(groups, trackIndex, startBeats);
  }
}

describe("update-clip-move-groups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not warn when nothing was moved", () => {
    emitArrangementWarnings(new Map());

    expect(console.warn).not.toHaveBeenCalled();
  });

  it("does not warn when one clip lands per group", () => {
    const groups = new Map<string, MoveGroup>();

    tallyMovedClip(groups, 0, 16);
    tallyMovedClip(groups, 1, 16);
    emitArrangementWarnings(groups);

    expect(console.warn).not.toHaveBeenCalled();
  });

  it("does not warn for clips on one lane at different positions", () => {
    const groups = new Map<string, MoveGroup>();

    tallyMovedClip(groups, 0, 16);
    tallyMovedClip(groups, 0, 32);
    tallyMovedClip(groups, 0, 48);
    emitArrangementWarnings(groups);

    expect(console.warn).not.toHaveBeenCalled();
  });

  it("warns when clips land on one lane at one position", () => {
    const groups = new Map<string, MoveGroup>();

    tallyMany(groups, 0, 16, 3);
    emitArrangementWarnings(groups);

    expect(console.warn).toHaveBeenCalledWith(
      "3 clips on track 0 moved to the same position - later clips will overwrite earlier ones",
    );
  });

  it("warns once per overlapping group", () => {
    const groups = new Map<string, MoveGroup>();

    tallyMany(groups, 0, 16, 2);
    tallyMovedClip(groups, 1, 16);
    tallyMany(groups, 2, 32, 4);
    emitArrangementWarnings(groups);

    expect(console.warn).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledWith(
      "2 clips on track 0 moved to the same position - later clips will overwrite earlier ones",
    );
    expect(console.warn).toHaveBeenCalledWith(
      "4 clips on track 2 moved to the same position - later clips will overwrite earlier ones",
    );
  });
});
