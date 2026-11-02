// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { plugin_host_response } from "#src/live-api-adapter/live-api-adapter.ts";
import {
  installCapturingTask,
  latestWrapperRequest as sent,
} from "#src/live-api-adapter/protocols/tests/v8-protocol-test-helpers.ts";
import { pluginHost } from "./plugin-host.ts";
import { toolDefPluginHost } from "./plugin-host.def.ts";

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

  it("sends the message for raw", async () => {
    const pending = pluginHost({
      deviceId: "9",
      action: "raw",
      message: ["get", "params"],
    });

    expect(sent().payload).toStrictEqual({
      deviceId: "9",
      op: "raw",
      message: ["get", "params"],
    });
    plugin_host_response(sent().requestId, '{"success":true}');
    await expect(pending).resolves.toStrictEqual({});
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

  it("only load, set, map and unmap count as changing the Set", () => {
    const { changesSet } = toolDefPluginHost.toolOptions;

    expect(changesSet?.({ action: "load" })).toBe(true);
    expect(changesSet?.({ action: "set" })).toBe(true);
    expect(changesSet?.({ action: "map" })).toBe(true);
    expect(changesSet?.({ action: "unmap" })).toBe(true);
    expect(changesSet?.({ action: "info" })).toBe(false);
    expect(changesSet?.({ action: "params" })).toBe(false);
    expect(changesSet?.({ action: "slots" })).toBe(false);
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

  it("refuses load without a plug-in, set without params and raw without a message", async () => {
    vi.mocked(globalThis.messnamed).mockClear();

    await expect(pluginHost({ deviceId: "9", action: "load" })).rejects.toThrow(
      "needs `plugin`",
    );
    await expect(
      pluginHost({ deviceId: "9", action: "set", params: [] }),
    ).rejects.toThrow("needs `params`");
    await expect(pluginHost({ deviceId: "9", action: "raw" })).rejects.toThrow(
      "needs `message`",
    );
    await expect(
      pluginHost({ deviceId: "9", action: "raw", message: [] }),
    ).rejects.toThrow("needs `message`");
    expect(globalThis.messnamed).not.toHaveBeenCalled();
  });

  it("sends the slot ops' fields", async () => {
    const mapped = pluginHost({
      deviceId: "9",
      action: "map",
      slot: 3,
      name: "Cutoff",
    });

    expect(sent().payload).toStrictEqual({
      deviceId: "9",
      op: "map",
      slot: 3,
      name: "Cutoff",
    });
    plugin_host_response(
      sent().requestId,
      '{"success":true,"slot":3,"index":5,"name":"Cutoff"}',
    );
    await expect(mapped).resolves.toStrictEqual({
      slot: 3,
      index: 5,
      name: "Cutoff",
    });

    const byIndex = pluginHost({
      deviceId: "9",
      action: "map",
      slot: 4,
      index: 7,
    });

    expect(sent().payload).toStrictEqual(
      expect.objectContaining({ op: "map", slot: 4, index: 7 }),
    );
    plugin_host_response(sent().requestId, '{"success":true}');
    await byIndex;

    const unmapped = pluginHost({ deviceId: "9", action: "unmap", slot: 3 });

    expect(sent().payload).toStrictEqual({
      deviceId: "9",
      op: "unmap",
      slot: 3,
    });
    plugin_host_response(sent().requestId, '{"success":true}');
    await unmapped;

    const listed = pluginHost({ deviceId: "9", action: "slots" });

    expect(sent().payload).toStrictEqual({ deviceId: "9", op: "slots" });
    plugin_host_response(sent().requestId, '{"success":true,"slots":[]}');
    await listed;
  });

  it("refuses map and unmap without what they need", async () => {
    vi.mocked(globalThis.messnamed).mockClear();

    await expect(
      pluginHost({ deviceId: "9", action: "map", name: "Cutoff" }),
    ).rejects.toThrow("needs `slot`");
    await expect(
      pluginHost({ deviceId: "9", action: "unmap" }),
    ).rejects.toThrow("needs `slot`");
    await expect(
      pluginHost({ deviceId: "9", action: "map", slot: 1 }),
    ).rejects.toThrow("needs `name` or `index`");
    expect(globalThis.messnamed).not.toHaveBeenCalled();
  });
});
