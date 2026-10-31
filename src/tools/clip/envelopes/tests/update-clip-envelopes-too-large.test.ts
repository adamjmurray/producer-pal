// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

// update-clip's `envelopes` when one line has too many points to send in one
// Max message: that line is refused, and the others still go.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { MAX_SINGLE_MESSAGE_BYTES } from "#src/shared/mcp-responses.ts";
import {
  setupMidiClipMock,
  setupUpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

/** 900 points with long values, too many for one Max message. */
const DENSE = Array.from(
  { length: 900 },
  (_, index) => `${index + 1}|1 0.1234567891`,
).join(" / ");

describe("updateClip - an envelope line too large to send", () => {
  beforeEach(() => {
    setupMidiClipMock(setupUpdateClipMocks().clip123);
    // Stands in for requestNode's own size check.
    vi.mocked(requestNode).mockImplementation(async (_route, args) =>
      JSON.stringify(args).length > MAX_SINGLE_MESSAGE_BYTES
        ? { success: false, error: "too large", tooLarge: true }
        : { success: true, result: { available: true, result: {} } },
    );
  });

  it("says the line has too many points, and still writes the rest", async () => {
    const result = await updateClip({
      id: "123",
      envelopes: `volume: ${DENSE}\npan: 1|1 0 / 2|1 1`,
    });

    expect(requestNode).toHaveBeenCalledTimes(2);
    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 1,
        detail: expect.stringMatching(
          /^envelope "volume": not written: 900 points are too many to send in one write \(about \d{3} fit\)$/,
        ),
      }),
    );
  });

  it("says a count that fits with the rest of the request", async () => {
    // Bars 300-1199: every point spells its time in 4 digits, so all are one size.
    const even = Array.from(
      { length: 900 },
      (_, index) => `${index + 300}|1 0.1234567891`,
    ).join(" / ");

    const result = await updateClip({
      id: "123",
      envelopes: `volume: ${even}`,
    });
    const fit = Number(/about (\d+) fit/.exec(JSON.stringify(result))?.[1]);
    const [route, args] = vi.mocked(requestNode).mock.calls[0] ?? [];
    const { points } = args as { points: unknown[] };
    const fitting = { ...args, points: points.slice(0, fit) };

    expect(fit).toBeGreaterThan(0);
    expect(JSON.stringify({ route, args: fitting }).length).toBeLessThanOrEqual(
      MAX_SINGLE_MESSAGE_BYTES,
    );
  });
});
