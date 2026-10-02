// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api-property-helpers.ts";
import {
  clearMockRegistry,
  mockNonExistentObjects,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  copiedIds,
  copyClearing,
  copyClearingAsync,
  copyLedger,
  copyReach,
  mainLaneOf,
  noteCleared,
} from "#src/tools/actions/duplicate/helpers/clip/overwrites/copy-overwrites.ts";
import { copyEffectsOf } from "#src/tools/actions/duplicate/helpers/minimal-clip-info.ts";

describe("copyReach", () => {
  it("runs from the start to the longest span", () => {
    expect(copyReach(16, 4, 12, 8)).toStrictEqual({ start: 16, end: 28 });
  });

  it("ignores a span that wasn't read", () => {
    expect(copyReach(16, Number.NaN, 4)).toStrictEqual({ start: 16, end: 20 });
    expect(copyReach(16, Number.NaN)).toStrictEqual({ start: 16, end: 16 });
  });
});

describe("copiedIds", () => {
  it("lists a clip's id", () => {
    expect(copiedIds({ id: "a", path: "t0[1|1]" })).toStrictEqual(["a"]);
  });

  it("lists the clips of a group, and an entry with none as empty", () => {
    expect(
      copiedIds({ path: "t0", clips: [{ id: "a" }, { id: "b" }] }),
    ).toStrictEqual(["a", "b"]);
    expect(copiedIds({ path: "t0[1|1]", ok: false })).toStrictEqual([]);
  });
});

describe("noteCleared", () => {
  it("says it on a clip's entry, and remembers it", () => {
    const entry = { id: "a", detail: "first" };

    noteCleared(entry, "overwrote the clip at t0[1|1]");

    expect(entry.detail).toBe("first; overwrote the clip at t0[1|1]");
    expect(copyEffectsOf(entry)).toBe("overwrote the clip at t0[1|1]");
  });

  it("says it once for a group, on its first clip", () => {
    const group = { path: "t0", clips: [{ id: "a" }, { id: "b" }] };

    noteCleared(group, "overwrote the clip at t0[1|1]");

    expect(group.clips).toStrictEqual([
      { id: "a", detail: "overwrote the clip at t0[1|1]" },
      { id: "b" },
    ]);
  });
});

describe("a copy that throws", () => {
  let clip: RegisteredMockObject;

  beforeEach(() => {
    clearMockRegistry();
    mockNonExistentObjects();
    clip = registerMockObject("clip", {
      path: livePath.track(0).arrangementClip(0),
      type: "Clip",
      properties: { start_time: 0, end_time: 8 },
    });
    registerMockObject("track", {
      path: livePath.track(0),
      properties: { arrangement_clips: children("clip") },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Scan the lane again, as the next copy would.
   * @param ledger - The ledger the copy threw under
   * @param where - The lane
   * @returns Whether the clip on it was read once more
   */
  function rescans(
    ledger: ReturnType<typeof copyLedger>,
    where: ReturnType<typeof mainLaneOf>,
  ): boolean {
    clip.get.mockClear();
    ledger.scan(where.lane, where.api);

    return clip.get.mock.calls.length > 0;
  }

  it("lets the lane be read again, and rethrows", () => {
    const ledger = copyLedger();
    const where = mainLaneOf(0, LiveAPI.from(livePath.track(0)));

    expect(() =>
      copyClearing(
        ledger,
        where,
        { start: 0, end: 8 },
        () => {
          throw new Error("no clip");
        },
        () => [],
      ),
    ).toThrow("no clip");
    expect(rescans(ledger, where)).toBe(true);
  });

  it("does the same for a copy that awaits", async () => {
    const ledger = copyLedger();
    const where = mainLaneOf(0, LiveAPI.from(livePath.track(0)));

    await expect(
      copyClearingAsync(
        ledger,
        where,
        { start: 0, end: 8 },
        () => Promise.reject(new Error("no clip")),
        () => [],
        false,
      ),
    ).rejects.toThrow("no clip");
    expect(rescans(ledger, where)).toBe(true);
  });

  it("keeps the lane for a copy that didn't", () => {
    const ledger = copyLedger();
    const where = mainLaneOf(0, LiveAPI.from(livePath.track(0)));

    copyClearing(
      ledger,
      where,
      { start: 0, end: 8 },
      () => "made",
      () => [],
    );

    expect(rescans(ledger, where)).toBe(false);
  });

  it("forgets every lane after a copy that waited, and only then", async () => {
    const ledger = copyLedger();
    const where = mainLaneOf(0, LiveAPI.from(livePath.track(0)));

    const copy = async (waits: boolean): Promise<void> => {
      await copyClearingAsync(
        ledger,
        where,
        { start: 0, end: 8 },
        () => Promise.resolve("made"),
        () => [],
        waits,
      );
    };

    await copy(false);

    expect(rescans(ledger, where)).toBe(false);

    await copy(true);

    expect(rescans(ledger, where)).toBe(true);
  });
});
