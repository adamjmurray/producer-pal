// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { requestPluginHost } from "./plugin-host-v8-protocol.ts";

interface PluginHostArgs {
  deviceId: string;
  action: "info" | "load" | "params" | "set" | "raw";
  plugin?: string;
  names?: string[];
  params?: Array<{ index?: number; name?: string; value: number }>;
  message?: string[];
}

/**
 * Spike: read or set plug-in parameters through a plug-in host wrapper device.
 * @param args - The parameters
 * @param args.deviceId - Live id of the wrapper device
 * @param args.action - info, load, params or set
 * @param args.plugin - Plug-in to load (load)
 * @param args.names - Parameter names to read (params)
 * @param args.params - Parameters to set (set)
 * @param args.message - Message for vst~ (raw)
 * @returns The wrapper's reply, minus `success`
 */
export async function pluginHost({
  deviceId,
  action,
  plugin,
  names,
  params,
  message,
}: PluginHostArgs): Promise<Record<string, unknown>> {
  const request = buildRequest(action, plugin, names, params, message);
  const { success, error, ...reply } = await requestPluginHost(
    deviceId,
    action,
    request,
  );

  if (!success) {
    throw new Error(error ?? `ppal-plugin-host ${action} failed`);
  }

  return reply;
}

/**
 * The op's own fields, refusing a call that lacks the one the op needs.
 * @param action - The op
 * @param plugin - Plug-in to load
 * @param names - Parameter names to read
 * @param params - Parameters to set
 * @param message - Message for vst~
 * @returns The fields to send with the op
 */
function buildRequest(
  action: PluginHostArgs["action"],
  plugin: string | undefined,
  names: string[] | undefined,
  params: PluginHostArgs["params"],
  message?: string[],
): object {
  switch (action) {
    case "load":
      if (plugin == null) {
        throw new Error("action 'load' needs `plugin`");
      }

      return { plugin };

    case "params":
      return names == null ? {} : { names };

    case "set":
      if (params == null || params.length === 0) {
        throw new Error("action 'set' needs `params`");
      }

      return { params };

    case "raw":
      if (message == null || message.length === 0) {
        throw new Error("action 'raw' needs `message`");
      }

      return { message };

    default:
      return {};
  }
}
