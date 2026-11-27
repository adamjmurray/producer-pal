// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

// `convert: "drum-rack"` runs through the remote script after the track's other
// edits. Its entry names the new track, or says why there isn't one.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { DEVICE_CONVERSION_ROUTES } from "#src/tools/shared/remote-script/device-conversions/device-conversions-contract.ts";
import { remoteScriptSetup } from "#src/tools/shared/remote-script/remote-script-setup.ts";
import { updateTrack } from "../update-track.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

const ONLY_REGULAR = "not converted: only a regular track can be converted";
const NO_ANSWER = "the Producer Pal remote script did not answer in time";
const REMOVED =
  "the track had no clips, so Live removed it: its devices and name are on the new track";

/**
 * Answer the conversion, registering the new track it makes at each index it
 * reports.
 * @param results - What the route says, one per call
 */
function conversionAnswers(...results: unknown[]): void {
  const mock = vi.mocked(requestNode);

  for (const result of results) {
    mock.mockImplementationOnce((async () => {
      const made = (result as { result?: { track_index?: number } }).result;

      if (made?.track_index != null) {
        registerMockObject(`made-${made.track_index}`, {
          path: livePath.track(made.track_index),
          properties: { name: `Kit ${made.track_index}` },
        });
      }

      return { success: true, result };
    }) as unknown as typeof requestNode);
  }
}

/**
 * What the remote script says for a conversion that worked.
 * @param trackIndex - Where the new track is
 * @param sourceRemoved - Whether Live deleted the source
 * @returns The route's reply
 */
function converted(trackIndex: number, sourceRemoved = false): unknown {
  return {
    available: true,
    result: { track_index: trackIndex, source_removed: sourceRemoved },
  };
}

describe("updateTrack - convert", () => {
  let source: RegisteredMockObject;

  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
    source = registerMockObject("123", {
      path: livePath.track(0),
      properties: { name: "Drums" },
    });
  });

  it("answers with the new track, asking the remote script for the source", async () => {
    conversionAnswers(converted(1));

    expect(
      await updateTrack({ id: "123", convert: "drum-rack" }),
    ).toStrictEqual({
      id: "123",
      path: "t0",
      converted: { track: { id: "made-1", path: "t1", name: "Kit 1" } },
    });

    const [route, args] = vi.mocked(requestNode).mock.calls[0] ?? [];

    expect(route).toBe(DEVICE_CONVERSION_ROUTES.trackToDrumRack);
    expect(args).toStrictEqual({
      track: "t0",
      expiresInMs: expect.any(Number),
    });
  });

  it("drops the path and says why when Live removed the source track", async () => {
    conversionAnswers(converted(0, true));

    expect(
      await updateTrack({ id: "123", convert: "drum-rack" }),
    ).toStrictEqual({
      id: "123",
      converted: {
        track: { id: "made-0", path: "t0", name: "Kit 0" },
        sourceRemoved: true,
      },
      detail: REMOVED,
    });
  });

  it("converts last, so the track's other edits land and report", async () => {
    conversionAnswers(converted(1));

    expect(
      await updateTrack({ id: "123", name: "Kit", convert: "drum-rack" }),
    ).toStrictEqual({
      id: "123",
      path: "t0",
      converted: { track: { id: "made-1", path: "t1", name: "Kit 1" } },
    });
    expect(source.set).toHaveBeenCalledWith("name", "Kit");

    const setOrder = source.set.mock.invocationCallOrder[0] as number;
    const routeOrder = vi.mocked(requestNode).mock
      .invocationCallOrder[0] as number;

    expect(setOrder).toBeLessThan(routeOrder);
  });

  it("converts each of several tracks", async () => {
    registerMockObject("456", { path: livePath.track(1) });
    conversionAnswers(converted(5), converted(6));

    expect(
      await updateTrack({ ids: "123,456", convert: "drum-rack" }),
    ).toStrictEqual([
      {
        id: "123",
        path: "t0",
        converted: { track: { id: "made-5", path: "t5", name: "Kit 5" } },
      },
      {
        id: "456",
        path: "t1",
        converted: { track: { id: "made-6", path: "t6", name: "Kit 6" } },
      },
    ]);
    expect(
      vi.mocked(requestNode).mock.calls.map(([, args]) => args),
    ).toStrictEqual([
      { track: "t0", expiresInMs: expect.any(Number) },
      { track: "t1", expiresInMs: expect.any(Number) },
    ]);
  });

  it("answers synchronously, never a promise, without convert", () => {
    const answer = updateTrack({ id: "123", name: "Kit" });

    expect(answer).not.toBeInstanceOf(Promise);
    expect(requestNode).not.toHaveBeenCalled();
  });

  describe("a track that can't be converted", () => {
    beforeEach(() => {
      registerMockObject("ret", {
        path: livePath.returnTrack(0),
        properties: { name: "A-Reverb" },
      });
      registerMockObject("main", {
        path: livePath.masterTrack(),
        properties: { name: "Main" },
      });
    });

    it.each([
      ["a return track", "ret"],
      ["the main track", "main"],
    ])("refuses %s, without asking the remote script", async (_name, id) => {
      await expect(updateTrack({ id, convert: "drum-rack" })).rejects.toThrow(
        ONLY_REGULAR,
      );
      expect(requestNode).not.toHaveBeenCalled();
    });

    it("keeps the entry and says so beside an edit that landed", async () => {
      expect(
        await updateTrack({ id: "ret", name: "Verb", convert: "drum-rack" }),
      ).toStrictEqual(
        expect.objectContaining({
          id: "ret",
          detail: expect.stringContaining(ONLY_REGULAR),
        }),
      );
      expect(requestNode).not.toHaveBeenCalled();
    });
  });

  describe("a track holding the Producer Pal device", () => {
    const HOLDS = "not converted: the track holds the Producer Pal device";

    it.each([
      ["directly", `${livePath.track(0)} devices 2`],
      [
        "inside a rack chain",
        `${livePath.track(0)} devices 0 chains 1 devices 0`,
      ],
      [
        "inside a rack's return chain",
        `${livePath.track(0)} devices 0 return_chains 0 devices 0`,
      ],
      [
        "inside a drum pad's chain",
        `${livePath.track(0)} devices 0 chains 0 devices 0 chains 0 devices 0`,
      ],
    ])("refuses it %s, without asking the remote script", async (_n, host) => {
      registerMockObject("this_device", { path: host });

      await expect(
        updateTrack({ id: "123", convert: "drum-rack" }),
      ).rejects.toThrow(HOLDS);
      expect(requestNode).not.toHaveBeenCalled();
    });

    it("keeps the entry and says so beside an edit that landed", async () => {
      registerMockObject("this_device", {
        path: `${livePath.track(0)} devices 0`,
      });

      expect(
        await updateTrack({ id: "123", name: "Kit", convert: "drum-rack" }),
      ).toStrictEqual({ id: "123", path: "t0", detail: HOLDS });
      expect(source.set).toHaveBeenCalledWith("name", "Kit");
      expect(requestNode).not.toHaveBeenCalled();
    });

    it("converts another track, and refuses only the one that holds it", async () => {
      registerMockObject("456", { path: livePath.track(1) });
      registerMockObject("this_device", {
        path: `${livePath.track(1)} devices 0`,
      });
      conversionAnswers(converted(5));

      expect(
        await updateTrack({
          ids: "123,456",
          name: "Kit",
          convert: "drum-rack",
        }),
      ).toStrictEqual([
        {
          id: "123",
          path: "t0",
          converted: { track: { id: "made-5", path: "t5", name: "Kit 5" } },
        },
        { id: "456", path: "t1", detail: HOLDS },
      ]);
      expect(requestNode).toHaveBeenCalledTimes(1);
    });

    it("shows the remote script's own refusal as the same one", async () => {
      conversionAnswers({
        available: true,
        error: "the track holds the Producer Pal device",
      });

      await expect(
        updateTrack({ id: "123", convert: "drum-rack" }),
      ).rejects.toThrow(HOLDS);
    });
  });

  describe("a conversion that didn't happen", () => {
    it("says why when the remote script refuses", async () => {
      conversionAnswers({ available: true, error: "Live said no" });

      await expect(
        updateTrack({ id: "123", convert: "drum-rack" }),
      ).rejects.toThrow("not converted: Live said no");
    });

    it("keeps the other edits when the remote script refuses", async () => {
      conversionAnswers({ available: true, error: "Live said no" });

      expect(
        await updateTrack({ id: "123", name: "Kit", convert: "drum-rack" }),
      ).toStrictEqual({
        id: "123",
        path: "t0",
        detail: "not converted: Live said no",
      });
    });

    it.each([
      ["a caller with ppal-manage", true],
      ["a caller without it", false],
    ])("says the remote script isn't answering to %s", async (_n, manage) => {
      conversionAnswers({ available: false });

      await expect(
        updateTrack(
          { id: "123", convert: "drum-rack" },
          { manageAvailable: manage },
        ),
      ).rejects.toThrow(
        `not converted: it needs the Producer Pal remote script, which isn't answering; ${remoteScriptSetup(manage)}`,
      );
    });

    it("says when the remote script is out of date, as it words it", async () => {
      const outdated = "the Producer Pal remote script is out of date";

      conversionAnswers({
        available: false,
        outdated,
        outdatedWithoutManage: outdated,
      });

      await expect(
        updateTrack({ id: "123", convert: "drum-rack" }),
      ).rejects.toThrow(new RegExp(`^${outdated}$`, "u"));
    });

    it("keeps the entry and says it may have converted when nothing answers", async () => {
      vi.mocked(requestNode).mockResolvedValue({ success: false });

      expect(
        await updateTrack({ id: "123", convert: "drum-rack" }),
      ).toStrictEqual({
        id: "123",
        path: "t0",
        detail: expect.stringContaining(
          `may have converted: ${NO_ANSWER}; look for a new track before converting again`,
        ),
      });
    });

    it("says so too when the route throws", async () => {
      vi.mocked(requestNode).mockRejectedValue(new Error("channel closed"));

      expect(
        await updateTrack({ id: "123", convert: "drum-rack" }),
      ).toStrictEqual(
        expect.objectContaining({
          id: "123",
          detail: expect.stringContaining(
            `may have converted: ${NO_ANSWER} (channel closed)`,
          ),
        }),
      );
    });
  });
});
