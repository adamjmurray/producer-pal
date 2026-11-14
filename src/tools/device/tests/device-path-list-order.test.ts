// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// createDevice, updateDevice and duplicate place devices by one rule, so a path
// list means the same to each: the same shapes are refused, for the same entry.

import { describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { LIVE_API_DEVICE_TYPE_AUDIO_EFFECT } from "#src/tools/constants.ts";
import { createDevice } from "#src/tools/device/create/create-device.ts";
import { updateDevice } from "#src/tools/device/update/update-device.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

vi.mock(import("#src/tools/session/select.ts"), () => ({ select: vi.fn() }));

/** Each tool, sent a two-entry list of where to put an audio effect. */
const TOOLS: Record<string, (paths: string) => unknown> = {
  createDevice: (paths) => createDevice({ path: paths, device: "Compressor" }),
  updateDevice: (paths) => updateDevice({ id: "src-0,src-1", toPath: paths }),
  duplicate: (paths) =>
    duplicate({ type: "device", id: "src-0", toPath: paths }),
};

/** [paths, the entry refused and the earlier one that renumbered it, or null] */
const SHAPES: Array<[string, [string, string] | null]> = [
  ["t1/d0,t1/d0", ["t1/d0", "t1/d0"]],
  ["t1/d1,t1/d0", ["t1/d0", "t1/d1"]],
  ["t1/d0,t1/d0/c0", ["t1/d0/c0", "t1/d0"]],
  ["t1/d1,t1/d0/c0", ["t1/d0/c0", "t1/d1"]],
  ["t1/d+,t1/d+", null],
  ["t1/d+,t1/d0", null],
  ["t1/d0/c0,t1/d0/c0", null],
  ["t1/d0,t2/d0", null],
];

/**
 * t0 holds the audio effects to move or copy; t1 a rack, then a Utility; t2
 * nothing.
 */
function registerSet(): void {
  mockNonExistentObjects();
  registerMockObject("live_set", { path: livePath.liveSet });
  registerMockObject("track-0", {
    path: livePath.track(0),
    properties: { devices: children("src-0", "src-1") },
  });

  for (const index of [0, 1]) {
    registerMockObject(`src-${index}`, {
      path: livePath.track(0).device(index),
      type: "Device",
      properties: { type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT },
    });
  }

  registerMockObject("track-1", {
    path: livePath.track(1),
    properties: { devices: children("rack", "util") },
  });
  registerMockObject("rack-c0", {
    path: livePath.track(1).device(0).chain(0),
    type: "Chain",
    properties: { devices: children() },
  });
  registerMockObject("rack", {
    path: livePath.track(1).device(0),
    type: "RackDevice",
    properties: { chains: children("rack-c0"), can_have_chains: 1 },
  });
  registerMockObject("util", { path: livePath.track(1).device(1) });
  registerMockObject("track-2", {
    path: livePath.track(2),
    properties: { devices: children() },
  });
}

/**
 * Why a call failed, or null when it went through. Only the order refusal
 * matters here; the mocks stop most writes some other way.
 * @param call - The tool call
 * @returns The order refusal, or null
 */
async function orderRefusal(call: () => unknown): Promise<string | null> {
  try {
    await call();
  } catch (error) {
    const message = (error as Error).message;

    return message.includes("spelled through") ? message : null;
  }

  return null;
}

describe.each(Object.entries(TOOLS))("%s path list order", (tool, send) => {
  const [param, verb] =
    tool === "createDevice"
      ? ["path", "insert at"]
      : ["toPath", tool === "duplicate" ? "copy to" : "move to"];

  it.each(SHAPES)("%s", async (paths, refused) => {
    registerSet();

    const reason = await orderRefusal(() => send(paths));

    expect(reason).toBe(
      refused == null
        ? null
        : `${param} entry "${refused[0]}" is spelled through "t1", which ` +
            `the ${verb} "${refused[1]}" renumbers. Make these calls separately.`,
    );
  });
});
