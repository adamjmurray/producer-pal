// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { createNoteTrackingMethods } from "#src/test/helpers/mock-registry-test-helpers.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { createClip } from "../create-clip.ts";
import {
  setupMultiSessionAudioClipMocks,
  setupSessionAudioClipMocks,
} from "./create-clip-test-helpers.ts";

interface SessionSlot {
  clipSlot: RegisteredMockObject;
  clip: RegisteredMockObject;
}

/** Two empty session clip slots on track 0, in a 4/4 Set. */
function twoSessionSlots(): SessionSlot[] {
  registerMockObject("live-set", {
    path: livePath.liveSet,
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });

  return [0, 1].map((sceneIndex) => ({
    clipSlot: registerMockObject(`clip-slot-0-${sceneIndex}`, {
      path: livePath.track(0).clipSlot(sceneIndex),
      properties: { has_clip: 0 },
    }),
    clip: registerMockObject(`clip-0-${sceneIndex}`, {
      path: livePath.track(0).clipSlot(sceneIndex).clip(),
      methods: createNoteTrackingMethods(),
    }),
  }));
}

describe("createClip - per-position timing params", () => {
  it("gives each position its own length", async () => {
    const [first, second] = twoSessionSlots() as [SessionSlot, SessionSlot];

    await createClip({ path: "t0/s0,t0/s1", length: "1bar,2bar" });

    expect(first.clipSlot.call).toHaveBeenCalledWith("create_clip", 4);
    expect(second.clipSlot.call).toHaveBeenCalledWith("create_clip", 8);
  });

  it("applies a single length to every position", async () => {
    const [first, second] = twoSessionSlots() as [SessionSlot, SessionSlot];

    await createClip({ path: "t0/s0,t0/s1", length: "2bar" });

    expect(first.clipSlot.call).toHaveBeenCalledWith("create_clip", 8);
    expect(second.clipSlot.call).toHaveBeenCalledWith("create_clip", 8);
  });

  it("gives each position its own time signature", async () => {
    const [first, second] = twoSessionSlots() as [SessionSlot, SessionSlot];

    await createClip({ path: "t0/s0,t0/s1", timeSignature: "4/4,3/4" });

    expect(first.clip.set).toHaveBeenCalledWith("signature_numerator", 4);
    expect(second.clip.set).toHaveBeenCalledWith("signature_numerator", 3);
  });

  it("gives each position its own region start", async () => {
    const [first, second] = twoSessionSlots() as [SessionSlot, SessionSlot];

    await createClip({ path: "t0/s0,t0/s1", start: "1|1,2|1" });

    expect(first.clip.set).toHaveBeenCalledWith("loop_start", 0);
    expect(second.clip.set).toHaveBeenCalledWith("loop_start", 4);
  });

  it("gives each position its own firstStart", async () => {
    const [first, second] = twoSessionSlots() as [SessionSlot, SessionSlot];

    await createClip({
      path: "t0/s0,t0/s1",
      looping: true,
      length: "4bar",
      firstStart: "1|1,3|1",
    });

    expect(first.clip.set).toHaveBeenCalledWith("playing_position", 0);
    expect(second.clip.set).toHaveBeenCalledWith("playing_position", 8);
  });

  it("refuses a list that names a different number of positions", async () => {
    twoSessionSlots();

    await expect(
      createClip({ path: "t0/s0,t0/s1", length: "1bar,2bar,3bar" }),
    ).rejects.toThrow("path names 2 entries but length names 3 entries");
  });

  // A trailing comma isn't an entry, so this is a short list, not one value.
  it("refuses a short list before creating anything", async () => {
    const [first] = twoSessionSlots() as [SessionSlot, SessionSlot];

    await expect(
      createClip({ path: "t0/s0,t0/s1", timeSignature: "3/4," }),
    ).rejects.toThrow("path names 2 entries but timeSignature names 1 entry");

    expect(first.clipSlot.call).not.toHaveBeenCalledWith(
      "create_clip",
      expect.anything(),
    );
  });

  it("refuses an empty entry rather than guessing", async () => {
    twoSessionSlots();

    await expect(
      createClip({ path: "t0/s0,t0/s1", length: "1bar,," }),
    ).rejects.toThrow('invalid length "1bar,," - it has an empty entry');
  });

  // With one position there is no list to pair, so the value stays whole.
  it("takes a whole timeSignature literally when the call names one position", async () => {
    const [first] = twoSessionSlots() as [SessionSlot, SessionSlot];

    await expect(
      createClip({ path: "t0/s0", timeSignature: "4/4,3/4" }),
    ).rejects.toThrow("Time signature must be in format");

    expect(first.clipSlot.call).not.toHaveBeenCalledWith(
      "create_clip",
      expect.anything(),
    );
  });
});

describe("createClip - per-position sampleFile", () => {
  it("gives each position its own sample", async () => {
    const { clipSlots } = setupMultiSessionAudioClipMocks([0, 1]);

    await createClip({
      path: "t0/s0,t0/s1",
      sampleFile: "/samples/kick.wav,/samples/snare.wav",
    });

    expect(clipSlots[0]?.call).toHaveBeenCalledWith(
      "create_audio_clip",
      "/samples/kick.wav",
    );
    expect(clipSlots[1]?.call).toHaveBeenCalledWith(
      "create_audio_clip",
      "/samples/snare.wav",
    );
  });

  it("applies a single sample to every position", async () => {
    const { clipSlots } = setupMultiSessionAudioClipMocks([0, 1]);

    await createClip({ path: "t0/s0,t0/s1", sampleFile: "/samples/kick.wav" });

    for (const clipSlot of clipSlots) {
      expect(clipSlot.call).toHaveBeenCalledWith(
        "create_audio_clip",
        "/samples/kick.wav",
      );
    }
  });

  // The only way to name a file whose own path has a comma in it.
  it("takes the whole value literally when the call names one position", async () => {
    const { clipSlot } = setupSessionAudioClipMocks();

    await createClip({ path: "t0/s0", sampleFile: "/samples/kick, snare.wav" });

    expect(clipSlot.call).toHaveBeenCalledWith(
      "create_audio_clip",
      "/samples/kick, snare.wav",
    );
  });

  it("reads each value whole beside another with a different comma count", async () => {
    const { clipSlot } = setupSessionAudioClipMocks();

    await createClip({
      path: "t0/s0",
      name: "Kick, Snare",
      sampleFile: "/samples/kick, snare, hat.wav",
    });

    expect(clipSlot.call).toHaveBeenCalledWith(
      "create_audio_clip",
      "/samples/kick, snare, hat.wav",
    );
  });

  it("refuses a sample list that names a different number of positions", async () => {
    setupMultiSessionAudioClipMocks([0, 1]);

    await expect(
      createClip({ path: "t0/s0,t0/s1", sampleFile: "/a.wav,/b.wav,/c.wav" }),
    ).rejects.toThrow("path names 2 entries but sampleFile names 3 entries");
  });
});
