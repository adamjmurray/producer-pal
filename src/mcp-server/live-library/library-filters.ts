// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Filter mappings between Live's DB encoding and our public enums.
 *
 * Live stores content kind as a fourCC integer in `files.file_type` (e.g.
 * 'aiff' → 0x61696666). Source category is encoded as `places.folder_kind`
 * (0=Pack, 1=User Library, etc.). Device classification lives in
 * `files.device_type` (1=instrument, 2=audiofx, 4=midifx).
 */

import {
  type LibraryDeviceKind,
  type LibraryItemType,
  type LibraryKind,
  type LibrarySource,
} from "./library-types.ts";

/**
 * Convert a 4-character ASCII code to its big-endian uint32 integer.
 * Mirrors Live's encoding: e.g. 'fldr' (0x666C6472) = 1718379634.
 *
 * @param code - Exactly 4 ASCII characters
 * @returns 32-bit unsigned integer
 */
export function fourCC(code: string): number {
  // Use unsigned right shift to coerce to uint32 (avoids sign overflow)
  let n = 0;

  for (let i = 0; i < 4; i++) {
    n = (n << 8) | code.charCodeAt(i);
  }

  return n >>> 0;
}

/**
 * `.alc` Live-clip file_type, plus its MIDI/audio subtype fourCCs. A single
 * `.alc` row's `subtype` column distinguishes a MIDI clip (alcM) from an audio
 * clip (alcA). Exported so the search layer can enrich kind:midi with alcM.
 */
export const ALC_FILE_TYPE = fourCC("alc-");
export const ALC_MIDI_SUBTYPE = fourCC("alcM");
const ALC_AUDIO_SUBTYPE = fourCC("alcA");

const ALC_SUBTYPE_TO_NAME = new Map<number, "midi" | "audio">([
  [ALC_MIDI_SUBTYPE, "midi"],
  [ALC_AUDIO_SUBTYPE, "audio"],
]);

/**
 * file_type fourCC sets per public LibraryKind enum.
 *
 * Coverage note: the audio list is spike-confirmed against a Live 12.3 install
 * but may be incomplete. The prior ppal-context.search-samples implementation
 * filtered by Live's `file_kind` bitmask (4 = uncompressed, 2048 = compressed),
 * which covers *every* audio format Live indexes. Switching to an explicit
 * fourCC allow-list means any format the spike didn't observe (caf, m4a/aac,
 * wma, opus, etc.) silently drops out of audio queries. Add new fourCCs here
 * as they're verified — do not guess, since unverified codes are harmless but
 * create false confidence in the lock-down test below.
 */
const KIND_FOURCC: Record<LibraryKind, number[]> = {
  audio: [
    fourCC("aiff"),
    fourCC("wav-"),
    fourCC("flac"),
    fourCC("mp3-"),
    fourCC("oggv"),
  ],
  midi: [fourCC("midi")],
  "live-clip": [ALC_FILE_TYPE],
  preset: [fourCC("adv-")],
  "device-group": [fourCC("adg-")],
  "m4l-device": [fourCC("amp-")],
  "live-set": [fourCC("als-")],
  plugin: [fourCC("vst3"), fourCC("vstp"), fourCC("aupr"), fourCC("plug")],
  image: [fourCC("png-"), fourCC("jpeg"), fourCC("tiff")],
  video: [fourCC("mp4-"), fourCC("qtmv"), fourCC("avi-")],
  folder: [fourCC("fldr"), fourCC("lfld"), fourCC("pfld"), fourCC("dfld")],
};

/** Reverse index for resolving an int back to a kind name */
const FOURCC_TO_KIND: Map<number, LibraryKind> = new Map();

for (const [kind, codes] of Object.entries(KIND_FOURCC) as Array<
  [LibraryKind, number[]]
>) {
  for (const code of codes) {
    FOURCC_TO_KIND.set(code, kind);
  }
}

/**
 * Look up the file_type fourCC integers for a public kind enum value.
 *
 * @param kind - Public kind enum
 * @returns Array of fourCC integers to OR-match against file_type
 */
export function fourCCsForKind(kind: LibraryKind): number[] {
  return KIND_FOURCC[kind];
}

/**
 * The union of all known kind fourCCs. Use this as a default file_type
 * filter to exclude internal Live system rows (keyword definitions,
 * vfolder patterns, etc.) that the user never wants to see.
 *
 * @returns All fourCC integers across every public kind
 */
export function allKnownKindFourCCs(): number[] {
  return [...FOURCC_TO_KIND.keys()];
}

/**
 * Resolve a raw file_type integer back to a public kind enum, or null if
 * the file_type doesn't map to any of the kinds we expose.
 *
 * @param fileType - Raw file_type integer from the DB
 * @returns Public LibraryKind or null
 */
export function resolveKind(fileType: number): LibraryKind | null {
  return FOURCC_TO_KIND.get(fileType) ?? null;
}

/**
 * Resolve a Live clip's content subtype (MIDI vs audio) from its file_type and
 * subtype columns. Returns null for non-`.alc` rows or an unrecognized subtype.
 *
 * @param fileType - Raw file_type integer
 * @param subtype - Raw subtype integer (may be null)
 * @returns "midi" | "audio" | null
 */
export function resolveClipSubtype(
  fileType: number,
  subtype: number | null,
): "midi" | "audio" | null {
  if (fileType !== ALC_FILE_TYPE || subtype == null) {
    return null;
  }

  return ALC_SUBTYPE_TO_NAME.get(subtype) ?? null;
}

/** device_type encoding per LibraryDeviceKind */
const DEVICE_KIND_TO_TYPE: Record<LibraryDeviceKind, number> = {
  instrument: 1,
  audiofx: 2,
  midifx: 4,
};

/**
 * Map a public deviceKind enum to the integer Live stores in device_type.
 *
 * @param deviceKind - Public deviceKind enum
 * @returns Integer for device_type column
 */
export function deviceTypeForKind(deviceKind: LibraryDeviceKind): number {
  return DEVICE_KIND_TO_TYPE[deviceKind];
}

/**
 * places.folder_kind values that map to each DB-side source enum.
 * "sampleFolder" is not here — it's a V8-only synthetic source for the
 * user-configured custom sample folder, with no DB encoding.
 */
type DbLibrarySource = Exclude<LibrarySource, "sampleFolder">;

const SOURCE_TO_FOLDER_KINDS: Record<DbLibrarySource, number[]> = {
  user: [1, 2],
  pack: [0],
  builtin: [8],
  cloud: [9],
  plugin: [10],
};

const FOLDER_KIND_TO_SOURCE: Map<number, DbLibrarySource> = new Map();

for (const [src, kinds] of Object.entries(SOURCE_TO_FOLDER_KINDS) as Array<
  [DbLibrarySource, number[]]
>) {
  for (const k of kinds) {
    FOLDER_KIND_TO_SOURCE.set(k, src);
  }
}

/**
 * Map a public source enum to the folder_kind integers it covers.
 * Returns [] for "sampleFolder" (no DB encoding); callers should guard.
 *
 * @param source - Public source enum
 * @returns Array of folder_kind integers to IN-match
 */
export function folderKindsForSource(source: LibrarySource): number[] {
  return source === "sampleFolder" ? [] : SOURCE_TO_FOLDER_KINDS[source];
}

/**
 * Resolve a raw folder_kind back to a public source enum, or null when
 * the folder_kind doesn't map to one of our known categories.
 *
 * @param folderKind - Raw folder_kind from the DB
 * @returns Public source enum or null
 */
export function resolveSource(folderKind: number): LibrarySource | null {
  return FOLDER_KIND_TO_SOURCE.get(folderKind) ?? null;
}

/**
 * Live's "Type" keyword names per public LibraryItemType. A file may carry more
 * than one (e.g. a clip tagged both "One Shot" and "Loop" — ~0.2% of the
 * library); deriveItemType resolves that via TYPE_PRIORITY.
 */
const TYPE_KEYWORDS: Record<LibraryItemType, string[]> = {
  loop: ["Loop", "Looping"],
  oneshot: ["One Shot"],
  "impulse-response": ["Impulse Response"],
};

/**
 * Tie-break order when a file carries multiple Type tags. "loop" wins over
 * "oneshot": a clip that loops is usable as a loop regardless of an extra
 * one-shot tag.
 */
const TYPE_PRIORITY: LibraryItemType[] = [
  "loop",
  "oneshot",
  "impulse-response",
];

/**
 * Keyword names that identify a given item type, for tag-based filtering.
 *
 * @param type - Public item type
 * @returns Live keyword names to OR-match against the keywords table
 */
export function keywordsForType(type: LibraryItemType): string[] {
  return TYPE_KEYWORDS[type];
}

/**
 * Derive an item's playback type from its tag names, or null when none apply.
 *
 * @param tags - Tag names attached to the file
 * @returns Highest-priority matching LibraryItemType, or null
 */
export function deriveItemType(tags: string[]): LibraryItemType | null {
  const set = new Set(tags);

  for (const type of TYPE_PRIORITY) {
    if (TYPE_KEYWORDS[type].some((name) => set.has(name))) {
      return type;
    }
  }

  return null;
}
