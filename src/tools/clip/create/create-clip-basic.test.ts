// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { createClip } from "./create-clip.ts";
import {
  expectClipCreated,
  expectNotesAdded,
  note,
} from "./create-clip-test-helpers.ts";

function setupSessionMocks(
  opts: {
    liveSet?: Record<string, unknown>;
    clipSlot?: Record<string, unknown>;
    clip?: Record<string, unknown>;
  } = {},
): { clipSlot: RegisteredMockObject; clip: RegisteredMockObject } {
  registerMockObject("live-set", {
    path: "live_set",
    properties: opts.liveSet,
  });
  const clipSlot = registerMockObject("clip-slot-0-0", {
    path: livePath.track(0).clipSlot(0),
    properties: { has_clip: 0, ...opts.clipSlot },
  });
  const clip = registerMockObject("live_set/tracks/0/clip_slots/0/clip", {
    path: livePath.track(0).clipSlot(0).clip(),
    properties: opts.clip,
  });

  return { clipSlot, clip };
}

describe("createClip - basic validation and time signatures", () => {
  it("should throw error when required parameters are missing", async () => {
    await expect(
      createClip({} as Parameters<typeof createClip>[0]),
    ).rejects.toThrow("createClip failed: view parameter is required");
    // Note: trackIndex validation is handled by TypeScript at compile time
    await expect(
      createClip({ view: "session", trackIndex: 0 }),
    ).rejects.toThrow(
      "createClip failed: sceneIndex is required when view is 'session'",
    );
    await expect(
      createClip({ view: "arrangement", trackIndex: 0 }),
    ).rejects.toThrow(
      "createClip failed: arrangementStart is required when view is 'arrangement'",
    );
  });

  it("should throw error for invalid sceneIndex format", async () => {
    await expect(
      createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "invalid",
      }),
    ).rejects.toThrow(
      'createClip failed: Invalid index "invalid" - must be a valid integer',
    );
  });

  it("should validate time signature early when provided", async () => {
    await expect(
      createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "0",
        timeSignature: "invalid",
      }),
    ).rejects.toThrow("Time signature must be in format");
  });

  it("should read time signature from song when not provided", async () => {
    const { clip } = setupSessionMocks({
      liveSet: { signature_numerator: 3, signature_denominator: 4 },
      clip: { length: 6 }, // 2 bars in 3/4 time = 6 beats
    });

    const result = await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      notes: "C3 1|1 D3 2|1", // Should parse with 3 beats per bar from song
    });

    expect(result).toStrictEqual({
      id: "live_set/tracks/0/clip_slots/0/clip",
      trackIndex: 0,
      sceneIndex: 0,
      noteCount: 2,
      length: "2:0",
    });

    // Verify the parsed notes were correctly added to the clip
    expectNotesAdded(clip, [
      note(60, 0, 1), // C3
      note(62, 3, 1), // D3 at 3 beats per bar in 3/4
    ]);
  });

  it("should parse notes using provided time signature", async () => {
    const { clip } = setupSessionMocks();

    await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      timeSignature: "3/4",
      notes: "C3 1|1 D3 2|1", // Should parse with 3 beats per bar
    });

    expectNotesAdded(clip, [note(60, 0, 1), note(62, 3, 1)]);
  });

  it("should correctly handle 6/8 time signature with Ableton's quarter-note beats", async () => {
    const { clip } = setupSessionMocks();

    await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      timeSignature: "6/8",
      notes: "C3 1|1 D3 2|1",
    });

    // In 6/8, beat 2|1 should be 3 Ableton beats (6 musical beats * 4/8 = 3 Ableton beats)
    expectNotesAdded(clip, [note(60, 0, 0.5), note(62, 3, 0.5)]);
  });

  it("should create clip with specified length", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 4 },
    });

    await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      length: "1:3",
      looping: false,
    });

    expectClipCreated(clipSlot, 7);
  });

  it("should create clip with specified length for looping clips", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 4 },
    });

    await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      length: "2:0",
      looping: true,
    });

    expectClipCreated(clipSlot, 8);
  });

  it("should calculate clip length from notes when markers not provided", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      notes: "t2 C3 1|1 t1.5 D3 1|4", // Last note starts at beat 3 (0-based), rounds up to 1 bar = 4 beats
    });

    expectClipCreated(clipSlot, 4);
  });

  it("should handle time signatures with denominators other than 4", async () => {
    const { clipSlot, clip } = setupSessionMocks({
      liveSet: { signature_numerator: 6, signature_denominator: 8 },
    });

    await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      notes: "t2 C3 1|1 t1.5 D3 1|2", // Last note starts at beat 1 (0.5 Ableton beats), rounds up to 1 bar
    });

    expectClipCreated(clipSlot, 3); // 1 bar in 6/8 = 3 Ableton beats
    // LiveAPI durations are in quarter notes, so halved from the notation string
    expectNotesAdded(clip, [note(60, 0, 1), note(62, 0.5, 0.75)]);
  });

  it("should create 1-bar clip when empty in 4/4 time", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
    });

    expectClipCreated(clipSlot, 4); // 1 bar in 4/4 = 4 Ableton beats
  });

  it("should create 1-bar clip when empty in 6/8 time", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 6, signature_denominator: 8 },
    });

    await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
    });

    expectClipCreated(clipSlot, 3); // 1 bar in 6/8 = 3 Ableton beats
  });

  it("should use 1-bar clip length when notes are empty in 4/4", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      notes: "",
    });

    expectClipCreated(clipSlot, 4); // 1 bar in 4/4 = 4 Ableton beats
  });

  it("should set loop_end to clip length for empty clips (not 0)", async () => {
    const { clip } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
    });

    // loop_end must be > loop_start (Live API constraint)
    // For empty clips, loop_end should be set to clipLength (1 bar = 4 beats)
    expect(clip.set).toHaveBeenCalledWith("loop_end", 4);
    expect(clip.set).toHaveBeenCalledWith("end_marker", 4);
  });

  it("should round up to next bar based on latest note start in 4/4", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      notes: "C4 1|4.5", // Note starts at beat 3.5 (0-based), which is in bar 1, rounds up to 1 bar
    });

    expectClipCreated(clipSlot, 4); // Rounds up to 1 bar = 4 Ableton beats
  });

  it("should round up to next bar based on latest note start in 6/8", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 6, signature_denominator: 8 },
    });

    await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      notes: "C4 1|5.5", // Note starts at beat 4.5 in musical beats (2.25 Ableton beats), rounds up to 1 bar
    });

    expectClipCreated(clipSlot, 3); // Rounds up to 1 bar in 6/8 = 3 Ableton beats
  });

  it("should round up to next bar when note start is in next bar", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      notes: "C4 2|1", // Note starts at bar 2, beat 1 (beat 4 in 0-based), rounds up to 2 bars
    });

    expectClipCreated(clipSlot, 8); // Rounds up to 2 bars = 8 Ableton beats
  });

  it("warns when firstStart is used with non-looping clips", async () => {
    setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
      clip: { signature_numerator: 4, signature_denominator: 4 },
    });

    await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      notes: "C4 1|1",
      firstStart: "1|2",
      looping: false,
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining(
        "firstStart parameter ignored for non-looping clips",
      ),
    );
  });

  it("sets playing_position when firstStart is used with looping clips", async () => {
    const { clip } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
      clip: { signature_numerator: 4, signature_denominator: 4 },
    });

    await createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      notes: "C4 1|1",
      firstStart: "1|2",
      looping: true,
    });

    // 1|2 = 1 beat in 4/4 time
    expect(clip.set).toHaveBeenCalledWith("playing_position", 1);
  });
});
