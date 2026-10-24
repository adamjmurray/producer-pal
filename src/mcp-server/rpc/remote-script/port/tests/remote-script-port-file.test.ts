// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  REMOTE_SCRIPT_DEFAULT_PORT,
  remoteScriptPortFromFile,
} from "../remote-script-port-file.ts";

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ppal-port-file-"));
  file = join(dir, "remote-script-port.txt");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("remoteScriptPortFromFile", () => {
  it("reads the port the remote script wrote", () => {
    writeFileSync(file, "3352\n");

    expect(remoteScriptPortFromFile(file)).toBe(3352);
  });

  it("is null when there is no file, as on a 2.4.0 install", () => {
    expect(remoteScriptPortFromFile(file)).toBeNull();
    expect(REMOTE_SCRIPT_DEFAULT_PORT).toBe(3349);
  });

  it("is null when the file can't be read", () => {
    mkdirSync(file);

    expect(remoteScriptPortFromFile(file)).toBeNull();
  });

  it.each(["", "garbage", "33x49", "3349.5", "-1", "0", "70000", "3349 3350"])(
    "is null when the file holds %j",
    (text) => {
      writeFileSync(file, text);

      expect(remoteScriptPortFromFile(file)).toBeNull();
    },
  );

  it("notices a port rewritten after a restart", () => {
    writeFileSync(file, "3349\n");
    expect(remoteScriptPortFromFile(file)).toBe(3349);

    writeFileSync(file, "3353\n");
    expect(remoteScriptPortFromFile(file)).toBe(3353);
  });
});
