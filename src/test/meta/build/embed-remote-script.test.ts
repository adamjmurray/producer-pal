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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GEN_UI_REMOTE_SCRIPT_FILES } from "#src/mcp-server/rpc/remote-script/bundle/gen-ui-remote-script-files.ts";
import { projectRoot } from "#src/test/helpers/meta-test-helpers.ts";
import {
  PY_ONLY_SOURCE,
  writeScriptTreeWithJunk,
} from "#src/mcp-server/rpc/remote-script/tests/remote-script-test-helpers.ts";
import { readRemoteScriptSource } from "#src/mcp-server/rpc/remote-script/bundle/remote-script-source.ts";
import {
  embedRemoteScript,
  readScriptSource,
} from "../../../../config/rolldown-plugin-embed-remote-script.mjs";

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

describe("the embed plugin and the gen-UI files", () => {
  const EMBEDDED_MODULE = join(
    projectRoot,
    "src/mcp-server/rpc/remote-script/bundle/embedded-remote-script.ts",
  );

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** @returns The file names the plugin would embed with this environment */
  function embeddedNames(): string[] {
    const code = String(embedRemoteScript().load(EMBEDDED_MODULE));
    const json = code.slice(code.indexOf("{"), code.lastIndexOf("}") + 1);

    return Object.keys(JSON.parse(json) as Record<string, string>);
  }

  it("leaves them out without ENABLE_GEN_UI", () => {
    vi.stubEnv("ENABLE_GEN_UI", "");

    const names = embeddedNames();

    expect(names).toContain("routes.py");
    expect(names).toContain("version.py");

    for (const file of GEN_UI_REMOTE_SCRIPT_FILES) {
      expect(names).not.toContain(file);
    }
  });

  it("leaves them out unless the flag is exactly true", () => {
    vi.stubEnv("ENABLE_GEN_UI", "1");

    expect(embeddedNames()).not.toContain("watches.py");
  });

  it("keeps them with ENABLE_GEN_UI=true", () => {
    vi.stubEnv("ENABLE_GEN_UI", "true");

    expect(embeddedNames()).toStrictEqual(
      expect.arrayContaining([...GEN_UI_REMOTE_SCRIPT_FILES]),
    );
  });
});
