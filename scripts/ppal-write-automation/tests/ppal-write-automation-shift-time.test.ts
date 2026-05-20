// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readAls } from "#src/automation/als-file.ts";
import { locateTrackBlock } from "#src/automation/als-param-resolver.ts";
import { getArrangementClips } from "#src/automation/als-shift-time.ts";
import {
  runShiftTime,
  shiftTimeInternals,
} from "../ppal-shift-time-helpers.ts";
import { parseFlags } from "../clip-patch-cli.ts";

const SRC = "e2e/live-sets/e2e-test-set Project/e2e-test-set.als";
const ACT_SRC =
  "e2e/live-sets/arrangement-clip-tests Project/arrangement-clip-tests.als";
const TRACK = "Lead"; // 1 Arr-Clip Time=32 (Recon-Ground-Truth)
// C1: AudioTrack OHNE <ClipTimeable> mit Arr-Clip Id=1 Time=0 (spanEnd=8).
const AUDIO_TRACK = "1. Audio - Looped";

/**
 * Ein echtes Test-Set in ein frisches Temp-Verzeichnis kopieren.
 * @param src - Quell-`.als` (Default: e2e-test-set).
 * @returns Pfad zur isolierten `.als`-Arbeitskopie.
 */
function tmpCopy(src = SRC): string {
  const dir = mkdtempSync(join(tmpdir(), "ppal-shift-"));
  const dst = join(dir, "set.als");

  copyFileSync(src, dst);

  return dst;
}

/**
 * stdout fuer den Aufruf abfangen.
 * @param fn - Auszufuehrender Aufruf, liefert den Exit-Code.
 * @returns Exit-Code + gesammelte stdout-Payload.
 */
function captureOut(fn: () => number): { code: number; out: string } {
  let out = "";
  const w = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      out += String(chunk);

      return true;
    });

  try {
    return { code: fn(), out };
  } finally {
    w.mockRestore();
  }
}

/**
 * stderr stummschalten (Guard-Pfade schreiben FEHLER-Zeilen).
 * @returns Restore-Funktion fuer den Spy.
 */
function muteErr(): () => void {
  const w = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

  return () => w.mockRestore();
}

beforeEach(() => {
  // Default: Open-Set-Guard auf "closed", damit Tests robust gegen ein lokal
  // laufendes Producer-Pal auf Port 3350 sind. Tests, die exit 2 erwarten,
  // ueberschreiben das via eigenem vi.spyOn(...).mockReturnValue(true).
  vi.spyOn(shiftTimeInternals, "isSetLikelyOpen").mockReturnValue(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runShiftTime get", () => {
  it("liefert die Arr-Clips als JSON (exit 0)", () => {
    const f = tmpCopy();
    const r = captureOut(() =>
      runShiftTime(["get", "--als", f, "--track", TRACK], parseFlags),
    );

    expect(r.code).toBe(0);

    const json = JSON.parse(r.out) as {
      track: string;
      clips: { id: string; time: string }[];
    };

    expect(json.track).toBe(TRACK);
    expect(json.clips).toHaveLength(1);
    expect(json.clips[0]?.time).toBe("32");
  });
});

describe("runShiftTime Flag-/Guard-Exit-Codes", () => {
  it("exit 1 bei fehlendem --track", () => {
    const restore = muteErr();
    const code = runShiftTime(["get", "--als", SRC], parseFlags);

    restore();
    expect(code).toBe(1);
  });

  it("exit 1 bei set ohne --from-beat/--delta", () => {
    const restore = muteErr();
    const code = runShiftTime(
      ["set", "--als", tmpCopy(), "--track", TRACK],
      parseFlags,
    );

    restore();
    expect(code).toBe(1);
  });

  it("exit 1 bei spanning-Clip", () => {
    const restore = muteErr();
    const code = runShiftTime(
      [
        "set",
        "--als",
        tmpCopy(ACT_SRC),
        "--track",
        "1. MIDI - Looped",
        "--from-beat",
        "2",
        "--delta",
        "4",
      ],
      parseFlags,
    );

    restore();
    expect(code).toBe(1);
  });

  it("exit 1 bei negativ-unter-0", () => {
    const restore = muteErr();
    const code = runShiftTime(
      [
        "set",
        "--als",
        tmpCopy(),
        "--track",
        TRACK,
        "--from-beat",
        "0",
        "--delta",
        "-40",
      ],
      parseFlags,
    );

    restore();
    expect(code).toBe(1);
  });

  it("exit 2 bei offenem Set ohne --force (Spy-Seam)", () => {
    const spy = vi
      .spyOn(shiftTimeInternals, "isSetLikelyOpen")
      .mockReturnValue(true);
    const restore = muteErr();
    const code = runShiftTime(
      [
        "set",
        "--als",
        tmpCopy(),
        "--track",
        TRACK,
        "--from-beat",
        "0",
        "--delta",
        "8",
      ],
      parseFlags,
    );

    restore();
    spy.mockRestore();
    expect(code).toBe(2);
  });

  it("exit 1 bei wert-gebundenem Verify-Mismatch (Spy verfaelscht Output)", () => {
    const f = tmpCopy();
    const real = shiftTimeInternals.shiftTrackArrangementClips;
    const spy = vi
      .spyOn(shiftTimeInternals, "shiftTrackArrangementClips")
      .mockImplementation((b: string, from: number, d: number) => {
        // Korrekt verschieben, aber eine FALSCHE shifted-Erwartung erzeugen,
        // indem der geschriebene Time-Wert vom erwarteten abweicht.
        const res = real(b, from, d);

        return {
          block: res.block.replace('Time="40"', 'Time="999"'),
          shifted: res.shifted,
        };
      });
    const restore = muteErr();
    const code = runShiftTime(
      ["set", "--als", f, "--track", TRACK, "--from-beat", "0", "--delta", "8"],
      parseFlags,
    );

    restore();
    spy.mockRestore();
    expect(code).toBe(1);
  });
});

describe("runShiftTime set success + Byte-Disziplin", () => {
  it("verschiebt den Arr-Clip, exit 0, verified:true, Re-Parse stimmt", () => {
    const f = tmpCopy();
    const before = readAls(f);
    const r = captureOut(() =>
      runShiftTime(
        [
          "set",
          "--als",
          f,
          "--track",
          TRACK,
          "--from-beat",
          "0",
          "--delta",
          "8",
        ],
        parseFlags,
      ),
    );

    expect(r.code).toBe(0);

    const json = JSON.parse(r.out) as {
      track: string;
      shifted: number;
      verified: boolean;
    };

    expect(json.shifted).toBe(1);
    expect(json.verified).toBe(true);

    const after = readAls(f);
    const t = locateTrackBlock(after, TRACK);

    expect(getArrangementClips(t.block)[0]?.time).toBe("40");

    // Voll-XML: NUR das [t.index, t.index+len)-Fenster darf differieren.
    const tBefore = locateTrackBlock(before, TRACK);

    expect(after.slice(0, tBefore.index)).toBe(before.slice(0, tBefore.index));
    expect(after.slice(tBefore.end)).toBe(before.slice(tBefore.end));
  });

  it("verschiebt einen echten AudioTrack-Clip (C1, set-Roundtrip)", () => {
    // AudioTrack hat KEIN <ClipTimeable>: vor dem Fix lieferte
    // getArrangementClips [] -> falscher exit-0/verified:true ohne Mutation.
    const f = tmpCopy(ACT_SRC);
    const before = readAls(f);
    const r = captureOut(() =>
      runShiftTime(
        [
          "set",
          "--als",
          f,
          "--track",
          AUDIO_TRACK,
          "--from-beat",
          "0",
          "--delta",
          "8",
        ],
        parseFlags,
      ),
    );

    expect(r.code).toBe(0);

    const json = JSON.parse(r.out) as { shifted: number; verified: boolean };

    expect(json.shifted).toBe(1);
    expect(json.verified).toBe(true);

    const after = readAls(f);
    const t = locateTrackBlock(after, AUDIO_TRACK);

    // Time tatsaechlich geaendert 0 -> 8 (nicht still no-op).
    expect(getArrangementClips(t.block)[0]?.time).toBe("8");
    expect(after).not.toBe(before);

    // Nur das Ziel-Track-Fenster differiert.
    const tBefore = locateTrackBlock(before, AUDIO_TRACK);

    expect(after.slice(0, tBefore.index)).toBe(before.slice(0, tBefore.index));
    expect(after.slice(tBefore.end)).toBe(before.slice(tBefore.end));
  });

  it("ist deterministisch (Doppellauf gleiche Bytes)", () => {
    const f1 = tmpCopy();
    const f2 = tmpCopy();

    for (const f of [f1, f2]) {
      const restore = muteErr();

      runShiftTime(
        [
          "set",
          "--als",
          f,
          "--track",
          TRACK,
          "--from-beat",
          "0",
          "--delta",
          "8",
        ],
        parseFlags,
      );
      restore();
    }

    expect(readAls(f1)).toBe(readAls(f2));
  });
});
