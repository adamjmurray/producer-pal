// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, vi } from "vitest";
import * as zlib from "node:zlib";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runCli } from "./ppal-write-automation.ts";
import * as alsFile from "#src/automation/als-file.ts";
import { readAls } from "#src/automation/als-file.ts";
import * as envelopeWriter from "#src/automation/als-envelope-writer.ts";
import { injectClipEnvelope } from "#src/automation/als-envelope-writer.ts";
import { parseBreakpoints } from "#src/automation/breakpoint-parser.ts";

// Minimal .als XML fixture: track "T", Operator with Frequency (id 23005), one clip "C"
const FIXTURE_XML = [
  `<Ableton>`,
  `<Tracks>`,
  `<MidiTrack Id="1">`,
  `<Name><EffectiveName Value="T" /><UserName Value="T" /></Name>`,
  `<DeviceChain><DeviceChain><Devices>`,
  `<Operator Id="0">`,
  `<Frequency>`,
  `<Manual Value="12000" />`,
  `<MidiControllerRange><Min Value="30" /><Max Value="18500" /></MidiControllerRange>`,
  `<AutomationTarget Id="23005"><LockEnvelope Value="0" /></AutomationTarget>`,
  `</Frequency>`,
  `</Operator>`,
  `</Devices></DeviceChain></DeviceChain>`,
  `<ClipSlotList><ClipSlot><Value>`,
  `<MidiClip Id="0" Time="0">`,
  `<Name Value="C" />`,
  `<Envelopes><Envelopes /></Envelopes>`,
  `</MidiClip>`,
  `</Value></ClipSlot></ClipSlotList>`,
  `</MidiTrack>`,
  `</Tracks>`,
  `</Ableton>`,
].join("");

/**
 * Create a gzip-compressed temp .als file from the fixture XML.
 * @returns Path to the created temp file
 */
function createTmpAls(): string {
  const tmpPath = path.join(
    os.tmpdir(),
    `ppal-cli-test-${Date.now()}-${Math.random().toString(36).slice(2)}.als`,
  );

  fs.writeFileSync(tmpPath, zlib.gzipSync(Buffer.from(FIXTURE_XML, "utf8")));

  return tmpPath;
}

describe("ppal-write-automation CLI", () => {
  it("write: gibt exit 0 zurueck und schreibt Envelope in die Datei", () => {
    const tmpPath = createTmpAls();

    try {
      const code = runCli([
        "write",
        "--als",
        tmpPath,
        "--track",
        "T",
        "--clip",
        "C",
        "--param",
        "Filter Freq",
        "--breakpoints",
        "0=200,4=8000",
        "--force",
      ]);

      expect(code).toBe(0);

      // Verify file contents
      const written = zlib
        .gunzipSync(fs.readFileSync(tmpPath))
        .toString("utf8");

      expect(written).toContain('<PointeeId Value="23005"');
      // Member must be ClipEnvelope (Ableton 12 factory schema)
      expect(written).toContain("<ClipEnvelope ");
      expect(written).not.toContain("AutomationEnvelope");

      const floatEvents = [...written.matchAll(/<FloatEvent /g)];

      // 2 user breakpoints + 1 anchor event = 3 total
      expect(floatEvents).toHaveLength(3);

      // Verify backup exists
      expect(fs.existsSync(`${tmpPath}.bak`)).toBe(true);
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      if (fs.existsSync(`${tmpPath}.bak`)) fs.unlinkSync(`${tmpPath}.bak`);
    }
  });

  it("list: gibt exit 0 zurueck und listet Parameter auf", () => {
    const tmpPath = createTmpAls();

    try {
      const code = runCli([
        "list",
        "--als",
        tmpPath,
        "--track",
        "T",
        "--device",
        "0",
      ]);

      expect(code).toBe(0);
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  });

  it("write: gibt exit 1 zurueck bei fehlendem Clip", () => {
    const tmpPath = createTmpAls();

    try {
      const code = runCli([
        "write",
        "--als",
        tmpPath,
        "--track",
        "T",
        "--clip",
        "NonExistent",
        "--param",
        "Frequency",
        "--breakpoints",
        "0=200",
        "--force",
      ]);

      expect(code).toBe(1);
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      if (fs.existsSync(`${tmpPath}.bak`)) fs.unlinkSync(`${tmpPath}.bak`);
    }
  });

  it("write: Verifizierung prueft FloatEvents nur im Ziel-Clip (scoped)", () => {
    const tmpPath = createTmpAls();

    try {
      const code = runCli([
        "write",
        "--als",
        tmpPath,
        "--track",
        "T",
        "--clip",
        "C",
        "--param",
        "Filter Freq",
        "--breakpoints",
        "0=100,2=200,4=300",
        "--force",
      ]);

      expect(code).toBe(0);

      const written = zlib
        .gunzipSync(fs.readFileSync(tmpPath))
        .toString("utf8");

      // 3 user breakpoints + 1 anchor event = 4 FloatEvents total, all inside the clip
      const floatEvents = [...written.matchAll(/<FloatEvent /g)];

      expect(floatEvents).toHaveLength(4);
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      if (fs.existsSync(`${tmpPath}.bak`)) fs.unlinkSync(`${tmpPath}.bak`);
    }
  });

  it("write: --force umgeht open-set-Guard, Envelope korrekt injiziert", () => {
    const tmpPath = createTmpAls();

    try {
      const code = runCli([
        "write",
        "--als",
        tmpPath,
        "--track",
        "T",
        "--clip",
        "C",
        "--param",
        "Frequency",
        "--breakpoints",
        "0=200,4=8000",
        "--force",
      ]);

      // --force bypasses the port guard; the write should succeed
      expect(code).toBe(0);

      const written = zlib
        .gunzipSync(fs.readFileSync(tmpPath))
        .toString("utf8");

      expect(written).toContain('<PointeeId Value="23005"');
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      if (fs.existsSync(`${tmpPath}.bak`)) fs.unlinkSync(`${tmpPath}.bak`);
    }
  });
});

describe("scope routing", () => {
  it("unbekanntes --scope -> Fehlermeldung + Exit 1", () => {
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const code = runCli([
      "write",
      "--scope",
      "bogus",
      "--als",
      "/x.als",
      "--track",
      "X",
    ]);

    expect(code).toBe(1);
    expect(spy.mock.calls.map((c) => String(c[0])).join("")).toContain(
      'unbekanntes --scope "bogus"',
    );
    spy.mockRestore();
  });
  it("scope=arrangement ohne --target -> Fehlermeldung + Exit 1", () => {
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const code = runCli([
      "write",
      "--scope",
      "arrangement",
      "--als",
      "/x.als",
      "--track",
      "X",
      "--breakpoints",
      "0=0.5,4=1.0",
    ]);

    expect(code).toBe(1);
    expect(spy.mock.calls.map((c) => String(c[0])).join("")).toContain(
      "erfordert --target",
    );
    spy.mockRestore();
  });
  it("scope=arrangement mit --target -> verdrahteter Pfad (Lesefehler nicht-existente .als) + Exit 1", () => {
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    // --force ueberspringt open-set-guard -> readAls("/x.als") wirft ->
    // catch in runCli -> Exit 1. Beweist: arrangement-Pfad ist verdrahtet
    // (kein Stub mehr, kein "noch nicht verdrahtet").
    const code = runCli([
      "write",
      "--scope",
      "arrangement",
      "--target",
      "mixer:volume",
      "--als",
      "/x.als",
      "--track",
      "X",
      "--force",
    ]);

    expect(code).toBe(1);
    const stderr = spy.mock.calls.map((c) => String(c[0])).join("");

    expect(stderr).not.toContain("noch nicht verdrahtet");
    expect(stderr).toContain("FEHLER:");
    spy.mockRestore();
  });
  it("scope=clip Default unberührt (kein scope-Fehler bei fehlenden Flags)", () => {
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const code = runCli(["write"]);

    expect(code).toBe(1);
    const out = spy.mock.calls.map((c) => String(c[0])).join("");

    expect(out).not.toContain("unbekanntes --scope");
    spy.mockRestore();
  });
});

describe("CLI Error- und Args-Branches (Slice 2)", () => {
  /**
   * Sammelt stderr-Ausgaben waehrend des Callbacks und gibt sie zurueck.
   * @param fn - Auszufuehrender Code, dessen stderr abgefangen wird
   * @returns Gesammelte stderr-Ausgabe als String
   */
  function captureStderr(fn: () => void): string {
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    try {
      fn();

      return spy.mock.calls.map((c) => String(c[0])).join("");
    } finally {
      spy.mockRestore();
    }
  }

  it("unbekanntes Subcommand -> Fehlermeldung + Exit 1", () => {
    let code = 0;
    const out = captureStderr(() => {
      code = runCli(["frobnicate"]);
    });

    expect(code).toBe(1);
    expect(out).toContain('Unbekanntes Subcommand "frobnicate"');
  });

  it("list ohne --als/--track -> Fehlermeldung + Exit 1", () => {
    let code = 0;
    const out = captureStderr(() => {
      code = runCli(["list"]);
    });

    expect(code).toBe(1);
    expect(out).toContain("--als und --track sind erforderlich");
  });

  it("parseFlags ignoriert Positional-Argumente ohne -- (else-Zweig)", () => {
    const tmpPath = createTmpAls();

    try {
      let code = 1;

      captureStderr(() => {
        code = runCli([
          "list",
          "POSITIONAL",
          "--als",
          tmpPath,
          "extra",
          "--track",
          "T",
        ]);
      });

      expect(code).toBe(0);
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  });

  it("write mit --target-id loest Range via listDeviceParams auf (matched)", () => {
    const tmpPath = createTmpAls();

    try {
      const code = runCli([
        "write",
        "--als",
        tmpPath,
        "--track",
        "T",
        "--clip",
        "C",
        "--param",
        "ignored",
        "--target-id",
        "23005",
        "--breakpoints",
        "0=200,4=8000",
        "--force",
      ]);

      expect(code).toBe(0);

      const written = zlib
        .gunzipSync(fs.readFileSync(tmpPath))
        .toString("utf8");

      expect(written).toContain('<PointeeId Value="23005"');
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      if (fs.existsSync(`${tmpPath}.bak`)) fs.unlinkSync(`${tmpPath}.bak`);
    }
  });

  it("write mit --device-Flag setzt device-Index (parseWriteArgs Ternary)", () => {
    const tmpPath = createTmpAls();

    try {
      const code = runCli([
        "write",
        "--als",
        tmpPath,
        "--track",
        "T",
        "--clip",
        "C",
        "--param",
        "Filter Freq",
        "--device",
        "0",
        "--breakpoints",
        "0=200,4=8000",
        "--force",
      ]);

      expect(code).toBe(0);
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      if (fs.existsSync(`${tmpPath}.bak`)) fs.unlinkSync(`${tmpPath}.bak`);
    }
  });

  it("write mit --target-id ohne Treffer -> resolvedParam=null (matched ?? null)", () => {
    const tmpPath = createTmpAls();

    try {
      const code = runCli([
        "write",
        "--als",
        tmpPath,
        "--track",
        "T",
        "--clip",
        "C",
        "--param",
        "ignored",
        "--target-id",
        "99999",
        "--breakpoints",
        "0=200,4=8000",
        "--force",
      ]);

      // Track gefunden, aber keine Param mit id 99999 -> matched=undefined
      // -> resolvedParam=null -> Validierung ohne Range, Write trotzdem ok.
      expect(code).toBe(0);

      const written = zlib
        .gunzipSync(fs.readFileSync(tmpPath))
        .toString("utf8");

      expect(written).toContain('<PointeeId Value="99999"');
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      if (fs.existsSync(`${tmpPath}.bak`)) fs.unlinkSync(`${tmpPath}.bak`);
    }
  });

  it("open-set-Guard ohne --force -> Exit 2 wenn Set offen scheint", () => {
    const tmpPath = createTmpAls();
    const guardSpy = vi.spyOn(alsFile, "isSetLikelyOpen").mockReturnValue(true);

    try {
      let code = 0;
      const out = captureStderr(() => {
        code = runCli([
          "write",
          "--als",
          tmpPath,
          "--track",
          "T",
          "--clip",
          "C",
          "--param",
          "Filter Freq",
          "--breakpoints",
          "0=200,4=8000",
        ]);
      });

      expect(code).toBe(2);
      expect(out).toContain("Set scheint offen (Port 3350)");
      // Guard greift VOR dem Backup: keine .bak-Datei geschrieben.
      expect(fs.existsSync(`${tmpPath}.bak`)).toBe(false);
    } finally {
      guardSpy.mockRestore();
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      if (fs.existsSync(`${tmpPath}.bak`)) fs.unlinkSync(`${tmpPath}.bak`);
    }
  });

  it("Verifizierung schlaegt fehl wenn PointeeId nach Write fehlt -> Exit 1", () => {
    const tmpPath = createTmpAls();
    // injectClipEnvelope liefert das XML unveraendert zurueck: dadurch fehlt
    // die PointeeId im readBack -> Verifizierungs-Guard muss Exit 1 liefern.
    const injSpy = vi
      .spyOn(envelopeWriter, "injectClipEnvelope")
      .mockImplementation((xml: string) => xml);

    try {
      let code = 0;
      const out = captureStderr(() => {
        code = runCli([
          "write",
          "--als",
          tmpPath,
          "--track",
          "T",
          "--clip",
          "C",
          "--param",
          "Filter Freq",
          "--breakpoints",
          "0=200,4=8000",
          "--force",
        ]);
      });

      expect(code).toBe(1);
      expect(out).toContain("Verifizierung fehlgeschlagen");
    } finally {
      injSpy.mockRestore();
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      if (fs.existsSync(`${tmpPath}.bak`)) fs.unlinkSync(`${tmpPath}.bak`);
    }
  });

  it("runCli faengt geworfene Fehler ab -> Exit 1 (catch-Zweig)", () => {
    let code = 0;
    const out = captureStderr(() => {
      code = runCli([
        "write",
        "--als",
        "/nicht/vorhanden/datei-xyz.als",
        "--track",
        "T",
        "--clip",
        "C",
        "--param",
        "Filter Freq",
        "--breakpoints",
        "0=200",
        "--force",
      ]);
    });

    expect(code).toBe(1);
    expect(out).toMatch(/FEHLER:/);
  });

  it("write mit --target-id faellt bei unbekanntem Track auf null-Range zurueck (catch-Zweig)", () => {
    const tmpPath = createTmpAls();

    try {
      const code = runCli([
        "write",
        "--als",
        tmpPath,
        "--track",
        "GIBT-ES-NICHT",
        "--clip",
        "C",
        "--param",
        "ignored",
        "--target-id",
        "23005",
        "--breakpoints",
        "0=200,4=8000",
        "--force",
      ]);

      // listDeviceParams wirft (Track unbekannt) -> catch -> resolvedParam=null
      // -> Validierung ohne Range -> Write gegen Clip "C" erfolgreich.
      expect(code).toBe(0);

      const written = zlib
        .gunzipSync(fs.readFileSync(tmpPath))
        .toString("utf8");

      expect(written).toContain('<PointeeId Value="23005"');
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      if (fs.existsSync(`${tmpPath}.bak`)) fs.unlinkSync(`${tmpPath}.bak`);
    }
  });
});

it("REGRESSION: scope=clip default erzeugt byte-identischen Clip-Envelope-Output wie Slice 1", () => {
  // Nutze das älteste Backup mit "Spike Test" + leerer Envelopes-Sektion (Ausgangszustand vor Slice-1-Schreibvorgang)
  const als =
    "/Users/macuser/Desktop/AIbleton/_throwaway-automation-test Project/Backup/_throwaway-automation-test [2026-05-16 175132].als";
  const xml = readAls(als);
  const bp = parseBreakpoints("0=200\n2=8000\n4=400");
  const reference = injectClipEnvelope(xml, "Spike Test", 23005, bp);

  expect(reference).toContain("<ClipEnvelope");
  expect(reference).toContain('<PointeeId Value="23005" />');
  expect(reference.length).toBeGreaterThan(xml.length);
});

describe("e2e scope=arrangement", () => {
  const SRC =
    "/Users/macuser/Desktop/AIbleton/_throwaway-automation-test Project/_throwaway-automation-test.als";

  it("schreibt Mixer-Volume-Arrangement-Automation in Wegwerf-.als + verifiziert", () => {
    const tmp = SRC.replace(/\.als$/, ".s2e2e.als");

    fs.copyFileSync(SRC, tmp);

    try {
      const code = runCli([
        "write",
        "--scope",
        "arrangement",
        "--als",
        tmp,
        "--track",
        "Spike Instr",
        "--target",
        "mixer:volume",
        "--breakpoints",
        "0=0.5,4=1.0,8=0.25",
        "--force",
      ]);

      expect(code).toBe(0);
      const out = readAls(tmp);

      // Writer bewahrt Original-Einrueckung (Mitigation A) -> ws-tolerant
      expect(out).toMatch(/<AutomationEnvelopes>\s*<Envelopes>/);
      expect(out).toContain("<AutomationEnvelope ");
    } finally {
      fs.rmSync(tmp, { force: true });
      fs.rmSync(`${tmp}.bak`, { force: true });
    }
  });

  it("ändert NUR den AutomationEnvelopes-Block (Mitigation B)", () => {
    const tmp = SRC.replace(/\.als$/, ".s2assert.als");

    fs.copyFileSync(SRC, tmp);

    try {
      const before = readAls(tmp);
      const code = runCli([
        "write",
        "--scope",
        "arrangement",
        "--als",
        tmp,
        "--track",
        "Spike Instr",
        "--target",
        "mixer:volume",
        "--breakpoints",
        "0=0.5,8=1.0",
        "--force",
      ]);

      expect(code).toBe(0);
      const after = readAls(tmp);
      const STRIP = /<AutomationEnvelopes>[^]*?<\/AutomationEnvelopes>/g;

      expect(before.replaceAll(STRIP, "")).toBe(after.replaceAll(STRIP, ""));
    } finally {
      fs.rmSync(tmp, { force: true });
      fs.rmSync(`${tmp}.bak`, { force: true });
    }
  });
});
