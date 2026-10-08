// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Live can fail at any step of parking, stamping and putting the clip back. The
// entry says what changed and where the clip is, and the original's content is
// never deleted until it is back.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { deleteMockObject } from "#src/test/mocks/mock-registry.ts";
import { applyClipEnvelopes } from "#src/tools/clip/envelopes/apply-clip-envelopes.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import {
  CLIP_ID,
  type LaneWorld,
  registerLaneWorld,
} from "./lane-world-test-helpers.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

/** The parked copy is the first clip Live makes, a bar past the Set's end. */
const PARKED_ID = "800";
const PARKED_PATH = "t0[10|1]";

/** The empty clip the stamp leaves in place of the original. */
const STAMPED_ID = "801";

/** The put-back copy. */
const RESTORED_ID = "802";

/**
 * Make one of the arrangement copies fail.
 * @param world - The Set
 * @param failing - Which copy (0 parks, 1 stamps, 2 puts back), and how
 */
function failCopy(
  world: LaneWorld,
  failing: Record<number, "throw" | "no-copy">,
) {
  world.onCopy = ({ count }) => {
    if (failing[count] === "throw") {
      throw new Error("boom");
    }

    return failing[count] === "no-copy" ? "decline" : undefined;
  };
}

/**
 * @param world - The Set
 * @param id - A clip whose delete throws
 */
function failDelete(world: LaneWorld, id: string): void {
  world.onDelete = (deleting) => {
    if (deleting === id) {
      throw new Error("boom");
    }
  };
}

describe("arrangement envelopes - failure after Live changed", () => {
  let world: LaneWorld;

  beforeEach(() => {
    vi.mocked(requestNode).mockReset();
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: true, result: {} },
    });
    world = registerLaneWorld();
  });

  /**
   * @returns The clip's entry after writing one line
   */
  async function apply(): Promise<ClipResult> {
    const entry: ClipResult = { id: CLIP_ID, path: "t0[5|1]" };

    await applyClipEnvelopes(entry, [
      { target: "volume", notation: "1|1 0 / 3|1 1" },
    ]);

    return entry;
  }

  it.each([
    ["throws", "throw", "boom"],
    ["makes no copy", "no-copy", "Live made no copy"],
  ] as const)("changes nothing when parking %s", async (_name, how, why) => {
    failCopy(world, { 0: how });

    const entry = await apply();

    expect(entry).toStrictEqual({
      id: CLIP_ID,
      path: "t0[5|1]",
      envelopes: 0,
      detail: `not written: couldn't park the clip (${why}); it and the lane are unchanged`,
    });
    expect(world.copies).toHaveLength(1);
    expect(world.laneIds()).toStrictEqual([CLIP_ID]);
    expect(world.deleted).toStrictEqual([]);
    expect(world.scratchClipLeft()).toBe(false);
    expect(world.sceneCount()).toBe(1);
  });

  it.each([
    ["throws", "throw", "boom"],
    ["makes no copy", "no-copy", "Live made no copy"],
  ] as const)(
    "deletes the parked copy and keeps the clip when the stamp %s",
    async (_name, how, why) => {
      failCopy(world, { 1: how });

      const entry = await apply();

      expect(entry).toStrictEqual({
        id: CLIP_ID,
        path: "t0[5|1]",
        envelopes: 0,
        detail: `not written: couldn't write the lane (${why}); the clip is unchanged`,
      });
      expect(world.copies).toHaveLength(2);
      expect(world.deleted).toStrictEqual([PARKED_ID]);
      expect(world.laneIds()).toStrictEqual([CLIP_ID]);
      expect(world.scratchClipLeft()).toBe(false);
    },
  );

  it("says where the parked copy is left when it can't be deleted after a failed stamp", async () => {
    failCopy(world, { 1: "throw" });
    failDelete(world, PARKED_ID);

    const entry = await apply();

    expect(entry.detail).toBe(
      `not written: couldn't write the lane (boom); the clip is unchanged; left a copy of the clip parked at ${PARKED_PATH} (id ${PARKED_ID}): boom; delete it`,
    );
    expect(world.laneIds()).toStrictEqual([CLIP_ID, PARKED_ID]);
  });

  it("puts the clip back when a stamp that threw had already replaced it", async () => {
    world.onCopy = ({ count }) => {
      if (count === 1) {
        deleteMockObject(CLIP_ID);

        throw new Error("boom");
      }

      return undefined;
    };

    const entry = await apply();

    // The failed stamp made no copy, so the put-back is the second.
    expect(entry).toStrictEqual({
      id: STAMPED_ID,
      path: "t0[5|1]",
      envelopes: 1,
    });
    expect(world.deleted).toStrictEqual([PARKED_ID]);
  });

  it.each([
    ["throws", "throw", "boom"],
    ["makes no copy", "no-copy", "Live made no copy"],
  ] as const)(
    "keeps the parked copy and names it when putting the clip back %s",
    async (_name, how, why) => {
      failCopy(world, { 2: how });

      const entry = await apply();

      expect(entry).toStrictEqual({
        id: PARKED_ID,
        path: PARKED_PATH,
        envelopes: 1,
        detail: `couldn't put the clip back (${why}); already changed: the lane was written and the clip was replaced by an empty clip carrying the automation; its copy is parked at ${PARKED_PATH} (id ${PARKED_ID}), so move it back`,
      });
      expect(world.deleted).toStrictEqual([]);
      expect(world.laneIds()).toStrictEqual([STAMPED_ID, PARKED_ID]);
      expect(world.scratchClipLeft()).toBe(false);
    },
  );

  it("still names the parked copy when its position can't be read", async () => {
    world.onCopy = ({ count }) => {
      if (count === 2) {
        deleteMockObject(PARKED_ID);

        throw new Error("boom");
      }

      return undefined;
    };

    const entry = await apply();

    expect(entry.id).toBe(PARKED_ID);
    expect(entry).not.toHaveProperty("path");
    expect(entry.detail).toContain(
      `its copy is parked past the end of the arrangement (id ${PARKED_ID})`,
    );
  });

  it("says where the parked copy is left when it can't be deleted after the clip is back", async () => {
    failDelete(world, PARKED_ID);

    const entry = await apply();

    expect(entry).toStrictEqual({
      id: RESTORED_ID,
      path: "t0[5|1]",
      envelopes: 1,
      detail: `left a copy of the clip parked at ${PARKED_PATH} (id ${PARKED_ID}): boom; delete it`,
    });
    expect(world.laneIds()).toStrictEqual([RESTORED_ID, PARKED_ID]);
  });

  it("says a scratch clip it couldn't remove, and still removes its scene", async () => {
    world.onSlotDelete = () => {
      throw new Error("boom");
    };

    const entry = await apply();

    expect(entry).toStrictEqual({
      id: RESTORED_ID,
      path: "t0[5|1]",
      envelopes: 1,
      detail: "couldn't remove the scratch session clip (boom)",
    });
    expect(world.sceneCount()).toBe(1);
  });
});
