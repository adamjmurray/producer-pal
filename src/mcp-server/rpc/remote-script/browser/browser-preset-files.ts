// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Finding a preset by name in Live's library database, for presets Live's
// device browser doesn't list (a pack's drum kits, racks under Sounds, user
// presets in custom folders). Searching those sections through the remote
// script can crash Live, so the database is read instead and the preset loads
// by its file, which the remote script finds under Packs, User Library or
// Places.

import { type LibraryDeviceKind } from "../../../live-library/library-types.ts";
import {
  type PresetFile,
  type PresetFileQuery,
  findPresetFiles,
} from "../../../live-library/query/preset-files.ts";
import {
  type BrowserItemResolution,
  type PresetScope,
} from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { type Candidate, ambiguity } from "./browser-device-lookup.ts";
import { presetFileIsFor } from "./preset-file-device.ts";
import { RemoteScriptTimeout } from "../remote-script-errors.ts";

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
  const device = deviceOf(scope);

  // A plug-in's or Max device's presets can't be told from other files.
  if (scope != null && device == null && scope.orAnywhere !== true) {
    return null;
  }

  let files = await findNamedPresetFiles(key, device, endsAt);

  if (device != null && scope?.orAnywhere === true && files?.length === 0) {
    files = await findNamedPresetFiles(key, undefined, endsAt);
  }

  if (files == null || files.length === 0) {
    return null;
  }

  return oneOrSeveral(preset, files);
}

/**
 * Whether the library has several files for a name the browser lists once.
 * Live's browser lists only some of the files in its library, so a name it
 * finds once can still be filed elsewhere too.
 * @param preset - The preset as the call named it
 * @param key - The name, normalized
 * @param searched - The device the browser's match was searched under, or
 *   undefined when it was found anywhere
 * @param endsAt - When the lookup must be done, in epoch ms
 * @returns The error naming the files, or null when there are fewer than two,
 *   the library can't be read, or the device's presets can't be told apart
 * @throws RemoteScriptTimeout when `endsAt` passes first
 */
export async function duplicatePresetFiles(
  preset: string,
  key: string,
  searched: PresetScope | undefined,
  endsAt: number,
): Promise<BrowserItemResolution | null> {
  if (hasNoClass(searched)) {
    return null;
  }

  const files = await findNamedPresetFiles(key, deviceOf(searched), endsAt);

  return files != null && files.length > 1
    ? severalPresets(preset, files)
    : null;
}

/**
 * Settle a name the browser lists several times by the files the library
 * holds. Live's browser lists a rack under every device it is built around, so
 * one file can show up more than once, and two files can share a browser path.
 * Files for the searched device are kept by reading them (a rack built around
 * Simpler is recorded in the library as a rack, not as Simpler). A single file
 * loads only when the browser's matches look like that one file listed under
 * several devices: the library is read as of Live's last save, so it can lack
 * a file the browser lists.
 * @param preset - The preset as the call named it
 * @param key - The name, normalized
 * @param matches - The browser's matches, at least two
 * @param searched - The device the browser's matches were searched under, or
 *   undefined when they were found anywhere
 * @param endsAt - When the lookup must be done, in epoch ms
 * @returns The file, the error naming the files when there are several, or null
 *   when there are none, the library can't be read, the device's presets can't
 *   be told apart, or one file doesn't account for the browser's matches
 * @throws RemoteScriptTimeout when `endsAt` passes first
 */
export async function listedPresetFiles(
  preset: string,
  key: string,
  matches: Candidate[],
  searched: PresetScope | undefined,
  endsAt: number,
): Promise<BrowserItemResolution | null> {
  if (hasNoClass(searched)) {
    return null;
  }

  const named = await findNamedPresetFiles(key, undefined, endsAt);
  const files =
    named == null || searched == null
      ? named
      : await keepFilesFor(named, searched.device, endsAt);

  if (files == null || files.length === 0) {
    return null;
  }

  return files.length > 1 ||
    isListedUnderEachDevice(matches, (files[0] as PresetFile).path)
    ? oneOrSeveral(preset, files)
    : null;
}

/**
 * The refusal for a preset name several presets share.
 * @param preset - The preset as the call named it
 * @param matches - The presets, at least two
 * @returns The error naming them
 */
export function severalPresets(
  preset: string,
  matches: Parameters<typeof ambiguity>[2],
): BrowserItemResolution {
  return {
    available: true,
    error: ambiguity({ name: "preset", noun: "presets" }, preset, matches),
  };
}

/**
 * The device a scope names, as the library knows it.
 * @param scope - The device, if any
 * @returns The device's name and kind, or undefined when there is none or its
 *   kind has no presets in the library
 */
function deviceOf(scope: PresetScope | undefined): PresetFileQuery["device"] {
  const kind = scope == null ? undefined : SCOPE_KINDS[scope.type];

  return scope == null || kind == null
    ? undefined
    : { name: scope.device, kind };
}

/**
 * @param searched - The device a browser search was under, if any
 * @returns True for a device whose presets can't be told apart in the library
 *   (a Max device listed under Max for Live, a plug-in)
 */
function hasNoClass(searched: PresetScope | undefined): boolean {
  return searched != null && deviceOf(searched) == null;
}

/**
 * @param files - Preset files
 * @param device - The device as the call named it
 * @param endsAt - When the lookup must be done, in epoch ms
 * @returns The files that are for the device, in order
 * @throws RemoteScriptTimeout when `endsAt` passes while the files are read
 */
async function keepFilesFor(
  files: PresetFile[],
  device: string,
  endsAt: number,
): Promise<PresetFile[]> {
  const keep = await Promise.all(
    files.map(({ path }) => presetFileIsFor(path, device)),
  );

  throwIfLate(endsAt, "ran out of time before the library's files were read");

  return files.filter((_, i) => keep[i]);
}

/**
 * Whether the browser's matches are one file listed under several devices:
 * each device folder lists it once, and below that folder every match has the
 * same path, which the file's path ends with. The browser gives no file
 * identity, so two matches at one path, or at different paths, may be
 * different files.
 * @param matches - The browser's matches
 * @param file - The library file's absolute path
 * @returns True when the file accounts for every match
 */
function isListedUnderEachDevice(matches: Candidate[], file: string): boolean {
  const full = matches.map(({ section, path }) =>
    comparable(`${section.label}/${path}`),
  );
  const tails = matches.map(({ path }) => comparable(path).split("/").slice(1));
  const tail = (tails[0] ?? []).join("/");

  return (
    tail !== "" &&
    new Set(full).size === full.length &&
    tails.every((parts) => parts.join("/") === tail) &&
    comparable(file).endsWith(`/${tail}`)
  );
}

/**
 * @param path - A browser or file path
 * @returns The path with forward slashes, in lower case
 */
function comparable(path: string): string {
  return path.replaceAll("\\", "/").toLowerCase();
}

/**
 * @param preset - The preset as the call named it
 * @param files - The library's files, at least one
 * @returns The file when there is one, else the error naming them
 */
function oneOrSeveral(
  preset: string,
  files: PresetFile[],
): BrowserItemResolution {
  return files.length === 1
    ? presetFile((files[0] as PresetFile).path)
    : severalPresets(preset, files);
}

/**
 * @param endsAt - When the lookup must be done, in epoch ms
 * @param message - What ran out of time
 * @throws RemoteScriptTimeout when `endsAt` has passed
 */
function throwIfLate(endsAt: number, message: string): void {
  if (Date.now() >= endsAt) {
    throw new RemoteScriptTimeout(message, false);
  }
}

/**
 * Ask the library for the files with a name.
 * @param key - The name, normalized
 * @param device - Only presets for this device, if given
 * @param endsAt - When the lookup must be done, in epoch ms
 * @returns The files, or null when the library can't be read
 * @throws RemoteScriptTimeout when `endsAt` has passed
 */
async function findNamedPresetFiles(
  key: string,
  device: PresetFileQuery["device"],
  endsAt: number,
): Promise<PresetFile[] | null> {
  throwIfLate(endsAt, "ran out of time before the library was searched");

  return await findPresetFiles({
    name: key,
    ...(device == null ? {} : { device }),
  });
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
