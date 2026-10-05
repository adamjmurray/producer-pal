// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { readClip } from "#src/tools/clip/read/read-clip.ts";
import { readDevice } from "#src/tools/device/read/read-device.ts";
import { readScene } from "#src/tools/scene/read-scene.ts";
import { readTrack } from "#src/tools/track/read/read-track.ts";
import { readFanOut } from "#src/tools/shared/validation/lists/read-fan-out.ts";

interface ToyArgs {
  id?: string;
  path?: string;
}

const UNREACHED = "the request ran out of time; re-run for this toy";

/**
 * Reads the toy targets, each one answering with the value it was named by.
 * @param args - The call's target params
 * @param deadline - The request deadline, when the test sets one
 * @param readOne - What reading one target does
 * @returns What the fan-out answered
 */
function run(
  args: ToyArgs,
  deadline: number | null | undefined,
  readOne: (one: ToyArgs) => string = (one) => one.id ?? one.path ?? "",
): unknown {
  return readFanOut(
    args,
    { object: "toy", idAlias: "toyId", deadline },
    readOne,
  );
}

describe("readFanOut and the request deadline", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads every target when there is no deadline", () => {
    expect(run({ id: "a,b", path: "p" }, undefined)).toStrictEqual([
      "a",
      "b",
      "p",
    ]);
    expect(run({ id: "a,b" }, null)).toStrictEqual(["a", "b"]);
  });

  it("reads every target while there is time left", () => {
    expect(run({ id: "a,b" }, Date.now() + 60_000)).toStrictEqual(["a", "b"]);
  });

  it("skips every target when the deadline passed before the first", () => {
    const read = vi.fn((one: ToyArgs) => one.id ?? "");

    expect(run({ id: "a", path: "p" }, Date.now() - 1, read)).toStrictEqual([
      { id: "a", ok: false, detail: UNREACHED },
      { path: "p", ok: false, detail: UNREACHED },
    ]);
    expect(read).not.toHaveBeenCalled();
  });

  it("skips the targets it never reached when the deadline passes midway", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);

    const read = vi.fn((one: ToyArgs) => {
      // Reading the second target is what uses up the time.
      if (one.id === "b") {
        vi.setSystemTime(2_000);
      }

      return one.id ?? "";
    });

    expect(run({ id: "a,b,c,d" }, 2_000, read)).toStrictEqual([
      "a",
      "b",
      { id: "c", ok: false, detail: UNREACHED },
      { id: "d", ok: false, detail: UNREACHED },
    ]);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("leaves a single target unchanged", () => {
    expect(run({ id: "a" }, Date.now() - 1)).toBe("a");
  });

  // Every read tool hands its context's deadline to the fan-out.
  it.each([
    ["track", (deadline: number) => readTrack({ id: "1,2" }, { deadline })],
    ["scene", (deadline: number) => readScene({ id: "1,2" }, { deadline })],
    ["clip", (deadline: number) => readClip({ id: "1,2" }, { deadline })],
    ["device", (deadline: number) => readDevice({ id: "1,2" }, { deadline })],
  ])(
    "read-%s skips every target once the deadline passed",
    async (object, read) => {
      const detail = `the request ran out of time; re-run for this ${object}`;

      expect(await read(Date.now() - 1)).toStrictEqual([
        { id: "1", ok: false, detail },
        { id: "2", ok: false, detail },
      ]);
    },
  );
});
