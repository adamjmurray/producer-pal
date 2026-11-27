// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

// A drum pad copied to `t+` becomes a new MIDI track, made by the remote
// script. Anything that can't be copied is refused before it is asked.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { DEVICE_CONVERSION_ROUTES } from "#src/tools/shared/remote-script/device-conversions/device-conversions-contract.ts";
import { remoteScriptSetup } from "#src/tools/shared/remote-script/remote-script-setup.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  maxError: vi.fn(),
  maxLog: vi.fn(),
  emitWarning: vi.fn(),
  emitWarningOnce: vi.fn(),
}));

const RACK_PATH = String(livePath.track(0).device(0));
const NO_ANSWER = "the Producer Pal remote script did not answer in time";
const NEW_TRACK = { id: "new-track", path: "t3" };

/**
 * A Drum Rack on t0/d0 with a kick on C1 and an empty D1.
 * @param rackProperties - Overrides for the rack's own properties
 * @returns The rack mock
 */
function registerKit(
  rackProperties: Record<string, unknown> = {},
): RegisteredMockObject {
  registerMockObject("kick", {
    path: `${RACK_PATH} chains 0`,
    type: "DrumChain",
  });
  registerMockObject("pad36", {
    path: `${RACK_PATH} drum_pads 36`,
    type: "DrumPad",
    properties: { note: [36], chains: children("kick") },
  });
  registerMockObject("pad38", {
    path: `${RACK_PATH} drum_pads 38`,
    type: "DrumPad",
    properties: { note: [38], chains: [] },
  });

  return registerMockObject("rack", {
    path: RACK_PATH,
    type: "RackDevice",
    properties: {
      can_have_drum_pads: [1],
      has_drum_pads: [1],
      drum_pads: children("pad36", "pad38"),
      ...rackProperties,
    },
  });
}

/**
 * Make the rack's copy_pad land: D1 then holds a chain.
 * @param rack - The rack mock
 */
function padCopyLands(rack: RegisteredMockObject): void {
  rack.call.mockImplementation(() => {
    registerMockObject("pad38", {
      path: `${RACK_PATH} drum_pads 38`,
      type: "DrumPad",
      properties: { note: [38], chains: children("kickCopy") },
    });

    return ["id", 0];
  });
}

/**
 * Answer the conversion, with the new track there when it is made.
 * @param reply - What `requestNode` resolves with
 * @returns The new track's mock
 */
function copyAnswers(reply: {
  success: boolean;
  result?: unknown;
}): RegisteredMockObject {
  const track = registerMockObject(NEW_TRACK.id, {
    path: livePath.track(3),
    properties: { name: "Kick" },
  });

  vi.mocked(requestNode).mockResolvedValue(
    reply as Awaited<ReturnType<typeof requestNode>>,
  );

  return track;
}

const COPIED = {
  success: true,
  result: { available: true, result: { track_index: 3 } },
};

/**
 * Copy the kick (C1) to a new track.
 * @param args - Extra duplicate args merged over the defaults
 * @returns The duplicate answer
 */
function copyKickToNewTrack(
  args: Partial<Parameters<typeof duplicate>[0]> = {},
): ReturnType<typeof duplicate> {
  return duplicate({ type: "drum-pad", id: "pad36", toPath: "t+", ...args });
}

describe("duplicate drum-pad to a new track", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("copies the pad's chain to a new track and answers with it", async () => {
    registerKit();
    copyAnswers(COPIED);

    expect(await copyKickToNewTrack()).toStrictEqual(NEW_TRACK);

    const [route, args] = vi.mocked(requestNode).mock.calls[0] ?? [];

    expect(route).toBe(DEVICE_CONVERSION_ROUTES.drumPadToTrack);
    expect(args).toStrictEqual({
      devicePath: RACK_PATH,
      note: 36,
      expiresInMs: expect.any(Number),
    });
  });

  it("names the new track when the call gives a name", async () => {
    registerKit();

    const track = copyAnswers(COPIED);

    expect(await copyKickToNewTrack({ name: "Kick Bus" })).toStrictEqual(
      NEW_TRACK,
    );
    expect(track.set).toHaveBeenCalledExactlyOnceWith("name", "Kick Bus");
  });

  it("leaves the new track's name to Live when the call gives none", async () => {
    registerKit();

    const track = copyAnswers(COPIED);

    await copyKickToNewTrack();

    expect(track.set).not.toHaveBeenCalled();
  });

  it("answers with a pad copy and a new track from one toPath list", async () => {
    padCopyLands(registerKit());
    copyAnswers(COPIED);

    expect(await copyKickToNewTrack({ toPath: "t+,t0/d0/pD1" })).toStrictEqual([
      NEW_TRACK,
      { id: "pad38", path: "t0/d0/pD1" },
    ]);
    expect(requestNode).toHaveBeenCalledOnce();
  });

  describe("refused before the remote script is asked", () => {
    it("refuses an empty pad", async () => {
      registerKit();
      registerMockObject("pad36", {
        path: `${RACK_PATH} drum_pads 36`,
        type: "DrumPad",
        properties: { note: [36], chains: [] },
      });

      await expect(copyKickToNewTrack()).rejects.toThrow(
        "drum pad t0/d0/pC1 (id pad36) is empty, nothing to copy",
      );
      expect(requestNode).not.toHaveBeenCalled();
    });

    it("names a pad the rack doesn't list by its note", async () => {
      registerKit({ drum_pads: children("pad38") });

      await expect(copyKickToNewTrack()).rejects.toThrow(
        "drum pad C1 is empty, nothing to copy",
      );
      expect(requestNode).not.toHaveBeenCalled();
    });

    it("refuses a rack with no pads, such as one nested in a pad", async () => {
      registerKit({ has_drum_pads: [0] });

      await expect(copyKickToNewTrack()).rejects.toThrow("has no pads");
      expect(requestNode).not.toHaveBeenCalled();
    });

    it("refuses a pad holding the Producer Pal device", async () => {
      registerKit();
      registerMockObject("this_device", {
        path: `${RACK_PATH} chains 0 devices 0`,
      });

      await expect(copyKickToNewTrack()).rejects.toThrow(
        "cannot duplicate drum pad t0/d0/pC1 (id pad36): it holds the Producer Pal device",
      );
      expect(requestNode).not.toHaveBeenCalled();
    });
  });

  describe("a copy that didn't happen", () => {
    let rack: RegisteredMockObject;

    beforeEach(() => {
      rack = registerKit();
    });

    it("says why when the remote script refuses", async () => {
      copyAnswers({
        success: true,
        result: { available: true, error: "Live said no" },
      });

      await expect(copyKickToNewTrack()).rejects.toThrow(
        "not copied: Live said no",
      );
    });

    it("passes on the remote script's refusal of a pad holding Producer Pal", async () => {
      copyAnswers({
        success: true,
        result: {
          available: true,
          error: "the pad holds the Producer Pal device",
        },
      });

      await expect(copyKickToNewTrack()).rejects.toThrow(
        "not copied: the pad holds the Producer Pal device",
      );
    });

    it.each([
      ["a caller with ppal-manage", true],
      ["a caller without it", false],
    ])("says the remote script isn't answering to %s", async (_n, manage) => {
      copyAnswers({ success: true, result: { available: false } });

      await expect(
        duplicate(
          { type: "drum-pad", id: "pad36", toPath: "t+" },
          { manageAvailable: manage },
        ),
      ).rejects.toThrow(
        `not copied: a pad's copy to a new track needs the Producer Pal remote script, which isn't answering; ${remoteScriptSetup(manage)}`,
      );
    });

    it("says when the remote script is out of date, as it words it", async () => {
      const outdated = "the Producer Pal remote script is out of date";

      copyAnswers({
        success: true,
        result: {
          available: false,
          outdated,
          outdatedWithoutManage: outdated,
        },
      });

      await expect(copyKickToNewTrack()).rejects.toThrow(outdated);
    });

    it("says it may have copied when nothing answers", async () => {
      copyAnswers({ success: false });

      await expect(copyKickToNewTrack()).rejects.toThrow(
        `may have copied: ${NO_ANSWER}; look for a new track before copying again`,
      );
    });

    it("says so too when the route throws", async () => {
      vi.mocked(requestNode).mockRejectedValue(new Error("channel closed"));

      await expect(copyKickToNewTrack()).rejects.toThrow(
        `may have copied: ${NO_ANSWER} (channel closed)`,
      );
    });

    it("keeps the other destination's copy when the new track fails", async () => {
      padCopyLands(rack);
      copyAnswers({
        success: true,
        result: { available: true, error: "Live said no" },
      });

      expect(
        await copyKickToNewTrack({ toPath: "t+,t0/d0/pD1" }),
      ).toStrictEqual([
        { path: "t+", ok: false, detail: "not copied: Live said no" },
        { id: "pad38", path: "t0/d0/pD1" },
      ]);
    });
  });
});
