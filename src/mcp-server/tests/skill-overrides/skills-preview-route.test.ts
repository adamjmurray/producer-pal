// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerSkillOverridesRoutes } from "#src/mcp-server/routes/skill-overrides-route.ts";
import { registerSkillsPreviewRoute } from "#src/mcp-server/routes/skills-preview-route.ts";
import { buildSkills } from "#src/skills/build-skills.ts";
import {
  type MarkdownRouteServer,
  putJson,
  startMarkdownRouteServer,
  useTempConfigDir,
} from "../config-dir-test-helpers.ts";

// A fresh temp config dir per test so override writes don't leak across cases.
useTempConfigDir();

let server: MarkdownRouteServer;
let base = "";
let overridesBase = "";

beforeAll(async () => {
  // Register the preview route AND the override writes so a test can save an
  // override and confirm the preview reflects it.
  server = await startMarkdownRouteServer((app) => {
    registerSkillsPreviewRoute(app);
    registerSkillOverridesRoutes(app);
  });
  base = `${server.baseUrl}/skills-preview`;
  overridesBase = `${server.baseUrl}/skill-overrides`;
});

afterAll(async () => {
  await server.close();
});

interface PreviewBody {
  notation: string;
  smallModelMode: boolean;
  head: string;
  driver: string;
  skills: string;
  warnings: string[];
}

/**
 * GET the preview for a notation + small-model combination.
 * @param query - Query string (without leading "?")
 * @returns The parsed preview body
 */
async function getPreview(query: string): Promise<PreviewBody> {
  const res = await fetch(`${base}?${query}`);

  expect(res.status).toBe(200);

  return (await res.json()) as PreviewBody;
}

describe("skills-preview route", () => {
  it("defaults to bar|beat + standard when params are absent", async () => {
    const body = await getPreview("");

    expect(body.notation).toBe("barbeat");
    expect(body.smallModelMode).toBe(false);
    expect(body.head).toBe("barbeat-standard");
    expect(body.driver).toBe("standard");
    expect(body.skills).toBe(buildSkills({ notation: "barbeat" }));
    expect(body.warnings).toStrictEqual([]);
  });

  it("selects the small-model core and notation head", async () => {
    const body = await getPreview("notation=stark&smallModel=true");

    expect(body.smallModelMode).toBe(true);
    expect(body.head).toBe("stark-basic");
    expect(body.driver).toBe("basic");
    expect(body.skills).toBe(
      buildSkills({ notation: "stark", smallModelMode: true }),
    );
  });

  it("keeps bar|beat's distinct small-model head", async () => {
    const body = await getPreview("notation=barbeat&smallModel=true");

    expect(body.head).toBe("barbeat-basic");
    expect(body.driver).toBe("basic");
  });

  it("reports the level-invariant midi-json head at both levels", async () => {
    const standard = await getPreview("notation=midi-json");

    expect(standard.head).toBe("midi-json");
    expect(standard.driver).toBe("standard");

    const small = await getPreview("notation=midi-json&smallModel=true");

    expect(small.head).toBe("midi-json");
    expect(small.driver).toBe("basic");
  });

  it("falls back to bar|beat for an unknown notation", async () => {
    const body = await getPreview("notation=bogus");

    expect(body.notation).toBe("barbeat");
    expect(body.head).toBe("barbeat-standard");
  });

  it("treats any non-'true' smallModel value as standard", async () => {
    const body = await getPreview("smallModel=1");

    expect(body.smallModelMode).toBe(false);
    expect(body.driver).toBe("standard");
  });

  it("reflects a saved fragment override in the assembled blob", async () => {
    await putJson(`${overridesBase}/stark-standard`, {
      content: "MY CUSTOM STARK",
    });

    const body = await getPreview("notation=stark");

    expect(body.skills).toContain("MY CUSTOM STARK");
  });

  it("surfaces assembly warnings when a saved override is broken (cycle)", async () => {
    // A driver override that includes itself is a cycle: the preview must flag
    // it instead of silently returning a truncated blob.
    await putJson(`${overridesBase}/standard`, {
      content: `INTRO\n\n@include "./standard.md"`,
    });

    const body = await getPreview("notation=barbeat");

    expect(body.warnings.some((w) => w.includes("cycle"))).toBe(true);
  });
});
