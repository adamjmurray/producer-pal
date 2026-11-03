// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { agentCliCommand } from "../agent-cli-command.ts";

// The tail of a shim npm writes on Windows
const NPM_SHIM = `@ECHO off
SETLOCAL
endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*
`;

let bin: string;

beforeEach(() => {
  bin = mkdtempSync(join(tmpdir(), "ppal-agent-cli-"));
});

afterEach(() => {
  rmSync(bin, { recursive: true, force: true });
});

describe("agentCliCommand", () => {
  it("runs a JS file through node on every platform", () => {
    expect(agentCliCommand("/x/cli.mjs", ["-p"], "darwin", "")).toStrictEqual([
      process.execPath,
      ["/x/cli.mjs", "-p"],
    ]);
  });

  it("runs a bare name as is outside Windows", () => {
    writeFileSync(join(bin, "codex.cmd"), NPM_SHIM);

    expect(agentCliCommand("codex", ["exec"], "linux", bin)).toStrictEqual([
      "codex",
      ["exec"],
    ]);
  });

  it("runs the JS entry of an npm shim found on PATH on Windows", () => {
    writeFileSync(join(bin, "codex.cmd"), NPM_SHIM);

    expect(
      agentCliCommand("codex", ["exec"], "win32", `C:\\nope;${bin}`),
    ).toStrictEqual([
      process.execPath,
      [join(bin, "node_modules/@openai/codex/bin/codex.js"), "exec"],
    ]);
  });

  it("reads a .cmd path it is given directly", () => {
    const shim = join(bin, "codex.cmd");

    writeFileSync(shim, NPM_SHIM);

    expect(agentCliCommand(shim, [], "win32", "")[1]).toStrictEqual([
      join(bin, "node_modules/@openai/codex/bin/codex.js"),
    ]);
  });

  it.each([
    ["a name with no shim on PATH", "claude", ""],
    ["a name with an extension", "claude.exe", "{bin}"],
    ["a path", "C:\\tools\\claude", "{bin}"],
    ["a .cmd that isn't an npm shim", "other", "{bin}"],
  ])("runs %s as is on Windows", (_, executable, searchPath) => {
    writeFileSync(join(bin, "claude.cmd"), NPM_SHIM);
    writeFileSync(join(bin, "other.cmd"), "@echo hi\n");

    expect(
      agentCliCommand(
        executable,
        [],
        "win32",
        searchPath.replace("{bin}", bin),
      ),
    ).toStrictEqual([executable, []]);
  });
});
