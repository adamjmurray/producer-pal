// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Finding the browser item a device name refers to. The remote script matches names
// only within one browser section, and refuses a plug-in installed in more than
// one format as ambiguous, so the search across sections happens here.

import { assertDefined } from "#src/shared/error-message.ts";
import {
  type BrowserItem,
  type BrowserItemResolution,
} from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { pathSegment } from "../../../live-library/reconstruct-path.ts";
import {
  type RemoteScriptReply,
  remoteScriptRequest,
  replyError,
  unavailableReply,
} from "../remote-script-client.ts";
import {
  type Candidate,
  type ListedItem,
  SECTIONS,
  type Section,
  candidateList,
  ambiguity,
  listedItems,
  pooledCandidates,
  searchFailed,
} from "./browser-candidates.ts";
import { RemoteScriptTimeout } from "../remote-script-errors.ts";
import {
  pluginFolderFormat,
  pluginPathFormat,
} from "./plugin-folder-format.ts";
import { type PluginFormat } from "../../../live-library/library-types.ts";
import { distinctMakers } from "../../../live-library/query/plugins/same-vendor.ts";

/** Which format a name loads when a plug-in has several, best first. */
const FORMAT_ORDER: PluginFormat[] = ["VST3", "AU", "VST"];

/** The format folders as Live spells them, which need no listing to reach. */
const LIVE_FORMAT_FOLDERS = new Set(["VST3", "VST", "AUv2"]);

/** Browser names that are really filenames. */
const FILE_SUFFIX = /\.(?:amxd|adg|adv)$/;

/** Rack and preset files, which `preset` can load by absolute path. */
export const PRESET_FILE = /\.(?:adv|adg)$/i;

/**
 * Find the one browser item a device name refers to. `<section>/<path>`, e.g.
 * `Plug-Ins/VST3/FabFilter/Pro-Q 4`, names one directly. Anything else is
 * searched for in every section: exact names first, else substrings.
 * @param deviceName - The name the call used
 * @param endsAt - When the whole lookup must be done, in epoch ms
 * @returns The item, an error worded for the model, or `available: false`
 * @throws RemoteScriptTimeout when `endsAt` passes before the search is done
 */
export async function lookUpBrowserDevice(
  deviceName: string,
  endsAt: number,
): Promise<BrowserItemResolution> {
  const wanted = deviceName.trim();
  const prefixed = sectionPrefixed(wanted);

  if (prefixed == null) {
    return await searchSections(deviceName, wanted, endsAt);
  }

  const rest = await withFormatFolder(deviceName, prefixed, endsAt);

  if (typeof rest !== "string") {
    return rest;
  }

  const resolution = await findAtPath(
    deviceName,
    { section: prefixed.section, rest },
    {
      missing: () => nothingNamed(deviceName),
      shared: (items) => sharedDevicePath(deviceName, items),
    },
    endsAt,
  );

  return prefixed.section.type === "plugin" && "notFound" in resolution
    ? await pluginElsewhere(
        deviceName,
        prefixed.section,
        rest,
        resolution,
        endsAt,
      )
    : resolution;
}

/**
 * One /list request that must finish by a shared deadline: Live skips it if it
 * hasn't started it by then. A skipped or unfinished one throws, so a search
 * never reads a half-listed section as a complete one.
 * @param query - The /list params
 * @param endsAt - When the lookup must be done, in epoch ms
 * @returns The reply
 * @throws RemoteScriptTimeout when the deadline passes first
 */
export async function listBrowser(
  query: Record<string, string>,
  endsAt: number,
): Promise<RemoteScriptReply> {
  const reply = await remoteScriptRequest({
    route: "/list",
    query,
    expiresInMs: endsAt - Date.now(),
  });

  if (reply.available && reply.status === 504) {
    throw new RemoteScriptTimeout(replyError(reply), true);
  }

  return reply;
}

/**
 * Split off a leading section label, e.g. `Plug-Ins/VST3/FabFilter/Pro-Q 4`.
 * @param wanted - The name the call used, trimmed
 * @returns The section and the path under it, or null when there's no label
 */
export function sectionPrefixed(
  wanted: string,
): { section: Section; rest: string } | null {
  const section = SECTIONS.find((candidate) =>
    wanted.toLowerCase().startsWith(`${candidate.label.toLowerCase()}/`),
  );

  return section == null
    ? null
    : { section, rest: wanted.slice(section.label.length + 1) };
}

/**
 * The folders and name of a path below its section, as the lookup reads them.
 * @param rest - Everything after the section
 * @returns The trimmed, non-empty segments
 */
export function pathSegments(rest: string): string[] {
  return rest
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "");
}

/**
 * Find the item a section-prefixed name spells out, one level listing its folder.
 * @param name - The name the call used
 * @param prefixed - Its section, and everything after the section
 * @param prefixed.section - The section it starts with
 * @param prefixed.rest - Everything after the section
 * @param refusals - What to say when the path can't be settled
 * @param refusals.missing - The resolution when nothing is there
 * @param refusals.shared - The error when several loadable items are there,
 *   given them. Live can list two files at one browser path, and the
 *   remote script loads the first, so one is never picked.
 * @param endsAt - When the lookup must be done, in epoch ms
 * @returns The resolution
 */
export async function findAtPath(
  name: string,
  { section, rest }: { section: Section; rest: string },
  {
    missing,
    shared,
  }: {
    missing: () => BrowserItemResolution;
    shared: (items: ListedItem[]) => string;
  },
  endsAt: number,
): Promise<BrowserItemResolution> {
  const segments = pathSegments(rest);
  const leaf = segments.pop();

  if (leaf == null) {
    return missing();
  }

  const reply = await listBrowser(
    {
      type: section.type,
      recursive: "false",
      ...(segments.length > 0 ? { path: segments.join("/") } : {}),
    },
    endsAt,
  );

  if (!reply.available) {
    return unavailableReply(reply);
  }

  // A folder that isn't there is a 404, which means the same as no such item.
  if (reply.status !== 200 && reply.status !== 404) {
    return searchFailed(name, reply);
  }

  const key = normalizedName(leaf);
  const named =
    reply.status === 200
      ? listedItems(reply).filter(
          (child) =>
            child.loadable !== false && normalizedName(child.name) === key,
        )
      : [];
  // `Foo.adv` names one of `Foo.adg` and `Foo.adv`; a bare `Foo` names neither.
  const spelled = named.filter(
    (child) => spelledName(child.name) === spelledName(leaf),
  );
  const items = spelled.length > 0 ? spelled : named;

  if (items.length > 1) {
    return { available: true, error: shared(items) };
  }

  return items[0] == null ? missing() : found({ ...items[0], section });
}

/**
 * A plug-in path's format folder, as Live spells it. The format matches by
 * kind, so `AU` and `au` both reach Live's `AUv2` folder. Live's own
 * spellings need no listing.
 * @param name - The name the call used
 * @param prefixed - The section and the path under it
 * @param prefixed.section - The section the path starts with
 * @param prefixed.rest - Everything after the section
 * @param endsAt - When the lookup must be done, in epoch ms
 * @returns The path under the section with the real folder, or the failure
 */
async function withFormatFolder(
  name: string,
  { section, rest }: { section: Section; rest: string },
  endsAt: number,
): Promise<string | BrowserItemResolution> {
  const [folder, ...more] = pathSegments(rest);
  const format = pluginPathFormat(folder);

  if (
    section.type !== "plugin" ||
    folder == null ||
    more.length === 0 ||
    format == null ||
    LIVE_FORMAT_FOLDERS.has(folder)
  ) {
    return rest;
  }

  const reply = await listBrowser(
    { type: section.type, recursive: "false" },
    endsAt,
  );

  if (!reply.available) {
    return unavailableReply(reply);
  }

  // The top folders always exist, so a 404 here is as odd as any other failure.
  if (reply.status !== 200) {
    return searchFailed(name, reply);
  }

  const real = listedItems(reply).find(
    (item) => pluginFolderFormat(item.name) === format,
  );

  return [real?.name ?? folder, ...more].join("/");
}

/**
 * Say where a plug-in is when its path was wrong (the vendor folder, usually).
 * @param name - The name the call used
 * @param section - The Plug-Ins section
 * @param rest - The path under it, format folder as Live's
 * @param missing - The plain not-found, kept when the search can't help
 * @param endsAt - When the lookup must be done, in epoch ms
 * @returns A not-found naming the plug-in's paths, in the asked format when
 *   it has that one, else `missing`
 */
async function pluginElsewhere(
  name: string,
  section: Section,
  rest: string,
  missing: BrowserItemResolution,
  endsAt: number,
): Promise<BrowserItemResolution> {
  const segments = pathSegments(rest);
  const key = normalizedName(segments.at(-1) ?? "");
  let reply: RemoteScriptReply;

  // Only a hint: a search that fails or runs out of time leaves the not-found.
  try {
    reply = await listBrowser({ type: section.type, q: key }, endsAt);
  } catch {
    return missing;
  }

  if (!reply.available || reply.status !== 200) {
    return missing;
  }

  const named = listedItems(reply)
    .filter((item) => normalizedName(item.name) === key)
    .map((item) => ({ ...item, section }));
  // The typed folder may be a vendor ("Audio Damage"), not a format.
  const format = pluginPathFormat(segments[0]);
  const inFormat =
    format == null
      ? []
      : named.filter(
          (item) => pluginFolderFormat(item.path.split("/")[0]) === format,
        );
  const elsewhere = inFormat.length > 0 ? inFormat : named;

  return elsewhere.length === 0
    ? missing
    : {
        available: true,
        error: `invalid device "${name}": no plug-in is at that path; Live lists it at ${candidateList(elsewhere)}`,
        notFound: true,
      };
}

/**
 * The refusal for a device path that two items share. Only a rack or preset
 * file has a way forward: `preset` takes a file's absolute path.
 * @param deviceName - The name the call used
 * @param items - The items at that path
 * @returns The error
 */
function sharedDevicePath(deviceName: string, items: ListedItem[]): string {
  const files = items.every((item) => PRESET_FILE.test(item.name));
  const next = files
    ? "; to load one, pass its absolute path from ppal-library as preset, without deviceName"
    : "";

  return `deviceName "${deviceName}" matches ${items.length} items at that browser path, so none was loaded${next}`;
}

/**
 * The matches for a name: exact names, else names containing it.
 * @param candidates - Everything a search listed
 * @param key - The name, normalized
 * @returns The matches
 */
function nameMatches(candidates: Candidate[], key: string): Candidate[] {
  const exact = candidates.filter((item) => normalizedName(item.name) === key);

  return exact.length > 0
    ? exact
    : candidates.filter((item) => normalizedName(item.name).includes(key));
}

/**
 * A name compared the way the remote script compares it: trimmed, any case,
 * accents composed, in path form, and without a filename suffix.
 * @param name - A browser name or the name the call used
 * @returns The comparable name
 */
export function normalizedName(name: string): string {
  return spelledName(name).replace(FILE_SUFFIX, "");
}

/**
 * A name as spelled, suffix kept, in the form names are compared in.
 * @param name - A name
 * @returns It trimmed, NFC, in path form and lowercase
 */
function spelledName(name: string): string {
  return pathSegment(name.trim().normalize("NFC")).toLowerCase();
}

/**
 * The resolution for a match.
 * @param match - The matched item
 * @returns The item, as the load route takes it
 */
export function found(match: Candidate): BrowserItemResolution {
  return { available: true, item: browserItem(match) };
}

// --- Helpers below main export ---

/**
 * Search every section for a name.
 * @param deviceName - The name the call used
 * @param wanted - The name, trimmed
 * @param endsAt - When the search must be done, in epoch ms
 * @returns The resolution
 */
async function searchSections(
  deviceName: string,
  wanted: string,
  endsAt: number,
): Promise<BrowserItemResolution> {
  const key = normalizedName(wanted);

  if (key === "") {
    return nothingNamed(deviceName);
  }

  const candidates = pooledCandidates(
    deviceName,
    await Promise.all(
      SECTIONS.map(async (section) => ({
        section,
        reply: await listBrowser({ type: section.type, q: key }, endsAt),
      })),
    ),
  );

  if (!Array.isArray(candidates)) {
    return candidates;
  }

  const matches = nameMatches(candidates, key);
  const chosen = matches.length === 1 ? matches[0] : preferredFormat(matches);

  if (chosen != null) {
    return found(chosen);
  }

  return matches.length === 0
    ? nothingNamed(deviceName)
    : {
        available: true,
        error: ambiguity(
          { name: "deviceName", noun: "devices" },
          deviceName,
          matches,
        ),
        // So a preset can still settle which device the name means.
        candidates: matches.map(browserItem),
      };
}

/**
 * The one match to load when every match is the same plug-in, from the same
 * maker, in different formats: VST3, then AU, then VST.
 * @param matches - The matches, more than one
 * @returns That match, or null when the matches are different things
 */
function preferredFormat(matches: Candidate[]): Candidate | null {
  const names = new Set(matches.map((match) => normalizedName(match.name)));
  // Anything but a plug-in in a format we rank drops out, shortening the list.
  const ranked = matches.flatMap((match) => {
    const rank =
      match.section.type === "plugin" ? formatRank(match.path) : null;

    return rank == null ? [] : [{ match, rank }];
  });
  const ranks = new Set(ranked.map(({ rank }) => rank));
  // Two makers can share a plug-in name. A VST sits in no maker's folder, and
  // one maker's folders can be spelled a little differently per format.
  const makers = distinctMakers(
    matches.flatMap(({ path }) => path.split("/").slice(1, -1).join("/") || []),
  );

  if (
    names.size !== 1 ||
    makers.length > 1 ||
    ranked.length !== matches.length ||
    ranks.size !== matches.length
  ) {
    return null;
  }

  return assertDefined(
    ranked.toSorted((a, b) => a.rank - b.rank)[0],
    "best-ranked format",
  ).match;
}

/**
 * How much a plug-in's format is preferred, lower first, read off the top
 * folder of its path.
 * @param path - The plug-in's path under Plug-Ins
 * @returns The rank, or null for a folder that isn't a format
 */
function formatRank(path: string): number | null {
  const format = pluginFolderFormat(path.split("/")[0]);

  return format == null ? null : FORMAT_ORDER.indexOf(format);
}

/**
 * The resolution for a name nothing has.
 * @param deviceName - The name the call used
 * @returns The error
 */
function nothingNamed(deviceName: string): BrowserItemResolution {
  return {
    available: true,
    error: `invalid device "${deviceName}": no native device, plug-in, or Max for Live device has that name`,
    notFound: true,
  };
}

/**
 * @param match - A matched item
 * @returns It as the load route takes it
 */
function browserItem(match: Candidate): BrowserItem {
  const format =
    match.section.type === "plugin"
      ? pluginFolderFormat(match.path.split("/")[0])
      : null;

  return {
    type: match.section.type,
    path: match.path,
    name: match.name,
    ...(format != null && { format }),
  };
}
