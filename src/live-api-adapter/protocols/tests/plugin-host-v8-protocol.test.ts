// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { MAX_SINGLE_MESSAGE_BYTES } from "#src/shared/mcp-responses.ts";
import { plugin_host_response } from "#src/live-api-adapter/live-api-adapter.ts";
import {
  probePluginHost,
  requestPluginHost,
} from "../plugin-host-v8-protocol.ts";
import {
  installCapturingTask,
  installTrackingTask,
} from "#src/live-api-adapter/protocols/tests/v8-protocol-test-helpers.ts";

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

  it("waits longer for load and write than for the quick ops", () => {
    const schedules: number[] = [];
    const restore = installTrackingTask(schedules);

    try {
      void requestPluginHost("1", "info");
      void requestPluginHost("1", "set", { params: [] });
      void requestPluginHost("1", "load", { plugin: "Big" });
      void requestPluginHost("1", "write", { params: [] });

      expect(schedules).toStrictEqual([3000, 3000, 20_000, 20_000]);
    } finally {
      restore();
    }
  });

  it("never waits longer than the caller allows", () => {
    const schedules: number[] = [];
    const restore = installTrackingTask(schedules);

    try {
      void requestPluginHost("1", "write", { params: [] }, 5000);
      void requestPluginHost("1", "info", {}, 9000);

      expect(schedules).toStrictEqual([5000, 3000]);
    } finally {
      restore();
    }
  });

  describe("a request too large for one Max message", () => {
    const big = { text: "é".repeat(MAX_SINGLE_MESSAGE_BYTES / 2) };

    it("is refused, not sent, and says so", async () => {
      vi.mocked(globalThis.messnamed).mockClear();
      const schedules: number[] = [];
      const restore = installTrackingTask(schedules);

      try {
        const result = await requestPluginHost("42", "write", big);

        expect(result).toStrictEqual({
          success: false,
          error: expect.stringMatching(
            /^device id 42 \(write\) too large .*Nothing was sent/,
          ),
          tooLarge: true,
        });
        expect(globalThis.messnamed).not.toHaveBeenCalled();
        expect(schedules).toStrictEqual([]);
      } finally {
        restore();
      }
    });

    it("is measured in bytes, not characters", async () => {
      // Half the cap in two-byte characters is over it once encoded.
      expect(big.text.length).toBeLessThan(MAX_SINGLE_MESSAGE_BYTES);
      const result = await requestPluginHost("42", "set", big);

      expect(result.tooLarge).toBe(true);
    });

    it("lets a request at the cap through", () => {
      const fixed = JSON.stringify({ deviceId: "42", op: "set", text: "" });
      const text = "x".repeat(MAX_SINGLE_MESSAGE_BYTES - fixed.length);

      vi.mocked(globalThis.messnamed).mockClear();
      void requestPluginHost("42", "set", { text });

      expect(globalThis.messnamed).toHaveBeenCalledTimes(1);
    });

    it("is refused for a probe too, without asking the bus", () => {
      vi.mocked(globalThis.messnamed).mockClear();

      expect(
        probePluginHost("42", "params", { search: big.text }),
      ).toStrictEqual({
        success: false,
        error: expect.stringContaining("device id 42 (params) too large"),
        tooLarge: true,
      });
      expect(globalThis.messnamed).not.toHaveBeenCalled();
    });
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
