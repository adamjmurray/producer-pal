// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for ppal-library's `list-plugins` against the remote script's
 * browser list. Installed plug-ins vary by machine and a test can't install
 * one, so these assert shape: the usual plug-in fields, and no stalenessNote
 * (or old stalenessRisk payload) while the browser answers.
 *
 * Opt-in like the other remote script suites: skipped unless
 * E2E_REMOTE_SCRIPT=true.
 *
 * Run with: npm run e2e:mcp:remote-script -- library/ppal-library-plugins
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  setConfig,
  setupMcpTestContext,
} from "../../mcp-test-helpers.ts";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../../device/helpers/remote-script-test-helpers.ts";

interface ListedPlugin {
  name: string;
  vendor: string | null;
  version: string | null;
  format: string | null;
  category: string | null;
  subcategories: string[];
}

interface ListPluginsResult {
  plugins: ListedPlugin[];
  dbAvailable?: boolean;
  stalenessNote?: string;
  stalenessRisk?: unknown;
  more?: number;
  note?: string;
  detail?: string;
}

describe.skipIf(!REMOTE_SCRIPT_E2E)("ppal-library list-plugins", () => {
  requireRemoteScript();

  const ctx = setupMcpTestContext({ once: true });

  async function listPlugins(
    args: Record<string, string | number> = {},
  ): Promise<ListPluginsResult> {
    return parseToolResult<ListPluginsResult>(
      await ctx.client!.callTool({
        name: "ppal-library",
        arguments: { action: "list-plugins", ...args },
      }),
    );
  }

  it("lists browser plug-ins with the usual shape and no staleness note", async ({
    skip,
  }) => {
    const result = await listPlugins({ limit: 1000 });

    expect(Array.isArray(result.plugins)).toBe(true);
    expect(result).not.toHaveProperty("stalenessNote");
    expect(result).not.toHaveProperty("stalenessRisk");

    skip(result.plugins.length === 0, "no plug-ins are installed");

    for (const plugin of result.plugins) {
      expect(typeof plugin.name).toBe("string");
      expect(Array.isArray(plugin.subcategories)).toBe(true);
    }
  });

  it("says how many plug-ins a small limit left out, with no way to page", async ({
    skip,
  }) => {
    const all = await listPlugins({ limit: 1000 });

    skip(all.plugins.length < 2, "needs two or more installed plug-ins");

    const cut = await listPlugins({ limit: 1 });

    expect(cut.plugins).toHaveLength(1);
    expect(cut.more).toBe(all.plugins.length - 1);
    expect(cut).not.toHaveProperty("nextOffset");
    expect(all).not.toHaveProperty("more");
  });

  it("still filters the merged list", async ({ skip }) => {
    const all = await listPlugins({ limit: 1000 });
    const [first] = all.plugins;

    skip(first == null, "no plug-ins are installed");

    const found = await listPlugins({ query: first!.name });

    expect(found.plugins.map((p) => p.name)).toContain(first!.name);
  });

  it("filters by deviceKind, noting exactly the plug-ins with an unknown category", async ({
    skip,
  }) => {
    const all = await listPlugins({ limit: 1000 });

    skip(all.plugins.length === 0, "no plug-ins are installed");
    const expectedLeftOut = all.plugins.filter(
      (p) => p.category == null && p.subcategories.length === 0,
    ).length;
    const result = await listPlugins({ deviceKind: "audiofx", limit: 1000 });

    for (const plugin of result.plugins) {
      expect(plugin.category).toBe("audiofx");
    }

    // No unknown-category plug-ins on this machine means no note.
    if (expectedLeftOut === 0) {
      expect(result).not.toHaveProperty("note");
    } else {
      const noun =
        expectedLeftOut === 1 ? "1 plug-in" : `${expectedLeftOut} plug-ins`;

      expect(result.note).toMatch(
        new RegExp(`^${noun} with an unknown category (was|were) left out\\.`),
      );
    }
  });

  it("falls back to the database alone when the script is switched off", async () => {
    await setConfig({ remoteScriptEnabled: false });

    try {
      const result = await listPlugins({ limit: 1000 });

      expect(Array.isArray(result.plugins)).toBe(true);
      expect(result).not.toHaveProperty("stalenessRisk");
    } finally {
      await setConfig({ remoteScriptEnabled: true });
    }
  });

  it("words the staleness note when the database may be out of date", async ({
    skip,
  }) => {
    await setConfig({ remoteScriptEnabled: false });

    try {
      const result = await listPlugins({ limit: 1000 });

      // Only appears when Live's -wal file is newer than the database.
      if (result.stalenessNote == null) {
        skip("the browser database isn't stale on this machine");
      }

      expect(result.stalenessNote).toContain("loaded by name");
    } finally {
      await setConfig({ remoteScriptEnabled: true });
    }
  });
});
