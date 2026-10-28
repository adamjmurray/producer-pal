// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { applyAudioTransform } from "#src/notation/transform/transform-audio-evaluator.ts";
import {
  applyTransforms,
  evaluateTransform,
} from "#src/notation/transform/transform-evaluator.ts";
import { withClipWarningLabel } from "#src/notation/transform/transform-warning-label.ts";
import { type ClipContext } from "#src/notation/transform/helpers/transform-context.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import {
  beginWarningCapture,
  capturedWarnings,
} from "#src/shared/max/v8-warning-capture.ts";
import {
  createContext,
  createTestNote,
} from "../evaluator/transform-evaluator-test-helpers.ts";

const SESSION: ClipContext = {
  clipDuration: 8,
  clipIndex: 0,
  clipCount: 1,
  barDuration: 4,
};

/**
 * Run a transform the way the tools do: facts about the clip go to a sink.
 * @param run - The transform work
 * @returns What the sink took
 */
function details(run: () => void): string[] {
  const taken: string[] = [];

  withClipWarningLabel("clip t0/s0", run, (message) => taken.push(message));

  return taken;
}

/**
 * Run a note transform and collect what it said about the clip.
 * @param notes - The clip's notes
 * @param transform - Transform text
 * @param context - Clip context, if any
 * @returns What the sink took
 */
function noteDetails(
  notes: NoteEvent[],
  transform: string,
  context?: ClipContext,
): string[] {
  return details(() => applyTransforms(notes, transform, 4, 4, context));
}

/**
 * Cut positions one beat apart in 4/4, for a note that spans them.
 * @param count - How many positions
 * @returns A bar|beat list
 */
function cuts(count: number): string {
  return Array.from(
    { length: count },
    (_, i) => `${Math.floor((i + 1) / 4) + 1}|${((i + 1) % 4) + 1}`,
  ).join(", ");
}

describe("per-clip transform facts go to the clip's sink", () => {
  beforeEach(() => {
    beginWarningCapture();
  });

  it.each([
    [
      "a where() predicate that throws",
      () =>
        noteDetails(
          createTestNote({ probability: undefined }),
          "where(note.probability < .5): velocity = 64",
        ),
      /^where\(\) failed: /,
    ],
    [
      "an assignment that fails",
      () => noteDetails(createTestNote(), "velocity = audio.gain"),
      /^velocity transform failed: /,
    ],
    [
      "an assignment that fails in a single evaluation",
      () =>
        details(() =>
          evaluateTransform("velocity = audio.gain", createContext()),
        ),
      /^velocity transform failed: /,
    ],
    [
      "an audio assignment that fails",
      () => details(() => applyAudioTransform(0, 0, "pitchShift = note.pitch")),
      /^pitchShift transform failed: /,
    ],
    [
      "a ramp that stops short",
      () =>
        noteDetails(
          Array.from({ length: 7 }, (_, i) => ({
            ...createTestNote({ start_time: 6 + i * 0.25, duration: 0.25 })[0]!,
          })),
          "2|3-3|1: velocity = ramp(1, 127)",
        ),
      /^ramp\(\) only reached 75% of its end value: .*\(2\|4\.5\)/,
    ],
    [
      "legato() on a last note with no clip end",
      () => noteDetails(createTestNote(), "duration = legato()"),
      /^legato\(\): last note has no next note or clip end/,
    ],
    [
      "clip.position on a session clip",
      () => noteDetails(createTestNote(), "velocity = clip.position", SESSION),
      /^clip\.position isn't available on a session clip; used 0$/,
    ],
    [
      "clip.position on a session audio clip",
      () =>
        details(() =>
          applyAudioTransform(0, 0, "gain = clip.position", SESSION),
        ),
      /^clip\.position isn't available on a session clip; used 0$/,
    ],
    [
      "sync on a session clip (split)",
      () =>
        noteDetails(
          createTestNote({ duration: 8 }),
          "split(1|3, sync)",
          SESSION,
        ),
      /^sync ignored: session clip, so split is clip-relative$/,
    ],
    [
      "sync on a session clip (waveform)",
      () =>
        noteDetails(createTestNote(), "velocity = sin(n/1, 0, sync)", SESSION),
      /^sync ignored: session clip, so the LFO is clip-relative$/,
    ],
    [
      "sync on a session audio clip",
      () =>
        details(() =>
          applyAudioTransform(0, 0, "gain = sin(n/1, 0, sync)", SESSION),
        ),
      /^sync ignored: session clip, so the LFO is clip-relative$/,
    ],
    [
      "split leaving a note unchanged",
      () => noteDetails(createTestNote({ duration: 1 }), "split(2|1)"),
      /^split: 1 note\(s\) contained none of the given positions, left unchanged$/,
    ],
    [
      "split clamped",
      () => noteDetails(createTestNote({ duration: 80 }), `split(${cuts(70)})`),
      /^split: 1 note\(s\) clamped to the max of 64 pieces$/,
    ],
    [
      "ratchet leaving a note unchanged",
      () => noteDetails(createTestNote({ duration: 0.25 }), "ratchet(n/4)"),
      /^ratchet: 1 note\(s\) spanned no grid line, left unchanged$/,
    ],
    [
      "ratchet clamped",
      () => noteDetails(createTestNote({ duration: 40 }), "ratchet(n/16)"),
      /^ratchet: 1 note\(s\) clamped to the max of 64 pieces$/,
    ],
    [
      "notes deleted for a zero duration",
      () => noteDetails(createTestNote(), "duration = -1"),
      /^1 note\(s\) deleted: duration went to 0 or below$/,
    ],
  ])("%s", (_name, run, expected) => {
    const taken = run();

    expect(taken).toHaveLength(1);
    expect(taken[0]).toMatch(expected);
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("is still a warning when no clip is listening", () => {
    applyTransforms(createTestNote(), "duration = -1", 4, 4);

    expect(capturedWarnings()).toHaveLength(1);
  });
});
