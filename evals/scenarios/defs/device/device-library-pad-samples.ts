// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: find drum sounds in the library and put each on its own pad.
 *
 * `device-drum-kit` builds a kit from the eval samples folder. This one has no
 * sample folder: the sounds come from Live's own library, so the model has to
 * search it, pick a kick, a snare, a closed hat and a clap, and load them on
 * the pads the user names.
 *
 * Library content differs per machine, so no file name is pinned. Each pad is
 * graded by keyword: its sample's name has to read as the sound asked for.
 */

import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../clip/helpers/clip-tool-constants.ts";
import { argText } from "../arg-text.ts";
import { lastSuccessfulToolCall } from "../../assertions/index.ts";
import { firstResultPath, newTrackPath } from "../helpers/new-track-path.ts";

/** One pad the user asked for, and what its sample's name should read as. */
interface PadSpec {
  pad: string;
  sound: string;
  /** Matches a sample name for the sound. Short codes need a non-letter on each side. */
  name: RegExp;
  /** A name that matches this is the wrong sound (an open hat). */
  not?: RegExp;
}

const PADS: PadSpec[] = [
  { pad: "C1", sound: "kick", name: /kick|bass ?drum|(?<![a-z])bd(?![a-z])/ },
  { pad: "D1", sound: "snare", name: /snare|(?<![a-z])sd(?![a-z])/ },
  {
    pad: "F#1",
    sound: "closed hi-hat",
    name: /hat|(?<![a-z])(?:hh|ch)(?![a-z])/,
    not: /open|(?<![a-z])oh(?![a-z])/,
  },
  { pad: "D#1", sound: "clap", name: /clap|(?<![a-z])cp(?![a-z])/ },
];

/** One entry of a read-device result for a pad's Simpler. */
interface PadRead {
  sample?: string;
  ok?: boolean;
}

/**
 * Where the new Drum Rack is: the path the create call reported, else the
 * track's instrument. The device index isn't fixed, since a default track
 * preset may add devices.
 *
 * @param turns - All conversation turns
 * @returns The rack's path
 */
function drumRackPath(turns: EvalTurnResult[]): string {
  const rackCall = lastSuccessfulToolCall(turns, "any", "ppal-create-device");
  const rackPath =
    rackCall != null && /drum ?rack/i.test(argText(rackCall.args.device))
      ? firstResultPath(rackCall.result)
      : undefined;

  return rackPath ?? `${newTrackPath(turns)}/inst`;
}

/**
 * The file name of a sample path, lowercased, with its folders as a fallback
 * for names that say nothing ("Hit 01.wav" in a Kick folder).
 *
 * @param path - Sample file path
 * @param spec - The pad's wanted sound
 * @returns Whether the sample reads as that sound
 */
function reads(path: string, spec: PadSpec): boolean {
  const name = path.toLowerCase().split("/").pop() ?? "";
  const text = spec.name.test(name) ? name : path.toLowerCase();

  return spec.name.test(text) && !(spec.not?.test(text) ?? false);
}

/**
 * What each wanted pad holds, or why not, one line per pad.
 *
 * @param result - Parsed read-device result, one entry per pad in order
 * @returns The verdict lines; a pad that's right reads "ok"
 */
function padProblems(result: unknown): string[] {
  const entries = Array.isArray(result) ? (result as PadRead[]) : [];

  return PADS.map((spec, index) => {
    const sample = entries[index]?.sample;

    if (sample == null) {
      return `${spec.pad}: no sample (wanted a ${spec.sound})`;
    }

    return reads(sample, spec)
      ? "ok"
      : `${spec.pad}: ${sample.split("/").pop()} doesn't read as a ${spec.sound}`;
  });
}

/**
 * Read the four pads' Simpler devices off the new rack and check each sample.
 *
 * @returns A state assertion over the four pads
 */
function assertPadSamples(): EvalAssertion {
  return {
    type: "state",
    tool: "ppal-read-device",
    args: (turns) => ({
      path: PADS.map(
        (spec) => `${drumRackPath(turns)}/p${spec.pad}/c0/d0`,
      ).join(","),
      include: ["sample"],
    }),
    expect: (result) => padProblems(result).every((line) => line === "ok"),
    explain: (result) =>
      padProblems(result)
        .filter((line) => line !== "ok")
        .join("; "),
  };
}

export const deviceLibraryPadSamples: EvalScenario = {
  id: "device-library-pad-samples",
  tags: ["devices", "workflow"],
  description:
    "Find kick, snare, hat and clap in the library and load them on pads",
  kind: "capability",
  liveSet: "basic-midi-4-track",

  messages: [
    MSG_CONNECT,
    "Make a new MIDI track with a Drum Rack, then find a kick, a snare, a closed hi-hat and a clap in my library and put them on the first four pads: C1, D1, F#1 and D#1.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: "ppal-library", turn: 1 },
    assertPadSamples(),

    { type: "token_usage", maxTokens: 8_000 },
  ],
};
