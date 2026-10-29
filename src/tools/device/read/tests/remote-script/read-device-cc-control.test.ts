// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Before Live 12.4.15, Max's Live API can't read a CC Control's name or on/off
// state. A read reports the device and its params without them, and adds them
// when the remote script answers. From 12.4.15 the read has them and never asks.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { DEVICE_BASICS_ROUTE } from "#src/tools/shared/remote-script/device-basics/device-basics-contract.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { registerCcControl } from "../../../tests/helpers/cc-control-fixtures.ts";
import { readDevice } from "../../read-device.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

/**
 * Have the remote script answer the device basics request.
 * @param devices - What it says about each device asked about
 */
function remoteScriptSays(...devices: unknown[]): void {
  vi.mocked(requestNode).mockImplementation(async (route) => ({
    success: true,
    result:
      route === DEVICE_BASICS_ROUTE
        ? { available: true, result: { devices } }
        : { available: false },
  }));
}

/**
 * Register live_app reporting a specific Live version.
 * @param version - Version string `get_version_string` should return
 */
function registerLiveApp(version: string): void {
  registerMockObject("live_app", {
    path: "live_app",
    methods: { get_version_string: () => version },
  });
}

describe("readDevice of a CC Control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
    registerCcControl({ paramNames: ["Device On", "Mod Wheel"] });
  });

  describe("without the remote script", () => {
    beforeEach(() => {
      vi.mocked(requestNode).mockResolvedValue({
        success: true,
        result: { available: false },
      });
    });

    it("reports it as a MIDI effect named for its class, with no name and not deactivated", async () => {
      expect(await readDevice({ id: "cc-1" })).toStrictEqual({
        id: "cc-1",
        path: "t0/d0",
        type: "midi-effect: CC Control",
      });
    });

    it("lists its params by index, so they can be read and searched", async () => {
      const result = (await readDevice({
        id: "cc-1",
        include: ["params"],
        paramSearch: "mod",
      })) as { parameters: Array<{ id: string; name: string }> };

      expect(result.parameters).toStrictEqual([
        expect.objectContaining({ id: "901", name: "Mod Wheel" }),
      ]);
    });

    it("reads a param's value", async () => {
      const result = (await readDevice({
        id: "cc-1",
        include: ["param-values"],
      })) as { parameters: Array<Record<string, unknown>> };

      expect(result.parameters[1]).toStrictEqual(
        expect.objectContaining({
          id: "901",
          name: "Mod Wheel",
          value: 0,
          min: 0,
          max: 127,
        }),
      );
    });
  });

  describe("on Live 12.4.15 and later", () => {
    it("makes no remote-script request and leaves the read as it is", async () => {
      registerLiveApp("12.4.15");
      remoteScriptSays({ name: "Wheel lane", is_active: false });

      expect(await readDevice({ id: "cc-1" })).toStrictEqual({
        id: "cc-1",
        path: "t0/d0",
        type: "midi-effect: CC Control",
      });
      expect(requestNode).not.toHaveBeenCalledWith(
        DEVICE_BASICS_ROUTE,
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe("with the remote script", () => {
    it("still asks on a Live just before 12.4.15", async () => {
      registerLiveApp("12.4.14");
      remoteScriptSays({ name: "Wheel lane", is_active: false });

      expect(await readDevice({ id: "cc-1" })).toStrictEqual(
        expect.objectContaining({ name: "Wheel lane", deactivated: true }),
      );
    });

    it("adds a name the user gave it, and that it is off, right after its type", async () => {
      remoteScriptSays({ name: "Wheel lane", is_active: false });

      const result = await readDevice({ id: "cc-1", include: ["params"] });

      expect(Object.keys(result as object)).toStrictEqual([
        "id",
        "path",
        "type",
        "name",
        "deactivated",
        "parameters",
      ]);
      expect(result).toStrictEqual(
        expect.objectContaining({ name: "Wheel lane", deactivated: true }),
      );
      expect(vi.mocked(requestNode).mock.calls[0]?.[1]).toStrictEqual({
        devicePaths: ["live_set tracks 0 devices 0"],
      });
    });

    it("adds nothing for a CC Control that is on and kept its own name", async () => {
      remoteScriptSays({ name: "CC Control", is_active: true });

      expect(await readDevice({ id: "cc-1" })).toStrictEqual({
        id: "cc-1",
        path: "t0/d0",
        type: "midi-effect: CC Control",
      });
    });

    it("waits only a few seconds for the answer", async () => {
      remoteScriptSays({ name: "CC Control", is_active: true });

      await readDevice({ id: "cc-1" });

      expect(vi.mocked(requestNode).mock.calls[0]?.[2]).toBe(3000);
    });

    it("reads as without it when the remote script can't read the device", async () => {
      remoteScriptSays({ error: "Live couldn't read it" });

      expect(await readDevice({ id: "cc-1" })).toStrictEqual({
        id: "cc-1",
        path: "t0/d0",
        type: "midi-effect: CC Control",
      });
    });
  });

  it("reads as without it when the remote script is too slow, or the route throws", async () => {
    vi.mocked(requestNode).mockResolvedValue({ success: false, error: "x" });

    const slow = await readDevice({ id: "cc-1" });

    vi.mocked(requestNode).mockRejectedValue(new Error("channel closed"));

    const thrown = await readDevice({ id: "cc-1" });

    expect(slow).toStrictEqual(thrown);
    expect(slow).toStrictEqual({
      id: "cc-1",
      path: "t0/d0",
      type: "midi-effect: CC Control",
    });
  });
});
