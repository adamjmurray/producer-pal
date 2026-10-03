// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A write that parks on a preset load must not lose or swap its warnings with a
// request that runs while it waits (v8-warning-capture.ts).

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type NodeResponse,
  requestNode,
} from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  beginWarningCapture,
  endWarningCapture,
  suspendWarningCapture,
} from "#src/shared/max/v8-warning-capture.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  type BrowserItem,
  REMOTE_SCRIPT_ROUTES,
} from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { updateDevice } from "../../update-device.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

const PRESET: BrowserItem = {
  type: "instrument",
  path: "Drift/Bass/AG Bass.adv",
  name: "AG Bass.adv",
};

describe("updateDevice - warnings while a preset loads", () => {
  let finishLoad: () => void;

  beforeEach(() => {
    registerMockObject("drift", {
      path: String(livePath.track(3).device(0)),
      type: "Device",
      properties: { class_display_name: "Drift", type: 1, name: "Drift" },
    });
    registerMockObject("reverb", {
      path: String(livePath.track(3).device(1)),
      type: "Device",
      properties: { class_display_name: "Reverb", type: 2, name: "Reverb" },
    });

    // The remote script answers the lookup at once and the load when told to,
    // each through the wrapper the real request channel parks on.
    const loaded = new Promise<void>((resolve) => {
      finishLoad = resolve;
    });

    const respond = (
      result: unknown,
      after: Promise<unknown> = Promise.resolve(),
    ): Promise<NodeResponse> =>
      suspendWarningCapture(after.then(() => ({ success: true, result })));

    vi.mocked(requestNode).mockImplementation(async (route) =>
      route === REMOTE_SCRIPT_ROUTES.resolvePreset
        ? await respond({ available: true, item: PRESET })
        : await respond({ available: true, replaced: false }, loaded),
    );
  });

  it("puts each request's warnings on its own response", async () => {
    // Request A parks inside the preset load, with a warning still to come.
    const first = beginWarningCapture();
    const parked = updateDevice({
      id: "   ",
      path: "t3/d0",
      preset: "AG Bass",
    });

    // Request B starts and finishes while A waits.
    const second = beginWarningCapture();

    updateDevice({ ids: "   ", path: "t3/d1", name: "Pad" });

    const secondWarnings = endWarningCapture(second);

    finishLoad();
    await parked;

    expect(endWarningCapture(first)).toStrictEqual([
      'blank id ignored: "path" names the targets',
    ]);
    expect(secondWarnings).toStrictEqual([
      'blank ids ignored: "path" names the targets',
    ]);
  });
});
