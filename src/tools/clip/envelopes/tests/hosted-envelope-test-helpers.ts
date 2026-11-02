// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A track with a hosted plug-in's wrapper at t0/d0, and a wrapper that answers
// for it. The test file must `vi.mock` node-request-v8-protocol.ts.

import { vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { ENVELOPE_ROUTES } from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import {
  infoReply,
  installWrapper,
  registerWrapperDevice,
  type WrapperMessage,
} from "#src/tools/device/tests/helpers/plugin-host-wrapper-fixtures.ts";

/** How many slots the fake wrapper has. */
export const SLOT_COUNT = 4;

/** A mapped slot of the fake wrapper. */
export interface Mapping {
  slot: number;
  index: number;
  name: string;
}

/** Every slot of the fake wrapper mapped to some other param. */
export const FULL_BANK: Mapping[] = [
  { slot: 1, index: 5, name: "Cutoff" },
  { slot: 2, index: 6, name: "Res" },
  { slot: 3, index: 7, name: "Drive" },
  { slot: 4, index: 8, name: "Mix" },
];

/** What the fake wrapper does, and what it was asked. */
export interface Wrapper {
  mapped: Mapping[];
  heard: WrapperMessage[];
  /** Answers `map` with this error, when set */
  mapError?: string;
}

/**
 * Register the clip's track: its clip slots, the wrapper at t0/d0 and the
 * wrapper's parameters (its Device On, then one per automation slot).
 * @param options - How the track differs from the usual
 * @param options.automation - The automation state of each slot's parameter
 * @param options.playingSlot - The track's playing_slot_index
 * @param options.skipSlots - Slots whose parameter the wrapper doesn't list
 * @param options.nested - Put the wrapper at t0/d0/c1/d0, in a rack's chain
 */
export function setupTrack(
  options: {
    automation?: number[];
    playingSlot?: number;
    skipSlots?: number[];
    nested?: boolean;
  } = {},
): void {
  const { automation = [], playingSlot = -1, skipSlots = [] } = options;
  const device = options.nested
    ? livePath.track(0).device(0).chain(1).device(0)
    : livePath.track(0).device(0);

  registerMockObject("track0", {
    path: String(livePath.track(0)),
    type: "Track",
    properties: {
      playing_slot_index: playingSlot,
      clip_slots: ["id", "cs0", "id", "cs1"],
      devices: ["id", "device-123"],
    },
  });
  registerMockObject("cs0", {
    path: String(livePath.track(0).clipSlot(0)),
    properties: { has_clip: 1 },
  });
  registerMockObject("cs1", {
    path: String(livePath.track(0).clipSlot(1)),
    properties: { has_clip: 0 },
  });

  if (options.nested) {
    registerMockObject("rack", {
      path: String(livePath.track(0).device(0)),
      type: "RackDevice",
      properties: {
        can_have_chains: 1,
        chains: ["id", "chain0", "id", "chain1"],
      },
    });
    registerMockObject("chain1", {
      path: String(livePath.track(0).device(0).chain(1)),
      type: "Chain",
      properties: { devices: ["id", "device-123"] },
    });
  }

  const wrapper = registerWrapperDevice({ path: String(device) });
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => i + 1).filter(
    (slot) => !skipSlots.includes(slot),
  );

  registerMockObject("device-on", {
    path: device.parameter(0),
    type: "DeviceParameter",
    properties: { name: "Device On" },
  });
  wrapper.properties.parameters = [
    "id",
    "device-on",
    ...slots.flatMap((slot) => ["id", `slot-${slot}`]),
  ];

  for (const [i, slot] of slots.entries()) {
    const name = `Automation ${String(slot).padStart(3, "0")}`;

    registerMockObject(`slot-${slot}`, {
      path: device.parameter(i + 1),
      type: "DeviceParameter",
      properties: {
        name,
        original_name: name,
        automation_state: automation[slot - 1] ?? 0,
      },
    });
  }

  mockNonExistentObjects();
}

/**
 * Make the wrapper answer for a hosted plug-in with some slots mapped.
 * @param mapped - What the slots drive to begin with
 * @returns The wrapper's state, and the requests it heard
 */
export function answerAsWrapper(mapped: Mapping[] = []): Wrapper {
  const wrapper: Wrapper = { mapped: [...mapped], heard: [] };
  const heard = installWrapper({
    info: () => infoReply("Serum 2"),
    slots: () => ({
      success: true,
      slotCount: SLOT_COUNT,
      slots: wrapper.mapped,
    }),
    map: (request) => {
      if (wrapper.mapError != null) {
        return { success: false, error: wrapper.mapError };
      }

      const slot = request.slot as number;
      const index = request.index as number;
      const entry = { slot, index, name: `Param ${index}` };

      wrapper.mapped = [
        ...wrapper.mapped.filter((m) => m.slot !== slot),
        entry,
      ];

      return { success: true, ...entry, dialSet: true };
    },
  });

  wrapper.heard = heard;

  return wrapper;
}

/**
 * Answer the envelope routes: every write and clear works, and the list route
 * reports these envelopes on the track's clip.
 * @param listed - The envelopes the list route reports, by device parameter;
 *   one with no device is a mixer parameter
 */
export function answerRoutes(
  listed: { device?: string; index?: number }[] = [],
): void {
  vi.mocked(requestNode).mockReset();
  vi.mocked(requestNode).mockImplementation(async (route) => ({
    success: true,
    result:
      route === ENVELOPE_ROUTES.list
        ? {
            available: true,
            result: {
              envelopes: listed.map(({ device, index }) => ({
                device,
                parameter_index: index,
                parameter: { name: "x" },
                event_count: 1,
              })),
            },
          }
        : { available: true, result: { cleared: true } },
  }));
}

/**
 * The args one route was called with, less the expiry.
 * @param route - The route
 * @returns Its args, or undefined when it was never called
 */
export function routeArgs(route: string): Record<string, unknown> | undefined {
  const args = vi
    .mocked(requestNode)
    .mock.calls.find((call) => call[0] === route)?.[1] as
    | Record<string, unknown>
    | undefined;

  if (args == null) {
    return undefined;
  }

  const { expiresInMs: _expiry, ...rest } = args;

  return rest;
}

/**
 * @param request - What the wrapper heard
 * @param op - The op
 * @returns The requests for that op
 */
export function heardOp(wrapper: Wrapper, op: string): WrapperMessage[] {
  return wrapper.heard.filter((request) => request.op === op);
}
