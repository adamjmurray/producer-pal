// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installStatusLines } from "./install-status-report.ts";

let root: string;
let library: string;
let release: string;

function write(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "install-status-"));
  library = join(root, "User Library");
  release = join(root, "release/Producer_Pal.amxd");
  mkdirSync(library);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("installStatusLines", () => {
  it("reports an empty library", () => {
    const text = installStatusLines(library, release).join("\n");

    expect(text).toContain("Device: not installed");
    expect(text).toContain("Remote script: not installed");
    expect(text).not.toContain("leftovers");
  });

  it("reports versions, build commit, other copies and leftovers", () => {
    write(release, 'const VERSION = "2.0.0"');
    write(
      join(library, "Presets/MIDI Effects/Max MIDI Effect/Producer_Pal.amxd"),
      'const VERSION = "1.0.0"',
    );
    write(join(library, "Presets/Mine/Producer_Pal 2.amxd"), "x");
    write(
      join(library, "Remote Scripts/Producer_Pal/BUILD_COMMIT"),
      "abc123\n",
    );
    write(
      join(
        library,
        "Remote Scripts/Producer_Pal.tmp-11111111-2222-3333-4444-555555555555/x",
      ),
      "x",
    );

    const text = installStatusLines(library, release).join("\n");

    expect(text).toContain("version 1.0.0, older than the release build");
    expect(text).toContain("Other Producer_Pal .amxd copies (1)");
    expect(text).toContain("(build abc123)");
    expect(text).toContain("leftovers (1)");
  });

  it("says when there is no release build to compare", () => {
    write(
      join(library, "Presets/MIDI Effects/Max MIDI Effect/Producer_Pal.amxd"),
      "x",
    );

    expect(installStatusLines(library, release).join("\n")).toContain(
      "version unknown, no release build to compare",
    );
  });
});
