// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// update-clip's `envelopes` when the remote script goes missing after some
// lines were written: the lines that landed stay counted.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
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

const NOTATION = "1|1 0 / 3|1 0.8";

const MISSING =
  "the Producer Pal remote script isn't running, so clip automation can't be reached";

describe("updateClip - envelopes when the remote script goes missing", () => {
  beforeEach(() => {
    setupMidiClipMock(setupUpdateClipMocks().clip123);
    vi.mocked(requestNode).mockReset();
  });

  it("keeps the lines that landed, and names the ones left", async () => {
    vi.mocked(requestNode)
      .mockResolvedValueOnce({
        success: true,
        result: { available: true, result: {} },
      })
      .mockResolvedValueOnce({
        success: true,
        result: { available: true, result: {} },
      })
      .mockResolvedValue({ success: true, result: { available: false } });

    const result = await updateClip({
      id: "123",
      envelopes: `volume: ${NOTATION}\npan: ${NOTATION}\nsend0: ${NOTATION}\nsend1: ${NOTATION}`,
    });

    expect(requestNode).toHaveBeenCalledTimes(3);
    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 2,
        detail: `${MISSING}; envelopes not written, re-run for "send0", "send1"`,
      }),
    );
  });

  it("still reports only the reason when the first line finds it missing", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: false },
    });

    const result = await updateClip({
      id: "123",
      envelopes: `volume: ${NOTATION}\npan: ${NOTATION}`,
    });

    expect(requestNode).toHaveBeenCalledTimes(1);
    expect(result).toStrictEqual(
      expect.objectContaining({ envelopes: MISSING }),
    );
    expect(result).not.toHaveProperty("detail");
  });
});
