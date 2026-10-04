// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude Code (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Where a clip sits decides whether its envelopes can be written at all.

import { describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { applyClipEnvelopes } from "#src/tools/clip/envelopes/apply-clip-envelopes.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

describe("applyClipEnvelopes - clip placement", () => {
  it("says a clip outside a session slot can't hold automation", async () => {
    // Not an arrangement clip, yet its path names no clip slot.
    registerMockObject("321", {
      path: `${livePath.track(0)} view detail_clip`,
      properties: { is_arrangement_clip: 0 },
    });
    const entry: ClipResult = { id: "321" };

    await applyClipEnvelopes(entry, [{ target: "volume", notation: "1|1 0" }]);

    expect(entry.envelopes).toBe(
      "only a clip in a session clip slot can hold automation",
    );
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("does nothing without lines to write", async () => {
    const entry: ClipResult = { id: "321" };

    await applyClipEnvelopes(entry, undefined);

    expect(entry).toStrictEqual({ id: "321" });
  });
});
