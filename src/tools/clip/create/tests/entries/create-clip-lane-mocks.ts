// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  deleteMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { audioClipProperties } from "../create-clip-test-helpers.ts";

/** One clip on the lane, as the registry answers for it. */
export interface Span {
  id: string;
  start: number;
  end: number;
}

type Kind = "midi" | "audio";

/**
 * A MIDI track whose arrangement lane changes the moment Live makes the new
 * clip, the way a create over an occupied range really behaves. Each clip keeps
 * one props object, because the create moves the clips already there rather
 * than leaving them where the registry first put them, and a clip a create
 * clears is gone from the registry too.
 * @param before - The clips on the lane before the create
 * @param afters - The clips on it once each create has run, new clip included.
 *   The first create makes "made", the next "made2", and so on.
 */
export function setupDisplacingTrack(
  before: Span[],
  ...afters: Span[][]
): void {
  registerDisplacingTrack("midi", before, afters);
}

/**
 * {@link setupDisplacingTrack} for an audio track, where Live decides the
 * length of the clip a create makes, so `afters` say how long each came out.
 * @param before - The clips on the lane before the create
 * @param afters - The clips on it once each create has run, new clip included
 */
export function setupDisplacingAudioTrack(
  before: Span[],
  ...afters: Span[][]
): void {
  registerDisplacingTrack("audio", before, afters);
}

// --- Helpers below main exports ---

/**
 * @param kind - Whether the track holds MIDI or audio clips
 * @param before - The clips on the lane before the first create
 * @param afters - The clips on it once each create has run
 */
function registerDisplacingTrack(
  kind: Kind,
  before: Span[],
  afters: Span[][],
): void {
  registerMockObject("live-set", {
    path: livePath.liveSet,
    properties: {
      signature_numerator: 4,
      signature_denominator: 4,
      tempo: 120,
    },
  });

  const propsById = new Map<string, Record<string, unknown>>();
  let onLane = new Set<string>();

  const place = (spans: Span[]): void => {
    for (const { id, start, end } of spans) {
      Object.assign(
        propsById.get(id) as Record<string, unknown>,
        kind === "audio" ? audioClipProperties(end - start) : {},
        { start_time: start, end_time: end, length: end - start },
      );
    }

    // A clip the create covered whole no longer exists.
    for (const id of onLane) {
      if (!spans.some((span) => span.id === id)) {
        deleteMockObject(id);
      }
    }

    onLane = new Set(spans.map((span) => span.id));
  };

  for (const [index, { id }] of [...before, ...afters.flat()].entries()) {
    const props = propsById.get(id) ?? {};

    propsById.set(id, props);
    registerMockObject(id, {
      path: livePath.track(0).arrangementClip(index),
      type: "Clip",
      properties: props,
    });
  }

  place(before);

  let created = 0;
  const trackProps: Record<string, unknown> = {
    has_midi_input: kind === "midi" ? 1 : 0,
    arrangement_clips: children(...before.map((span) => span.id)),
  };

  const make = (): string[] => {
    const step = created++;
    const after = afters[step] as Span[];

    place(after);
    trackProps.arrangement_clips = children(...after.map((span) => span.id));

    return ["id", step === 0 ? "made" : `made${step + 1}`];
  };

  registerMockObject("track-0", {
    path: livePath.track(0),
    properties: trackProps,
    methods: { create_midi_clip: make, create_audio_clip: make },
  });
}
