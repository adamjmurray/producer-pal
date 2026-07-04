// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearNodeRoutes } from "#src/mcp-server/rpc/node-request-protocol.ts";
import {
  dispatchNodeRoute,
  useTempConfigDir,
} from "#src/mcp-server/tests/config-dir-test-helpers.ts";
import { rememberCustomSkill } from "../custom-skills-store.ts";
import { registerCustomSkillsNodeRoutes } from "../custom-skills-node-routes.ts";

vi.mock(import("#src/mcp-server/node-for-max-logger.ts"), () => ({
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

useTempConfigDir();

beforeEach(() => {
  vi.clearAllMocks();
  registerCustomSkillsNodeRoutes();
});

afterEach(() => {
  clearNodeRoutes();
});

describe("skills.remember route", () => {
  it("stores a skill and echoes the regenerated index", async () => {
    const response = await dispatchNodeRoute("skills.remember", {
      name: "Jazz Voicings",
      description: "rich voicings",
      content: "Voice with 3rds and 7ths.",
    });

    expect(response.success).toBe(true);
    expect(response.result?.content).toContain(
      'Saved custom skill "jazz-voicings".',
    );
    expect(response.result?.content).toContain(
      "- `jazz-voicings` — rich voicings",
    );
  });

  it("stores a skill with no description (index line has no dash)", async () => {
    const response = await dispatchNodeRoute("skills.remember", {
      name: "bare",
      content: "a skill",
    });

    expect(response.success).toBe(true);
    expect(response.result?.content).toContain("- `bare`\n");
  });

  it("fails when a required string field is missing", async () => {
    const response = await dispatchNodeRoute("skills.remember", {
      content: "y",
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain("name must be a string");
  });
});

describe("skills.read route", () => {
  it("returns the stored body", async () => {
    rememberCustomSkill({
      name: "jazz-voicings",
      description: "rich",
      body: "Voice with 3rds and 7ths.",
    });

    const response = await dispatchNodeRoute("skills.read", {
      name: "jazz-voicings",
    });

    expect(response.result).toStrictEqual({
      content: "Voice with 3rds and 7ths.",
    });
  });

  it("returns a not-found note for a missing skill", async () => {
    const response = await dispatchNodeRoute("skills.read", { name: "ghost" });

    expect(response.result).toStrictEqual({
      content: 'No custom skill found for "ghost".',
    });
  });
});

describe("skills.forget route", () => {
  it("removes an existing skill", async () => {
    rememberCustomSkill({ name: "temp", description: "", body: "b" });

    const response = await dispatchNodeRoute("skills.forget", { name: "temp" });

    expect(response.result?.content).toContain('Deleted custom skill "temp".');
    expect(response.result?.content).toContain("(no custom skills)");
  });

  it("reports when there was nothing to delete", async () => {
    const response = await dispatchNodeRoute("skills.forget", {
      name: "ghost",
    });

    expect(response.result?.content).toContain(
      'No custom skill to delete for "ghost".',
    );
  });
});

describe("skills.list route", () => {
  it("returns a placeholder when empty", async () => {
    const response = await dispatchNodeRoute("skills.list", {});

    expect(response.result).toStrictEqual({ content: "(no custom skills)" });
  });

  it("returns the derived index when populated", async () => {
    rememberCustomSkill({ name: "on", description: "hook", body: "b" });

    const response = await dispatchNodeRoute("skills.list", {});

    expect(response.result?.content).toContain("# Producer Pal Custom Skills");
    expect(response.result?.content).toContain("- `on` — hook");
  });
});
