// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A hosted plug-in's params that an automation slot drives read with the slot,
// and with the arrangement automation on it.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  infoReply,
  installWrapper,
  registerWrapperDevice,
  type WrapperMessage,
} from "#src/tools/device/tests/helpers/plugin-host-wrapper-fixtures.ts";
import { readOneDevice } from "../../read-device.ts";

const PARAMS: WrapperMessage = {
  success: true,
  total: 3,
  params: [
    { index: 5, name: "Cutoff", display: " 1 kHz" },
    { index: 206, name: "Main Vol", display: " -6 dB" },
    { index: 9, name: "Res", display: " 20 %" },
  ],
};

/**
 * Register the wrapper at t0/d0 with automation slots 1 and 2 as its parameters.
 * @param states - The automation state of each slot's parameter
 * @param playingSlot - The track's playing_slot_index (-1 follows the arrangement)
 */
function setup(states: number[] = [0, 0], playingSlot = -1): void {
  const device = registerWrapperDevice({
    path: String(livePath.track(0).device(0)),
  });

  device.properties.parameters = states.flatMap((_, i) => [
    "id",
    `slot-${i + 1}`,
  ]);

  for (const [i, state] of states.entries()) {
    registerMockObject(`slot-${i + 1}`, {
      path: livePath.track(0).device(0).parameter(i),
      type: "DeviceParameter",
      properties: {
        name: `Automation 00${i + 1}`,
        original_name: `Automation 00${i + 1}`,
        automation_state: state,
      },
    });
  }

  registerMockObject("track0", {
    path: String(livePath.track(0)),
    type: "Track",
    properties: { playing_slot_index: playingSlot },
  });
}

/** Slots driving two of the params. */
const TWO_SLOTS: WrapperMessage = {
  success: true,
  slotCount: 128,
  slots: [
    { slot: 1, index: 206, name: "Main Vol" },
    { slot: 2, index: 9, name: "Res" },
  ],
};

/**
 * Make the wrapper answer for a hosted Serum 2.
 * @param slots - What the wrapper says of its slots: by default two drive params
 * @returns The requests the wrapper heard
 */
function answer(slots?: WrapperMessage): WrapperMessage[] {
  return installWrapper({
    info: () => infoReply("Serum 2"),
    params: () => PARAMS,
    slots: () => slots ?? TWO_SLOTS,
  });
}

/** The params as a read lists them when no slot drives any. */
const PLAIN = [
  { id: "h5", name: "Cutoff" },
  { id: "h206", name: "Main Vol" },
  { id: "h9", name: "Res" },
];

describe("readOneDevice on a hosted plug-in with automation slots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(globalThis.messnamed).mockReset();
    clearMockRegistry();
  });

  it("gives the slot of each param a slot drives, and nothing to the rest", () => {
    setup();
    answer();

    expect(
      readOneDevice({ path: "t0/d0", include: ["params"] }).parameters,
    ).toStrictEqual([
      { id: "h5", name: "Cutoff" },
      { id: "h206", name: "Main Vol", slot: "Automation 001" },
      { id: "h9", name: "Res", slot: "Automation 002" },
    ]);
  });

  it("gives the automation on a slot beside the values, unless the track plays from Session", () => {
    setup([0, 1]);
    answer();

    const read = () =>
      readOneDevice({ path: "t0/d0", include: ["param-values"] });
    const resSlot = {
      id: "h9",
      name: "Res",
      value: "20 %",
      slot: "Automation 002",
    };

    expect((read().parameters as object[]).at(-1)).toStrictEqual({
      ...resSlot,
      automation: "active",
    });

    // Played from Session, the state reads none whatever the lane holds.
    setup([0, 1], 2);

    const fromSession = read();

    expect((fromSession.parameters as object[]).at(-1)).toStrictEqual(resSlot);
    expect(fromSession.detail).toBe(
      "arrangement automation unknown while the track plays from Session",
    );
  });

  it("reads no slot's automation when the params listed have no slot", () => {
    setup([0, 1]);
    installWrapper({
      info: () => infoReply("Serum 2"),
      params: () => ({
        ...PARAMS,
        params: (PARAMS.params as object[]).slice(0, 1),
      }),
      slots: () => TWO_SLOTS,
    });

    expect(
      readOneDevice({
        path: "t0/d0",
        include: ["param-values"],
        paramSearch: "cut",
      }).parameters,
    ).toStrictEqual([{ id: "h5", name: "Cutoff", value: "1 kHz" }]);
  });

  it("reads the slots once, whatever is searched for", () => {
    setup();

    const heard = answer();

    readOneDevice({ path: "t0/d0", paramSearch: "main" });

    expect(heard.filter((request) => request.op === "slots")).toHaveLength(1);
  });

  it.each([
    ["no slot drives any", { success: true, slotCount: 128, slots: [] }],
    ["the slots can't be read", { success: false, error: "boom" }],
  ])("lists the params as before when %s", (_why, slots) => {
    setup();
    answer(slots);

    expect(
      readOneDevice({ path: "t0/d0", include: ["params"] }).parameters,
    ).toStrictEqual(PLAIN);
  });
});
