// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerSkillOverridesRoutes } from "#src/mcp-server/routes/skill-overrides-route.ts";
import { SKILL_SLOT_NAMES } from "#src/skills/skill-slots.ts";
import {
  type MarkdownRouteServer,
  errorOf,
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
  enabled: boolean;
  canDisable: boolean;
  gate: readonly string[] | string | null;
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
      expect(slot.enabled).toBe(true);
      expect(slot.provenance).toBeNull();
    }
  });

  it("GET carries each slot's tool gate, so the editor can state the rule", async () => {
    // The editor renders this verbatim; a field-name or shape change here would
    // otherwise only surface as the gate note quietly vanishing.
    const res = await fetch(base);
    const { slots } = (await res.json()) as { slots: SlotState[] };
    // Read through the slot, not a defaulted lookup: a driver's gate is
    // legitimately null, so a `?? fallback` would hide a missing slot AND a
    // correct null behind the same value.
    const gateOf = (name: string): SlotState["gate"] | undefined =>
      slots.find((slot) => slot.name === name)?.gate;

    expect(gateOf("library")).toStrictEqual(["ppal-library"]);
    expect(gateOf("time-and-values")).toBe("always");
    expect(gateOf("getting-help")).toBe("conversation-only");
    // The drivers are the document, not a section of it.
    expect(gateOf("standard")).toBeNull();
  });

  it("PUT saves an override with provenance; GET reflects it", async () => {
    const res = await putJson(`${base}/barbeat-standard`, {
      content: "my custom core",
    });

    expect(res.status).toBe(200);
    const { slot } = (await res.json()) as { slot: SlotState };

    expect(slot.override).toBe("my custom core");
    expect(slot.provenance?.builtInHash).toMatch(/^[\da-f]{64}$/);

    const getRes = await fetch(base);
    const listed = (await getRes.json()) as { slots: SlotState[] };
    const saved = listed.slots.find((s) => s.name === "barbeat-standard");

    expect(saved?.override).toBe("my custom core");
  });

  it("DELETE resets an override back to the built-in", async () => {
    await putJson(`${base}/stark-standard`, { content: "temp override" });

    const res = await fetch(`${base}/stark-standard`, { method: "DELETE" });

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

  it("PUT switches a fragment off without touching its override", async () => {
    await putJson(`${base}/library`, { content: "my library notes" });
    const res = await putJson(`${base}/library`, { enabled: false });

    expect(res.status).toBe(200);
    const { slot } = (await res.json()) as { slot: SlotState };

    expect(slot.enabled).toBe(false);
    expect(slot.override).toBe("my library notes");
  });

  it("refuses to switch off a driver, which would empty the whole blob", async () => {
    const res = await putJson(`${base}/standard`, { enabled: false });

    expect(res.status).toBe(400);
    expect(await errorOf(res)).toMatch(/cannot be disabled/i);
  });

  it("reports canDisable so the editor knows which slots offer a toggle", async () => {
    const res = await fetch(base);
    const { slots } = (await res.json()) as { slots: SlotState[] };
    const offSwitchable = slots
      .filter((slot) => !slot.canDisable)
      .map((slot) => slot.name);

    expect(offSwitchable).toStrictEqual(["standard", "basic"]);
  });

  it("rejects a non-string content with 400", async () => {
    const res = await putJson(`${base}/barbeat-standard`, { content: 42 });

    expect(res.status).toBe(400);
  });

  it("rejects a non-boolean enabled with 400", async () => {
    const res = await putJson(`${base}/barbeat-standard`, { enabled: "no" });

    expect(res.status).toBe(400);
    expect(await errorOf(res)).toMatch(/enabled must be a boolean/i);
  });

  it("PUT with no JSON body rejects with 400, not 500", async () => {
    // Valid slot so origin + slot checks pass; the bodyless request must fall
    // through to the "content must be a string" 400, not TypeError into a 500.
    const res = await fetch(`${base}/barbeat-standard`, { method: "PUT" });

    expect(res.status).toBe(400);
    expect(await errorOf(res)).toMatch(/content must be a string/i);
  });

  it("rejects an unknown slot with 404 on PUT and DELETE", async () => {
    const putRes = await putJson(`${base}/not-a-slot`, { content: "x" });
    const delRes = await fetch(`${base}/not-a-slot`, { method: "DELETE" });

    expect(putRes.status).toBe(404);
    expect(delRes.status).toBe(404);
  });

  it("blocks genuinely cross-site writes with 403", async () => {
    const putRes = await putJson(
      `${base}/barbeat-standard`,
      { content: "x" },
      "https://evil.example.com",
    );
    const delRes = await fetch(`${base}/barbeat-standard`, {
      method: "DELETE",
      headers: { Origin: "https://evil.example.com" },
    });

    expect(putRes.status).toBe(403);
    expect(delRes.status).toBe(403);
  });
});
