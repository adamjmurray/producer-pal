// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addProbeRoute } from "../python-probe/add-probe-route.ts";
import { addReloadRoute } from "./add-reload-route.ts";
import { hashRemoteScript } from "./source-hash.ts";

const REMOTE_SCRIPT_DIR = join(
  import.meta.dirname,
  "../../../remote-script/Producer_Pal",
);

// Pinned in remote-script/tests/test_hot_reload.py too, so Python and
// TypeScript agree on the same fixture.
const FIXTURE_HASH =
  "ef65924eed9afdbfa81ade6f73039bf11bab300dfbee03cf70ab80759514642b";

const FIXTURE: Record<string, string> = {
  "a.py": "x = 1\n",
  "b.py": "y = 2\n",
  // Bootstrap, not Python, and hidden files aren't hashed.
  "bridge.py": "z = 3\n",
  "notes.txt": "ignored\n",
  ".hidden.py": "h = 1\n",
  "sub/c.py": "c = 1\n",
};

let dir: string;

/**
 * Write files into the temp folder.
 * @param files - Relative path to contents
 */
function write(files: Record<string, string>): void {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "source-hash-"));
  write(FIXTURE);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("hashRemoteScript", () => {
  it("matches the value hot_reload.py gives the same files", () => {
    expect(hashRemoteScript(dir)).toBe(FIXTURE_HASH);
  });

  it("ignores bootstrap, hidden and non-Python files", () => {
    write({
      "bridge.py": "z = 4\n",
      "notes.txt": "x",
      ".hidden.py": "h = 2\n",
    });

    expect(hashRemoteScript(dir)).toBe(FIXTURE_HASH);
  });

  it("changes with a file's contents", () => {
    write({ "a.py": "x = 2\n" });

    expect(hashRemoteScript(dir)).not.toBe(FIXTURE_HASH);
  });

  it("changes with a file's name", () => {
    renameSync(join(dir, "b.py"), join(dir, "c.py"));

    expect(hashRemoteScript(dir)).not.toBe(FIXTURE_HASH);
  });
});

describe("hashRemoteScript on an installed copy", () => {
  it("agrees with what Python reloads and hashes, probe routes included", () => {
    const parent = mkdtempSync(join(tmpdir(), "source-hash-install-"));
    const installed = join(parent, "Producer_Pal");

    try {
      cpSync(REMOTE_SCRIPT_DIR, installed, {
        recursive: true,
        filter: (source) => !source.includes("__pycache__"),
      });
      addProbeRoute(installed);
      addReloadRoute(installed);

      const python = spawnSync(
        "python3",
        [
          "-c",
          [
            "import json, sys, types",
            "sys.dont_write_bytecode = True",
            "sys.path.insert(0, sys.argv[1])",
            "sys.modules['Live'] = types.ModuleType('Live')",
            "from Producer_Pal import hot_reload",
            "reloaded, digest = hot_reload.reload_implementation()",
            "print(json.dumps({'reloaded': reloaded, 'hash': digest, 'loaded': hot_reload.loaded_hash}))",
          ].join("\n"),
          parent,
        ],
        { encoding: "utf8" },
      );

      expect(python.stderr).toBe("");

      const result = JSON.parse(python.stdout) as {
        reloaded: string[];
        hash: string;
        loaded: string;
      };

      expect(result.hash).toBe(hashRemoteScript(installed));
      expect(result.loaded).toBe(result.hash);
      expect(result.reloaded).toContain("probe");
      expect(result.reloaded.at(-1)).toBe("routes");
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
