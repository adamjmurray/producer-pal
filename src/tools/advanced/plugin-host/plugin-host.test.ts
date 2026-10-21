// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { plugin_host_response } from "#src/live-api-adapter/live-api-adapter.ts";
import { installCapturingTask } from "#src/live-api-adapter/tests/v8-protocol-test-helpers.ts";
import { pluginHost } from "./plugin-host.ts";
import { toolDefPluginHost } from "./plugin-host.def.ts";

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

describe("ppal-plugin-host", () => {
  it("returns the wrapper's reply without `success`", async () => {
    const pending = pluginHost({ deviceId: "9", action: "info" });

    expect(sent().payload).toStrictEqual({ deviceId: "9", op: "info" });
    plugin_host_response(
      sent().requestId,
      JSON.stringify({ success: true, plugin: null, numParams: 0 }),
    );

    await expect(pending).resolves.toStrictEqual({
      plugin: null,
      numParams: 0,
    });
  });

  it("sends the plug-in name for load", async () => {
    const pending = pluginHost({
      deviceId: "9",
      action: "load",
      plugin: "ColourCopy",
    });

    expect(sent().payload).toStrictEqual({
      deviceId: "9",
      op: "load",
      plugin: "ColourCopy",
    });
    plugin_host_response(sent().requestId, '{"success":true}');
    await pending;
  });

  it("sends the name filter for params, and none when omitted", async () => {
    const filtered = pluginHost({
      deviceId: "9",
      action: "params",
      names: ["Cutoff"],
    });

    expect(sent().payload.names).toStrictEqual(["Cutoff"]);
    plugin_host_response(sent().requestId, '{"success":true,"params":[]}');
    await filtered;

    const all = pluginHost({ deviceId: "9", action: "params" });

    expect(sent().payload).not.toHaveProperty("names");
    plugin_host_response(sent().requestId, '{"success":true,"params":[]}');
    await all;
  });

  it("sends search and paging for params", async () => {
    const pending = pluginHost({
      deviceId: "9",
      action: "params",
      search: "osc",
      offset: 20,
      limit: 10,
    });

    expect(sent().payload).toStrictEqual(
      expect.objectContaining({ search: "osc", offset: 20, limit: 10 }),
    );
    plugin_host_response(sent().requestId, '{"success":true,"params":[]}');
    await pending;
  });

  it("sends the params for set and returns the read-back", async () => {
    const params = [
      { name: "Cutoff", value: 0.5 },
      { index: 3, value: 1 },
    ];
    const pending = pluginHost({ deviceId: "9", action: "set", params });

    expect(sent().payload.params).toStrictEqual(params);
    plugin_host_response(
      sent().requestId,
      JSON.stringify({
        success: true,
        params: [{ index: 0, name: "Cutoff", value: 0.5, display: "1 kHz" }],
      }),
    );

    await expect(pending).resolves.toStrictEqual({
      params: [{ index: 0, name: "Cutoff", value: 0.5, display: "1 kHz" }],
    });
  });

  it("throws the wrapper's error", async () => {
    const pending = pluginHost({ deviceId: "9", action: "info" });

    plugin_host_response(
      sent().requestId,
      '{"success":false,"error":"nothing loaded"}',
    );

    await expect(pending).rejects.toThrow("nothing loaded");
  });

  it("throws a generic error when the wrapper gives none", async () => {
    const pending = pluginHost({ deviceId: "9", action: "info" });

    plugin_host_response(sent().requestId, '{"success":false}');

    await expect(pending).rejects.toThrow("ppal-plugin-host info failed");
  });

  it("only load and set count as changing the Set", () => {
    const { changesSet } = toolDefPluginHost.toolOptions;

    expect(changesSet?.({ action: "load" })).toBe(true);
    expect(changesSet?.({ action: "set" })).toBe(true);
    expect(changesSet?.({ action: "info" })).toBe(false);
    expect(changesSet?.({ action: "params" })).toBe(false);
  });

  it("throws when no wrapper answers", async () => {
    const callbacks: Array<() => void> = [];
    const restore = installCapturingTask(callbacks);

    try {
      const pending = pluginHost({ deviceId: "404", action: "info" });

      callbacks.at(-1)?.();

      await expect(pending).rejects.toThrow(
        "No plug-in host answered for device id 404",
      );
    } finally {
      restore();
    }
  });

  it("refuses load without a plug-in and set without params", async () => {
    vi.mocked(globalThis.messnamed).mockClear();

    await expect(pluginHost({ deviceId: "9", action: "load" })).rejects.toThrow(
      "needs `plugin`",
    );
    await expect(
      pluginHost({ deviceId: "9", action: "set", params: [] }),
    ).rejects.toThrow("needs `params`");
    expect(globalThis.messnamed).not.toHaveBeenCalled();
  });
});
