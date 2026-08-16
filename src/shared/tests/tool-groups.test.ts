// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  ALL_TOOL_IDS,
  CONNECT_TOOL_ID,
  LIVE_API_TOOL_ID,
  READ_ONLY_ALIAS,
  READ_ONLY_TOOLS,
  resolveToolNames,
  TOOL_GROUPS,
} from "#src/shared/tool-groups.ts";

/**
 * Resolve with a spy in place of the unknown-item reporter.
 * @param raw - The user's tool/group list
 * @returns The resolved names and the items reported as unknown
 */
function resolve(raw: string): { names: string[]; unknown: string[] } {
  const onUnknown = vi.fn();
  const names = resolveToolNames(raw, onUnknown);

  return {
    names,
    unknown: onUnknown.mock.calls.map(([item]) => item as string),
  };
}

describe("TOOL_GROUPS", () => {
  it("partitions the catalog — no tool appears in two groups", () => {
    expect(new Set(ALL_TOOL_IDS).size).toBe(ALL_TOOL_IDS.length);
  });

  it("has a unique slug alias per group", () => {
    const aliases = TOOL_GROUPS.map((group) => group.alias);

    expect(new Set(aliases).size).toBe(aliases.length);

    for (const alias of aliases) expect(alias).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it("keeps the read-only alias out of the group aliases", () => {
    expect(TOOL_GROUPS.map((group) => group.alias)).not.toContain(
      READ_ONLY_ALIAS,
    );
  });

  it("draws read-only entirely from the catalog", () => {
    for (const name of READ_ONLY_TOOLS) expect(ALL_TOOL_IDS).toContain(name);
  });

  it("includes the opt-in Direct Live API tool in the catalog", () => {
    // Complementing --tools over a catalog missing this would leak the tool into
    // a narrowed session on a device where the flag is on.
    expect(ALL_TOOL_IDS).toContain(LIVE_API_TOOL_ID);
  });

  it("has no group alias colliding with a bare tool name", () => {
    // resolveToolNames checks aliases first, so a collision would shadow a tool.
    const bareNames = new Set(
      ALL_TOOL_IDS.map((id) => id.replace(/^ppal-/, "")),
    );

    for (const group of TOOL_GROUPS) {
      expect(bareNames).not.toContain(group.alias);
    }

    expect(bareNames).not.toContain(READ_ONLY_ALIAS);
  });
});

describe("resolveToolNames", () => {
  it("resolves a group alias to its tools", () => {
    expect(resolve("clip").names).toStrictEqual([
      "ppal-read-clip",
      "ppal-create-clip",
      "ppal-update-clip",
    ]);
  });

  it("resolves the read-only alias", () => {
    expect(resolve(READ_ONLY_ALIAS).names).toStrictEqual(
      READ_ONLY_TOOLS.toSorted(
        (a, b) => ALL_TOOL_IDS.indexOf(a) - ALL_TOOL_IDS.indexOf(b),
      ),
    );
  });

  it("accepts bare and prefixed names", () => {
    expect(resolve("read-clip").names).toStrictEqual(["ppal-read-clip"]);
    expect(resolve("ppal-read-clip").names).toStrictEqual(["ppal-read-clip"]);
  });

  it("splits on commas, whitespace, and both together", () => {
    expect(resolve("connect, context   playback").names).toStrictEqual([
      CONNECT_TOOL_ID,
      "ppal-context",
      "ppal-playback",
    ]);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(resolve("  Live-Set , PPAL-Delete ").names).toStrictEqual([
      "ppal-delete",
      "ppal-read-live-set",
      "ppal-update-live-set",
    ]);
  });

  it("dedupes across overlapping items and returns catalog order", () => {
    expect(resolve("update-clip,clip,read-clip").names).toStrictEqual([
      "ppal-read-clip",
      "ppal-create-clip",
      "ppal-update-clip",
    ]);
  });

  it("returns nothing for an empty or separator-only list", () => {
    expect(resolve("").names).toStrictEqual([]);
    expect(resolve(" , , ").names).toStrictEqual([]);
  });

  it("reports an unrecognized item and keeps the rest", () => {
    const { names, unknown } = resolve("clip,nonesuch,ppal-bogus");

    expect(names).toStrictEqual([
      "ppal-read-clip",
      "ppal-create-clip",
      "ppal-update-clip",
    ]);
    expect(unknown).toStrictEqual(["nonesuch", "ppal-bogus"]);
  });

  it("reports the item as the user spelled it", () => {
    expect(resolve(" NoneSuch ").unknown).toStrictEqual(["NoneSuch"]);
  });
});
