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
  description: string;
  body: string;
}

/**
 * PUT one memory entry and return the parsed response.
 * @param name - Desired memory name (path segment, slugified server-side)
 * @param entry - The description/content payload
 * @param entry.description - Optional one-line recall hook
 * @param entry.content - The memory body
 * @param entry.createOnly - When true, the server rejects a name collision (409)
 * @returns The fetch Response
 */
function putMemory(
  name: string,
  entry: {
    description?: string;
    content: string;
    createOnly?: boolean;
  },
): Promise<Response> {
  // Memory now requires a non-empty description; default one so tests that
  // don't exercise the description supply a valid write.
  return putJson(`${base}/${encodeURIComponent(name)}`, {
    description: "hook",
    ...entry,
  });
}

/**
 * PUT a rename for an existing memory and return the Response.
 * @param oldName - Current name (path segment)
 * @param body - The rename payload
 * @param body.newName - Requested new name (slugified server-side)
 * @param body.description - The description to carry over
 * @param body.content - The body to carry over
 * @returns The fetch Response
 */
function putRename(
  oldName: string,
  body: { newName?: string; description?: string; content?: string },
): Promise<Response> {
  return putJson(`${base}/${encodeURIComponent(oldName)}/rename`, body);
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
      description: "default key & genre",
      content: "Composes mostly in C minor, house/techno.",
    });

    expect(res.status).toBe(200);
    const { entry } = (await res.json()) as { entry: MemoryEntry };

    expect(entry).toStrictEqual({
      name: "prefers-c-minor",
      description: "default key & genre",
      body: "Composes mostly in C minor, house/techno.",
    });

    const entries = await listEntries();

    expect(entries.map((e) => e.name)).toStrictEqual(["prefers-c-minor"]);
  });

  it("PUT overwrites in place when the same name is stored again", async () => {
    await putMemory("album-nyx", {
      description: "v1",
      content: "first",
    });
    await putMemory("album-nyx", {
      description: "v2",
      content: "second",
    });

    const entries = await listEntries();
    const nyx = entries.filter((e) => e.name === "album-nyx");

    expect(nyx).toHaveLength(1);
    expect(nyx[0]?.body).toBe("second");
  });

  it("rejects a missing/blank description with 400 (store validation)", async () => {
    const res = await putJson(`${base}/loose-drums`, {
      content: "Apply groove.",
      description: "   ",
    });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(
      /description must not be empty/i,
    );
  });

  it("DELETE removes an entry and reports whether it existed", async () => {
    await putMemory("temp-note", { content: "x" });

    const hit = await fetch(`${base}/temp-note`, { method: "DELETE" });
    const miss = await fetch(`${base}/temp-note`, { method: "DELETE" });

    expect(await hit.json()).toStrictEqual({ existed: true });
    expect(await miss.json()).toStrictEqual({ existed: false });
  });

  it("rejects a create-only PUT that collides with an existing name (409)", async () => {
    await putMemory("collide", { content: "original" });

    // Same slug via a differently-cased name, with createOnly set (the editor's
    // Create flow) — must not overwrite the existing memory.
    const res = await putMemory("Collide", {
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
      content: "hi",
      createOnly: true,
    });

    expect(res.status).toBe(200);
  });

  it("rejects a non-string content with 400", async () => {
    const res = await putJson(`${base}/bad-content`, {
      content: 42,
    });

    expect(res.status).toBe(400);
  });

  it("PUT with no JSON body rejects with 400, not 500", async () => {
    // No Content-Type: application/json → express leaves req.body undefined;
    // the handler must 400 (bad request) rather than TypeError into a 500.
    const res = await fetch(`${base}/no-body`, { method: "PUT" });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(
      /content must be a string/i,
    );
  });

  it("rename PUT with no JSON body rejects with 400, not 500", async () => {
    const res = await fetch(`${base}/no-body/rename`, { method: "PUT" });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/newname/i);
  });

  it("rejects an empty body with 400 (store validation)", async () => {
    const res = await putMemory("blank", { content: "   " });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(
      /body must not be empty/i,
    );
  });

  it("rejects an unslugifiable name with 400", async () => {
    const res = await putMemory("!!!", { content: "x" });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(
      /name must contain/i,
    );
  });

  it("blocks genuinely cross-site writes with 403", async () => {
    const putRes = await putJson(
      `${base}/evil`,
      { content: "x" },
      "https://evil.example.com",
    );
    const delRes = await fetch(`${base}/evil`, {
      method: "DELETE",
      headers: { Origin: "https://evil.example.com" },
    });

    expect(putRes.status).toBe(403);
    expect(delRes.status).toBe(403);
  });

  it("PUT /:name/rename moves the entry to the new slug; GET reflects it", async () => {
    await putMemory("rename-src", {
      description: "hook",
      content: "the fact",
    });

    const res = await putRename("rename-src", {
      newName: "Rename Dst",
      description: "hook",
      content: "the fact",
    });

    expect(res.status).toBe(200);
    const { entry } = (await res.json()) as { entry: MemoryEntry };

    expect(entry.name).toBe("rename-dst");

    const entries = await listEntries();
    const names = entries.map((e) => e.name);

    expect(names).toContain("rename-dst");
    expect(names).not.toContain("rename-src");
  });

  it("rejects a rename that collides with a different memory (409)", async () => {
    await putMemory("keep-a", { content: "a" });
    await putMemory("keep-b", { content: "b" });

    const res = await putRename("keep-a", {
      newName: "keep-b",
      content: "a",
    });

    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(
      /already exists/i,
    );
    // Both survive.
    const entries = await listEntries();
    const names = entries.map((e) => e.name);

    expect(names).toStrictEqual(expect.arrayContaining(["keep-a", "keep-b"]));
  });

  it("rejects a rename with a missing newName (400)", async () => {
    await putMemory("rn-missing", { content: "x" });

    const res = await putRename("rn-missing", { content: "x" });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/newname/i);
  });

  it("blocks a cross-site rename with 403", async () => {
    const res = await putJson(
      `${base}/whatever/rename`,
      { newName: "x", content: "x" },
      "https://evil.example.com",
    );

    expect(res.status).toBe(403);
  });
});
