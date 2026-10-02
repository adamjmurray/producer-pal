// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The release bundle embeds the remote script with the build plugin's reader,
// while tests and the dev installer use readRemoteScriptSource. Both must ship
// only Python sources, never local junk like .DS_Store.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readRemoteScriptSource } from "#src/mcp-server/rpc/remote-script/remote-script-source.ts";
import { readScriptSource } from "../../../../config/rolldown-plugin-embed-remote-script.mjs";

let scratchDir: string;

beforeEach(() => {
  scratchDir = mkdtempSync(join(tmpdir(), "ppal-embed-remote-script-"));
});

afterEach(() => {
  rmSync(scratchDir, { recursive: true, force: true });
});

describe("the embed plugin's reader", () => {
  it("takes only .py files, same as readRemoteScriptSource", () => {
    mkdirSync(join(scratchDir, "__pycache__"));
    mkdirSync(join(scratchDir, "nested"));
    writeFileSync(join(scratchDir, "__init__.py"), "top", "utf8");
    writeFileSync(join(scratchDir, ".DS_Store"), "finder", "utf8");
    writeFileSync(join(scratchDir, "._bridge.py"), "appledouble", "utf8");
    writeFileSync(join(scratchDir, "stale.pyc"), "bytecode", "utf8");
    writeFileSync(join(scratchDir, "__pycache__/a.pyc"), "bytecode", "utf8");
    writeFileSync(join(scratchDir, "nested/deep.py"), "deep", "utf8");
    writeFileSync(join(scratchDir, "nested/notes.txt"), "scratch", "utf8");

    const expected = { "__init__.py": "top", "nested/deep.py": "deep" };

    expect(readScriptSource(scratchDir)).toStrictEqual(expected);
    expect(readRemoteScriptSource(scratchDir)).toStrictEqual(expected);
  });
});
