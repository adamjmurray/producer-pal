// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { mockNonExistentObjects } from "#src/test/mocks/mock-registry.ts";
import {
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

/**
 * Count how many times a mock clip method ran, so a clip updated twice is
 * distinguishable from one updated once.
 * @param mock - The clip's call or set mock
 * @param name - Method or property name
 * @returns How many calls named it
 */
function callsNamed(
  mock: { mock: { calls: unknown[][] } },
  name: string,
): number {
  return mock.mock.calls.filter((call) => call[0] === name).length;
}

// clip123 sits at t0/s0 and clip456 at t1/s1 (setupUpdateClipMocks).
describe("updateClip - pairing ids, paths, and destinations", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
  });

  it("keeps each clip on the destination named at its own position", async () => {
    setupMidiClipMock(mocks.clip456);
    mockNonExistentObjects();

    // t9/s9 holds no clip, so only the clip at t1/s1 is left to move. It must
    // keep t5/s1 — sliding it onto t5/s0 would overwrite whatever sits there.
    await updateClip({ path: "t9/s9,t1/s1", toPath: "t5/s0,t5/s1" });

    expect(outlet).toHaveBeenCalledWith(1, "destination t5/s1 does not exist");
    expect(outlet).not.toHaveBeenCalledWith(
      1,
      "destination t5/s0 does not exist",
    );
  });

  it("does not claim a destination went unused when its clip was dropped", async () => {
    setupMidiClipMock(mocks.clip456);
    mockNonExistentObjects();

    await updateClip({ path: "t9/s9,t1/s1", toPath: "t5/s0,t5/s1" });

    expect(outlet).not.toHaveBeenCalledWith(
      1,
      expect.stringContaining("destination(s) for"),
    );
  });

  it("updates a clip once when ids and path both name it", async () => {
    setupMidiClipMock(mocks.clip456);

    // duplicate_loop doubles the clip, so running it twice quadruples it.
    const result = await updateClip({
      ids: "456",
      path: "t1/s1",
      duplicateLoop: true,
    });

    expect(callsNamed(mocks.clip456.call, "duplicate_loop")).toBe(1);
    expect(result).toStrictEqual({ id: "456", noteCount: 0 });
    expect(outlet).toHaveBeenCalledWith(
      1,
      "ids/path named 1 clip(s) more than once; each clip was updated once",
    );
  });

  it("updates a clip once when an id repeats", async () => {
    setupMidiClipMock(mocks.clip123);

    const result = await updateClip({ ids: "123,123", name: "Once" });

    expect(callsNamed(mocks.clip123.set, "name")).toBe(1);
    expect(result).toStrictEqual({ id: "123" });
  });

  it("gives a repeated clip the destination named the first time", async () => {
    setupMidiClipMock(mocks.clip456);
    mockNonExistentObjects();

    await updateClip({ ids: "456", path: "t1/s1", toPath: "t5/s0,t5/s1" });

    expect(outlet).toHaveBeenCalledWith(1, "destination t5/s0 does not exist");
    expect(outlet).not.toHaveBeenCalledWith(
      1,
      "destination t5/s1 does not exist",
    );
  });
});
