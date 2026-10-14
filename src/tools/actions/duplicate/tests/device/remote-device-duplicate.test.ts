// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { duplicateOnRemoteScript } from "#src/tools/actions/duplicate/helpers/device/remote-script-copy/remote-device-duplicate.ts";
import { REMOTE_SCRIPT_ROUTES } from "#src/tools/device/create/helpers/remote-script-contract.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

const DEVICE = { path: "live_set tracks 0 devices 1", name: "Reverb" };

describe("duplicateOnRemoteScript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks the route to copy the device, and says where the copy went", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: true, index: 2 },
    });

    expect(await duplicateOnRemoteScript(DEVICE, null)).toStrictEqual({
      kind: "copied",
      index: 2,
    });
    expect(requestNode).toHaveBeenCalledWith(
      REMOTE_SCRIPT_ROUTES.duplicateDevice,
      {
        devicePath: DEVICE.path,
        deviceName: "Reverb",
        expiresInMs: expect.any(Number),
      },
      expect.any(Number),
    );
  });

  it("says when there is no remote script to ask", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: false },
    });

    expect(await duplicateOnRemoteScript(DEVICE, null)).toStrictEqual({
      kind: "unavailable",
    });
  });

  it("hands back a refusal as one Live can't have acted on", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: true, error: "it's an instrument" },
    });

    expect(await duplicateOnRemoteScript(DEVICE, null)).toStrictEqual({
      kind: "failed",
      reason: "it's an instrument",
      unfinished: false,
    });
  });

  it("passes on that Live may have acted on a request that timed out", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: true, error: "too slow", unfinished: true },
    });

    expect(await duplicateOnRemoteScript(DEVICE, null)).toStrictEqual({
      kind: "failed",
      reason: "too slow",
      unfinished: true,
    });
  });

  it.each([
    [{ success: false, error: "timed out" }, "timed out"],
    [{ success: false }, "the remote script returned nothing"],
    [{ success: true }, "the remote script returned nothing"],
  ])(
    "treats %j as an answer that may have landed",
    async (response, reason) => {
      vi.mocked(requestNode).mockResolvedValue(response);

      expect(await duplicateOnRemoteScript(DEVICE, null)).toStrictEqual({
        kind: "failed",
        reason,
        unfinished: true,
      });
    },
  );

  it("sends nothing once the request is out of time", async () => {
    expect(await duplicateOnRemoteScript(DEVICE, Date.now() - 1)).toStrictEqual(
      {
        kind: "failed",
        reason: "the request ran out of time",
        unfinished: false,
      },
    );
    expect(requestNode).not.toHaveBeenCalled();
  });
});
