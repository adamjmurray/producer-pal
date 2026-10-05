// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Finding the preset a `preset` arg refers to. Live's browser files every
// device preset (.adv, and .adg racks built around a device) under that device,
// so a name is searched there first. A name it doesn't have is looked up in
// Live's library database, which also reaches presets filed elsewhere, such as
// a pack's drum kits. A file path from ppal-library names one directly.

import { isAbsolutePath } from "#src/tools/shared/remote-script/absolute-path.ts";
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
  listBrowser,
  listedItems,
  normalizedName,
  searchFailed,
  sectionPrefixed,
} from "./browser-device-lookup.ts";
import { lookUpPresetFile, presetFile } from "./browser-preset-files.ts";
import { presetFileIsFor } from "./preset-file-device.ts";

/** Sections that hold presets. Plug-ins list none. */
const PRESET_SECTIONS = SECTIONS.filter((section) => section.type !== "plugin");

/**
 * Find the one preset a `preset` arg refers to: a file path, a
 * `<section>/<path>` browser path, or a name searched for among the presets.
 * A name must match exactly (any case, with or without its suffix): loading a
 * preset that merely contains it would load one the caller didn't name. A name
 * the browser doesn't have is looked up in Live's library database.
 * @param preset - The preset as the call named it
 * @param scope - The device whose presets a name is searched among, if the call
 *   named one
 * @param endsAt - When the whole lookup must be done, in epoch ms
 * @returns The item, an error worded for the model, or `available: false`
 * @throws RemoteScriptTimeout when `endsAt` passes before the search is done
 */
export async function lookUpBrowserPreset(
  preset: string,
  scope: PresetScope | undefined,
  endsAt: number,
): Promise<BrowserItemResolution> {
  const wanted = preset.trim();

  if (isAbsolutePath(wanted)) {
    const file = presetFile(wanted);

    // A device in the Set may take any preset, a rack included.
    return scope != null &&
      !scope.orAnywhere &&
      "item" in file &&
      !(await presetFileIsFor(wanted, scope.device))
      ? notAPresetFor(preset, scope)
      : file;
  }

  const prefixed = sectionPrefixed(wanted);

  if (prefixed != null) {
    const resolution = await findAtPath(
      preset,
      prefixed,
      () => nothingNamed(preset, scope),
      endsAt,
    );

    return scope != null &&
      !scope.orAnywhere &&
      "item" in resolution &&
      !inScope(resolution, scope)
      ? notAPresetFor(preset, scope)
      : resolution;
  }

  const key = normalizedName(wanted);

  if (key === "") {
    return nothingNamed(preset, scope);
  }

  const searched = await searchByName(preset, key, scope, endsAt);

  if ("available" in searched) {
    return searched;
  }

  if (searched.exact.length > 0) {
    return pickPreset(preset, searched.exact);
  }

  return (
    (await lookUpPresetFile(preset, key, scope, endsAt)) ??
    nothingNamed(preset, searched.searchedScope, searched.close)
  );
}

// --- Helpers below main export ---

/** What a name search in the browser found. */
interface NameSearch {
  /** The presets named exactly that */
  exact: Candidate[];
  /** Every preset whose name contains it */
  close: Candidate[];
  /** The device the browser pass ended on, if any: the one errors name */
  searchedScope: PresetScope | undefined;
}

/**
 * Search the browser for a preset name: under its device, then, for a device
 * already in the Set, anywhere.
 * @param preset - The preset as the call named it
 * @param key - The name, normalized
 * @param scope - The device whose presets it's searched among, if any
 * @param endsAt - When the search must be done, in epoch ms
 * @returns What it found, or a failed search
 */
async function searchByName(
  preset: string,
  key: string,
  scope: PresetScope | undefined,
  endsAt: number,
): Promise<NameSearch | BrowserItemResolution> {
  const exactOf = (candidates: Candidate[]): Candidate[] =>
    candidates.filter((item) => normalizedName(item.name) === key);
  const scoped = await searchPresets(preset, key, scope, endsAt);

  if (!Array.isArray(scoped)) {
    return scoped;
  }

  if (scope?.orAnywhere !== true || exactOf(scoped).length > 0) {
    return { exact: exactOf(scoped), close: scoped, searchedScope: scope };
  }

  const anywhere = await searchPresets(preset, key, undefined, endsAt);

  return Array.isArray(anywhere)
    ? {
        exact: exactOf(anywhere),
        close: anywhere,
        searchedScope: undefined,
      }
    : anywhere;
}

/**
 * Search for a preset name, under one device or in every section.
 * @param preset - The preset as the call named it
 * @param key - The name, normalized
 * @param scope - The device to search under, if any
 * @param endsAt - When the search must be done, in epoch ms
 * @returns Every preset whose name contains it, or a failed search
 */
async function searchPresets(
  preset: string,
  key: string,
  scope: PresetScope | undefined,
  endsAt: number,
): Promise<Candidate[] | BrowserItemResolution> {
  const searches: Array<{ section: Section; path?: string }> =
    scope == null
      ? PRESET_SECTIONS.map((section) => ({ section }))
      : scopeSection(scope);
  const replies = await Promise.all(
    searches.map(({ section, path }) =>
      listBrowser(
        {
          type: section.type,
          presets: "true",
          q: key,
          ...(path == null ? {} : { path }),
        },
        endsAt,
      ),
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
 * The one match, or an error naming them all.
 * @param preset - The preset as the call named it
 * @param exact - The presets with exactly that name, at least one
 * @returns The resolution
 */
function pickPreset(preset: string, exact: Candidate[]): BrowserItemResolution {
  return exact.length === 1
    ? found(exact[0] as Candidate)
    : {
        available: true,
        error: ambiguity({ name: "preset", noun: "presets" }, preset, exact),
      };
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
 * The resolution for a preset that belongs to another device.
 * @param preset - The preset as the call named it
 * @param scope - The device the call named
 * @returns The error
 */
function notAPresetFor(
  preset: string,
  scope: PresetScope,
): BrowserItemResolution {
  return {
    available: true,
    error: `preset "${preset}" is not a preset for ${scope.device}`,
  };
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
