// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// `envelopes` on a clip that automates a hosted plug-in's param through one of
// its wrapper's automation slots.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  ENVELOPE_ROUTES,
  type EnvelopeListResult,
} from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  infoReply,
  installWrapper,
  registerWrapperDevice,
  type WrapperMessage,
} from "#src/tools/device/tests/helpers/plugin-host-wrapper-fixtures.ts";
import {
  type ReadClipResult,
  readClip,
} from "#src/tools/clip/read/read-clip.ts";
import { setupMidiClipMock } from "../read-clip-test-helpers.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

type ListedEnvelope = EnvelopeListResult["envelopes"][number];

/**
 * An envelope on one of the wrapper's slots.
 * @param slot - The slot number
 * @param device - The remote script's device path
 * @returns What the list route says about it
 */
function slotEnvelope(slot: number, device = "d0"): ListedEnvelope {
  return {
    device,
    parameter_index: slot,
    parameter: {
      name: `Automation 00${slot}`,
      min: 0,
      max: 1,
      value: 0.5,
      display: "0.5",
      quantized: false,
      enabled: true,
      automation_state: 1,
    },
    event_count: 1,
  };
}

/**
 * Answer the envelope routes: one list, and one point for every read.
 * @param listed - What the list route reports
 */
function answerEnvelopeRoutes(listed: ListedEnvelope[]): void {
  vi.mocked(requestNode).mockImplementation(async (route) =>
    route === ENVELOPE_ROUTES.list
      ? {
          success: true,
          result: { available: true, result: { envelopes: listed } },
        }
      : {
          success: true,
          result: {
            available: true,
            result: {
              exists: true,
              event_count: 1,
              events: [
                { time: 0, value: 0.2, display: 0.2, display_str: "0.2" },
              ],
            },
          },
        },
  );
}

/**
 * Register the clip on t0/s1, and its track's first device as a wrapper.
 * @param slotIds - The ids of the wrapper's slot parameters, by slot number
 */
function setup(slotIds = ["slot-1", "slot-2"]): void {
  setupMidiClipMock({
    trackIndex: 0,
    sceneIndex: 1,
    clipId: "clip0",
    clipProps: {
      name: "Automated",
      signature_numerator: 4,
      signature_denominator: 4,
      length: 4,
      is_arrangement_clip: 0,
    },
  });
  registerWrapperDevice({ path: String(livePath.track(0).device(0)) });

  for (const [i, id] of slotIds.entries()) {
    registerMockObject(id, {
      path: livePath
        .track(0)
        .device(0)
        .parameter(i + 1),
    });
  }

  mockNonExistentObjects();
}

/**
 * Make the wrapper answer for a hosted Serum 2 whose slots drive some params.
 * @param slots - What the slots drive
 * @returns The requests the wrapper heard
 */
function answerSlots(
  slots: { slot: number; index: number; name: string }[],
): WrapperMessage[] {
  return installWrapper({
    info: () => infoReply("Serum 2"),
    slots: () => ({ success: true, slotCount: 128, slots }),
  });
}

/**
 * Read the clip's automation.
 * @returns Whatever landed on the clip's `envelopes`
 */
async function readEnvelopes(): Promise<ReadClipResult["envelopes"]> {
  const clip = (await readClip({
    path: "t0/s1",
    include: ["envelopes"],
  })) as ReadClipResult;

  return clip.envelopes;
}

describe("readClip - envelopes on a hosted plug-in's slots", () => {
  beforeEach(() => {
    vi.mocked(requestNode).mockReset();
  });

  it("names a mapped slot's envelope by the plug-in param, with an id that targets it", async () => {
    setup();
    answerEnvelopeRoutes([slotEnvelope(2)]);
    answerSlots([{ slot: 2, index: 206, name: "Main Vol" }]);

    expect(await readEnvelopes()).toStrictEqual([
      {
        parameter: "Main Vol",
        id: "t0/d0/h206",
        slot: "Automation 002",
        eventCount: 1,
        events: "1|1 0.2",
      },
    ]);
  });

  it("reads an unmapped slot's envelope as any parameter's", async () => {
    setup();
    answerEnvelopeRoutes([slotEnvelope(2)]);
    answerSlots([{ slot: 1, index: 206, name: "Main Vol" }]);

    expect(await readEnvelopes()).toStrictEqual([
      {
        parameter: "Automation 002",
        id: "slot-2",
        device: "t0/d0",
        eventCount: 1,
        events: "1|1 0.2",
      },
    ]);
  });

  it("reads a device that isn't a wrapper as any device", async () => {
    setup();
    answerEnvelopeRoutes([slotEnvelope(2)]);
    installWrapper({});

    expect(await readEnvelopes()).toStrictEqual([
      expect.objectContaining({
        parameter: "Automation 002",
        id: "slot-2",
        device: "t0/d0",
      }),
    ]);
  });

  it("reads a wrapper whose slots can't be read as any device", async () => {
    setup();
    answerEnvelopeRoutes([slotEnvelope(2)]);
    installWrapper({
      info: () => infoReply("Serum 2"),
      slots: () => ({ success: false, error: "boom" }),
    });

    expect(await readEnvelopes()).toStrictEqual([
      expect.objectContaining({ parameter: "Automation 002", id: "slot-2" }),
    ]);
  });

  it("asks a wrapper about its slots once, however many envelopes it has", async () => {
    setup();
    answerEnvelopeRoutes([slotEnvelope(1), slotEnvelope(2)]);

    const heard = answerSlots([
      { slot: 1, index: 5, name: "Cutoff" },
      { slot: 2, index: 206, name: "Main Vol" },
    ]);

    expect(await readEnvelopes()).toStrictEqual([
      expect.objectContaining({ parameter: "Cutoff", id: "t0/d0/h5" }),
      expect.objectContaining({ parameter: "Main Vol", id: "t0/d0/h206" }),
    ]);
    expect(heard.filter((request) => request.op === "slots")).toHaveLength(1);
  });

  it("reads a build without hosted plug-ins as any device", async () => {
    vi.stubEnv("ENABLE_HOSTED_PLUGINS", "");

    try {
      setup();
      answerEnvelopeRoutes([slotEnvelope(2)]);

      const heard = installWrapper({ info: () => infoReply("Serum 2") });

      expect(await readEnvelopes()).toStrictEqual([
        expect.objectContaining({ parameter: "Automation 002", id: "slot-2" }),
      ]);
      expect(heard).toStrictEqual([]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
