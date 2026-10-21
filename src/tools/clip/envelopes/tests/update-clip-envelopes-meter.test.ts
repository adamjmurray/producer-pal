// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

// update-clip's `envelopes` in a clip whose bars hold more than 4 beats: times
// are read in each clip's meter, never in a stand-in one.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { answerEnvelopeRoutes } from "#src/tools/clip/envelopes/tests/envelope-route-test-helpers.ts";
import { ENVELOPE_ROUTES } from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import {
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  warn: vi.fn(),
  log: vi.fn(),
}));

/**
 * The points the write route was sent.
 * @returns Each point's time and value
 */
function writtenPoints(): unknown {
  const args = vi
    .mocked(requestNode)
    .mock.calls.find((call) => call[0] === ENVELOPE_ROUTES.write)?.[1] as
    | { points: unknown }
    | undefined;

  return args?.points;
}

describe("updateClip - envelopes in the clip's meter", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    vi.mocked(console.warn).mockClear();
    mocks = setupUpdateClipMocks();
    answerEnvelopeRoutes();
  });

  /**
   * Give the clip a meter.
   * @param numerator - Beats per bar
   * @param denominator - The beat's note value
   */
  function meter(numerator: number, denominator: number): void {
    setupMidiClipMock(mocks.clip123, {
      signature_numerator: numerator,
      signature_denominator: denominator,
    });
  }

  it("writes points past beat 4 of a 6/8 bar, with no warning", async () => {
    meter(6, 8);

    const result = await updateClip({
      id: "123",
      envelopes: "volume: 1|1 0 / 1|5 0.5 / 1|6 0.7 / 2|1 1",
    });

    expect(writtenPoints()).toStrictEqual([
      { time: 0, value: 0 },
      { time: 2, value: 0.5 },
      { time: 2.5, value: 0.7 },
      { time: 3, value: 1 },
    ]);
    expect(result).toStrictEqual(expect.objectContaining({ envelopes: 1 }));
    expect(result).not.toHaveProperty("detail");
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("writes points past beat 4 of a 5/4 bar", async () => {
    meter(5, 4);

    const result = await updateClip({
      id: "123",
      envelopes: "volume: 1|1 0 / 1|4.5 0.5 / 1|5.5 1 / 2|1 0",
    });

    expect(writtenPoints()).toStrictEqual([
      { time: 0, value: 0 },
      { time: 3.5, value: 0.5 },
      { time: 4.5, value: 1 },
      { time: 5, value: 0 },
    ]);
    expect(result).toStrictEqual(expect.objectContaining({ envelopes: 1 }));
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("reports a line that runs backwards in 6/8 on the clip, writing nothing", async () => {
    meter(6, 8);

    const result = await updateClip({
      id: "123",
      envelopes: "volume: 1|1 0 / 1|6 0.5 / 1|5 1",
    });

    expect(requestNode).not.toHaveBeenCalled();
    expect(result).toStrictEqual(
      expect.objectContaining({
        id: "123",
        envelopes: 0,
        detail: expect.stringContaining(
          'envelope "volume": Envelope points must run forwards in time, but "1|5 1"',
        ) as string,
      }),
    );
  });

  it("still writes a 4/4 line as before", async () => {
    meter(4, 4);

    await updateClip({
      id: "123",
      envelopes: "volume: 1|1 0 / 3|1 0.8 _ 4|1 0.2",
    });

    expect(writtenPoints()).toStrictEqual([
      { time: 0, value: 0 },
      { time: 8, value: 0.8 },
      { time: 12, value: 0.2, jump: true },
    ]);
    expect(console.warn).not.toHaveBeenCalled();
  });
});
