// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readAls } from "#src/automation/als-file.ts";
import { getGroupTracks } from "#src/automation/als-group-create.ts";
import { parseFlags } from "../clip-patch-cli.ts";
import {
  groupCreateInternals,
  runGroupCreate,
} from "../ppal-group-create-helpers.ts";

const SRC = "e2e/live-sets/grp0-base Project/grp0-base.als";

/**
 * Das grp0-base-Set in ein frisches Temp-Verzeichnis kopieren.
 * @returns Pfad zur isolierten `.als`-Arbeitskopie.
 */
function tmpCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "ppal-grpcreate-"));
  const dst = join(dir, "set.als");

  copyFileSync(SRC, dst);

  return dst;
}

/**
 * Eine GroupCreate-Spec-JSON-Datei in ein Temp-Verzeichnis schreiben.
 * @param spec - Zu serialisierendes Spec-Objekt (beliebig getypt fuer
 *   Negativfaelle).
 * @returns Pfad zur geschriebenen JSON-Datei.
 */
function specFile(spec: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "ppal-grpspec-"));
  const dst = join(dir, "spec.json");

  writeFileSync(dst, JSON.stringify(spec));

  return dst;
}

const validSpec = {
  groupTrackId: 16,
  nextPointeeId: 22346,
  returnCount: 0,
  groupName: "2-Group",
  color: 6,
  memberTrackIds: [13, 8],
  insertAfterTrackId: 12,
};

/**
 * `runGroupCreate` mit unterdruecktem stdout/stderr ausfuehren.
 * @param argv - Argument-Array ohne das `group-create`-Token.
 * @returns `{ code, out }`.
 */
function run(argv: string[]): { code: number; out: string } {
  let out = "";
  const w = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((c: string | Uint8Array) => {
      out += String(c);

      return true;
    });
  const e = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  const code = runGroupCreate(argv, parseFlags);

  w.mockRestore();
  e.mockRestore();

  return { code, out };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runGroupCreate guards", () => {
  it("exit 1 on missing subcommand", () => {
    expect(run([]).code).toBe(1);
  });

  it("exit 1 on unknown subcommand", () => {
    expect(run(["foo", "--als", "x"]).code).toBe(1);
  });

  it("exit 1 on missing --als", () => {
    expect(run(["get"]).code).toBe(1);
  });

  it("exit 1 on missing --group-spec-file (set)", () => {
    expect(run(["set", "--als", tmpCopy()]).code).toBe(1);
  });

  it("exit 1 on --group-spec-file without value", () => {
    expect(run(["set", "--als", tmpCopy(), "--group-spec-file"]).code).toBe(1);
  });

  it("exit 1 on unparseable spec JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "ppal-grpspec-"));
    const bad = join(dir, "bad.json");

    writeFileSync(bad, "{not json");
    expect(
      run(["set", "--als", tmpCopy(), "--group-spec-file", bad]).code,
    ).toBe(1);
  });

  it("exit 1 on spec with wrong field types", () => {
    const f = specFile({ ...validSpec, memberTrackIds: "13,8" });

    expect(run(["set", "--als", tmpCopy(), "--group-spec-file", f]).code).toBe(
      1,
    );
  });

  it("exit 1 on spec that is not an object", () => {
    expect(
      run(["set", "--als", tmpCopy(), "--group-spec-file", specFile(42)]).code,
    ).toBe(1);
  });

  it("accepts insertAfterTrackId null", () => {
    const f = specFile({ ...validSpec, insertAfterTrackId: null });

    expect(run(["set", "--als", tmpCopy(), "--group-spec-file", f]).code).toBe(
      0,
    );
  });

  it("exit 2 when set likely open", () => {
    vi.spyOn(groupCreateInternals, "isSetLikelyOpen").mockReturnValue(true);
    const f = specFile(validSpec);

    expect(run(["set", "--als", tmpCopy(), "--group-spec-file", f]).code).toBe(
      2,
    );
  });

  it("exit 1 when injectGroupCreate throws (precondition)", () => {
    const f = specFile({ ...validSpec, returnCount: 5 });

    expect(run(["set", "--als", tmpCopy(), "--group-spec-file", f]).code).toBe(
      1,
    );
  });
});

describe("runGroupCreate get/set", () => {
  it("get returns empty groupTracks for base set", () => {
    const { code, out } = run(["get", "--als", tmpCopy()]);

    expect(code).toBe(0);
    expect(JSON.parse(out)).toStrictEqual({ groupTracks: [] });
  });

  it("set creates the GroupTrack and verifies (value-bound)", () => {
    const als = tmpCopy();
    const { code, out } = run([
      "set",
      "--als",
      als,
      "--group-spec-file",
      specFile(validSpec),
    ]);

    expect(code).toBe(0);
    expect(JSON.parse(out).verified).toBe(true);

    const { groupTracks } = getGroupTracks(readAls(als));

    expect(groupTracks).toStrictEqual([
      { id: 16, name: "2-Group", memberTrackIds: [13, 8], sendHolderCount: 0 },
    ]);
  });

  it("get round-trips a set GroupTrack from disk", () => {
    const als = tmpCopy();

    run(["set", "--als", als, "--group-spec-file", specFile(validSpec)]);
    const { out } = run(["get", "--als", als]);

    expect(JSON.parse(out).groupTracks[0].id).toBe(16);
  });
});

describe("runGroupCreate verify catches a mismatch (spy seam)", () => {
  it("exit 1 when injected output does not match the spec", () => {
    const stub = vi
      .spyOn(groupCreateInternals, "injectGroupCreate")
      .mockImplementation((xml: string) => xml);
    const { code } = run([
      "set",
      "--als",
      tmpCopy(),
      "--group-spec-file",
      specFile(validSpec),
    ]);

    expect(code).toBe(1);
    expect(stub).toHaveBeenCalledOnce();
  });
});
