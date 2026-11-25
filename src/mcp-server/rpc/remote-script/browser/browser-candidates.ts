// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What a browser listing found, and how an error spells those candidates.

import { type BrowserItemResolution } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import {
  type RemoteScriptAnswer,
  type RemoteScriptReply,
  replyError,
  unavailableReply,
} from "../remote-script-client.ts";

/** Browser sections, as the remote script's `type` and as Live labels them. */
export const SECTIONS = [
  { type: "plugin", label: "Plug-Ins" },
  { type: "mfl-device", label: "Max for Live" },
  { type: "instrument", label: "Instruments" },
  { type: "audio-effect", label: "Audio Effects" },
  { type: "midi-effect", label: "MIDI Effects" },
] as const;

export type Section = (typeof SECTIONS)[number];

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
