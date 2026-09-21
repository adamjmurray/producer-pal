// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The `envelopes` include, which is the one part of a clip read that goes out
// to the Producer Pal remote script.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  ENVELOPE_ROUTES,
  type EnvelopeListResult,
  type EnvelopeReadResult,
  type ParameterInfo,
} from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  type ReadClipResult,
  readClip,
} from "#src/tools/clip/read/read-clip.ts";
import { setupMidiClipMock } from "./read-clip-test-helpers.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

type ListedEnvelope = EnvelopeListResult["envelopes"][number];

/** Every read route answers with this unless a test says otherwise. */
const EVENTS = [
  { time: 0, value: 0.25, display: -12, display_str: "-12.0 dB" },
  { time: 2, value: 0.5, display: -6, display_str: "-6.0 dB" },
];

/** The same events, as notation in the clip's 4/4 meter. */
const EVENTS_NOTATION = "1|1 0.25 (-12.0 dB) ~ 1|3 0.5 (-6.0 dB)";

const MIXER_VOLUME: ListedEnvelope = {
  parameter_name: "volume",
  parameter: parameterInfo("Track Volume"),
  event_count: 2,
};

const MIXER_SEND: ListedEnvelope = {
  parameter_name: "send0",
  parameter: parameterInfo("Send A"),
  event_count: 2,
};

const DEVICE_PARAM: ListedEnvelope = {
  device: "d0/c1/d0",
  parameter_index: 2,
  parameter: parameterInfo("Filter Freq"),
  event_count: 2,
};

/**
 * One parameter as the remote script describes it.
 * @param name - What Live calls the parameter
 * @returns The parameter info a list or read route carries
 */
function parameterInfo(name: string): ParameterInfo {
  return {
    name,
    min: 0,
    max: 1,
    value: 0.5,
    display: "-6.0 dB",
    quantized: false,
    enabled: true,
    automation_state: 1,
  };
}

/**
 * Register a 4/4 session clip on track 0, and the Live objects the parameter
 * ids resolve against.
 * @param arrangement - Whether the clip reads as an arrangement clip
 */
function setupClip(arrangement = false): void {
  setupMidiClipMock({
    trackIndex: 0,
    sceneIndex: 1,
    clipId: "clip0",
    clipProps: {
      name: "Automated",
      signature_numerator: 4,
      signature_denominator: 4,
      length: 4,
      is_arrangement_clip: arrangement ? 1 : 0,
    },
  });

  const mixer = livePath.track(0).mixerDevice();

  registerMockObject("volume-param", { path: `${mixer} volume` });
  registerMockObject("pan-param", { path: `${mixer} panning` });
  registerMockObject("send-param", { path: `${mixer} sends 0` });
  registerMockObject("filter-param", {
    path: livePath.track(0).device(0).chain(1).device(0).parameter(2),
  });
  mockNonExistentObjects();
}

/**
 * Answer the envelope routes: one list, then the same events for every read.
 * @param listed - What the list route reports
 * @param read - What each read route answers, merged over the default events
 */
function answerEnvelopeRoutes(
  listed: ListedEnvelope[],
  read: Partial<EnvelopeReadResult> = {},
): void {
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
              parameter: parameterInfo("Track Volume"),
              event_count: EVENTS.length,
              events: EVENTS,
              ...read,
            },
          },
        },
  );
}

/**
 * Read the clip's automation.
 * @param include - The include array to send
 * @returns Whatever landed on the clip's `envelopes`
 */
async function readEnvelopes(
  include: string[] = ["envelopes"],
): Promise<ReadClipResult["envelopes"]> {
  const clip = (await readClip({ path: "t0/s1", include })) as ReadClipResult;

  return clip.envelopes;
}

describe("readClip - envelopes", () => {
  beforeEach(() => {
    vi.mocked(requestNode).mockReset();
  });

  it("reports each automated parameter with its id, times and values", async () => {
    setupClip();
    answerEnvelopeRoutes([MIXER_VOLUME, MIXER_SEND, DEVICE_PARAM]);

    expect(await readEnvelopes()).toStrictEqual([
      {
        parameter: "Track Volume",
        id: "volume-param",
        eventCount: 2,
        events: EVENTS_NOTATION,
      },
      {
        parameter: "Send A",
        id: "send-param",
        eventCount: 2,
        events: EVENTS_NOTATION,
      },
      {
        parameter: "Filter Freq",
        id: "filter-param",
        device: "t0/d0/c1/d0",
        eventCount: 2,
        events: EVENTS_NOTATION,
      },
    ]);
  });

  it("names the clip and the parameter on every route call", async () => {
    setupClip();
    answerEnvelopeRoutes([DEVICE_PARAM]);
    await readEnvelopes();

    expect(requestNode).toHaveBeenCalledWith(
      ENVELOPE_ROUTES.list,
      { track: "t0", slot: 1 },
      expect.any(Number),
    );
    expect(requestNode).toHaveBeenCalledWith(
      ENVELOPE_ROUTES.read,
      { track: "t0", slot: 1, device: "d0/c1/d0", parameter: 2, limit: 32 },
      expect.any(Number),
    );
  });

  it("resolves a pan envelope against the mixer's panning", async () => {
    setupClip();
    answerEnvelopeRoutes([
      {
        parameter_name: "pan",
        parameter: parameterInfo("Pan"),
        event_count: 1,
      },
    ]);

    expect(await readEnvelopes()).toStrictEqual([
      {
        parameter: "Pan",
        id: "pan-param",
        eventCount: 2,
        events: EVENTS_NOTATION,
      },
    ]);
  });

  it("leaves out an id it can't address", async () => {
    setupClip();
    answerEnvelopeRoutes([
      {
        device: "nonsense",
        parameter_index: 0,
        parameter: parameterInfo("Mystery"),
        event_count: 1,
      },
      {
        parameter_name: "macro",
        parameter: parameterInfo("Unknown Mixer Param"),
        event_count: 1,
      },
    ]);

    // No `id` on either: nothing at that address to name one.
    expect(await readEnvelopes()).toStrictEqual([
      {
        parameter: "Mystery",
        device: "t0/nonsense",
        eventCount: 2,
        events: EVENTS_NOTATION,
      },
      {
        parameter: "Unknown Mixer Param",
        eventCount: 2,
        events: EVENTS_NOTATION,
      },
    ]);
  });

  it("says when the clip holds more events than it returned", async () => {
    setupClip();
    answerEnvelopeRoutes([MIXER_VOLUME], { event_count: 97, truncated: true });

    expect(await readEnvelopes()).toStrictEqual([
      {
        parameter: "Track Volume",
        id: "volume-param",
        eventCount: 97,
        truncated: true,
        events: EVENTS_NOTATION,
      },
    ]);
  });

  it("sends the arrangement reader to the track's automation lane", async () => {
    setupClip(true);

    expect(await readEnvelopes()).toBe(
      "Live can't read an arrangement clip's envelopes: its automation lives in the track's automation lane. Automate a session clip and duplicate that to the arrangement.",
    );
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("says when the remote script isn't running", async () => {
    setupClip();
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: false },
    });

    expect(await readEnvelopes()).toBe(
      "the Producer Pal remote script isn't running, so clip automation can't be read",
    );
  });

  it("hands back what a route said went wrong", async () => {
    setupClip();
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: true, error: "no clip in slot 1 of t0" },
    });

    expect(await readEnvelopes()).toBe("no clip in slot 1 of t0");
  });

  it("says when the route itself went unanswered", async () => {
    setupClip();
    vi.mocked(requestNode).mockResolvedValue({ success: false });

    expect(await readEnvelopes()).toBe("the read went unanswered");
  });

  it("keeps reading the clip when the channel throws", async () => {
    setupClip();
    vi.mocked(requestNode).mockRejectedValue(new Error("the channel closed"));

    const clip = (await readClip({
      path: "t0/s1",
      include: ["envelopes", "notes"],
    })) as ReadClipResult;

    expect(clip.envelopes).toBe("the channel closed");
    expect(clip.notes).toBeTruthy();
  });

  it("leaves a skipped target alone", async () => {
    setupClip();
    answerEnvelopeRoutes([MIXER_VOLUME]);

    const entries = (await readClip({
      path: "t0/s1,t0/s2",
      include: ["envelopes"],
    })) as ReadClipResult[];

    expect(entries[1]).toStrictEqual({
      path: "t0/s2",
      ok: false,
      reason: 'no track at "t0"',
    });
    expect(entries[0]?.envelopes).toHaveLength(1);
  });

  it("stays out of '*', which would cost a round trip per parameter", async () => {
    setupClip();

    expect(await readEnvelopes(["*"])).toBeUndefined();
    expect(requestNode).not.toHaveBeenCalled();
  });
});
