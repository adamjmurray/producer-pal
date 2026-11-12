// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// ppal-delete and ppal-duplicate on Live 13 return-track envelope clips.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { deleteObject } from "#src/tools/actions/delete/delete.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { getMinimalClipInfo } from "#src/tools/actions/duplicate/helpers/minimal-clip-info.ts";
import { registerRegularClip } from "./envelope-clip-test-helpers.ts";
import {
  answerEnvelopeList,
  NO_ENVS_BY_PATH_OR_ID,
  noteOrAudioTouches,
  PAN_ENVELOPE,
  PREDELAY_ENVELOPE,
  resetWritableEnvelopeWorld,
  type WritableEnvelopeWorld,
} from "./envelope-write-test-helpers.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

const ONLY_RETURN = "an envelope clip can only go to a return-track slot";
const ONLY_ENVELOPE = "a return-track slot only takes an envelope clip";

type Entry = Record<string, unknown>;

/**
 * A regular clip with the slot that holds it, so copies of it can be tried.
 * @returns Nothing; the clip and slot are registered
 */
function registerRegularClipInSlot(): void {
  registerRegularClip();
  registerMockObject("t0s0", {
    path: livePath.track(0).clipSlot(0),
    properties: { has_clip: 1 },
  });
}

describe("ppal-delete - envelope clips", () => {
  let world: WritableEnvelopeWorld;

  beforeEach(() => {
    world = resetWritableEnvelopeWorld();
  });

  it.each([
    ["path", { path: "rt0/s0" }, "rt0/s0"],
    ["id", { ids: "no-envs" }, "rt0/s0"],
  ])("deletes a clip named by %s from its slot", (_how, target, path) => {
    const result = deleteObject({ type: "clip", ...target }) as Entry;

    expect(result).toStrictEqual({ id: "no-envs", deletedPath: path });
    expect(world.slots[0]?.[0]?.call).toHaveBeenCalledWith("delete_clip");
    expect(noteOrAudioTouches(world)).toStrictEqual([]);
  });

  it("deletes one on each return track, beside a regular clip", () => {
    registerRegularClip();

    const result = deleteObject({
      type: "clip",
      path: "rt1/s0,t0/s0,rt0/s0",
    }) as Entry[];

    expect(result.map((entry) => entry.deletedPath)).toStrictEqual([
      "rt1/s0",
      "t0/s0",
      "rt0/s0",
    ]);
    expect(world.slots[1]?.[0]?.call).toHaveBeenCalledWith("delete_clip");
    expect(world.slots[0]?.[0]?.call).toHaveBeenCalledWith("delete_clip");
  });

  it("says an empty return track slot holds nothing to delete", () => {
    const result = deleteObject({ type: "clip", path: "rt0/s2" }) as Entry;

    expect(result).toStrictEqual(
      expect.objectContaining({
        detail: expect.stringContaining("nothing"),
      }),
    );
    expect(world.slots[0]?.[2]?.call).not.toHaveBeenCalled();
  });

  it("reports a delete Live refused, with the clip still there", () => {
    world.failDeletes();

    expect(() => deleteObject({ type: "clip", path: "rt0/s0" })).toThrow(
      "Live refused to delete",
    );
    expect(LiveAPI.from("id no-envs").exists()).toBe(true);
  });

  it("refuses a return-track slot on Live 12, saying so", () => {
    resetWritableEnvelopeWorld("12.4.15");

    expect(() => deleteObject({ type: "clip", path: "rt0/s0" })).toThrow(
      "return-track clips need Live 13",
    );
  });
});

describe("ppal-duplicate - envelope clips", () => {
  let world: WritableEnvelopeWorld;

  beforeEach(() => {
    world = resetWritableEnvelopeWorld();
    answerEnvelopeList([PREDELAY_ENVELOPE, PAN_ENVELOPE]);
  });

  it.each(NO_ENVS_BY_PATH_OR_ID)(
    "copies a clip named by %s to other return track slots",
    async (_how, target) => {
      const result = (await duplicate({
        type: "clip",
        ...target,
        toPath: "rt1/s2,rt0/s1",
      })) as Entry[];

      expect(result).toStrictEqual([
        { id: "copy-1", path: "rt1/s2" },
        { id: "copy-2", path: "rt0/s1" },
      ]);
      expect(world.slots[0]?.[0]?.call).toHaveBeenCalledWith(
        "duplicate_clip_to",
        "id r1s2",
      );
      expect(world.copies.get("rt1/s2")?.properties.name).toBe("No Envs");
      expect(noteOrAudioTouches(world)).toStrictEqual([]);
    },
  );

  it("copies a clip with envelopes by Live's own duplicate alone, with no automation work", async () => {
    const result = (await duplicate({
      type: "clip",
      id: "with-env",
      toPath: "rt0/s2",
    })) as Entry;

    // Only the device envelope is named: Live's copy keeps the mixer ones.
    expect(result).toStrictEqual({
      id: "copy-1",
      path: "rt0/s2",
      detail:
        "dropped the device envelopes, which don't copy to another track: Predelay (rt1/d0)",
    });
    // Nothing is stamped or written to put them back.
    expect(world.slots[1]?.[0]?.call.mock.calls).toStrictEqual([
      ["duplicate_clip_to", "id r0s2"],
    ]);
    expect(world.withEnv.call).not.toHaveBeenCalled();
    expect(world.returnTracks.flatMap((t) => t.call.mock.calls)).toStrictEqual(
      [],
    );
  });

  it("says it dropped device envelopes, unnamed, when the remote script isn't running", async () => {
    answerEnvelopeList(null);

    const result = (await duplicate({
      type: "clip",
      id: "with-env",
      toPath: "rt0/s2",
    })) as Entry;

    expect(result.detail).toBe(
      "any device envelopes were dropped, since they don't copy to another track",
    );
  });

  it("says nothing of envelopes when only mixer ones were on the clip", async () => {
    answerEnvelopeList([PAN_ENVELOPE]);

    const result = (await duplicate({
      type: "clip",
      id: "with-env",
      toPath: "rt0/s2",
    })) as Entry;

    expect(result).toStrictEqual({ id: "copy-1", path: "rt0/s2" });
  });

  it("asks the remote script once for a clip copied to several slots", async () => {
    await duplicate({
      type: "clip",
      id: "with-env",
      toPath: "rt0/s2,rt0/s1",
    });

    expect(vi.mocked(requestNode)).toHaveBeenCalledTimes(1);
  });

  it("doesn't look for envelopes when the copy stays on its return track", async () => {
    const result = (await duplicate({
      type: "clip",
      id: "with-env",
      toPath: "rt1/s2",
    })) as Entry;

    expect(result).toStrictEqual({ id: "copy-1", path: "rt1/s2" });
    expect(vi.mocked(requestNode)).not.toHaveBeenCalled();
  });

  it("names and colors the copies", async () => {
    const result = (await duplicate({
      type: "clip",
      id: "with-env",
      toPath: "rt0/s1",
      name: "Copy",
      color: "#00FF00",
    })) as Entry;

    expect(result).toStrictEqual(
      expect.objectContaining({ id: "copy-1", path: "rt0/s1" }),
    );
    expect(world.copies.get("rt0/s1")?.set).toHaveBeenCalledWith(
      "name",
      "Copy",
    );
  });

  it("says when a copy replaced the clip in its slot", async () => {
    const result = (await duplicate({
      type: "clip",
      id: "no-envs",
      toPath: "rt1/s0",
    })) as Entry;

    expect(result).toStrictEqual({
      id: "copy-1",
      path: "rt1/s0",
      detail: "overwrote the existing clip at rt1/s0",
    });
  });

  it("skips a slot past the last scene that the scenes made for it don't give", async () => {
    const result = (await duplicate({
      type: "clip",
      id: "no-envs",
      toPath: "rt1/s5,rt0/s1",
    })) as Entry[];

    expect(result[0]).toStrictEqual({
      path: "rt1/s5",
      ok: false,
      detail: expect.stringContaining("no clip slot there"),
    });
    expect(result[0]?.detail).toContain("created s3-s5");
    expect(result[1]).toStrictEqual({ id: "copy-1", path: "rt0/s1" });
  });

  it("reads where a copy of an envelope clip sits as its return slot", () => {
    expect(getMinimalClipInfo(LiveAPI.from("id no-envs"))).toStrictEqual({
      id: "no-envs",
      path: "rt0/s0",
    });
    expect(getMinimalClipInfo(LiveAPI.from("id no-envs"), "why")).toStrictEqual(
      { id: "no-envs", path: "rt0/s0", detail: "why" },
    );
  });

  it("copies several clips, one slot each", async () => {
    const result = (await duplicate({
      type: "clip",
      id: "no-envs,with-env",
      toPath: "rt0/s1,rt1/s1",
    })) as Entry[];

    expect(result).toStrictEqual([
      { id: "copy-1", path: "rt0/s1" },
      { id: "copy-2", path: "rt1/s1" },
    ]);
  });

  it("refuses a copy that would land on another source of the call", async () => {
    await expect(
      duplicate({
        type: "clip",
        id: "no-envs,with-env",
        toPath: "rt1/s0,rt0/s1",
      }),
    ).rejects.toThrow("rt1/s0");
    expect(world.copies.size).toBe(0);
  });

  it("says the copy was made when naming it fails", async () => {
    const source = world.slots[0]?.[0];
    const makeCopy = source?.methods.duplicate_clip_to as (
      target: unknown,
    ) => null;

    (source as { methods: Record<string, unknown> }).methods.duplicate_clip_to =
      (target: unknown) => {
        makeCopy(target);
        world.copies.get("rt1/s2")?.set.mockImplementation(() => {
          throw new Error("name refused");
        });

        return null;
      };

    const result = (await duplicate({
      type: "clip",
      id: "no-envs",
      toPath: "rt1/s2",
      name: "Copy",
    })) as Entry;

    expect(result).toStrictEqual(
      expect.objectContaining({ id: "copy-1", path: "rt1/s2" }),
    );
    expect(result.detail).toContain("the copy landed, but name refused");
  });

  it("says an edit the copy can't take", async () => {
    const result = (await duplicate({
      type: "clip",
      id: "no-envs",
      toPath: "rt1/s2",
      transforms: "velocity = 100",
    })) as Entry;

    expect(result.detail).toBe(
      `the copy was made, but the edit wasn't: transforms ignored: the clip is an envelope clip`,
    );
  });

  describe("destinations an envelope clip can't go to", () => {
    it.each([
      ["a regular slot", { toPath: "t0/s2" }],
      ["a regular track's arrangement", { toPath: "t0[5|1]" }],
      ["an arrangement position", { arrangementStart: "5|1" }],
    ])("refuses a lone clip sent to %s", async (_where, args) => {
      await expect(
        duplicate({ type: "clip", id: "no-envs", ...args }),
      ).rejects.toThrow(ONLY_RETURN);
      expect(world.copies.size).toBe(0);
    });

    it("skips only the destinations that can't take it in a list", async () => {
      const result = (await duplicate({
        type: "clip",
        id: "no-envs",
        toPath: "rt1/s2,t0/s2",
      })) as Entry[];

      expect(result).toStrictEqual([
        { id: "copy-1", path: "rt1/s2" },
        { path: "t0/s2", ok: false, detail: ONLY_RETURN },
      ]);
    });

    it("refuses a regular clip sent to a return track slot", async () => {
      registerRegularClipInSlot();

      await expect(
        duplicate({ type: "clip", id: "regular", toPath: "rt1/s2" }),
      ).rejects.toThrow(ONLY_ENVELOPE);
      expect(world.copies.size).toBe(0);
    });

    it("skips a regular clip's return slot beside one that can take it", async () => {
      registerRegularClipInSlot();
      registerMockObject("t0s1", {
        path: livePath.track(0).clipSlot(1),
        properties: { has_clip: 0 },
      });

      const result = (await duplicate({
        type: "clip",
        id: "regular",
        toPath: "rt1/s2,t0/s1",
      })) as Entry[];

      expect(result[0]).toStrictEqual({
        path: "rt1/s2",
        ok: false,
        detail: ONLY_ENVELOPE,
      });
    });

    it("skips a return slot beside an arrangement entry, which neither can take", async () => {
      const result = (await duplicate({
        type: "clip",
        id: "no-envs",
        toPath: "rt1/s2,t0[5|1]",
      })) as Entry[];

      expect(result).toStrictEqual([
        {
          path: "rt1/s2",
          ok: false,
          detail: expect.stringContaining(
            "a return-track slot can't take an arrangement copy",
          ),
        },
        { path: "t0[5|1]", ok: false, detail: ONLY_RETURN },
      ]);
      expect(world.copies.size).toBe(0);
    });

    it("skips a return track that isn't there", async () => {
      await expect(
        duplicate({ type: "clip", id: "no-envs", toPath: "rt9/s0" }),
      ).rejects.toThrow("return track rt9 does not exist");
      expect(world.copies.size).toBe(0);
    });
  });

  it("refuses an envelope clip or a return track slot on Live 12", async () => {
    resetWritableEnvelopeWorld("12.4.15");
    registerRegularClipInSlot();

    await expect(
      duplicate({ type: "clip", path: "rt0/s0", toPath: "rt1/s1" }),
    ).rejects.toThrow("return-track clips need Live 13");
    await expect(
      duplicate({ type: "clip", id: "regular", toPath: "rt1/s1" }),
    ).rejects.toThrow("return-track clips need Live 13");
  });
});
