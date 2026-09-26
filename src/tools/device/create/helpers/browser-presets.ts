// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Presets (.adv, and .adg racks) from Live's browser. The Live API can't load
// one, so the Producer Pal remote script does: onto a temp track for
// create-device, or in place of a device for update-device.

import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { VALID_DEVICES } from "#src/tools/constants.ts";
import {
  type BrowserItem,
  type BrowserItemHotswap,
  type BrowserItemResolution,
  type PresetScope,
  REMOTE_SCRIPT_ROUTES,
} from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { remoteScriptExpiry, remoteScriptWait } from "./browser-devices.ts";

/** Why nothing loads when the remote script isn't answering. */
export const PRESET_NEEDS_REMOTE_SCRIPT =
  "loading a preset needs the Producer Pal remote script, which isn't answering; ask the user to set it up in Producer Pal's Settings → Remote Script";

/** The remote script's section `type` for each kind of native device. */
const NATIVE_SECTIONS = [
  { type: "instrument", devices: VALID_DEVICES.instruments },
  { type: "midi-effect", devices: VALID_DEVICES.midiEffects },
  { type: "audio-effect", devices: VALID_DEVICES.audioEffects },
] as const;

/** Live's device `type` values, as the remote script's section `type`. */
const DEVICE_TYPE_SECTIONS: Record<number, string> = {
  1: "instrument",
  2: "audio-effect",
  4: "midi-effect",
};

/** What loading a preset onto a device did: the device there now, or why not. */
export type PresetHotswap =
  | { replaced: boolean; device: LiveAPI }
  | { error: string };

/**
 * Find a preset in Live's browser.
 * @param preset - The preset as the call named it
 * @param scope - The device whose presets it's searched among, if any
 * @param deadline - The request deadline from ToolContext
 * @returns The item
 * @throws Error when the remote script isn't answering, or no one preset has
 *   that name
 */
export async function resolveBrowserPreset(
  preset: string,
  scope: PresetScope | undefined,
  deadline: number | null | undefined,
): Promise<BrowserItem> {
  const waitMs = remoteScriptWait(deadline);
  const lookUpFailed = (why: string): Error =>
    new Error(`could not look up preset "${preset}": ${why}`);

  // Every lookup runs before anything is loaded, so nothing changed yet.
  if (waitMs == null) {
    throw lookUpFailed("the request ran out of time; nothing changed");
  }

  const response = await requestNode<BrowserItemResolution>(
    REMOTE_SCRIPT_ROUTES.resolvePreset,
    { name: preset, ...(scope == null ? {} : { scope }) },
    waitMs,
  );

  if (!response.success || response.result == null) {
    throw lookUpFailed(response.error ?? "no answer");
  }

  const resolution = response.result;

  if (!resolution.available) {
    throw new Error(PRESET_NEEDS_REMOTE_SCRIPT);
  }

  if ("error" in resolution) {
    throw new Error(resolution.error);
  }

  return resolution.item;
}

/**
 * Where a device the call named keeps its presets.
 * @param device - The device as the call named it
 * @param item - Its browser item, or null for a native device
 * @returns The scope to search a preset name in
 */
export function presetScopeForDevice(
  device: string,
  item: BrowserItem | null,
): PresetScope {
  if (item != null) {
    return { type: item.type, path: item.path, device };
  }

  const section = NATIVE_SECTIONS.find(({ devices }) =>
    (devices as readonly string[]).includes(device),
  );

  return { type: section?.type ?? "instrument", path: device, device };
}

/**
 * Where a device in the Set keeps its presets: under its own device in the
 * browser first, then anywhere, since a preset for it may be a rack.
 * @param device - The device
 * @returns The scope to search a preset name in
 */
export function presetScopeForTarget(device: LiveAPI): PresetScope {
  const name = device.getProperty("class_display_name") as string;
  const type = DEVICE_TYPE_SECTIONS[device.getProperty("type") as number];

  return {
    type: type ?? "instrument",
    path: name,
    device: name,
    orAnywhere: true,
  };
}

/**
 * Load a preset in place of a device. The device at the same path afterwards
 * is the old one when Live kept it (a preset for the same device), or a new
 * one (another device, a rack).
 * @param device - The device to load it onto
 * @param item - The preset
 * @param deadline - The request deadline from ToolContext
 * @returns The device there now, or why nothing loaded
 */
export async function hotswapPreset(
  device: LiveAPI,
  item: BrowserItem,
  deadline: number | null | undefined,
): Promise<PresetHotswap> {
  const waitMs = remoteScriptWait(deadline);

  if (waitMs == null) {
    return { error: "the request ran out of time; re-run for this target" };
  }

  const devicePath = device.path;
  const response = await requestNode<BrowserItemHotswap>(
    REMOTE_SCRIPT_ROUTES.hotswap,
    {
      type: item.type,
      path: item.path,
      devicePath,
      deviceName: device.getName(),
      expiresInMs: remoteScriptExpiry(waitMs),
    },
    waitMs,
  );

  if (!response.success || response.result == null) {
    return { error: response.error ?? "the remote script returned nothing" };
  }

  const result = response.result;

  if (!result.available) {
    return { error: PRESET_NEEDS_REMOTE_SCRIPT };
  }

  if ("error" in result) {
    return { error: result.error };
  }

  return { replaced: result.replaced, device: LiveAPI.from(devicePath) };
}
