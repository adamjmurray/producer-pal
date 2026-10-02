// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Finding the preset a `preset` arg refers to. Live's browser files every
// device preset (.adv, and .adg racks built around a device) under that device,
// so a name is searched there. A file path from ppal-library also reaches
// presets filed elsewhere, such as a pack's drum kits.

import {
  type BrowserItemResolution,
  type PresetScope,
} from "#src/tools/device/create/helpers/remote-script-contract.ts";
import {
  type Candidate,
  SECTIONS,
  type Section,
  ambiguity,
  candidateList,
  findAtPath,
  found,
  listedItems,
  normalizedName,
  searchFailed,
  sectionPrefixed,
} from "./browser-device-lookup.ts";
import { remoteScriptRequest } from "./remote-script-client.ts";

/** Sections that hold presets. Plug-ins list none. */
const PRESET_SECTIONS = SECTIONS.filter((section) => section.type !== "plugin");

/** An absolute path: `/…`, or a Windows drive. */
const ABSOLUTE_PATH = /^(?:\/|[a-z]:[\\/])/i;

/** The files a preset can be. */
const PRESET_FILE = /\.(?:adv|adg)$/i;

/**
 * Find the one preset a `preset` arg refers to: a file path, a
 * `<section>/<path>` browser path, or a name searched for among the presets.
 * A name must match exactly (any case, with or without its suffix): loading a
 * preset that merely contains it would load one the caller didn't name.
 * @param preset - The preset as the call named it
 * @param scope - The device whose presets a name is searched among, if the call
 *   named one
 * @returns The item, an error worded for the model, or `available: false`
 */
export async function lookUpBrowserPreset(
  preset: string,
  scope?: PresetScope,
): Promise<BrowserItemResolution> {
  const wanted = preset.trim();

  if (ABSOLUTE_PATH.test(wanted)) {
    return presetFile(wanted);
  }

  const prefixed = sectionPrefixed(wanted);

  if (prefixed != null) {
    const resolution = await findAtPath(preset, prefixed, () =>
      nothingNamed(preset, scope),
    );

    return scope != null &&
      !scope.orAnywhere &&
      "item" in resolution &&
      !inScope(resolution, scope)
      ? {
          available: true,
          error: `preset "${preset}" is not a preset for ${scope.device}`,
        }
      : resolution;
  }

  const key = normalizedName(wanted);

  if (key === "") {
    return nothingNamed(preset, scope);
  }

  const scoped = await searchPresets(preset, key, scope);

  if (!Array.isArray(scoped)) {
    return scoped;
  }

  const exact = (candidates: Candidate[]): Candidate[] =>
    candidates.filter((item) => normalizedName(item.name) === key);

  if (scope?.orAnywhere !== true || exact(scoped).length > 0) {
    return pickPreset(preset, exact(scoped), scoped, scope);
  }

  const anywhere = await searchPresets(preset, key, undefined);

  return Array.isArray(anywhere)
    ? pickPreset(preset, exact(anywhere), anywhere, undefined)
    : anywhere;
}

// --- Helpers below main export ---

/**
 * The resolution for a preset file on disk. Whether Live's browser has it is
 * only known when the remote script loads it.
 * @param path - The absolute path
 * @returns The item, or an error when it isn't a preset file
 */
function presetFile(path: string): BrowserItemResolution {
  if (!PRESET_FILE.test(path)) {
    return {
      available: true,
      error: `preset "${path}" is not a preset file (.adv or .adg)`,
    };
  }

  const name = path.split(/[\\/]/).at(-1) as string;

  return { available: true, item: { type: "file", path, name } };
}

/**
 * Search for a preset name, under one device or in every section.
 * @param preset - The preset as the call named it
 * @param key - The name, normalized
 * @param scope - The device to search under, if any
 * @returns Every preset whose name contains it, or a failed search
 */
async function searchPresets(
  preset: string,
  key: string,
  scope: PresetScope | undefined,
): Promise<Candidate[] | BrowserItemResolution> {
  const searches: Array<{ section: Section; path?: string }> =
    scope == null
      ? PRESET_SECTIONS.map((section) => ({ section }))
      : scopeSection(scope);
  const replies = await Promise.all(
    searches.map(({ section, path }) =>
      remoteScriptRequest({
        route: "/list",
        query: {
          type: section.type,
          presets: "true",
          q: key,
          ...(path == null ? {} : { path }),
        },
      }),
    ),
  );
  const candidates: Candidate[] = [];

  for (const [index, reply] of replies.entries()) {
    if (!reply.available) {
      return { available: false };
    }

    // A device with no preset folder is a 404: it has no presets.
    if (reply.status === 404 && scope != null) {
      continue;
    }

    if (reply.status !== 200) {
      return searchFailed(preset, reply);
    }

    const { section } = searches[index] as { section: Section };

    candidates.push(
      ...listedItems(reply).map((item) => ({ ...item, section })),
    );
  }

  return candidates;
}

/**
 * The one exact match, or an error naming the matches or the near misses.
 * @param preset - The preset as the call named it
 * @param exact - The presets with exactly that name
 * @param close - Every preset whose name contains it
 * @param scope - The device searched under, if any
 * @returns The resolution
 */
function pickPreset(
  preset: string,
  exact: Candidate[],
  close: Candidate[],
  scope: PresetScope | undefined,
): BrowserItemResolution {
  if (exact.length === 1) {
    return found(exact[0] as Candidate);
  }

  return exact.length > 1
    ? {
        available: true,
        error: ambiguity({ name: "preset", noun: "presets" }, preset, exact),
      }
    : nothingNamed(preset, scope, close);
}

/**
 * The section a device's presets are under.
 * @param scope - The device
 * @returns The one search to run, or none when the section is unknown
 */
function scopeSection(
  scope: PresetScope,
): Array<{ section: Section; path: string }> {
  const section = PRESET_SECTIONS.find(({ type }) => type === scope.type);

  return section == null ? [] : [{ section, path: scope.path }];
}

/**
 * Whether a resolved item sits under the device a call named.
 * @param resolution - What a browser path resolved to
 * @param resolution.item - The item
 * @param scope - The device
 * @returns True when the item is one of that device's presets
 */
function inScope(
  { item }: { item: { type: string; path: string } },
  scope: PresetScope,
): boolean {
  return (
    item.type === scope.type &&
    item.path.toLowerCase().startsWith(`${scope.path.toLowerCase()}/`)
  );
}

/**
 * The resolution for a preset name nothing has.
 * @param preset - The preset as the call named it
 * @param scope - The device searched under, if any
 * @param close - Presets whose names contain it, to offer instead
 * @returns The error
 */
function nothingNamed(
  preset: string,
  scope: PresetScope | undefined,
  close: Candidate[] = [],
): BrowserItemResolution {
  const where = scope == null ? "" : ` for ${scope.device}`;
  const offer =
    close.length === 0
      ? "Search ppal-library (kind: preset or device-group) and pass a result's path as preset"
      : `Close matches, to pass as preset: ${candidateList(close)}`;

  return {
    available: true,
    error: `no preset "${preset}"${where}. ${offer}`,
  };
}
