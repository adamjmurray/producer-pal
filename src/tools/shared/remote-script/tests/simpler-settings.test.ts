// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import {
  lookUpSimplerSettings,
  writeSimplerSettings,
} from "#src/tools/shared/remote-script/simpler-settings.ts";
import { REQUEST_OUT_OF_TIME } from "#src/tools/shared/validation/lists/named-targets.ts";
import { MAX_SIMPLERS_PER_CALL } from "#src/tools/shared/remote-script/simpler-settings-contract.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

/**
 * Simplers that only have a path.
 * @param count - How many
 * @returns The Simplers
 */
function simplers(count: number): LiveAPI[] {
  return Array.from({ length: count }, (_, i) => ({
    path: `live_set tracks 0 devices ${String(i)}`,
  })) as unknown as LiveAPI[];
}

describe("lookUpSimplerSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks in chunks at the remote script's cap", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: true, result: { simplers: [] } },
    });

    const answers = await lookUpSimplerSettings(
      simplers(MAX_SIMPLERS_PER_CALL + 1),
      null,
    );

    expect(requestNode).toHaveBeenCalledTimes(2);
    expect(answers).toHaveLength(MAX_SIMPLERS_PER_CALL + 1);
  });

  it("gives the reason for a Simpler the remote script can't read", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: {
        available: true,
        result: { simplers: [{ error: "'Reverb' is not a Simpler" }] },
      },
    });

    expect(await lookUpSimplerSettings(simplers(1), null)).toStrictEqual([
      { unreadable: "'Reverb' is not a Simpler" },
    ]);
  });

  it("gives null when the remote script is out of date", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: false, outdated: "too old" },
    });

    expect(await lookUpSimplerSettings(simplers(1), null)).toBeNull();
  });

  it("gives null when the remote script isn't running", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: false },
    });

    expect(await lookUpSimplerSettings(simplers(1), null)).toBeNull();
  });
});

describe("writeSimplerSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const [simpler] = simplers(1) as [LiveAPI];

  it("hands back both settings in this tool's spelling", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: {
        available: true,
        result: { pitch_bend_range: 12, note_pitch_bend_range: 48 },
      },
    });

    expect(
      await writeSimplerSettings(simpler, { pitchBendRange: 12 }, null),
    ).toStrictEqual({
      ok: true,
      result: { pitchBendRange: 12, notePitchBendRange: 48 },
    });
  });

  it("says nothing was sent when the request is out of time", async () => {
    expect(
      await writeSimplerSettings(
        simpler,
        { pitchBendRange: 12 },
        Date.now() - 1,
      ),
    ).toStrictEqual({
      ok: false,
      reason: REQUEST_OUT_OF_TIME,
      available: true,
      stalled: "out-of-time",
    });
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("calls a route that throws unanswered, since the write may have landed", async () => {
    vi.mocked(requestNode).mockRejectedValue(new Error("channel closed"));

    expect(
      await writeSimplerSettings(simpler, { pitchBendRange: 12 }, null),
    ).toStrictEqual({
      ok: false,
      reason:
        "the Producer Pal remote script did not answer in time (channel closed)",
      available: true,
      stalled: "unanswered",
    });
  });
});
