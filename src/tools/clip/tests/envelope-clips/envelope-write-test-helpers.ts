// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { expect, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { UNNAMED_ENVELOPE_LOSS } from "#src/tools/clip/envelopes/cross-track-envelopes.ts";
import {
  clearMockRegistry,
  deleteMockObject,
  type RegisteredMockObject,
  registerMockObject,
  simulateMockDeletes,
} from "#src/test/mocks/mock-registry.ts";
import {
  type EnvelopeWorld,
  LIVE_13,
  registerEnvelopeWorld,
  RETURNS,
  SCENES,
} from "./envelope-clip-test-helpers.ts";

/** An envelope world whose return track slots copy, delete, fire and stop. */
export interface WritableEnvelopeWorld extends EnvelopeWorld {
  /** The clips Live made by `duplicate_clip_to`, by the slot they landed in */
  copies: Map<string, RegisteredMockObject>;
  /** Makes the next `delete_clip` throw, as Live can after a copy landed */
  failDeletes: () => void;
}

/** The "No Envs" clip, named by path and by id, as a tool takes `id`. */
export const NO_ENVS_BY_PATH_OR_ID = [
  ["path", { path: "rt0/s0" }],
  ["id", { id: "no-envs" }],
] as const;

/** Calls that only a MIDI or audio clip has an answer to. */
export const NOTE_OR_AUDIO_CALLS = [
  "get_notes_extended",
  "add_new_notes",
  "remove_notes_extended",
  "apply_note_modifications",
  "duplicate_loop",
  "quantize",
  "quantize_pitch",
  "add_warp_marker",
  "move_warp_marker",
  "remove_warp_marker",
];

/** Reads that only a MIDI or audio clip has an answer to. */
export const NOTE_OR_AUDIO_PROPS = [
  "midi_clip_type",
  "file_path",
  "sample_length",
  "warping",
];

/** What every slot of one world shares. */
interface SlotWiring {
  copies: Map<string, RegisteredMockObject>;
  state: { failDeletes: boolean; made: number };
  /** The clip in a return track's slot, if the world has made one there */
  clipAt: (
    returnIndex: number,
    scene: number,
  ) => RegisteredMockObject | undefined;
}

/**
 * A fresh writable world: clears what an earlier test left in the mocks, and
 * registers the world again.
 * @param liveVersion - The version Live reports
 * @returns The mocks the tests look at
 */
export function resetWritableEnvelopeWorld(
  liveVersion = LIVE_13,
): WritableEnvelopeWorld {
  vi.clearAllMocks();
  clearMockRegistry();

  return registerWritableEnvelopeWorld(liveVersion);
}

/**
 * The registered Live 13 world, with slots that act on their clips: copying one
 * makes a clip in the other slot, deleting one removes its clip, and a launch
 * or stop is only recorded. Live 12 has no return slots, so there is nothing to
 * wire there.
 * @param liveVersion - The version Live reports
 * @returns The mocks the tests look at
 */
export function registerWritableEnvelopeWorld(
  liveVersion = LIVE_13,
): WritableEnvelopeWorld {
  simulateMockDeletes();

  const world = registerEnvelopeWorld(liveVersion);
  const copies = new Map<string, RegisteredMockObject>();
  const state = { failDeletes: false, made: 0 };
  const wiring: SlotWiring = {
    copies,
    state,
    clipAt: (returnIndex, scene) =>
      copies.get(`rt${returnIndex}/s${scene}`) ??
      (scene === 0 ? [world.noEnvs, world.withEnv][returnIndex] : undefined),
  };

  if (liveVersion.startsWith("13")) {
    for (let returnIndex = 0; returnIndex < RETURNS; returnIndex++) {
      for (let scene = 0; scene < SCENES; scene++) {
        markSlot(returnIndex, scene, scene === 0 ? 1 : 0, wiring);
      }
    }
  }

  return {
    ...world,
    copies,
    failDeletes: () => {
      state.failDeletes = true;
    },
  };
}

/**
 * Register one return track slot, holding a clip or not.
 * @param returnIndex - The return track
 * @param scene - The scene
 * @param hasClip - Whether the slot holds a clip
 * @param wiring - What the slots share
 */
function markSlot(
  returnIndex: number,
  scene: number,
  hasClip: number,
  wiring: SlotWiring,
): void {
  registerMockObject(`r${returnIndex}s${scene}`, {
    path: livePath.returnTrack(returnIndex).clipSlot(scene),
    properties: { has_clip: hasClip },
    methods: slotMethods(returnIndex, scene, wiring),
  });
}

/**
 * What a return track slot does when called.
 * @param returnIndex - The return track
 * @param scene - The scene
 * @param wiring - What the slots share
 * @returns The slot's methods
 */
function slotMethods(
  returnIndex: number,
  scene: number,
  wiring: SlotWiring,
): Record<string, (...args: unknown[]) => unknown> {
  const { copies, state, clipAt } = wiring;

  return {
    duplicate_clip_to: (target) => {
      const match = /^(?:id )?r(\d+)s(\d+)$/.exec(String(target));

      if (match == null) {
        throw new Error(`incompatible destination ${String(target)}`);
      }

      const toReturn = Number(match[1]);
      const toScene = Number(match[2]);
      const source = clipAt(returnIndex, scene);
      const copy = registerMockObject(`copy-${++state.made}`, {
        path: livePath.returnTrack(toReturn).clipSlot(toScene).clip(),
        type: "Clip",
        properties: { ...source?.properties },
      });

      copies.set(`rt${toReturn}/s${toScene}`, copy);
      markSlot(toReturn, toScene, 1, wiring);

      return null;
    },
    delete_clip: () => {
      if (state.failDeletes) {
        throw new Error("Live refused to delete");
      }

      deleteMockObject(
        `${livePath.returnTrack(returnIndex).clipSlot(scene).toString()} clip`,
      );
      copies.delete(`rt${returnIndex}/s${scene}`);
      markSlot(returnIndex, scene, 0, wiring);

      return null;
    },
  };
}

/**
 * Every call the world's clips and slots got on Live's note and sample APIs,
 * and every read only a MIDI or audio clip can answer.
 * @param world - The mocks
 * @returns What reached them, which must be empty for an envelope clip
 */
export function noteOrAudioTouches(world: WritableEnvelopeWorld): string[] {
  return [
    world.noEnvs,
    world.withEnv,
    ...world.copies.values(),
    ...world.slots.flat(),
  ].flatMap((mock) => [
    ...mock.call.mock.calls
      .filter(([method]) => NOTE_OR_AUDIO_CALLS.includes(String(method)))
      .map(([method]) => `call ${String(method)}`),
    ...mock.get.mock.calls
      .filter(([prop]) => NOTE_OR_AUDIO_PROPS.includes(String(prop)))
      .map(([prop]) => `get ${String(prop)}`),
  ]);
}

/** The parameter info a listed envelope carries. */
const LISTED_PARAMETER = {
  min: 0,
  max: 1,
  value: 0.5,
  display: "0.5",
  quantized: false,
  enabled: true,
  automation_state: 1,
};

/** A device parameter's listed envelope, as the remote script lists it. */
export const PREDELAY_ENVELOPE = {
  device: "d0",
  parameter_index: 1,
  parameter: { ...LISTED_PARAMETER, name: "Predelay" },
  event_count: 4,
};

/** A device parameter's listed envelope, on the second device. */
export const FREQUENCY_ENVELOPE = {
  device: "d1",
  parameter_index: 3,
  parameter: { ...LISTED_PARAMETER, name: "Frequency" },
  event_count: 4,
};

/** A device parameter's listed envelope, on the first device. */
export const MACRO_ENVELOPE = {
  device: "d0",
  parameter_index: 1,
  parameter: { ...LISTED_PARAMETER, name: "Macro 1" },
  event_count: 2,
};

/** A mixer parameter's listed envelope. */
export const VOLUME_ENVELOPE = {
  parameter_name: "volume",
  parameter: { ...LISTED_PARAMETER, name: "Track Volume" },
  event_count: 2,
};

/** A mixer parameter's listed envelope. */
export const PAN_ENVELOPE = {
  parameter_name: "pan",
  parameter: { ...LISTED_PARAMETER, name: "Track Pan" },
  event_count: 2,
};

/**
 * Make the mocked remote script list these envelopes for any clip. The test
 * file mocks `requestNode`.
 * @param envelopes - What the list route reports; null for no remote script
 */
export function answerEnvelopeList(envelopes: unknown[] | null): void {
  vi.mocked(requestNode).mockReset();
  vi.mocked(requestNode).mockResolvedValue({
    success: true,
    result:
      envelopes == null
        ? { available: false }
        : { available: true, result: { envelopes } },
  });
}

/**
 * Check that a call copying to two other tracks reads the envelope list once,
 * finds the remote script gone, and hedges both entries.
 * @param run - Makes the call
 */
export async function expectOneReadThenHedges(
  run: () => Promise<unknown>,
): Promise<void> {
  answerEnvelopeList(null);

  const result = (await run()) as Array<{ detail?: string }>;

  expect(result.map((entry) => entry.detail)).toStrictEqual([
    UNNAMED_ENVELOPE_LOSS,
    UNNAMED_ENVELOPE_LOSS,
  ]);
  expect(requestNode).toHaveBeenCalledTimes(1);
}
