// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import { updateLiveSet } from "#src/tools/live-set/update-live-set.ts";
import { setupLocatorCreationMocks } from "../update-live-set-test-helpers.ts";

describe("updateLiveSet - locator creation past the song end", () => {
  let liveSet: RegisteredMockObject;
  let track: RegisteredMockObject;
  let newCue: RegisteredMockObject;

  beforeEach(() => {
    liveSet = registerMockObject("live_set_id", { path: "live_set" });
    track = registerMockObject("t1", {
      path: "live_set tracks 0",
      properties: { has_midi_input: 1 },
    });
    registerMockObject("temp-clip", {
      path: "live_set tracks 0 arrangement_clips 0",
      properties: { is_arrangement_clip: 1 },
    });
  });

  /**
   * Creation mocks for a song 8 beats long, so a locator at 5|1 (16 beats)
   * needs a temp clip, and a track that makes one.
   * @param deleteClip - What the track's delete_clip does
   */
  function setup(deleteClip: () => void): void {
    ({ newCue } = setupLocatorCreationMocks(liveSet, {
      time: 16,
      songLength: 8,
    }));

    const answer = liveSet.get.getMockImplementation()!;

    liveSet.get.mockImplementation((prop: string) =>
      prop === "tracks" ? children("t1") : answer(prop),
    );

    track.call.mockImplementation((method: string) => {
      if (method === "create_midi_clip") {
        return ["id", "temp-clip"];
      }

      if (method === "delete_clip") {
        deleteClip();
      }

      return undefined;
    });
  }

  it("creates the locator and leaves no detail when cleanup works", async () => {
    setup(() => {});

    const result = await updateLiveSet({
      locatorOperation: "create",
      locatorTime: "5|1",
    });

    expect(result.locator).toStrictEqual({ operation: "create", id: "26" });
  });

  it("keeps the created locator's entry when removing the temp clip throws", async () => {
    setup(() => {
      throw new Error("Live says no");
    });

    const result = await updateLiveSet({
      locatorOperation: "create",
      locatorTime: "5|1",
    });

    expect(result.locator).toStrictEqual({
      operation: "create",
      id: "26",
      detail: "couldn't remove the temp arrangement clip (Live says no)",
    });
  });

  it("warns about the leftover clip when the toggle itself fails", async () => {
    setup(() => {
      throw new Error("Live says no");
    });
    liveSet.call.mockImplementation(() => {
      throw new Error("toggle failed");
    });

    const result = await updateLiveSet({
      locatorOperation: "create",
      locatorTime: "5|1",
    }).catch((error: unknown) => error);

    expect(String(result)).toContain("toggle failed");
    expect(capturedWarnings()).toStrictEqual([
      expect.stringContaining("couldn't remove the temp arrangement clip"),
    ]);
  });

  it("warns about the leftover clip when naming the locator fails", async () => {
    setup(() => {
      throw new Error("Live says no");
    });
    newCue.set.mockImplementation(() => {
      throw new Error("name refused");
    });

    const result = await updateLiveSet({
      locatorOperation: "create",
      locatorTime: "5|1",
      locatorName: "Verse",
    });

    expect(result.locator).toStrictEqual({
      operation: "create",
      id: "26",
      detail: "name refused; already changed: created",
    });
    expect(capturedWarnings()).toStrictEqual([
      expect.stringContaining("couldn't remove the temp arrangement clip"),
    ]);
  });
});
