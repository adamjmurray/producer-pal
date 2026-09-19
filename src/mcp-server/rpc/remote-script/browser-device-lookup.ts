// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Finding the browser item a deviceName names. The remote script matches names
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
const SECTIONS = [
  { type: "plugin", label: "Plug-Ins" },
  { type: "mfl-device", label: "Max for Live" },
  { type: "instrument", label: "Instruments" },
  { type: "audio-effect", label: "Audio Effects" },
  { type: "midi-effect", label: "MIDI Effects" },
] as const;

type Section = (typeof SECTIONS)[number];

/** Browser names that are really filenames. */
const FILE_SUFFIX = /\.(?:amxd|adg|adv)$/;

/** How many candidates an ambiguity error names. */
const MAX_LISTED = 10;

interface ListedItem {
  name: string;
  path: string;
  /** Only a one-level listing says */
  loadable?: boolean;
}

interface Candidate extends ListedItem {
  section: Section;
}

/**
 * Find the one browser item a deviceName names. `<section>/<path>`, e.g.
 * `Plug-Ins/VST3/FabFilter/Pro-Q 4`, names one directly. Anything else is
 * searched for in every section: exact names first, else substrings.
 * @param deviceName - The name the call used
 * @returns The item, an error worded for the model, or `available: false`
 */
export async function lookUpBrowserDevice(
  deviceName: string,
): Promise<BrowserItemResolution> {
  const wanted = deviceName.trim();
  const section = SECTIONS.find((candidate) =>
    wanted.toLowerCase().startsWith(`${candidate.label.toLowerCase()}/`),
  );

  return section == null
    ? await searchSections(deviceName, wanted)
    : await findAtPath(
        deviceName,
        section,
        wanted.slice(section.label.length + 1),
      );
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

  const exact = candidates.filter((item) => normalizedName(item.name) === key);
  const matches =
    exact.length > 0
      ? exact
      : candidates.filter((item) => normalizedName(item.name).includes(key));
  const chosen = matches.length === 1 ? matches[0] : preferredFormat(matches);

  if (chosen != null) {
    return found(chosen);
  }

  return matches.length === 0
    ? nothingNamed(deviceName)
    : { available: true, error: ambiguity(deviceName, matches) };
}

/**
 * Find the item a section-prefixed name spells out, one level listing its folder.
 * @param deviceName - The name the call used
 * @param section - The section it starts with
 * @param rest - Everything after the section
 * @returns The resolution
 */
async function findAtPath(
  deviceName: string,
  section: Section,
  rest: string,
): Promise<BrowserItemResolution> {
  const segments = rest
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "");
  const leaf = segments.pop();

  if (leaf == null) {
    return nothingNamed(deviceName);
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
    return searchFailed(deviceName, reply);
  }

  const key = normalizedName(leaf);
  const item =
    reply.status === 200
      ? listedItems(reply).find(
          (child) =>
            child.loadable !== false && normalizedName(child.name) === key,
        )
      : undefined;

  return item == null ? nothingNamed(deviceName) : found({ ...item, section });
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
 * The items a listing reply holds.
 * @param reply - A 200 from /list
 * @returns Its items that carry a name and a path
 */
function listedItems(reply: RemoteScriptAnswer): ListedItem[] {
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
 * @param name - A browser name or the call's deviceName
 * @returns The comparable name
 */
function normalizedName(name: string): string {
  return name.trim().toLowerCase().replace(FILE_SUFFIX, "");
}

/**
 * The resolution for a match.
 * @param match - The matched item
 * @returns The item, as the load route takes it
 */
function found(match: Candidate): BrowserItemResolution {
  return {
    available: true,
    item: { type: match.section.type, path: match.path, name: match.name },
  };
}

/**
 * The resolution for a name nothing has.
 * @param deviceName - The name the call used
 * @returns The error
 */
function nothingNamed(deviceName: string): BrowserItemResolution {
  return {
    available: true,
    error: `invalid deviceName "${deviceName}": no native device, plug-in, or Max for Live device has that name`,
  };
}

/**
 * The resolution for a search the remote script answered with an error.
 * @param deviceName - The name the call used
 * @param reply - The failed reply
 * @returns The error
 */
function searchFailed(
  deviceName: string,
  reply: RemoteScriptAnswer,
): BrowserItemResolution {
  return {
    available: true,
    error: `could not search Live's browser for "${deviceName}": ${replyError(reply)}`,
  };
}

/**
 * The error for a name more than one thing has, each spelled so it can be sent
 * straight back as deviceName.
 * @param deviceName - The name the call used
 * @param matches - What it matched
 * @returns The message
 */
function ambiguity(deviceName: string, matches: Candidate[]): string {
  const listed = matches
    .slice(0, MAX_LISTED)
    .map((match) => `"${match.section.label}/${match.path}"`)
    .join(", ");
  const more =
    matches.length > MAX_LISTED
      ? `, and ${matches.length - MAX_LISTED} more`
      : "";

  return `deviceName "${deviceName}" matches ${matches.length} devices; pass one of these as deviceName: ${listed}${more}`;
}
