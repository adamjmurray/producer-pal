// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import {
  type PluginCategory,
  type ResolvedPlugin,
} from "#src/mcp-server/live-library/library-types.ts";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
} from "#src/tools/constants.ts";

/** What the wrapper's `load` op takes. */
export interface PluginLoadRequest {
  /** Bundle name without `.vst3`, as `vst~` loads it. */
  file: string;
  /**
   * The plug-in inside a bundle that holds several. Left out otherwise: Max
   * can't search a bundle that has no moduleinfo.json.
   */
  sub?: string;
  /** The plug-in's name, for the wrapper's messages. */
  name: string;
  /** Whether the plug-in is an instrument. */
  synth: boolean;
}

/**
 * Work out what to tell a wrapper to load, before touching it: look the name up
 * in Live's plug-in database and check the plug-in suits the wrapper.
 * @param deviceId - Live id of the wrapper device
 * @param name - Plug-in name as Live's browser shows it
 * @returns The wrapper request, and the plug-in it loads
 * @throws When the name doesn't resolve, or suits the other kind of wrapper
 */
export async function planPluginLoad(
  deviceId: string,
  name: string,
): Promise<{ request: PluginLoadRequest; plugin: ResolvedPlugin }> {
  const plugin = await resolvePluginName(name);

  checkWrapperKind(deviceId, plugin);

  return {
    request: {
      file: bundleName(plugin.file),
      ...(plugin.shared && { sub: plugin.name }),
      name: plugin.name,
      synth: plugin.category === "instrument",
    },
    plugin,
  };
}

/**
 * Ask Node's copy of Live's plug-in database for the plug-in.
 * @param name - Plug-in name
 * @returns The plug-in
 */
async function resolvePluginName(name: string): Promise<ResolvedPlugin> {
  // Node needs the running Live version to pick the right database.
  const liveVersion = String(
    LiveAPI.from("live_app").call("get_version_string"),
  );
  const response = await requestNode<ResolvedPlugin>("library.resolvePlugin", {
    name,
    liveVersion,
  });

  if (!response.success || response.result == null) {
    throw new Error(response.error ?? "could not look up the plug-in");
  }

  return response.result;
}

/**
 * Refuse an instrument in an effect wrapper and the other way round. The
 * wrapper reports its kind as the Live device type.
 * @param deviceId - Live id of the wrapper device
 * @param plugin - The plug-in to load
 */
function checkWrapperKind(deviceId: string, plugin: ResolvedPlugin): void {
  const device = LiveAPI.from(deviceId);

  if (!device.exists()) {
    throw new Error(`no device with id ${deviceId}`);
  }

  const wanted = wrapperType(plugin.category);

  if (device.getProperty("type") !== wanted.type) {
    throw new Error(
      `"${plugin.name}" is ${wanted.plugin}: load it into a PPal Plug-in ${wanted.wrapper} wrapper, not device ${deviceId}`,
    );
  }
}

/**
 * @param category - The plug-in's category
 * @returns The Live device type of the wrapper it needs, and wording for errors
 */
function wrapperType(category: PluginCategory): {
  type: number;
  plugin: string;
  wrapper: string;
} {
  return category === "instrument"
    ? {
        type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
        plugin: "an instrument",
        wrapper: "Instrument",
      }
    : {
        type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
        plugin: "an audio effect",
        wrapper: "Effect",
      };
}

/**
 * @param path - Path of a VST3 bundle
 * @returns The bundle's name without folders or `.vst3`
 */
function bundleName(path: string): string {
  const leaf = path.split(/[\\/]/).at(-1) ?? path;

  return leaf.replace(/\.vst3$/i, "");
}
