// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerCustomSkillsCollectionRoutes } from "#src/mcp-server/routes/custom-skills-collection-route.ts";
import {
  type MarkdownRouteServer,
  putJson,
  startMarkdownRouteServer,
  useTempConfigDir,
} from "#src/mcp-server/tests/config-dir-test-helpers.ts";

// The generic GET/PUT/DELETE + 409 + origin-gate behavior is covered by
// memory-collection-route.test (both use the same collection-route factory);
// this covers the custom-skills binding: the enabled round-trip and the
// no-type-validation buildInput.
useTempConfigDir();

let server: MarkdownRouteServer;
let base = "";

beforeAll(async () => {
  server = await startMarkdownRouteServer(registerCustomSkillsCollectionRoutes);
  base = `${server.baseUrl}/custom-skills`;
});

afterAll(async () => {
  await server.close();
});

interface SkillEntry {
  name: string;
  description: string;
  enabled: boolean;
  body: string;
}

/**
 * GET the collection and return its parsed entries.
 * @returns The stored skills
 */
async function listEntries(): Promise<SkillEntry[]> {
  const res = await fetch(base);

  return ((await res.json()) as { entries: SkillEntry[] }).entries;
}

describe("custom-skills-collection route", () => {
  it("PUT stores a skill (round-tripping the enabled flag); GET reflects it", async () => {
    const res = await putJson(
      `${base}/${encodeURIComponent("Jazz Voicings")}`,
      {
        description: "rich",
        content: "Voice with 3rds and 7ths.",
        enabled: false,
      },
    );

    expect(res.status).toBe(200);

    const { entry } = (await res.json()) as { entry: SkillEntry };

    expect(entry).toStrictEqual({
      name: "jazz-voicings",
      description: "rich",
      enabled: false,
      body: "Voice with 3rds and 7ths.",
    });

    const entries = await listEntries();

    expect(entries.map((e) => e.name)).toStrictEqual(["jazz-voicings"]);
  });

  it("defaults enabled to true when the flag is omitted on create", async () => {
    const res = await putJson(`${base}/on-by-default`, {
      description: "",
      content: "x",
    });

    const { entry } = (await res.json()) as { entry: SkillEntry };

    expect(entry.enabled).toBe(true);
  });

  it("rejects a non-string content with 400", async () => {
    const res = await putJson(`${base}/bad`, { content: 42 });

    expect(res.status).toBe(400);
  });

  it("DELETE removes a skill and reports whether it existed", async () => {
    await putJson(`${base}/temp`, { content: "x" });

    const hit = await fetch(`${base}/temp`, { method: "DELETE" });
    const miss = await fetch(`${base}/temp`, { method: "DELETE" });

    expect(await hit.json()).toStrictEqual({ existed: true });
    expect(await miss.json()).toStrictEqual({ existed: false });
  });
});
