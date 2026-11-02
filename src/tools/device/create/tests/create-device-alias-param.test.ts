// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The published param is `deviceName`; `device` is a permanent hidden alias
// (Claude Desktop's bridge drops an argument named `device`, but models and
// 2.4.0 callers still send it).

import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { createDevice } from "../create-device.ts";
import { toolDefCreateDevice } from "../create-device.def.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  emitWarning: vi.fn(),
  emitWarningOnce: vi.fn(),
}));

const TRACK = livePath.track(0);

/**
 * Register a track that takes an insert.
 * @returns The track mock
 */
function registerTrack(): RegisteredMockObject {
  const track = registerMockObject("track-0", {
    path: TRACK,
    type: "Track",
    properties: { devices: [] },
    methods: { insert_device: () => ["id", "new-device"] },
  });

  registerMockObject("new-device", { path: TRACK.device(0) });

  return track;
}

describe("createDevice — device alias", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it("creates the device from deviceName", async () => {
    registerTrack();

    expect(
      await createDevice({ deviceName: "Reverb", path: "t0/d+" }),
    ).toStrictEqual({ id: "new-device", path: "t0/d0" });
  });

  it("creates the device from the device alias", async () => {
    registerTrack();

    expect(
      await createDevice({ device: "Reverb", path: "t0/d+" }),
    ).toStrictEqual({ id: "new-device", path: "t0/d0" });
  });

  // Both spellings name the same thing, so the call is refused rather than
  // quietly taking one of them.
  it("refuses device beside deviceName, creating nothing", async () => {
    const track = registerTrack();

    await expect(
      createDevice({
        deviceName: "Reverb",
        device: "Delay",
        path: "t0/d+",
      }),
    ).rejects.toThrow(
      "deviceName names the device on its own - don't send device with it",
    );
    expect(track.call).not.toHaveBeenCalled();
  });

  it("tells a device caller the param is deviceName", async () => {
    const mockServer = {
      registerTool: vi.fn(),
    } as unknown as McpServer & { registerTool: Mock };
    const callLiveApi = vi
      .fn()
      .mockResolvedValue({ content: [{ type: "text", text: "created" }] });

    toolDefCreateDevice(mockServer, callLiveApi);

    const handler = mockServer.registerTool.mock.calls[0]![2] as (
      args: Record<string, unknown>,
      extra: { signal: AbortSignal },
    ) => Promise<{ content: { text?: string }[] }>;
    const result = await handler(
      { device: "Reverb", path: "t0/d+" },
      { signal: new AbortController().signal },
    );

    expect(callLiveApi).toHaveBeenCalledWith(
      "ppal-create-device",
      { device: "Reverb", path: "t0/d+" },
      { signal: expect.any(AbortSignal) },
    );
    expect(result.content.map((entry) => entry.text)).toContain(
      'WARNING: "device" accepted as a fallback; the parameter is "deviceName"',
    );
  });
});
