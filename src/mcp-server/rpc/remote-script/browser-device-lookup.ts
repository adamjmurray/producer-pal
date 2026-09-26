// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Finding the browser item a device name refers to. The remote script matches names
// only within one browser section, and refuses a plug-in installed in more than
// one format as ambiguous, so the search across sections happens here.

import { assertDefined } from "#src/shared/error-message.ts";
import { type BrowserItemResolution } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import {
  type RemoteScriptAnswer,
  remoteScriptRequest,
  replyError,
} from "./remote-script-client.ts";

/** Browser sections, as the remote script's `type` and as Live labels them. */
export const SECTIONS = [
  { type: "plugin", label: "Plug-Ins" },
  { type: "mfl-device", label: "Max for Live" },
  { type: "instrument", label: "Instruments" },
  { type: "audio-effect", label: "Audio Effects" },
  { type: "midi-effect", label: "MIDI Effects" },
] as const;

export type Section = (typeof SECTIONS)[number];

/** Browser names that are really filenames. */
const FILE_SUFFIX = /\.(?:amxd|adg|adv)$/;

/** How many candidates an ambiguity error names. */
const MAX_LISTED = 10;

export interface ListedItem {
  name: string;
  path: string;
  /** Only a one-level listing says */
  loadable?: boolean;
}

export interface Candidate extends ListedItem {
  section: Section;
}

/**
 * Find the one browser item a device name refers to. `<section>/<path>`, e.g.
 * `Plug-Ins/VST3/FabFilter/Pro-Q 4`, names one directly. Anything else is
 * searched for in every section: exact names first, else substrings.
 * @param deviceName - The name the call used
 * @returns The item, an error worded for the model, or `available: false`
 */
export async function lookUpBrowserDevice(
  deviceName: string,
): Promise<BrowserItemResolution> {
  const wanted = deviceName.trim();
  const prefixed = sectionPrefixed(wanted);

  return prefixed == null
    ? await searchSections(deviceName, wanted)
    : await findAtPath(deviceName, prefixed, () => nothingNamed(deviceName));
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
 * Find the item a section-prefixed name spells out, one level listing its folder.
 * @param name - The name the call used
 * @param prefixed - Its section, and everything after the section
 * @param prefixed.section - The section it starts with
 * @param prefixed.rest - Everything after the section
 * @param missing - The resolution when nothing is there
 * @returns The resolution
 */
export async function findAtPath(
  name: string,
  { section, rest }: { section: Section; rest: string },
  missing: () => BrowserItemResolution,
): Promise<BrowserItemResolution> {
  const segments = rest
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "");
  const leaf = segments.pop();

  if (leaf == null) {
    return missing();
  }

  const reply = await remoteScriptRequest({
    route: "/list",
    query: {
      type: section.type,
      recursive: "false",
      ...(segments.length > 0 ? { path: segments.join("/") } : {}),
    },
  });

  if (!reply.available) {
    return { available: false };
  }

  // A folder that isn't there is a 404, which means the same as no such item.
  if (reply.status !== 200 && reply.status !== 404) {
    return searchFailed(name, reply);
  }

  const key = normalizedName(leaf);
  const item =
    reply.status === 200
      ? listedItems(reply).find(
          (child) =>
            child.loadable !== false && normalizedName(child.name) === key,
        )
      : undefined;

  return item == null ? missing() : found({ ...item, section });
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
 * The items a listing reply holds.
 * @param reply - A 200 from /list
 * @returns Its items that carry a name and a path
 */
export function listedItems(reply: RemoteScriptAnswer): ListedItem[] {
  const items = reply.body.items;

  return Array.isArray(items)
    ? items.filter(
        (item): item is ListedItem =>
          typeof item?.name === "string" && typeof item?.path === "string",
      )
    : [];
}

/**
 * A name compared the way the remote script compares it: trimmed, any case,
 * and without a filename suffix.
 * @param name - A browser name or the name the call used
 * @returns The comparable name
 */
export function normalizedName(name: string): string {
  return name.trim().toLowerCase().replace(FILE_SUFFIX, "");
}

/**
 * The resolution for a match.
 * @param match - The matched item
 * @returns The item, as the load route takes it
 */
export function found(match: Candidate): BrowserItemResolution {
  return {
    available: true,
    item: { type: match.section.type, path: match.path, name: match.name },
  };
}

/**
 * The resolution for a search the remote script answered with an error.
 * @param name - The name the call used
 * @param reply - The failed reply
 * @returns The error
 */
export function searchFailed(
  name: string,
  reply: RemoteScriptAnswer,
): BrowserItemResolution {
  return {
    available: true,
    error: `could not search Live's browser for "${name}": ${replyError(reply)}`,
  };
}

/**
 * The error for a name more than one thing has, each spelled so it can be sent
 * straight back as the arg.
 * @param param - The arg the name came in, and what it names
 * @param param.name - The arg, e.g. "device"
 * @param param.noun - What it names, plural
 * @param value - The name the call used
 * @param matches - What it matched
 * @returns The message
 */
export function ambiguity(
  { name, noun }: { name: string; noun: string },
  value: string,
  matches: Candidate[],
): string {
  return `${name} "${value}" matches ${matches.length} ${noun}; pass one of these as ${name}: ${candidateList(matches)}`;
}

/**
 * Candidates, each spelled so it can be sent straight back, capped at a few.
 * @param matches - The candidates
 * @returns The list, saying how many more there are past the cap
 */
export function candidateList(matches: Candidate[]): string {
  const listed = matches
    .slice(0, MAX_LISTED)
    .map((match) => `"${match.section.label}/${match.path}"`)
    .join(", ");
  const more =
    matches.length > MAX_LISTED
      ? `, and ${matches.length - MAX_LISTED} more`
      : "";

  return `${listed}${more}`;
}

// --- Helpers below main export ---

/**
 * Search every section for a name.
 * @param deviceName - The name the call used
 * @param wanted - The name, trimmed
 * @returns The resolution
 */
async function searchSections(
  deviceName: string,
  wanted: string,
): Promise<BrowserItemResolution> {
  const key = normalizedName(wanted);

  if (key === "") {
    return nothingNamed(deviceName);
  }

  const replies = await Promise.all(
    SECTIONS.map((section) =>
      remoteScriptRequest({
        route: "/list",
        query: { type: section.type, q: key },
      }),
    ),
  );
  const candidates: Candidate[] = [];

  for (const [index, reply] of replies.entries()) {
    if (!reply.available) {
      return { available: false };
    }

    if (reply.status !== 200) {
      return searchFailed(deviceName, reply);
    }

    const section = SECTIONS[index] as Section;

    candidates.push(
      ...listedItems(reply).map((item) => ({ ...item, section })),
    );
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
          { name: "device", noun: "devices" },
          deviceName,
          matches,
        ),
      };
}

/**
 * The one match to load when every match is the same plug-in in different
 * formats: VST3, then AU, then VST.
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

  if (
    names.size !== 1 ||
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
  const slash = path.indexOf("/");
  const folder = (slash === -1 ? path : path.slice(0, slash)).toLowerCase();

  if (folder === "vst3") {
    return 0;
  }

  // Live's name for this folder isn't confirmed, so match it loosely.
  if (folder.includes("audio unit")) {
    return 1;
  }

  return folder === "vst" ? 2 : null;
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
  };
}
