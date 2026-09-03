// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import "../duplicate-mocks-test-helpers.ts";
import {
  lookupMockObject,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";

// Capture the re-create warnings
vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

import * as consoleMock from "#src/shared/max/v8-max-console.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";

const SAMPLE = "/Samples/Castanet.aif";

/** The audio settings a copy has to carry across, all set to non-defaults. */
const AUDIO_PROPS = {
  is_midi_clip: 0,
  is_audio_clip: 1,
  is_arrangement_clip: 1,
  file_path: SAMPLE,
  length: 4,
  start_time: 0,
  warping: 1,
  warp_mode: 3,
  looping: 1,
  loop_start: 1,
  loop_end: 3,
  start_marker: 1,
  end_marker: 3,
  signature_numerator: 6,
  signature_denominator: 8,
  gain: 0.6,
  pitch_coarse: -4,
  pitch_fine: 30,
  name: "Castanet",
};

/** Register the live_set time signature mock. */
function registerLiveSet(): void {
  registerMockObject("live-set", {
    path: livePath.liveSet,
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });
}

/**
 * Register an audio source clip on track 0's main arrangement lane.
 * @param extraProps - Clip properties merged over the audio defaults
 */
function registerAudioSource(extraProps: Record<string, unknown> = {}): void {
  registerMockObject("src_clip", {
    path: livePath.track(0).arrangementClip(0),
    type: "Clip",
    properties: { ...AUDIO_PROPS, ...extraProps },
  });
}

/**
 * Register an audio source that already lives on track 0's take lane 0 — the
 * shape a promote reads from.
 * @param extraProps - Clip properties merged over the audio defaults
 */
function registerAudioTakeSource(
  extraProps: Record<string, unknown> = {},
): void {
  registerMockObject("tl_src_clip", {
    path: livePath.track(0).takeLane(0).arrangementClip(0),
    type: "Clip",
    properties: { ...AUDIO_PROPS, ...extraProps },
  });
}

/**
 * The order the copy's properties were written in, by property name.
 * @param clip - The mock the copy landed on
 * @returns Property names, in the order `set` was called with them
 */
function setOrder(clip: RegisteredMockObject): string[] {
  return vi.mocked(clip.set).mock.calls.map(([property]) => String(property));
}

describe("duplicate an audio clip to a take lane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerLiveSet();
  });

  /**
   * Duplicate the audio source onto a fresh take lane.
   * @returns The lane clip mock the copy landed on
   */
  async function duplicateToFreshLane(): Promise<
    RegisteredMockObject | undefined
  > {
    registerTakeLaneTrack({ initialLanes: 0, hasMidiInput: 0 });

    await duplicate({
      type: "clip",
      id: "src_clip",
      arrangementStart: "5|1",
      takeLane: "new",
    });

    return lookupMockObject(
      undefined,
      livePath.track(0).takeLane(0).arrangementClip(0),
    );
  }

  it("re-creates the clip from its sample", async () => {
    registerAudioSource();
    registerTakeLaneTrack({ initialLanes: 0, hasMidiInput: 0 });

    const result = await duplicate({
      type: "clip",
      id: "src_clip",
      arrangementStart: "5|1",
      takeLane: "new",
    });

    // The sample and the start position, in Live's argument order.
    expect(
      lookupMockObject(undefined, livePath.track(0).takeLane(0))?.call,
    ).toHaveBeenCalledWith("create_audio_clip", SAMPLE, 16);
    expect(result).toStrictEqual({
      id: "tl_clip_1",
      path: "t0/l0[5|1]",
    });
  });

  // Each source read is a distinct getProperty, so blanking any one would set
  // undefined on the copy instead of the source's value.
  it.each([
    ["warping", 1],
    ["warp_mode", 3],
    ["looping", 1],
    ["loop_start", 1],
    ["loop_end", 3],
    ["start_marker", 1],
    ["end_marker", 3],
    ["signature_numerator", 6],
    ["signature_denominator", 8],
    ["gain", 0.6],
    ["pitch_coarse", -4],
    ["pitch_fine", 30],
    ["name", "Castanet"],
  ])("carries the source's %s to the copy", async (property, value) => {
    registerAudioSource();

    const newClip = await duplicateToFreshLane();

    expect(newClip?.set).toHaveBeenCalledWith(property, value);
  });

  // Two orderings Live enforces silently: markers are read and written in beats
  // or in seconds depending on `warping`, and loop points snap back to the whole
  // sample unless `looping` is already set. Getting either wrong loses the
  // setting with no error.
  it("sets warping before the markers, and looping before the loop points", async () => {
    registerAudioSource();
    registerTakeLaneTrack({ initialLanes: 0, hasMidiInput: 0 });

    await duplicate({
      type: "clip",
      id: "src_clip",
      arrangementStart: "1|1",
      takeLane: "new",
    });

    const newClip = lookupMockObject(
      undefined,
      livePath.track(0).takeLane(0).arrangementClip(0),
    );

    expect(newClip).toBeDefined();

    const order = setOrder(newClip as RegisteredMockObject);

    expect(order.indexOf("warping")).toBeLessThan(
      order.indexOf("start_marker"),
    );
    expect(order.indexOf("warping")).toBeLessThan(order.indexOf("loop_start"));
    expect(order.indexOf("looping")).toBeLessThan(order.indexOf("loop_start"));
    expect(order.indexOf("looping")).toBeLessThan(order.indexOf("loop_end"));
  });

  // A copy built from the sample gets the sample's own warp markers, so anything
  // hand-edited on the source is gone. Live has no working way to write them
  // back, so the warning is all we can offer.
  it("names the warp markers a warped source loses", async () => {
    registerAudioSource();
    registerTakeLaneTrack({ initialLanes: 0, hasMidiInput: 0 });

    await duplicate({
      type: "clip",
      id: "src_clip",
      arrangementStart: "1|1",
      takeLane: "new",
    });

    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        `created on take lane "t0/l0" (warp markers reset to the sample's defaults)`,
      ),
    );
  });

  it("names both losses when a warped source also has envelopes", async () => {
    registerAudioSource({ has_envelopes: 1 });
    registerTakeLaneTrack({ initialLanes: 0, hasMidiInput: 0 });

    await duplicate({
      type: "clip",
      id: "src_clip",
      arrangementStart: "1|1",
      takeLane: "new",
    });

    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        `created on take lane "t0/l0" (automation envelopes aren't copied; ` +
          `warp markers reset to the sample's defaults)`,
      ),
    );
  });

  // An unwarped clip plays the sample as recorded, so the copy's markers match
  // and there is nothing to warn about.
  it("names no loss for an unwarped source with no envelopes", async () => {
    registerAudioSource({ warping: 0 });
    registerTakeLaneTrack({ initialLanes: 0, hasMidiInput: 0 });

    await duplicate({
      type: "clip",
      id: "src_clip",
      arrangementStart: "1|1",
      takeLane: "new",
    });

    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining(`created on take lane "t0/l0". Expand`),
    );
  });

  // duplicate_clip_to_arrangement no-ops on a take-lane source, so a promote
  // re-creates the clip on the track's main lane instead.
  it("promotes an audio take to the main lane from its sample", async () => {
    registerAudioTakeSource();
    const track = registerTakeLaneTrack({ initialLanes: 1, hasMidiInput: 0 });

    const result = await duplicate({
      type: "clip",
      id: "tl_src_clip",
      arrangementStart: "5|1",
    });

    expect(track.call).toHaveBeenCalledWith("create_audio_clip", SAMPLE, 16);

    const promoted = lookupMockObject(
      undefined,
      livePath.track(0).arrangementClip(0),
    );

    expect(promoted?.set).toHaveBeenCalledWith("warping", 1);
    expect(promoted?.set).toHaveBeenCalledWith("gain", 0.6);
    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "clip t0/l0[1|1] (id tl_src_clip) was promoted to the main lane by re-creating it " +
          "(warp markers reset to the sample's defaults)",
      ),
    );
    expect(result).toStrictEqual({
      id: "tl_clip_37",
      path: "t0[5|1]",
    });
  });
});
