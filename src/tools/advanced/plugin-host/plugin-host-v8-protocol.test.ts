// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { plugin_host_response } from "#src/live-api-adapter/live-api-adapter.ts";
import {
  probePluginHost,
  requestPluginHost,
} from "./plugin-host-v8-protocol.ts";
import {
  installCapturingTask,
  installTrackingTask,
} from "#src/live-api-adapter/tests/v8-protocol-test-helpers.ts";

/**
 * Read the most recent message sent on the plug-in host bus.
 *
 * @returns The bus name, request id and parsed payload
 */
function latestBusMessage(): {
  bus: string;
  message: string;
  requestId: string;
  payload: Record<string, unknown>;
} {
  const call = vi.mocked(globalThis.messnamed).mock.calls.at(-1) as string[];

  return {
    bus: call[0] as string,
    message: call[1] as string,
    requestId: call[2] as string,
    payload: JSON.parse(call[3] as string) as Record<string, unknown>,
  };
}

describe("plugin-host-v8-protocol", () => {
  it("transmits over messnamed, not an outlet", () => {
    vi.mocked(globalThis.outlet).mockClear();
    void requestPluginHost("42", "load", { plugin: "Serum2" });

    const { bus, message, requestId, payload } = latestBusMessage();

    expect(bus).toBe("ppal-plugin-host-req");
    expect(message).toBe("request");
    expect(requestId).toMatch(/^plugin-host-\d+$/);
    expect(payload).toStrictEqual({
      deviceId: "42",
      op: "load",
      plugin: "Serum2",
    });
    expect(globalThis.outlet).not.toHaveBeenCalled();
  });

  it("resolves with the wrapper's reply", async () => {
    const pending = requestPluginHost("42", "info");

    plugin_host_response(
      latestBusMessage().requestId,
      JSON.stringify({ success: true, plugin: "Serum2", numParams: 3 }),
    );

    await expect(pending).resolves.toStrictEqual({
      success: true,
      plugin: "Serum2",
      numParams: 3,
    });
  });

  it("times out fast, naming the device id", async () => {
    const callbacks: Array<() => void> = [];
    const restore = installCapturingTask(callbacks);

    try {
      const pending = requestPluginHost("77", "params");

      callbacks.at(-1)?.();

      const result = await pending;

      expect(result.success).toBe(false);
      expect(result.error).toContain("No plug-in host answered");
      expect(result.error).toContain("device id 77");
      expect(result.error).toContain("3000ms");
    } finally {
      restore();
    }
  });

  it("waits longer for load than for the quick ops", () => {
    const schedules: number[] = [];
    const restore = installTrackingTask(schedules);

    try {
      void requestPluginHost("1", "info");
      void requestPluginHost("1", "set", { params: [] });
      void requestPluginHost("1", "load", { plugin: "Big" });

      expect(schedules).toStrictEqual([3000, 3000, 20_000]);
    } finally {
      restore();
    }
  });

  describe("probePluginHost", () => {
    it("returns the reply a wrapper sends during the call", () => {
      vi.mocked(globalThis.messnamed).mockImplementationOnce(
        (_bus: string, ...args: unknown[]) => {
          plugin_host_response(
            args[1] as string,
            JSON.stringify({ success: true, plugin: "Serum 2" }),
          );
        },
      );

      expect(probePluginHost("42", "info")).toStrictEqual({
        success: true,
        plugin: "Serum 2",
      });
      expect(latestBusMessage().payload).toStrictEqual({
        deviceId: "42",
        op: "info",
      });
    });

    it("returns null at once when nothing answers", () => {
      const schedules: number[] = [];
      const restore = installTrackingTask(schedules);

      try {
        expect(probePluginHost("42", "params", { limit: 5 })).toBeNull();
        expect(schedules).toStrictEqual([]);
        expect(latestBusMessage().payload).toStrictEqual({
          deviceId: "42",
          op: "params",
          limit: 5,
        });
      } finally {
        restore();
      }
    });

    it("lets a send failure through and leaves nothing waiting", () => {
      vi.mocked(globalThis.messnamed).mockImplementationOnce(() => {
        throw new Error("bus down");
      });

      expect(() => probePluginHost("42", "info")).toThrow("bus down");
    });
  });
});
