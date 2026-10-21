// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { planPluginLoad } from "./plugin-host-load.ts";
import { requestPluginHost } from "./plugin-host-v8-protocol.ts";

interface PluginHostArgs {
  deviceId: string;
  action: "info" | "load" | "params" | "set" | "raw";
  plugin?: string;
  names?: string[];
  search?: string;
  offset?: number;
  limit?: number;
  params?: Array<{ index?: number; name?: string; value: number }>;
  message?: string[];
}

/**
 * Spike: read or set plug-in parameters through a plug-in host wrapper device.
 * @param args - The parameters
 * @param args.deviceId - Live id of the wrapper device
 * @param args.action - info, load, params or set
 * @param args.plugin - Plug-in to load, by the name Live's browser shows (load)
 * @param args.names - Parameter names to read (params)
 * @param args.search - Name filter (params)
 * @param args.offset - Matches to skip (params)
 * @param args.limit - Most matches to return (params)
 * @param args.params - Parameters to set (set)
 * @param args.message - Message for vst~ (raw)
 * @returns The wrapper's reply, minus `success`
 */
export async function pluginHost({
  deviceId,
  action,
  plugin,
  names,
  search,
  offset,
  limit,
  params,
  message,
}: PluginHostArgs): Promise<Record<string, unknown>> {
  if (action === "load") {
    return await loadPlugin(deviceId, plugin);
  }

  const request = buildRequest(action, params, message, {
    names,
    search,
    offset,
    limit,
  });

  return await send(deviceId, action, request);
}

/**
 * Load a plug-in into a wrapper: resolve the name and check the kind first, so
 * a refused call leaves the wrapper alone.
 * @param deviceId - Live id of the wrapper device
 * @param plugin - Plug-in name
 * @returns The wrapper's reply, naming the plug-in and vendor
 */
async function loadPlugin(
  deviceId: string,
  plugin: string | undefined,
): Promise<Record<string, unknown>> {
  if (plugin == null) {
    throw new Error("action 'load' needs `plugin`");
  }

  const plan = await planPluginLoad(deviceId, plugin);
  const reply = await send(deviceId, "load", plan.request);

  return { ...reply, plugin: plan.plugin.name, vendor: plan.plugin.vendor };
}

/**
 * Send one op to the wrapper and unwrap its reply.
 * @param deviceId - Live id of the wrapper device
 * @param action - The op
 * @param request - The op's own fields
 * @returns The wrapper's reply, minus `success`
 */
async function send(
  deviceId: string,
  action: PluginHostArgs["action"],
  request: object,
): Promise<Record<string, unknown>> {
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
 * @param params - Parameters to set
 * @param message - Message for vst~
 * @param query - Which params to read
 * @returns The fields to send with the op
 */
function buildRequest(
  action: PluginHostArgs["action"],
  params: PluginHostArgs["params"],
  message: string[] | undefined,
  query: Pick<PluginHostArgs, "names" | "search" | "offset" | "limit">,
): object {
  switch (action) {
    case "params":
      // Unset fields drop out when the request is serialized.
      return query;

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
