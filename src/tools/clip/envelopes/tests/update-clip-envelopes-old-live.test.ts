// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// update-clip's `envelopes` on Live before 12.4, whose Python API can't write
// envelope points. Clearing still works there.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { ENVELOPE_ROUTES } from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import {
  setupMidiClipMock,
  setupUpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

const NOTATION = "1|1 0 / 3|1 0.8";

const REFUSAL =
  "not written: writing envelope points requires Live 12.4 or later. An empty line still clears an envelope";

/**
 * Report a Live version from live_app.
 * @param version - What `get_version_string` returns
 */
function liveVersion(version: string): void {
  registerMockObject("live_app", {
    path: "live_app",
    methods: { get_version_string: () => version },
  });
}

describe("updateClip - envelopes by Live version", () => {
  beforeEach(() => {
    setupMidiClipMock(setupUpdateClipMocks().clip123);
    vi.mocked(requestNode).mockReset();
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: true, result: { cleared: true } },
    });
  });

  /**
   * The routes called, in order.
   * @returns The route names
   */
  function routesCalled(): unknown[] {
    return vi.mocked(requestNode).mock.calls.map((call) => call[0]);
  }

  it("refuses points on Live 12.3, saying what still works", async () => {
    liveVersion("12.3.8");

    const result = await updateClip({
      id: "123",
      envelopes: `volume: ${NOTATION}`,
    });

    expect(requestNode).not.toHaveBeenCalled();
    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 0,
        detail: `envelope "volume": ${REFUSAL}`,
      }),
    );
  });

  it("still clears on Live 12.3", async () => {
    liveVersion("12.3.8");

    const result = await updateClip({
      id: "123",
      envelopes: `volume:\npan: ${NOTATION}`,
    });

    expect(routesCalled()).toStrictEqual([ENVELOPE_ROUTES.clear]);
    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 1,
        detail: `envelope "pan": ${REFUSAL}`,
      }),
    );
  });

  it("writes points on Live 12.4", async () => {
    liveVersion("12.4.0");

    await updateClip({ id: "123", envelopes: `volume: ${NOTATION}` });

    expect(routesCalled()).toStrictEqual([ENVELOPE_ROUTES.write]);
  });
});
