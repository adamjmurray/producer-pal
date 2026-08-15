// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as adapter from "#src/live-api-adapter/live-api-adapter.ts";
import {
  findSourceFiles,
  projectRoot,
} from "#src/test/helpers/meta-test-helpers.ts";

// Every `Max.outlet("config", <key>, …)` the server emits lands on the v8 object
// as a `<key> …` message, because the device patch wires the route's config
// outlet to both v8 and the Setup tab. A key with no matching export makes Max
// log "no function <key>" — silent to tests, loud in the Max console. The v8
// side may ignore a value, but it has to export a setter for it.
const CONFIG_OUTLET = /Max\.outlet\(\s*"config"\s*,\s*"([^"]+)"/g;

describe("V8 config key parity", () => {
  it("exports a setter for every config key the server broadcasts", () => {
    const keys = findConfigKeys();

    // Guard against the scan silently matching nothing (a refactor renaming
    // Max.outlet, say) and passing vacuously.
    expect(keys.length).toBeGreaterThan(0);

    const missing = keys.filter(
      (key) => typeof (adapter as Record<string, unknown>)[key] !== "function",
    );

    expect(missing).toStrictEqual([]);
  });

  it("accepts the keys V8 deliberately ignores", () => {
    expect(() => adapter.liveApiEnabled()).not.toThrow();
    expect(() => adapter.tools()).not.toThrow();
  });
});

/**
 * Scan the server sources for the config keys broadcast to Max.
 *
 * @returns Sorted, deduplicated config key names
 */
function findConfigKeys(): string[] {
  const keys = new Set<string>();

  for (const file of findSourceFiles(
    path.join(projectRoot, "src/mcp-server"),
    true,
  )) {
    const source = fs.readFileSync(file, "utf8");

    for (const [, key] of source.matchAll(CONFIG_OUTLET)) {
      if (key != null) keys.add(key);
    }
  }

  return [...keys].sort();
}
