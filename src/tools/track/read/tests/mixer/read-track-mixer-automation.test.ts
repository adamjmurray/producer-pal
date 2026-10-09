// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { type RegisteredMockObject } from "#src/test/mocks/mock-registry.ts";
import { setupTrackMixerMocks } from "../helpers/read-track-registry-test-helpers.ts";
import { readOneTrack } from "../../read-track.ts";

const RETURN_TRACKS = [
  { name: "A-Echo", id: "return1" },
  { name: "B-Verb", id: "return2" },
];
const UNKNOWN =
  "arrangement automation unknown while the track plays from Session";

describe("readOneTrack - mixer automation", () => {
  it("names the automated fields, marking overridden ones", () => {
    setupTrackMixerMocks({
      volumeProperties: { automation_state: 1 },
      panningProperties: { automation_state: 2 },
      sendIds: ["send_1", "send_2"],
      sendValues: [-12, -6],
      sendProperties: [{ automation_state: 1 }, { automation_state: 0 }],
    });

    const result = readOneTrack({
      trackIndex: 0,
      include: ["mixer"],
      returnTracks: RETURN_TRACKS,
    });

    expect(result.automation).toStrictEqual([
      "gainDb",
      "pan (overridden)",
      "send A-Echo",
    ]);
    expect(result).not.toHaveProperty("detail");
  });

  it("names split pans only when they are shown", () => {
    setupTrackMixerMocks({
      panningMode: 1,
      leftSplitProperties: { automation_state: 1 },
      rightSplitProperties: { automation_state: 2 },
      // A hidden pan lane is not reported
      panningProperties: { automation_state: 1 },
    });

    const result = readOneTrack({ trackIndex: 0, include: ["mixer"] });

    expect(result.automation).toStrictEqual([
      "leftPan",
      "rightPan (overridden)",
    ]);
  });

  it("names a send by the generic label when no return lines up", () => {
    setupTrackMixerMocks({
      sendIds: ["send_1"],
      sendValues: [0],
      sendProperties: [{ automation_state: 2 }],
    });

    const result = readOneTrack({
      trackIndex: 0,
      include: ["mixer"],
      returnTracks: [],
    });

    expect(result.automation).toStrictEqual(["send Return 1 (overridden)"]);
  });

  it("omits the field when nothing is automated", () => {
    setupTrackMixerMocks({
      sendIds: ["send_1", "send_2"],
      sendValues: [0, 0],
    });

    const result = readOneTrack({
      trackIndex: 0,
      include: ["mixer"],
      returnTracks: RETURN_TRACKS,
    });

    expect(result).not.toHaveProperty("automation");
    expect(result).not.toHaveProperty("detail");
  });

  it("leaves it out without the mixer include", () => {
    setupTrackMixerMocks({ volumeProperties: { automation_state: 1 } });

    const result = readOneTrack({ trackIndex: 0 });

    expect(result).not.toHaveProperty("automation");
    expect(result).not.toHaveProperty("detail");
  });

  it.each([
    ["stopped in Session", -2],
    ["a session clip playing", 0],
  ])("says it is unknown when the track is %s", (_label, slot) => {
    setupTrackMixerMocks({
      trackProperties: { playing_slot_index: slot },
      volumeProperties: { automation_state: 1 },
    });

    const result = readOneTrack({ trackIndex: 0, include: ["mixer"] });

    expect(result).not.toHaveProperty("automation");
    expect(result.detail).toBe(UNKNOWN);
  });

  it("adds the reason to the send count mismatch", () => {
    setupTrackMixerMocks({
      trackProperties: { playing_slot_index: -2 },
      sendIds: ["send_1", "send_2"],
      sendValues: [0, 0],
    });

    const result = readOneTrack({
      trackIndex: 0,
      include: ["mixer"],
      returnTracks: RETURN_TRACKS.slice(0, 1),
    });

    expect(result.detail).toBe(
      `send count (2) doesn't match return track count (1); ${UNKNOWN}`,
    );
  });

  it("says nothing about automation when the track has no mixer", () => {
    setupTrackMixerMocks({
      trackProperties: { playing_slot_index: -2 },
      mixerExists: false,
    });

    const result = readOneTrack({ trackIndex: 0, include: ["mixer"] });

    expect(result).not.toHaveProperty("detail");
  });

  it("treats a return track as following the arrangement", () => {
    const { track } = setupTrackMixerMocks({
      trackPath: String(livePath.returnTrack(0)),
      trackId: "return1",
      trackProperties: { has_midi_input: 0, name: "A-Echo" },
      volumeProperties: { automation_state: 1 },
    });

    const result = readOneTrack({
      trackIndex: 0,
      trackType: "return",
      include: ["mixer"],
      returnTracks: RETURN_TRACKS,
    });

    expect(result.automation).toStrictEqual(["gainDb"]);
    expect(result).not.toHaveProperty("detail");
    expect(slotIndexReads(track)).toBe(0);
  });

  it("treats the main track as following the arrangement", () => {
    const { track } = setupTrackMixerMocks({
      trackPath: String(livePath.masterTrack()),
      trackId: "master",
      trackProperties: { has_midi_input: 0, name: "Master" },
      panningProperties: { automation_state: 2 },
    });

    const result = readOneTrack({ trackType: "master", include: ["mixer"] });

    expect(result.automation).toStrictEqual(["pan (overridden)"]);
    expect(result).not.toHaveProperty("detail");
    expect(slotIndexReads(track)).toBe(0);
  });
});

/**
 * How many times the track's playing_slot_index was asked for.
 * @param track - Track mock
 * @returns Number of reads
 */
function slotIndexReads(track: RegisteredMockObject): number {
  return track.get.mock.calls.filter(([name]) => name === "playing_slot_index")
    .length;
}
