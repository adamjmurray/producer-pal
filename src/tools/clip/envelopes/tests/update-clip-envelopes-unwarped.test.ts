// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// update-clip's `envelopes` on an audio clip: Live keeps an unwarped clip's
// envelopes but never plays them, so points aren't written to one.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { ENVELOPE_ROUTES } from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import {
  setupAudioClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

const NOTATION = "1|1 0 / 3|1 0.8";

/** A parameter on the clip's own track. */
const FILTER_ID = "472";

const REFUSAL =
  "not written: an unwarped audio clip can't play envelopes. Set warping: true on the clip, then write it again";

describe("updateClip - envelopes on an audio clip", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
    registerMockObject(FILTER_ID, {
      type: "DeviceParameter",
      path: livePath.track(0).device(0).parameter(2),
    });
    mockNonExistentObjects();
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

  it("writes to a warped audio clip", async () => {
    setupAudioClipMock(mocks.clip123, { warping: 1 });

    const result = await updateClip({
      id: "123",
      envelopes: `volume: ${NOTATION}`,
    });

    expect(routesCalled()).toStrictEqual([ENVELOPE_ROUTES.write]);
    expect(result).toStrictEqual(expect.objectContaining({ envelopes: 1 }));
  });

  it("refuses points on an unwarped audio clip, saying why and what to do", async () => {
    setupAudioClipMock(mocks.clip123, { warping: 0 });

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

  it("refuses the points but still runs the clear on the same clip", async () => {
    setupAudioClipMock(mocks.clip123, { warping: 0 });

    const result = await updateClip({
      id: "123",
      envelopes: `volume: ${NOTATION}\n${FILTER_ID}:\npan: ${NOTATION}`,
    });

    expect(routesCalled()).toStrictEqual([ENVELOPE_ROUTES.clear]);
    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 1,
        detail: `envelope "volume": ${REFUSAL}; envelope "pan": ${REFUSAL}`,
      }),
    );
  });

  it("reads warping after the same call changed it: turned off refuses", async () => {
    setupAudioClipMock(mocks.clip123, { warping: 1 });

    const result = await updateClip({
      id: "123",
      warping: false,
      envelopes: `volume: ${NOTATION}`,
    });

    expect(requestNode).not.toHaveBeenCalled();
    expect(result).toStrictEqual(
      expect.objectContaining({
        envelopes: 0,
        detail: expect.stringContaining(REFUSAL) as string,
      }),
    );
  });

  it("reads warping after the same call changed it: turned on writes", async () => {
    setupAudioClipMock(mocks.clip123, { warping: 0 });

    const result = await updateClip({
      id: "123",
      warping: true,
      envelopes: `volume: ${NOTATION}`,
    });

    expect(routesCalled()).toStrictEqual([ENVELOPE_ROUTES.write]);
    expect(result).toStrictEqual(expect.objectContaining({ envelopes: 1 }));
  });
});
