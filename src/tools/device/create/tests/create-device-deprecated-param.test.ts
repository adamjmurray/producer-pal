// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// `device` replaced `deviceName`. The old name still works so a caller
// mid-migration keeps creating devices, and the warning tells it the new one.

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
  warn: vi.fn(),
  warnOnce: vi.fn(),
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

describe("createDevice — deprecated deviceName", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it("still creates the device", async () => {
    registerTrack();

    expect(
      await createDevice({ deviceName: "Reverb", path: "t0/d+" }),
    ).toStrictEqual({ id: "new-device", path: "t0/d0" });
  });

  // Both spellings name the same thing, so a caller sending both gets the one
  // it is being steered towards rather than the one it is leaving behind.
  it("loses to device when both are sent", async () => {
    const track = registerTrack();

    await createDevice({
      device: "Reverb",
      deviceName: "Delay",
      path: "t0/d+",
    });

    expect(track.call).toHaveBeenCalledWith("insert_device", "Reverb");
  });

  it("tells the caller the param is now device", async () => {
    const mockServer = {
      registerTool: vi.fn(),
    } as unknown as McpServer & { registerTool: Mock };
    const callLiveApi = vi
      .fn()
      .mockResolvedValue({ content: [{ type: "text", text: "created" }] });

    toolDefCreateDevice(mockServer, callLiveApi);

    const handler = mockServer.registerTool.mock.calls[0]![2] as (
      args: Record<string, unknown>,
    ) => Promise<{ content: { text?: string }[] }>;
    const result = await handler({ deviceName: "Reverb", path: "t0/d+" });

    expect(callLiveApi).toHaveBeenCalledWith("ppal-create-device", {
      deviceName: "Reverb",
      path: "t0/d+",
    });
    expect(result.content.map((entry) => entry.text)).toContain(
      'WARNING: param "deviceName" is deprecated and will be removed; use "device" instead',
    );
  });
});
