// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { toolDefUpdateClip } from "#src/tools/clip/update/update-clip.def.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

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

/**
 * Register a MIDI track and the slot mocks a real move needs: the clip slots
 * themselves, plus the clip Live puts in an empty destination when the copy
 * lands.
 * @param slots - Slots to register, as [trackIndex, sceneIndex, has_clip]
 * @returns The registered slot mocks, keyed "t<track>/s<scene>"
 */
function registerSlots(
  slots: Array<[number, number, number]>,
): Map<string, RegisteredMockObject> {
  const registered = new Map<string, RegisteredMockObject>();

  for (const [trackIndex, sceneIndex, hasClip] of slots) {
    registerMockObject(`track-${trackIndex}`, {
      path: livePath.track(trackIndex),
      properties: { has_midi_input: 1, is_frozen: 0 },
    });

    const slot = registerMockObject(`t${trackIndex}/s${sceneIndex}`, {
      path: livePath.track(trackIndex).clipSlot(sceneIndex),
      properties: { has_clip: hasClip },
    });

    if (!hasClip) {
      registerMockObject(`t${trackIndex}/s${sceneIndex}/clip`, {
        path: livePath.track(trackIndex).clipSlot(sceneIndex).clip(),
      });
    }

    registered.set(`t${trackIndex}/s${sceneIndex}`, slot);
  }

  return registered;
}

/**
 * The literal a JSON null becomes before the handler sees it.
 * @param param - Param name to parse null through
 * @returns The coerced value
 */
function coercedNull(param: "ids" | "path"): string {
  return toolDefUpdateClip.toolOptions.inputSchema[param]?.parse(
    null,
  ) as string;
}

// clip123 sits at t0/s0 and clip456 at t1/s1 (setupUpdateClipMocks).
describe("updateClip - pairing ids, paths, and destinations", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
  });

  /**
   * Move both clips at once, with t1/s2 free for one of them to land in.
   * @param toPath - Where the two clips are sent, in call order
   * @returns The slot mocks and the per-clip results
   */
  async function moveBothClips(toPath: string): Promise<{
    slots: Map<string, RegisteredMockObject>;
    result: Array<{ id: string; path?: string }>;
  }> {
    setupMidiClipMock(mocks.clip123);
    setupMidiClipMock(mocks.clip456);

    const slots = registerSlots([
      [0, 0, 1],
      [1, 1, 1],
      [1, 2, 0],
    ]);

    const result = (await updateClip({
      path: "t0/s0,t1/s1",
      toPath,
    })) as Array<{ id: string; path?: string }>;

    return { slots, result };
  }

  it("keeps each clip on the destination named at its own position", async () => {
    setupMidiClipMock(mocks.clip456);
    mockNonExistentObjects();

    // t9/s9 holds no clip, so only the clip at t1/s1 is left to move. It must
    // keep t5/s1 — sliding it onto t5/s0 would overwrite whatever sits there.
    const result = await updateClip({
      path: "t9/s9,t1/s1",
      toPath: "t5/s0,t5/s1",
    });

    // Nothing else was asked of either clip, so both targets keep a skip.
    expect(result).toStrictEqual([
      { path: "t9/s9", ok: false, reason: 'no clip at path "t9/s9"' },
      {
        path: "t1/s1",
        ok: false,
        reason: "not moved: destination t5/s1 does not exist",
      },
    ]);
  });

  // The name and color lists pair with the targets named, not with the clips
  // that resolved: sliding them up past a skip renames the wrong clips.
  it("keeps each name and color on the target named at its own position", async () => {
    setupMidiClipMock(mocks.clip123);
    setupMidiClipMock(mocks.clip456);
    mockNonExistentObjects();

    const result = await updateClip({
      path: "t0/s0,t9/s9,t1/s1",
      name: "a,b,c",
      color: "#FF0000,#00FF00,#0000FF",
    });

    expect(mocks.clip123.set).toHaveBeenCalledWith("name", "a");
    expect(mocks.clip123.set).toHaveBeenCalledWith("color", 16711680);
    expect(mocks.clip456.set).toHaveBeenCalledWith("name", "c");
    expect(mocks.clip456.set).toHaveBeenCalledWith("color", 255);
    expect(result).toStrictEqual([
      { id: "123", path: "t0/s0" },
      { path: "t9/s9", ok: false, reason: 'no clip at path "t9/s9"' },
      { id: "456", path: "t1/s1" },
    ]);
  });

  // One clip left after the skips is still a list of targets, so the list has
  // to be split rather than written whole as that clip's name.
  it("does not write the whole name list onto the one clip that resolved", async () => {
    setupMidiClipMock(mocks.clip456);
    mockNonExistentObjects();

    await updateClip({ path: "t9/s9,t1/s1,t9/s8", name: "a,b,c" });

    expect(mocks.clip456.set).toHaveBeenCalledWith("name", "b");
  });

  // A call naming one target takes a comma-bearing value whole — a name can
  // have commas in it — and only two lists of two or more that disagree are
  // refused. update-track and update-scene read a lone target the same way.
  it("takes a name list whole when the call names one target", async () => {
    setupMidiClipMock(mocks.clip123);

    const result = await updateClip({ id: "123", name: "a,b,c" });

    expect(mocks.clip123.set).toHaveBeenCalledWith("name", "a,b,c");
    expect(result).toStrictEqual({ id: "123", path: "t0/s0" });
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("does not claim a destination went unused when its clip was dropped", async () => {
    setupMidiClipMock(mocks.clip456);
    mockNonExistentObjects();

    await updateClip({ path: "t9/s9,t1/s1", toPath: "t5/s0,t5/s1" });

    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("destinations for"),
    );
  });

  // Everything one clip's update had to say is joined, however many steps of it
  // had something to report — and with nothing landed on a lone clip, the joined
  // reason is the error.
  it("joins every reason one clip's update gave", async () => {
    setupMidiClipMock(mocks.clip123);
    registerMockObject("slot-1-2", {
      path: livePath.track(1).clipSlot(2),
      properties: { has_clip: 0 },
    });

    await expect(
      updateClip({ id: "123", toPath: "t1/s2", arrangementStart: "5|1" }),
    ).rejects.toThrow(
      "toPath ignored: a clip slot is off the arrangement timeline the other " +
        "position params name; arrangementStart ignored: this is a session clip",
    );
    expect(capturedWarnings()).toStrictEqual([]);
  });

  // The same call with a name to write: the name lands, so the clip keeps a real
  // entry and the reasons ride along on it.
  it("keeps a real entry when something else the call asked for landed", async () => {
    setupMidiClipMock(mocks.clip123);
    registerMockObject("slot-1-2", {
      path: livePath.track(1).clipSlot(2),
      properties: { has_clip: 0 },
    });

    const result = await updateClip({
      id: "123",
      toPath: "t1/s2",
      arrangementStart: "5|1",
      name: "Renamed Anyway",
    });

    expect(mocks.clip123.set).toHaveBeenCalledWith("name", "Renamed Anyway");
    expect(result).toStrictEqual({
      id: "123",
      path: "t0/s0",
      reason:
        "toPath ignored: a clip slot is off the arrangement timeline the other " +
        "position params name; arrangementStart ignored: this is a session clip",
    });
  });

  it("updates a clip once when ids and path both name it", async () => {
    setupMidiClipMock(mocks.clip456);

    // duplicate_loop doubles the clip, so running it twice quadruples it.
    const result = await updateClip({
      id: "456",
      path: "t1/s1",
      duplicateLoop: true,
    });

    expect(callsNamed(mocks.clip456.call, "duplicate_loop")).toBe(1);
    // The second naming of the same clip keeps its slot, saying the update it
    // asked for already happened.
    expect(result).toStrictEqual([
      {
        id: "456",
        path: "t1/s1",
        noteCount: 0,
        length: "2bar",
      },
      {
        id: "456",
        path: "t1/s1",
        reason: "named earlier in this call; updated once",
      },
    ]);
    expect(capturedWarnings()).toStrictEqual([]);
  });

  // `path` takes a list too, so the plural is the same guess `ids` is.
  it("still updates by the paths alias", async () => {
    setupMidiClipMock(mocks.clip456);

    await updateClip({ paths: "t1/s1", name: "Renamed" });

    expect(mocks.clip456.set).toHaveBeenCalledWith("name", "Renamed");
  });

  it("updates a clip once when an id repeats", async () => {
    setupMidiClipMock(mocks.clip123);

    const result = await updateClip({ id: "123,123", name: "Once" });

    expect(callsNamed(mocks.clip123.set, "name")).toBe(1);
    expect(result).toStrictEqual([
      { id: "123", path: "t0/s0" },
      {
        id: "123",
        path: "t0/s0",
        reason: "named earlier in this call; updated once",
      },
    ]);
  });

  it("gives a repeated clip the destination named the first time", async () => {
    setupMidiClipMock(mocks.clip456);
    mockNonExistentObjects();

    const result = await updateClip({
      id: "456",
      path: "t1/s1",
      toPath: "t5/s0,t5/s1",
    });

    expect(result).toStrictEqual([
      {
        id: "456",
        ok: false,
        reason: "not moved: destination t5/s0 does not exist",
      },
      {
        id: "456",
        path: "t1/s1",
        reason: "named earlier in this call; updated once",
      },
    ]);
  });

  // A move onto a slot the batch's own clip sits in overwrote it, and the batch
  // then reported the destroyed clip as updated.
  it("does not move a clip onto another clip this call updates", async () => {
    const { slots, result } = await moveBothClips("t1/s1,t1/s2");

    expect(result[0]).toStrictEqual({
      path: "t0/s0",
      ok: false,
      reason:
        "not moved: t1/s1 holds clip t1/s1 (id 456), which this call also " +
        "updates; move that clip out in its own call first",
    });
    // Nothing was copied out of t0/s0, so clip456 is still there to move itself.
    expect(slots.get("t0/s0")?.call).not.toHaveBeenCalledWith(
      "duplicate_clip_to",
      expect.anything(),
    );
    expect(result[1]).toStrictEqual({ id: "t1/s2/clip", path: "t1/s2" });
  });

  it("refuses both moves when two clips would trade slots", async () => {
    setupMidiClipMock(mocks.clip123);
    setupMidiClipMock(mocks.clip456);
    const slots = registerSlots([
      [0, 0, 1],
      [1, 1, 1],
    ]);

    const result = (await updateClip({
      path: "t0/s0,t1/s1",
      toPath: "t1/s1,t0/s0",
    })) as Array<{ reason?: string }>;

    expect(result[0]?.reason).toContain(
      "not moved: t1/s1 holds clip t1/s1 (id 456)",
    );
    expect(result[1]?.reason).toContain(
      "not moved: t0/s0 holds clip t0/s0 (id 123)",
    );

    for (const slot of slots.values()) {
      expect(slot.call).not.toHaveBeenCalledWith(
        "duplicate_clip_to",
        expect.anything(),
      );
    }
  });

  // Both clips landing in one slot means the second overwrites the first, and
  // the response claims two clips are in it.
  it("moves only the first clip when toPath names one slot twice", async () => {
    const { slots, result } = await moveBothClips("t1/s2,t1/s2");

    expect(result[0]).toStrictEqual({ id: "t1/s2/clip", path: "t1/s2" });
    // The second clip stayed put, so its path is still its own slot.
    expect(result[1]).toStrictEqual({
      path: "t1/s1",
      ok: false,
      reason:
        "not moved: clip t0/s0 (id 123) is already moving to t1/s2; " +
        "name one slot per clip",
    });
    expect(slots.get("t1/s1")?.call).not.toHaveBeenCalledWith(
      "duplicate_clip_to",
      expect.anything(),
    );
  });

  // One destination covers both clips, so the count was never mismatched: the
  // only thing wrong is the destination itself.
  it("does not blame the count when the one destination is unparseable", async () => {
    setupMidiClipMock(mocks.clip123);
    setupMidiClipMock(mocks.clip456);

    const result = (await updateClip({
      path: "t0/s0,t1/s1",
      toPath: "t0/d0",
    })) as Array<{ reason?: string }>;

    // The one unreadable destination covers both clips, so both say so.
    expect(result[0]?.reason).toContain("device paths hold no clips");
    expect(result[1]?.reason).toContain("device paths hold no clips");
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("destination for"),
    );
  });

  it("still accepts a clip's own slot as a destination", async () => {
    setupMidiClipMock(mocks.clip123);
    registerSlots([[0, 0, 1]]);

    const result = await updateClip({ path: "t0/s0", toPath: "t0/s0" });

    expect(result).toStrictEqual({ id: "123", path: "t0/s0" });
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("was not moved"),
    );
  });

  // A model writes the word instead of leaving the param out. Counting it as a
  // clip the caller named shifted every destination onto the wrong clip.
  it.each(["ids", "path"] as const)(
    "ignores a %s sent as null instead of shifting the destinations",
    async (param) => {
      setupMidiClipMock(mocks.clip123);
      registerSlots([
        [0, 0, 1],
        [1, 2, 0],
      ]);
      const named = param === "ids" ? { path: "t0/s0" } : { id: "123" };

      const result = await updateClip({
        ...named,
        [param]: coercedNull(param),
        toPath: "t1/s2",
      });

      expect(result).toStrictEqual({ id: "t1/s2/clip", path: "t1/s2" });
      expect(capturedWarnings()).toContain(`${param} "null" names nothing`);
      expect(capturedWarnings()).not.toContainEqual(
        expect.stringContaining("destinations for"),
      );
    },
  );
});
