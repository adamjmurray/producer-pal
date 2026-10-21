// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { plugin_host_response } from "#src/live-api-adapter/live-api-adapter.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { readOneDevice } from "../../read-device.ts";

type Reply = Record<string, unknown>;

/**
 * Make the plug-in host bus answer in the same call, as a wrapper does.
 * @param replies - What the wrapper says to each op; an op left out is unanswered
 * @returns The requests the bus heard
 */
function installWrapper(
  replies: Partial<Record<string, (request: Reply) => Reply>>,
): Reply[] {
  const heard: Reply[] = [];

  vi.mocked(globalThis.messnamed).mockImplementation(
    (_bus: string, ...args: unknown[]) => {
      const [, requestId, json] = args as [string, string, string];
      const request = JSON.parse(json) as Reply;

      heard.push(request);

      const reply = replies[request.op as string]?.(request);

      if (reply != null) {
        plugin_host_response(requestId, JSON.stringify(reply));
      }
    },
  );

  return heard;
}

/**
 * Register a Max audio effect at t0/d0.
 * @param name - What the device is called
 * @param className - Live's class for the device
 */
function registerMaxDevice(
  name = "PPal Plug-in Effect",
  className = "MxDeviceAudioEffect",
): void {
  registerMockObject("device-123", {
    path: livePath.track(0).device(0),
    type: "Device",
    properties: {
      name,
      class_name: className,
      class_display_name: "Max Audio Effect",
      type: 2,
      can_have_chains: 0,
      can_have_drum_pads: 0,
      is_active: 1,
      parameters: [],
    },
  });
}

const info = (plugin: string | null): Reply => ({
  success: true,
  plugin,
  loaded: plugin,
});

const paramsOf = (count: number, total = count): Reply => ({
  success: true,
  total,
  params: Array.from({ length: count }, (_, i) => ({
    index: i + 56,
    name: `Param ${i}`,
    value: 0.5,
    display: ` ${i} dB`,
  })),
});

describe("readOneDevice on a plug-in host wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(globalThis.messnamed).mockReset();
    clearMockRegistry();
  });

  it("reads as the plug-in it hosts, marked hosted", () => {
    registerMaxDevice();
    installWrapper({ info: () => info("Serum 2") });

    expect(readOneDevice({ path: "t0/d0" })).toStrictEqual({
      id: "device-123",
      path: "t0/d0",
      type: "audio-effect: Serum 2",
      hosted: true,
    });
  });

  it("keeps a name the user gave the wrapper", () => {
    registerMaxDevice("My Lead");
    installWrapper({ info: () => info("Serum 2") });

    expect(readOneDevice({ path: "t0/d0" }).name).toBe("My Lead");
  });

  it("names the plug-in by its file after a Set reload", () => {
    registerMaxDevice();
    installWrapper({ info: () => info("C74_VST3:/Serum2 1234567") });

    expect(readOneDevice({ path: "t0/d0" }).type).toBe("audio-effect: Serum2");
  });

  it("reads a wrapper with nothing loaded as the Max device it is", () => {
    registerMaxDevice();
    installWrapper({ info: () => info(null) });

    expect(readOneDevice({ path: "t0/d0" })).toStrictEqual({
      id: "device-123",
      path: "t0/d0",
      type: "audio-effect: Max Audio Effect",
      hosted: true,
    });
  });

  it("reads a Max device nobody answers for as a plain device", () => {
    registerMaxDevice("Some Max Device");
    installWrapper({});

    expect(readOneDevice({ path: "t0/d0" })).toStrictEqual({
      id: "device-123",
      path: "t0/d0",
      type: "audio-effect: Max Audio Effect",
      name: "Some Max Device",
    });
  });

  it("does not ask a device that isn't a Max audio effect or instrument", () => {
    registerMaxDevice("PPal Plug-in Effect", "MidiScale");
    const heard = installWrapper({ info: () => info("Serum 2") });

    expect(readOneDevice({ path: "t0/d0" }).hosted).toBeUndefined();
    expect(heard).toStrictEqual([]);
  });

  it("lists the plug-in's params with h ids", () => {
    registerMaxDevice();
    const heard = installWrapper({
      info: () => info("Serum 2"),
      params: () => paramsOf(2),
    });

    const result = readOneDevice({ path: "t0/d0", include: ["params"] });

    expect(result.parameters).toStrictEqual([
      { id: "h56", name: "Param 0" },
      { id: "h57", name: "Param 1" },
    ]);
    expect(heard.at(-1)).toStrictEqual({
      deviceId: "device-123",
      op: "params",
      limit: 200,
    });
    expect(result.paramCount).toBeUndefined();
  });

  it("gives values as the plug-in displays them", () => {
    registerMaxDevice();
    installWrapper({
      info: () => info("Serum 2"),
      params: () => paramsOf(2),
    });

    const result = readOneDevice({ path: "t0/d0", include: ["param-values"] });

    expect(result.parameters).toStrictEqual([
      { id: "h56", name: "Param 0", value: "0 dB" },
      { id: "h57", name: "Param 1", value: "1 dB" },
    ]);
  });

  it("leaves out a value the plug-in doesn't display", () => {
    registerMaxDevice();
    installWrapper({
      info: () => info("Serum 2"),
      params: () => ({
        success: true,
        total: 1,
        params: [{ index: 3, name: "Cut", value: 0.5 }],
      }),
    });

    const result = readOneDevice({ path: "t0/d0", include: ["param-values"] });

    expect(result.parameters).toStrictEqual([{ id: "h3", name: "Cut" }]);
  });

  it("passes a trimmed paramSearch to the plug-in, which implies params", () => {
    registerMaxDevice();
    const heard = installWrapper({
      info: () => info("Serum 2"),
      params: () => paramsOf(1),
    });

    readOneDevice({ path: "t0/d0", paramSearch: "  cut " });

    expect(heard.at(-1)).toStrictEqual({
      deviceId: "device-123",
      op: "params",
      search: "cut",
      limit: 200,
    });
  });

  it("caps a long list and says how many there are", () => {
    registerMaxDevice();
    installWrapper({
      info: () => info("Serum 2"),
      params: () => paramsOf(200, 543),
    });

    const result = readOneDevice({ path: "t0/d0", include: ["params"] });

    expect(result.parameters).toHaveLength(200);
    expect(result.paramCount).toBe(543);
    expect(result.detail).toBe(
      "listing the first 200 params; narrow with paramSearch",
    );
  });

  it("says when the plug-in's params can't be read", () => {
    registerMaxDevice();
    installWrapper({
      info: () => info("Serum 2"),
      params: () => ({ success: false, error: "boom" }),
    });

    const result = readOneDevice({ path: "t0/d0", include: ["params"] });

    expect(result.parameters).toStrictEqual([]);
    expect(result.detail).toBe("the plug-in's params could not be read");
  });

  it("lists no params when the plug-in sends none", () => {
    registerMaxDevice();
    installWrapper({
      info: () => info("Serum 2"),
      params: () => ({ success: true }),
    });

    const result = readOneDevice({ path: "t0/d0", include: ["params"] });

    expect(result.parameters).toStrictEqual([]);
  });
});
