// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { plugin_host_response } from "#src/live-api-adapter/live-api-adapter.ts";
import { installCapturingTask } from "#src/live-api-adapter/protocols/tests/v8-protocol-test-helpers.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { pluginHost } from "./plugin-host.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

const protocolMock =
  await import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts");

const INSTRUMENT = 1;
const AUDIO_EFFECT = 2;

/**
 * Register the wrapper device and Live app.
 *
 * @param type - Live device type of the wrapper
 */
function useWrapper(type: number): void {
  registerMockObject("live_app", {
    path: "live_app",
    methods: { get_version_string: () => "12.4" },
  });
  registerMockObject("9", {
    path: "live_set tracks 0 devices 0",
    properties: { type },
  });
}

/**
 * Stub the library.resolvePlugin route.
 *
 * @param name - Plug-in name
 * @param category - Plug-in category
 * @param file - Bundle path
 * @param shared - Whether the bundle holds other plug-ins
 */
function resolvesTo(
  name: string,
  category: string,
  file: string,
  shared = true,
): void {
  vi.mocked(protocolMock.requestNode).mockResolvedValue({
    success: true,
    result: { name, vendor: "Xfer Records", category, file, shared },
  });
}

/**
 * Read the most recent request sent to the wrapper.
 *
 * @returns The request id and parsed payload
 */
function sent(): { requestId: string; payload: Record<string, unknown> } {
  const call = vi.mocked(globalThis.messnamed).mock.calls.at(-1) as string[];

  return {
    requestId: call[2] as string,
    payload: JSON.parse(call[3] as string) as Record<string, unknown>,
  };
}

describe("ppal-plugin-host load", () => {
  beforeEach(() => {
    vi.mocked(protocolMock.requestNode).mockReset();
    vi.mocked(globalThis.messnamed).mockClear();
  });

  it("resolves the name, then tells the wrapper the bundle, plug-in and kind", async () => {
    useWrapper(AUDIO_EFFECT);
    resolvesTo(
      "Serum 2 FX",
      "audiofx",
      "/Library/Audio/Plug-Ins/VST3/Serum2.vst3",
    );

    const pending = pluginHost({
      deviceId: "9",
      action: "load",
      plugin: "serum 2 fx",
    });

    await vi.waitFor(() => expect(globalThis.messnamed).toHaveBeenCalled());
    expect(protocolMock.requestNode).toHaveBeenCalledWith(
      "library.resolvePlugin",
      { name: "serum 2 fx", liveVersion: "12.4" },
    );
    expect(sent().payload).toStrictEqual({
      deviceId: "9",
      op: "load",
      file: "Serum2",
      sub: "Serum 2 FX",
      name: "Serum 2 FX",
      synth: false,
    });
    plugin_host_response(
      sent().requestId,
      JSON.stringify({ success: true, plugin: "Serum 2 FX", numParams: 3 }),
    );

    await expect(pending).resolves.toStrictEqual({
      plugin: "Serum 2 FX",
      vendor: "Xfer Records",
      numParams: 3,
    });
  });

  it("marks an instrument as a synth and handles a Windows path", async () => {
    useWrapper(INSTRUMENT);
    resolvesTo(
      "Serum 2",
      "instrument",
      String.raw`C:\Program Files\Common Files\VST3\Serum2.vst3`,
    );

    const pending = pluginHost({
      deviceId: "9",
      action: "load",
      plugin: "Serum 2",
    });

    await vi.waitFor(() => expect(globalThis.messnamed).toHaveBeenCalled());
    expect(sent().payload).toStrictEqual(
      expect.objectContaining({ file: "Serum2", sub: "Serum 2", synth: true }),
    );
    plugin_host_response(sent().requestId, '{"success":true}');
    await pending;
  });

  it("sends no sub for a bundle that holds one plug-in", async () => {
    useWrapper(AUDIO_EFFECT);
    resolvesTo(
      "Pro-Q 4",
      "audiofx",
      "/Library/Audio/Plug-Ins/VST3/FabFilter Pro-Q 4.vst3",
      false,
    );

    const pending = pluginHost({
      deviceId: "9",
      action: "load",
      plugin: "Pro-Q 4",
    });

    await vi.waitFor(() => expect(globalThis.messnamed).toHaveBeenCalled());
    expect(sent().payload).toStrictEqual({
      deviceId: "9",
      op: "load",
      file: "FabFilter Pro-Q 4",
      name: "Pro-Q 4",
      synth: false,
    });
    plugin_host_response(sent().requestId, '{"success":true}');
    await pending;
  });

  it("passes the resolver's error through without messaging the wrapper", async () => {
    useWrapper(AUDIO_EFFECT);
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: false,
      error: 'No plug-in named "Nope"',
    });

    await expect(
      pluginHost({ deviceId: "9", action: "load", plugin: "Nope" }),
    ).rejects.toThrow('No plug-in named "Nope"');
    expect(globalThis.messnamed).not.toHaveBeenCalled();
  });

  it("refuses an instrument for an effect wrapper before loading", async () => {
    useWrapper(AUDIO_EFFECT);
    resolvesTo("Serum 2", "instrument", "/x/Serum2.vst3");

    await expect(
      pluginHost({ deviceId: "9", action: "load", plugin: "Serum 2" }),
    ).rejects.toThrow(
      '"Serum 2" is an instrument: load it into a PPal Plug-in Instrument wrapper, not device 9',
    );
    expect(globalThis.messnamed).not.toHaveBeenCalled();
  });

  it("refuses an effect for an instrument wrapper before loading", async () => {
    useWrapper(INSTRUMENT);
    resolvesTo("Pro-Q 4", "audiofx", "/x/Pro-Q 4.vst3");

    await expect(
      pluginHost({ deviceId: "9", action: "load", plugin: "Pro-Q 4" }),
    ).rejects.toThrow(
      "is an audio effect: load it into a PPal Plug-in Effect wrapper",
    );
    expect(globalThis.messnamed).not.toHaveBeenCalled();
  });

  it("refuses a device that doesn't exist", async () => {
    registerMockObject("live_app", {
      path: "live_app",
      methods: { get_version_string: () => "12.4" },
    });
    resolvesTo("Serum 2", "instrument", "/x/Serum2.vst3");

    await expect(
      pluginHost({ deviceId: "0", action: "load", plugin: "Serum 2" }),
    ).rejects.toThrow("no device with id 0");
    expect(globalThis.messnamed).not.toHaveBeenCalled();
  });

  it("uses a fallback message when the route fails without one", async () => {
    useWrapper(INSTRUMENT);
    vi.mocked(protocolMock.requestNode).mockResolvedValue({ success: false });

    await expect(
      pluginHost({ deviceId: "9", action: "load", plugin: "Serum 2" }),
    ).rejects.toThrow("could not look up the plug-in");
  });

  it("throws the wrapper's error when the load fails after resolving", async () => {
    useWrapper(INSTRUMENT);
    resolvesTo("Serum 2", "instrument", "/x/Serum2.vst3");

    const pending = pluginHost({
      deviceId: "9",
      action: "load",
      plugin: "Serum 2",
    });

    await vi.waitFor(() => expect(globalThis.messnamed).toHaveBeenCalled());
    plugin_host_response(
      sent().requestId,
      '{"success":false,"error":"loaded AU instead"}',
    );

    await expect(pending).rejects.toThrow("loaded AU instead");
  });

  it("throws when the wrapper never answers the load", async () => {
    useWrapper(INSTRUMENT);
    resolvesTo("Serum 2", "instrument", "/x/Serum2.vst3");

    const callbacks: Array<() => void> = [];
    const restore = installCapturingTask(callbacks);

    try {
      const pending = pluginHost({
        deviceId: "9",
        action: "load",
        plugin: "Serum 2",
      });

      await vi.waitFor(() => expect(globalThis.messnamed).toHaveBeenCalled());
      callbacks.at(-1)?.();

      await expect(pending).rejects.toThrow(
        "No plug-in host answered for device id 9",
      );
    } finally {
      restore();
    }
  });
});
