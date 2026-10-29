// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Finding the browser item a device name refers to. The remote script matches names
// only within one browser section, and refuses a plug-in installed in more than
// one format as ambiguous, so the search across sections happens here.

import { assertDefined } from "#src/shared/error-message.ts";
import { type BrowserItemResolution } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { pathSegment } from "../../../live-library/reconstruct-path.ts";
import {
  type RemoteScriptAnswer,
  type RemoteScriptReply,
  remoteScriptRequest,
  replyError,
  unavailableReply,
} from "../remote-script-client.ts";
import { RemoteScriptTimeout } from "../remote-script-errors.ts";

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

/** A file on disk, which is its own spelling. */
export interface FileCandidate {
  name: string;
  path: string;
}

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

  return prefixed == null
    ? await searchSections(deviceName, wanted, endsAt)
    : await findAtPath(
        deviceName,
        prefixed,
        {
          missing: () => nothingNamed(deviceName),
          shared: (count) =>
            `deviceName "${deviceName}" matches ${count} items at that browser path, so none was loaded`,
        },
        endsAt,
      );
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
 *   given how many. Live can list two files at one browser path, and the
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
    shared: (count: number) => string;
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
    return { available: true, error: shared(items.length) };
  }

  return items[0] == null ? missing() : found({ ...items[0], section });
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
 * Pool what each section's search listed, tagged with its section.
 * @param name - The name the call used, for a failed search's error
 * @param searched - Each search's section and reply
 * @param skipNotFound - Pass over a 404 instead of failing on it
 * @returns The candidates, or the first failure
 */
export function pooledCandidates(
  name: string,
  searched: Array<{ section: Section; reply: RemoteScriptReply }>,
  skipNotFound = false,
): Candidate[] | BrowserItemResolution {
  const candidates: Candidate[] = [];

  for (const { section, reply } of searched) {
    if (!reply.available) {
      return unavailableReply(reply);
    }

    if (reply.status === 404 && skipNotFound) {
      continue;
    }

    if (reply.status !== 200) {
      return searchFailed(name, reply);
    }

    candidates.push(
      ...listedItems(reply).map((item) => ({ ...item, section })),
    );
  }

  return candidates;
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
 * @param param.name - The arg, e.g. "deviceName"
 * @param param.noun - What it names, plural
 * @param value - The name the call used
 * @param matches - What it matched
 * @returns The message
 */
export function ambiguity(
  { name, noun }: { name: string; noun: string },
  value: string,
  matches: Array<Candidate | FileCandidate>,
): string {
  return `${name} "${value}" matches ${matches.length} ${noun}; pass one of these as ${name}: ${candidateList(matches)}`;
}

/**
 * Candidates, each spelled so it can be sent straight back, capped at a few.
 * @param matches - The candidates
 * @returns The list, saying how many more there are past the cap
 */
export function candidateList(
  matches: Array<Candidate | FileCandidate>,
): string {
  const listed = matches
    .slice(0, MAX_LISTED)
    .map((match) =>
      "section" in match
        ? `"${match.section.label}/${match.path}"`
        : `"${match.path}"`,
    )
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
