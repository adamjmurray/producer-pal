// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Placing a hosted param on a Live 13 return track's wrapper: a track that plays
// a session clip hides its arrangement automation, so no slot is reclaimed.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { hostedSlots } from "#src/tools/clip/envelopes/hosted/hosted-slots.ts";
import { ENVELOPE_ROUTES } from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import {
  answerAsWrapper,
  answerRoutes,
  FULL_BANK,
  routeArgs,
  setupTrack,
} from "./hosted-envelope-test-helpers.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

const TARGET = {
  devicePath: "rt0/d0",
  deviceId: "device-123",
  remotePath: "d0",
  index: 206,
};

const BANK_FULL = "all 4 automation slots of rt0/d0 are in use";
const CANT_TELL = "can't be told while the track plays from Session";

/**
 * Place a param on a full wrapper of the clip's return track.
 * @returns What the placer answered
 */
async function placeOnReturn() {
  answerAsWrapper(FULL_BANK);

  return await hostedSlots({
    track: { kind: "return", index: 0 },
    deadline: null,
    manage: true,
  }).place(TARGET, false);
}

describe("hosted slots on a return track", () => {
  beforeEach(() => {
    clearMockRegistry();
    answerRoutes();
  });

  /**
   * @param version - The version Live reports
   */
  function liveIs(version: string): void {
    registerMockObject("live_app", {
      path: "live_app",
      methods: { get_version_string: () => version },
    });
  }

  it.each([
    ["plays a session clip", 0],
    ["was stopped in Session", -2],
  ])("reclaims no slot on Live 13 when the return %s", async (_how, slot) => {
    liveIs("13.0");

    const track = setupTrack({ onReturn: true, playingSlot: slot });

    expect(await placeOnReturn()).toStrictEqual({
      ok: false,
      reason: expect.stringContaining(
        `${BANK_FULL}, and which have automation ${CANT_TELL}`,
      ) as unknown,
    });
    expect(track.get).toHaveBeenCalledWith("playing_slot_index");
    expect(requestNode).not.toHaveBeenCalledWith(
      ENVELOPE_ROUTES.list,
      expect.anything(),
      expect.anything(),
    );
  });

  it("checks the return's own clips for a free slot when it follows the arrangement", async () => {
    liveIs("13.0");
    setupTrack({ onReturn: true });
    answerRoutes([1, 2, 3, 4].map((index) => ({ device: "d0", index })));

    const placed = await placeOnReturn();

    expect(placed).toStrictEqual({
      ok: false,
      reason: expect.stringContaining(BANK_FULL) as unknown,
    });
    expect(!placed.ok && placed.reason).not.toContain(CANT_TELL);
    expect(routeArgs(ENVELOPE_ROUTES.list)).toStrictEqual({
      track: "rt0",
      slot: 0,
    });
  });

  it("never asks a Live 12 return track where it plays, and checks its clips", async () => {
    liveIs("12.3");

    const track = setupTrack({ onReturn: true, playingSlot: 0 });
    const placed = await placeOnReturn();

    expect(track.get).not.toHaveBeenCalledWith("playing_slot_index");
    expect(!placed.ok && placed.reason).not.toContain(CANT_TELL);
  });
});
