// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The release bundle embeds the remote script with the build plugin's reader,
// while tests and the dev installer use readRemoteScriptSource. Both must ship
// only Python sources, never local junk like .DS_Store.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PY_ONLY_SOURCE,
  writeScriptTreeWithJunk,
} from "#src/mcp-server/rpc/remote-script/tests/remote-script-test-helpers.ts";
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
    writeScriptTreeWithJunk(scratchDir);
    writeFileSync(join(scratchDir, "._bridge.py"), "appledouble", "utf8");

    expect(readScriptSource(scratchDir)).toStrictEqual(PY_ONLY_SOURCE);
    expect(readRemoteScriptSource(scratchDir)).toStrictEqual(PY_ONLY_SOURCE);
  });
});
