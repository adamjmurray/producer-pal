// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import * as zlib from "node:zlib";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runCli } from "./ppal-write-automation.ts";

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
        "--als", tmpPath,
        "--track", "T",
        "--clip", "C",
        "--param", "Filter Freq",
        "--breakpoints", "0=200,4=8000",
        "--force",
      ]);

      expect(code).toBe(0);

      // Verify file contents
      const written = zlib.gunzipSync(fs.readFileSync(tmpPath)).toString("utf8");

      expect(written).toContain('<PointeeId Value="23005"');

      const floatEvents = [...written.matchAll(/<FloatEvent /g)];

      expect(floatEvents).toHaveLength(2);

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
        "--als", tmpPath,
        "--track", "T",
        "--device", "0",
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
        "--als", tmpPath,
        "--track", "T",
        "--clip", "NonExistent",
        "--param", "Frequency",
        "--breakpoints", "0=200",
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
        "--als", tmpPath,
        "--track", "T",
        "--clip", "C",
        "--param", "Filter Freq",
        "--breakpoints", "0=100,2=200,4=300",
        "--force",
      ]);

      expect(code).toBe(0);

      const written = zlib.gunzipSync(fs.readFileSync(tmpPath)).toString("utf8");

      // 3 breakpoints → 3 FloatEvents, all inside the clip
      const floatEvents = [...written.matchAll(/<FloatEvent /g)];

      expect(floatEvents).toHaveLength(3);
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
        "--als", tmpPath,
        "--track", "T",
        "--clip", "C",
        "--param", "Frequency",
        "--breakpoints", "0=200,4=8000",
        "--force",
      ]);

      // --force bypasses the port guard; the write should succeed
      expect(code).toBe(0);

      const written = zlib.gunzipSync(fs.readFileSync(tmpPath)).toString("utf8");

      expect(written).toContain('<PointeeId Value="23005"');
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      if (fs.existsSync(`${tmpPath}.bak`)) fs.unlinkSync(`${tmpPath}.bak`);
    }
  });
});
