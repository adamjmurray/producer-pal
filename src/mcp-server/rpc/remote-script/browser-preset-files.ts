// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Finding a preset by name in Live's library database, for presets Live's
// device browser doesn't list (a pack's drum kits, racks under Sounds, user
// presets in custom folders). Searching those sections through the remote
// script can crash Live, so the database is read instead and the preset loads
// by its file, which the remote script finds under Packs, User Library or
// Places.

import { type LibraryDeviceKind } from "../../live-library/library-types.ts";
import { findPresetFiles } from "../../live-library/query/preset-files.ts";
import {
  type BrowserItemResolution,
  type PresetScope,
} from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { ambiguity } from "./browser-device-lookup.ts";
import { RemoteScriptTimeout } from "./remote-script-client.ts";

/** The files a preset can be. */
const PRESET_FILE = /\.(?:adv|adg)$/i;

/** The kind of device each remote script `type` holds presets for. */
const SCOPE_KINDS: Record<string, LibraryDeviceKind> = {
  instrument: "instrument",
  "audio-effect": "audiofx",
  "midi-effect": "midifx",
};

/**
 * Look a preset name up in Live's library database.
 * @param preset - The preset as the call named it
 * @param key - The name, normalized
 * @param scope - The device the preset should be for, if the call named one.
 *   Presets for it count first; only with `orAnywhere` does any preset count
 *   when it has none by that name.
 * @param endsAt - When the lookup must be done, in epoch ms
 * @returns The file to load, an error naming the files that match, or null
 *   when nothing matches or the database can't be read
 * @throws RemoteScriptTimeout when `endsAt` passes first
 */
export async function lookUpPresetFile(
  preset: string,
  key: string,
  scope: PresetScope | undefined,
  endsAt: number,
): Promise<BrowserItemResolution | null> {
  const kind = scope == null ? undefined : SCOPE_KINDS[scope.type];

  // A plug-in's or Max device's presets can't be told from other files.
  if (scope != null && kind == null && scope.orAnywhere !== true) {
    return null;
  }

  if (Date.now() >= endsAt) {
    throw new RemoteScriptTimeout(
      "ran out of time before the library was searched",
      false,
    );
  }

  const device =
    scope == null || kind == null ? undefined : { name: scope.device, kind };
  let files = await findPresetFiles({
    name: key,
    ...(device == null ? {} : { device }),
  });

  if (device != null && scope?.orAnywhere === true && files?.length === 0) {
    files = await findPresetFiles({ name: key });
  }

  if (files == null || files.length === 0) {
    return null;
  }

  return files.length === 1
    ? presetFile((files[0] as { path: string }).path)
    : {
        available: true,
        error: ambiguity({ name: "preset", noun: "presets" }, preset, files),
      };
}

/**
 * The resolution for a preset file on disk. Whether Live's browser has it is
 * only known when the remote script loads it.
 * @param path - The absolute path
 * @returns The item, or an error when it isn't a preset file
 */
export function presetFile(path: string): BrowserItemResolution {
  if (!PRESET_FILE.test(path)) {
    return {
      available: true,
      error: `preset "${path}" is not a preset file (.adv or .adg)`,
    };
  }

  const name = path.split(/[\\/]/).at(-1) as string;

  return { available: true, item: { type: "file", path, name } };
}
