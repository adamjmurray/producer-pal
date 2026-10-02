// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { suspendWarningCapture } from "#src/shared/max/v8-warning-capture.ts";
import { children } from "#src/test/mocks/mock-live-api-property-helpers.ts";
import {
  clearMockRegistry,
  mockNonExistentObjects,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  clearedBefore,
  copiedIds,
  copyClearing,
  copyClearingAsync,
  copyLedger,
  copyReach,
  mainLaneOf,
  noteCleared,
} from "#src/tools/actions/duplicate/helpers/clip/overwrites/copy-overwrites.ts";
import { copyEffectsOf } from "#src/tools/actions/duplicate/helpers/minimal-clip-info.ts";

/**
 * A promise that parks the request the way a Node round trip does, which lets
 * another request run.
 * @param value - What it settles with, or a promise to follow
 * @returns The promise
 */
function parked<T>(value: T | Promise<T>): Promise<T> {
  return suspendWarningCapture(Promise.resolve(value));
}

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

  it("reads the lane again after a copy that really waited, and only then", async () => {
    const ledger = copyLedger();
    const where = mainLaneOf(0, LiveAPI.from(livePath.track(0)));

    /**
     * Run a copy, and say whether the lane's clip was read while it ran.
     * @param waits - Whether the copy parks on a wait that lets another request run
     * @returns Whether the clip was read
     */
    const copyReads = async (waits: boolean): Promise<boolean> => {
      clip.get.mockClear();
      // Past the clip on the lane, so the copy itself reads nothing.
      await copyClearingAsync(
        ledger,
        where,
        { start: 100, end: 108 },
        () => (waits ? parked("made") : Promise.resolve("made")),
        () => [],
      );

      return clip.get.mock.calls.length > 0;
    };

    // The first copy reads the lane; a copy that doesn't wait keeps what it has.
    await copyReads(false);

    expect(await copyReads(false)).toBe(false);
    expect(await copyReads(true)).toBe(true);
    expect(rescans(ledger, where)).toBe(false);
  });

  it("forgets every lane after a failed copy that really waited, and only then", async () => {
    registerMockObject("other-clip", {
      path: livePath.track(1).arrangementClip(0),
      type: "Clip",
      properties: { start_time: 0, end_time: 8 },
    });
    registerMockObject("other-track", {
      path: livePath.track(1),
      properties: { arrangement_clips: children("other-clip") },
    });

    const results: boolean[] = [];

    const fail = async (waits: boolean): Promise<void> => {
      const ledger = copyLedger();
      const where = mainLaneOf(0, LiveAPI.from(livePath.track(0)));
      const other = mainLaneOf(1, LiveAPI.from(livePath.track(1)));

      ledger.scan(where.lane, where.api);
      await expect(
        copyClearingAsync(
          ledger,
          other,
          { start: 0, end: 8 },
          () =>
            waits
              ? parked(Promise.reject(new Error("no clip")))
              : Promise.reject(new Error("no clip")),
          () => [],
        ),
      ).rejects.toThrow("no clip");
      results.push(rescans(ledger, where));
    };

    await fail(false);
    await fail(true);

    expect(results).toStrictEqual([false, true]);
  });
});

describe("a copy that clears clips and then throws", () => {
  let track: RegisteredMockObject;

  beforeEach(() => {
    clearMockRegistry();
    mockNonExistentObjects();
    registerMockObject("clip", {
      path: livePath.track(0).arrangementClip(0),
      type: "Clip",
      properties: { start_time: 0, end_time: 8 },
    });
    track = registerMockObject("track", {
      path: livePath.track(0),
      properties: { arrangement_clips: children("clip") },
    });
  });

  /**
   * Run a copy that clears the clip on the lane and then throws.
   * @param ledger - The call's ledger
   * @returns What it threw
   */
  function clearThenThrow(ledger = copyLedger()): unknown {
    try {
      copyClearing(
        ledger,
        mainLaneOf(0, LiveAPI.from(livePath.track(0))),
        { start: 0, end: 8 },
        () => {
          track.properties.arrangement_clips = children();
          registerMockObject("clip", { path: "" });

          throw new Error("no clip");
        },
        () => [],
      );
    } catch (error) {
      return error;
    }

    return undefined;
  }

  it("throws the same words, with what it cleared", () => {
    const error = clearThenThrow();

    expect((error as Error).message).toBe("no clip");
    expect(clearedBefore(error)).toBe("overwrote the clip at t0[1|1]");
  });

  it("throws the original when what it cleared can't be read", () => {
    const ledger = copyLedger();

    vi.spyOn(ledger, "afterWrite").mockImplementation(() => {
      throw new Error("Live went away");
    });

    const error = clearThenThrow(ledger);

    expect((error as Error).message).toBe("no clip");
    expect(clearedBefore(error)).toBeUndefined();
  });

  it("says nothing was cleared for an error that wasn't one", () => {
    expect(clearedBefore(new Error("plain"))).toBeUndefined();
  });
});
