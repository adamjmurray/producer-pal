// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerMemoryCollectionRoutes } from "#src/mcp-server/routes/memory-collection-route.ts";
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
  server = await startMarkdownRouteServer(registerMemoryCollectionRoutes);
  base = `${server.baseUrl}/memory`;
});

afterAll(async () => {
  await server.close();
});

interface MemoryEntry {
  name: string;
  type: string;
  description: string;
  body: string;
}

/**
 * PUT one memory entry and return the parsed response.
 * @param name - Desired memory name (path segment, slugified server-side)
 * @param entry - The type/description/content payload
 * @param entry.type - The memory bucket
 * @param entry.description - Optional one-line recall hook
 * @param entry.content - The memory body
 * @param entry.createOnly - When true, the server rejects a name collision (409)
 * @returns The fetch Response
 */
function putMemory(
  name: string,
  entry: {
    type: string;
    description?: string;
    content: string;
    createOnly?: boolean;
  },
): Promise<Response> {
  return putJson(`${base}/${encodeURIComponent(name)}`, entry);
}

/**
 * GET the collection and return its parsed entries.
 * @returns The stored entries
 */
async function listEntries(): Promise<MemoryEntry[]> {
  const res = await fetch(base);
  const body = (await res.json()) as { entries: MemoryEntry[] };

  return body.entries;
}

describe("memory-collection route", () => {
  it("GET is empty when no memories are stored", async () => {
    const res = await fetch(base);

    expect(res.status).toBe(200);
    expect(await res.json()).toStrictEqual({ entries: [] });
  });

  it("PUT stores an entry (slugifying the name); GET reflects it", async () => {
    const res = await putMemory("Prefers C Minor", {
      type: "user",
      description: "default key & genre",
      content: "Composes mostly in C minor, house/techno.",
    });

    expect(res.status).toBe(200);
    const { entry } = (await res.json()) as { entry: MemoryEntry };

    expect(entry).toStrictEqual({
      name: "prefers-c-minor",
      type: "user",
      description: "default key & genre",
      body: "Composes mostly in C minor, house/techno.",
    });

    const entries = await listEntries();

    expect(entries.map((e) => e.name)).toStrictEqual(["prefers-c-minor"]);
  });

  it("PUT overwrites in place when the same name is stored again", async () => {
    await putMemory("album-nyx", {
      type: "goal",
      description: "v1",
      content: "first",
    });
    await putMemory("album-nyx", {
      type: "goal",
      description: "v2",
      content: "second",
    });

    const entries = await listEntries();
    const nyx = entries.filter((e) => e.name === "album-nyx");

    expect(nyx).toHaveLength(1);
    expect(nyx[0]?.body).toBe("second");
  });

  it("defaults a missing description to an empty string", async () => {
    const res = await putMemory("loose-drums", {
      type: "feedback",
      content: "Apply groove.",
    });

    const { entry } = (await res.json()) as { entry: MemoryEntry };

    expect(entry.description).toBe("");
  });

  it("DELETE removes an entry and reports whether it existed", async () => {
    await putMemory("temp-note", { type: "user", content: "x" });

    const hit = await fetch(`${base}/temp-note`, { method: "DELETE" });
    const miss = await fetch(`${base}/temp-note`, { method: "DELETE" });

    expect(await hit.json()).toStrictEqual({ existed: true });
    expect(await miss.json()).toStrictEqual({ existed: false });
  });

  it("rejects a create-only PUT that collides with an existing name (409)", async () => {
    await putMemory("collide", { type: "user", content: "original" });

    // Same slug via a differently-cased name, with createOnly set (the editor's
    // Create flow) — must not overwrite the existing memory.
    const res = await putMemory("Collide", {
      type: "user",
      content: "overwrite",
      createOnly: true,
    });

    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(
      /already exists/i,
    );

    const entries = await listEntries();
    const kept = entries.find((e) => e.name === "collide");

    expect(kept?.body).toBe("original");
  });

  it("allows a create-only PUT for a brand-new name", async () => {
    const res = await putMemory("fresh-name", {
      type: "user",
      content: "hi",
      createOnly: true,
    });

    expect(res.status).toBe(200);
  });

  it("rejects an invalid type with 400", async () => {
    const res = await putMemory("bad-type", {
      type: "bogus",
      content: "x",
    });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(
      /type must be one of/i,
    );
  });

  it("rejects a non-string content with 400", async () => {
    const res = await putJson(`${base}/bad-content`, {
      type: "user",
      content: 42,
    });

    expect(res.status).toBe(400);
  });

  it("rejects an empty body with 400 (store validation)", async () => {
    const res = await putMemory("blank", { type: "user", content: "   " });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(
      /body must not be empty/i,
    );
  });

  it("rejects an unslugifiable name with 400", async () => {
    const res = await putMemory("!!!", { type: "user", content: "x" });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(
      /name must contain/i,
    );
  });

  it("blocks genuinely cross-site writes with 403", async () => {
    const putRes = await putJson(
      `${base}/evil`,
      { type: "user", content: "x" },
      "https://evil.example.com",
    );
    const delRes = await fetch(`${base}/evil`, {
      method: "DELETE",
      headers: { Origin: "https://evil.example.com" },
    });

    expect(putRes.status).toBe(403);
    expect(delRes.status).toBe(403);
  });
});
