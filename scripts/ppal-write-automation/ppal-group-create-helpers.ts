// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  backupAls,
  isSetLikelyOpen,
  readAls,
  writeAls,
} from "#src/automation/als-file.ts";
import {
  type GroupCreateSpec,
  getGroupTracks,
  injectGroupCreate,
  synthesizeGroupTrack,
} from "#src/automation/als-group-create.ts";
import { parseJsonFile, requireAlsCliPrelude } from "./shared-cli-helpers.ts";

/** Spy-Seam fuer Tests (open-set-Guard + Inject-Funktion stubbar). */
export const groupCreateInternals = { isSetLikelyOpen, injectGroupCreate };

/**
 * Den `group-create get|set`-Subcommand ausfuehren (offline byte-true
 * GroupTrack-von-Null-Synthese, set-global Pfad analog
 * `ppal-arrangement-loop-helpers.ts` — KEIN `runLeanTrackCli`, da set-global
 * strukturell). `set` braucht `--group-spec-file` (JSON-`GroupCreateSpec`,
 * keine geratenen Werte; leer/ungueltig → exit 1).
 * @param rest - Argument-Array ohne das `group-create`-Token.
 * @param parseFlags - Geteilte Flag-Parser-Funktion.
 * @returns Exit-Code: 0 Erfolg, 1 Fehler, 2 Open-Set-Guard.
 */
export function runGroupCreate(
  rest: string[],
  parseFlags: (argv: string[]) => Record<string, string>,
): number {
  const pre = requireAlsCliPrelude(rest, "group-create", parseFlags);

  if (pre == null) return 1;
  const { sub, flags, alsPath } = pre;

  if (sub === "get") {
    process.stdout.write(JSON.stringify(getGroupTracks(readAls(alsPath))));

    return 0;
  }

  return runSet(alsPath, flags["group-spec-file"]);
}

/**
 * Den `set`-Pfad ausfuehren: Spec laden+haerten, Open-Set-Guard,
 * `injectGroupCreate` (Throw → Fehler, kein Partial), backup + write,
 * wert-gebundenes Re-Parse-Verify.
 * @param alsPath - Pfad zur `.als`-Datei.
 * @param specPath - Roher `--group-spec-file`-Flag-Wert.
 * @returns Exit-Code: 0 Erfolg, 1 Fehler, 2 Open-Set-Guard.
 */
function runSet(alsPath: string, specPath: string | undefined): number {
  const spec = parseSpecFile(specPath);

  if (spec == null) {
    process.stderr.write(
      "FEHLER: --group-spec-file <JSON mit GroupCreateSpec> erforderlich\n",
    );

    return 1;
  }

  if (groupCreateInternals.isSetLikelyOpen()) {
    process.stderr.write(
      "Set scheint offen (Port 3350). Schliesse es in Ableton.\n",
    );

    return 2;
  }

  const xml = readAls(alsPath);
  let patched: string;

  try {
    patched = groupCreateInternals.injectGroupCreate(xml, spec);
  } catch (err) {
    process.stderr.write(
      `FEHLER: ${err instanceof Error ? err.message : String(err)}\n`,
    );

    return 1;
  }

  backupAls(alsPath);
  writeAls(alsPath, patched);

  return verify(alsPath, spec, xml);
}

/**
 * Wert-gebundenes Re-Parse-Verify (NICHT Tag-Existenz): zurueckgelesener
 * GroupTrack muss Id/Name/MemberIds/sendHolderCount == Soll haben, die
 * `<NextPointeeId>` == `nextPointeeId + 22 + 2R`, und kein Nicht-Member
 * darf seine `<TrackGroupId>` geaendert haben.
 * @param alsPath - Pfad zur geschriebenen `.als`-Datei.
 * @param spec - Die angewandte Spec.
 * @param before - Roher XML-String vor dem Write.
 * @returns Exit-Code: 0 verifiziert, 1 Mismatch.
 */
function verify(
  alsPath: string,
  spec: GroupCreateSpec,
  before: string,
): number {
  const now = readAls(alsPath);
  const { groupTracks } = getGroupTracks(now);
  const created = groupTracks.find((g) => g.id === spec.groupTrackId);
  // Einzige Quelle der Wahrheit fuer den NextPointeeId-Verbrauch ist
  // synthesizeGroupTrack (Stage-1-Review F1: vermeidet zweite Hartcodierung
  // der `22 + 2R`-Formel — falls die Template-Slots sich aendern, bleibt
  // verify deckungsgleich mit der Synthese).
  const wantNp = synthesizeGroupTrack(spec).nextId;
  const npMatch = /<NextPointeeId Value="(\d+)" \/>/.exec(now);
  const wantMembers = [...spec.memberTrackIds].sort((a, b) => a - b).join(",");
  const sortedAttached = [...(created?.memberTrackIds ?? [])]
    .sort((a, b) => a - b)
    .join(",");

  if (
    created?.name !== spec.groupName ||
    created.sendHolderCount !== spec.returnCount ||
    sortedAttached !== wantMembers ||
    npMatch == null ||
    Number(npMatch[1]) !== wantNp ||
    !nonMembersUnchanged(before, now, spec)
  ) {
    process.stderr.write("FEHLER: Re-Parse-Verify fehlgeschlagen\n");

    return 1;
  }

  process.stdout.write(JSON.stringify({ groupTracks, verified: true }));

  return 0;
}

/**
 * Pruefen, dass jeder Track der NICHT Member ist seine track-level
 * `<TrackGroupId>` unveraendert behaelt (Soll: nur die Member flippen).
 * @param before - Roher XML-String vor dem Write.
 * @param after - Roher XML-String nach dem Write.
 * @param spec - Die angewandte Spec.
 * @returns True iff alle Nicht-Member-TrackGroupIds gleich blieben.
 */
function nonMembersUnchanged(
  before: string,
  after: string,
  spec: GroupCreateSpec,
): boolean {
  const re = /<(MidiTrack|AudioTrack) Id="(\d+)"[^>]*>/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(before)) != null) {
    const id = Number(m[2]);

    if (spec.memberTrackIds.includes(id) || id === spec.groupTrackId) {
      continue;
    }

    if (trackGroupIdOf(before, id) !== trackGroupIdOf(after, id)) {
      return false;
    }
  }

  return true;
}

/**
 * Die track-level `<TrackGroupId>` eines Tracks per Id auslesen.
 * @param xml - Dekomprimierter .als-XML-String.
 * @param trackId - Track-Id.
 * @returns Der Wert-String, oder `null`/`undefined` falls Track/Tag fehlt.
 */
function trackGroupIdOf(
  xml: string,
  trackId: number,
): string | null | undefined {
  const open = new RegExp(`<(MidiTrack|AudioTrack) Id="${trackId}"[^>]*>`).exec(
    xml,
  );

  if (open == null) {
    return null;
  }

  const closeTag = `</${open[1]}>`;
  const closeAt = xml.indexOf(closeTag, open.index);
  const block = xml.slice(open.index, closeAt);
  const tg = /<TrackGroupId Value="(-?\d+)" \/>/.exec(block);

  if (tg == null) {
    return null;
  }

  const [, value] = tg;

  return value;
}

/**
 * `--group-spec-file` lesen und als `GroupCreateSpec` validieren.
 * Fehlend/JSON-Fehler/Typ-Verstoss → `null` (Caller exit 1). Tiefe
 * Wert-Haertung macht `injectGroupCreate` (Throw, kein Partial).
 * @param path - Roher `--group-spec-file`-Flag-Wert (oder undefined).
 * @returns Spec oder `null` bei fehlendem/ungueltigem Flag.
 */
function parseSpecFile(path: string | undefined): GroupCreateSpec | null {
  return parseJsonFile<GroupCreateSpec>(
    path,
    (data): data is GroupCreateSpec => {
      if (data == null || typeof data !== "object") return false;
      const r = data as Record<string, unknown>;
      const insertOk =
        r.insertAfterTrackId === null ||
        typeof r.insertAfterTrackId === "number";

      return (
        typeof r.groupTrackId === "number" &&
        typeof r.nextPointeeId === "number" &&
        typeof r.returnCount === "number" &&
        typeof r.groupName === "string" &&
        typeof r.color === "number" &&
        Array.isArray(r.memberTrackIds) &&
        r.memberTrackIds.every((x) => typeof x === "number") &&
        insertOk
      );
    },
  );
}
