// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerSkillOverridesRoutes } from "#src/mcp-server/routes/skill-overrides-route.ts";
import { SKILL_SLOT_NAMES } from "#src/skills/skill-slots.ts";
import {
  type MarkdownRouteServer,
  putJson,
  startMarkdownRouteServer,
  useTempConfigDir,
} from "../config-dir-test-helpers.ts";

// Register the temp-config-dir lifecycle so each request hits a fresh real dir
// rather than the inert-under-Vitest path (env unset).
useTempConfigDir();

let server: MarkdownRouteServer;
let base = "";

beforeAll(async () => {
  server = await startMarkdownRouteServer(registerSkillOverridesRoutes);
  base = `${server.baseUrl}/skill-overrides`;
});

afterAll(async () => {
  await server.close();
});

interface SlotState {
  name: string;
  builtIn: string;
  override: string;
  drifted: boolean;
  provenance: { producerPalVersion: string; builtInHash: string } | null;
}

describe("skill-overrides route", () => {
  it("GET lists every slot with its built-in and empty override", async () => {
    const res = await fetch(base);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { slots: SlotState[] };

    expect(body.slots.map((s) => s.name)).toStrictEqual([...SKILL_SLOT_NAMES]);

    for (const slot of body.slots) {
      expect(slot.builtIn.length).toBeGreaterThan(0);
      expect(slot.override).toBe("");
      expect(slot.provenance).toBeNull();
    }
  });

  it("PUT saves an override with provenance; GET reflects it", async () => {
    const res = await putJson(`${base}/core-standard`, {
      content: "my custom core",
    });

    expect(res.status).toBe(200);
    const { slot } = (await res.json()) as { slot: SlotState };

    expect(slot.override).toBe("my custom core");
    expect(slot.provenance?.builtInHash).toMatch(/^[\da-f]{64}$/);

    const getRes = await fetch(base);
    const listed = (await getRes.json()) as { slots: SlotState[] };
    const saved = listed.slots.find((s) => s.name === "core-standard");

    expect(saved?.override).toBe("my custom core");
  });

  it("DELETE resets an override back to the built-in", async () => {
    await putJson(`${base}/stark`, { content: "temp override" });

    const res = await fetch(`${base}/stark`, { method: "DELETE" });

    expect(res.status).toBe(200);
    const { slot } = (await res.json()) as { slot: SlotState };

    expect(slot.override).toBe("");
  });

  it("PUT with blank content resets the slot", async () => {
    await putJson(`${base}/midi-json`, { content: "temp" });
    const res = await putJson(`${base}/midi-json`, { content: "   " });

    const { slot } = (await res.json()) as { slot: SlotState };

    expect(slot.override).toBe("");
  });

  it("rejects a non-string content with 400", async () => {
    const res = await putJson(`${base}/core-standard`, { content: 42 });

    expect(res.status).toBe(400);
  });

  it("rejects an unknown slot with 404 on PUT and DELETE", async () => {
    const putRes = await putJson(`${base}/not-a-slot`, { content: "x" });
    const delRes = await fetch(`${base}/not-a-slot`, { method: "DELETE" });

    expect(putRes.status).toBe(404);
    expect(delRes.status).toBe(404);
  });

  it("blocks cross-origin writes with 403 (localhost gate)", async () => {
    const putRes = await putJson(
      `${base}/core-standard`,
      { content: "x" },
      "https://evil.example.com",
    );
    const delRes = await fetch(`${base}/core-standard`, {
      method: "DELETE",
      headers: { Origin: "https://evil.example.com" },
    });

    expect(putRes.status).toBe(403);
    expect(delRes.status).toBe(403);
  });
});
