// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readAls } from "../../../examples/skills/ableton-read-als/read-als.mjs";

const SCRIPT = fileURLToPath(
  new URL(
    "../../../examples/skills/ableton-read-als/read-als.mjs",
    import.meta.url,
  ),
);

// chmod can't lock root out, and Windows ignores it.
const canLockFolders = process.platform !== "win32" && process.getuid?.() !== 0;

interface SetSummary {
  liveVersion: string;
  tempo: number;
  timeSignature: string;
  scale: string;
  mainTrack: { name: string; type: string };
}

interface CliEntry {
  file: string;
  name?: string;
  error?: string;
}

/**
 * A minimal Set. Live 12 names the master track MainTrack and writes the scale
 * as Root plus an index; Live 11 writes MasterTrack, RootNote and a name.
 * @param version - Live major version to imitate
 * @param scaleXml - Replaces the version's ScaleInformation contents; null
 *   leaves the element out
 * @returns The Set's XML
 */
function setXml(version: 11 | 12, scaleXml?: string | null): string {
  const [trackTag, trackName, defaultScale] =
    version === 12
      ? ["MainTrack", "Main", '<Root Value="9"/><Name Value="1"/>']
      : ["MasterTrack", "Master", '<RootNote Value="9"/><Name Value="Minor"/>'];
  const scale = scaleXml === undefined ? defaultScale : scaleXml;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Ableton Creator="Ableton Live ${version}.0">
  <LiveSet>
    <Tracks />
    <${trackTag}>
      <Name><EffectiveName Value="${trackName}" /></Name>
      <DeviceChain>
        <Mixer>
          <Tempo><Manual Value="97" /><AutomationTarget Id="8" /></Tempo>
          <TimeSignature><Manual Value="201" /><AutomationTarget Id="10" /></TimeSignature>
        </Mixer>
        <DeviceChain><Devices /></DeviceChain>
      </DeviceChain>
    </${trackTag}>
    ${scale == null ? "" : `<ScaleInformation>${scale}</ScaleInformation>`}
  </LiveSet>
</Ableton>`;
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "read-als-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/**
 * Write a gzipped Set into the temp folder.
 * @param relative - Path under the temp folder
 * @param version - Live major version to imitate
 * @param scaleXml - See setXml
 * @returns The Set's absolute path
 */
function writeSet(
  relative: string,
  version: 11 | 12 = 12,
  scaleXml?: string | null,
): string {
  const file = path.join(dir, relative);

  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, gzipSync(setXml(version, scaleXml)));

  return file;
}

/**
 * Run the CLI on some paths.
 * @param paths - Files or folders to read
 * @returns Exit status and the parsed JSON array
 */
function runCli(paths: string[]): { status: number | null; sets: CliEntry[] } {
  const run = spawnSync(process.execPath, [SCRIPT, ...paths, "--compact"], {
    encoding: "utf8",
  });
  const sets = run.stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as CliEntry);

  return { status: run.status, sets };
}

describe("readAls", () => {
  it.each([11, 12] as const)("reads a Live %i Set's main track", (version) => {
    const set = readAls(writeSet("song.als", version)) as SetSummary;

    expect(set.liveVersion).toBe(`Ableton Live ${version}.0`);
    expect(set.mainTrack).toStrictEqual(
      expect.objectContaining({
        name: version === 12 ? "Main" : "Master",
        type: "main",
      }),
    );
    expect(set.tempo).toBe(97);
    expect(set.timeSignature).toBe("4/4");
    expect(set.scale).toBe("A Minor");
  });

  it.each([
    ["an empty scale name", '<RootNote Value="0"/><Name Value=""/>'],
    ["no scale", null],
  ])("leaves out the scale when an older Set has %s", (_, scaleXml) => {
    const set = readAls(writeSet("old.als", 11, scaleXml)) as SetSummary;

    expect(set.scale).toBeUndefined();
    expect(set.mainTrack.type).toBe("main");
  });
});

describe("read-als CLI", () => {
  it("reports a missing path and carries on", () => {
    const good = writeSet("song.als");
    const missing = path.join(dir, "no-such-folder");
    const { status, sets } = runCli([missing, good]);

    expect(status).toBe(0);
    expect(sets).toHaveLength(2);
    expect(sets[0]).toStrictEqual({
      file: missing,
      error: expect.stringContaining("ENOENT"),
    });
    expect(sets[1]).toStrictEqual(
      expect.objectContaining({ file: good, name: "song" }),
    );
  });

  it.skipIf(process.platform === "win32")(
    "reports a broken symlink and carries on",
    () => {
      const good = writeSet("song.als");
      const broken = path.join(dir, "broken.als");

      symlinkSync(path.join(dir, "gone.als"), broken);
      // Not a Set, so not worth an entry.
      symlinkSync(path.join(dir, "gone.wav"), path.join(dir, "kick.wav"));
      const { status, sets } = runCli([dir]);

      expect(status).toBe(0);
      expect(sets.map((s) => [s.file, s.error != null])).toStrictEqual([
        [broken, true],
        [good, false],
      ]);
    },
  );

  it.skipIf(process.platform === "win32")(
    "walks a folder that links to itself once",
    () => {
      const good = writeSet("song.als");

      symlinkSync(dir, path.join(dir, "loop"));
      const { status, sets } = runCli([dir]);

      expect(status).toBe(0);
      expect(sets.map((s) => [s.file, s.error])).toStrictEqual([
        [good, undefined],
      ]);
    },
  );

  it.skipIf(!canLockFolders)(
    "reports a folder it can't open and reads the rest",
    () => {
      const good = writeSet("a.als");
      const locked = path.join(dir, "locked");

      writeSet("locked/hidden.als");
      chmodSync(locked, 0o000);

      try {
        const { status, sets } = runCli([dir]);

        expect(status).toBe(0);
        expect(sets).toHaveLength(2);
        expect(sets[0]).toStrictEqual(
          expect.objectContaining({ file: good, name: "a" }),
        );
        expect(sets[1]).toStrictEqual({
          file: locked,
          error: expect.stringContaining("EACCES"),
        });
      } finally {
        chmodSync(locked, 0o700);
      }
    },
  );
});
