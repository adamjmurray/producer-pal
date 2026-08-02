// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "fake-indexeddb/auto";
import { describe, expect, it, beforeEach } from "vitest";
import {
  type ConversationRecord,
  MAX_CONVERSATIONS,
  deleteAllConversations,
  loadConversation,
  saveConversation,
  resetDbCache,
  searchConversations,
} from "#webui/lib/conversation-db";
import {
  exportConversation,
  exportConversations,
  importConversations,
} from "#webui/lib/conversation-transfer";
import { createTestRecord } from "#webui/test-utils/conversation-test-helpers";

/**
 * Create a test record with a specific ID and optional title.
 * @param id - Conversation ID
 * @param title - Optional title
 * @returns A conversation record
 */
const makeRecord = (id: string, title: string | null = null) =>
  createTestRecord({
    id,
    title,
    messages: [{ role: "user", content: `hello from ${id}` }],
  });

/**
 * Import export-shaped data, then re-export and return the record with the given
 * id — proving a value survived the import normalize round-trip.
 * @param data - Export-format payload to import
 * @param id - Id of the record to read back
 * @returns The re-exported record
 */
const importThenReread = async (
  data: unknown,
  id: string,
): Promise<ConversationRecord> => {
  await importConversations(JSON.stringify(data));

  const { json } = await exportConversations();
  const parsed = JSON.parse(json) as { conversations: ConversationRecord[] };

  return parsed.conversations.find((c) => c.id === id)!;
};

/**
 * Export-format payload whose one assistant message carries a single spawn
 * tool result with the given raw subagent fields.
 * @param id - Conversation id
 * @param subagent - Raw subagent fields to put on the tool result
 * @returns Export-format payload
 */
const withSubagentResult = (id: string, subagent: Record<string, unknown>) => ({
  version: 1,
  conversations: [
    {
      id,
      createdAt: 100,
      messages: [
        {
          role: "assistant",
          content: "spawned",
          toolResults: [
            {
              id: "call-1",
              name: "spawn_subagent",
              args: {},
              result: "ok",
              ...subagent,
            },
          ],
        },
      ],
    },
  ],
});

describe("conversation-transfer", () => {
  beforeEach(async () => {
    await resetDbCache();
  });

  it("exports all conversations as JSON", async () => {
    await saveConversation(makeRecord("a", "Session A"));
    await saveConversation(makeRecord("b", "Session B"));

    const { json, count } = await exportConversations();

    expect(count).toBe(2);

    const parsed = JSON.parse(json) as {
      version: number;
      conversations: ConversationRecord[];
    };

    expect(parsed.version).toBe(1);
    expect(parsed.conversations).toHaveLength(2);
  });

  it("imports new conversations", async () => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      conversations: [makeRecord("x", "Imported")],
    };

    const { newCount, updatedCount } = await importConversations(
      JSON.stringify(data),
    );

    expect(newCount).toBe(1);
    expect(updatedCount).toBe(0);
  });

  it("overwrites existing conversations when imported version is newer", async () => {
    const original = makeRecord("x", "Original");

    original.updatedAt = 1000;
    await saveConversation(original);

    const updated = makeRecord("x", "Updated");

    updated.updatedAt = 2000;
    const data = { version: 1, conversations: [updated] };

    const { newCount, updatedCount } = await importConversations(
      JSON.stringify(data),
    );

    expect(newCount).toBe(0);
    expect(updatedCount).toBe(1);
  });

  it("ignores imported conversations older than local version", async () => {
    const local = makeRecord("x", "Local");

    local.updatedAt = 2000;
    await saveConversation(local);

    const older = makeRecord("x", "Older");

    older.updatedAt = 1000;
    const data = { version: 1, conversations: [older] };

    const { newCount, updatedCount, ignoredCount } = await importConversations(
      JSON.stringify(data),
    );

    expect(newCount).toBe(0);
    expect(updatedCount).toBe(0);
    expect(ignoredCount).toBe(1);
  });

  it("ignores imported conversations with same updatedAt as local", async () => {
    const local = makeRecord("x", "Local");

    local.updatedAt = 1000;
    await saveConversation(local);

    const same = makeRecord("x", "Same");

    same.updatedAt = 1000;
    const data = { version: 1, conversations: [same] };

    const { updatedCount, ignoredCount } = await importConversations(
      JSON.stringify(data),
    );

    expect(updatedCount).toBe(0);
    expect(ignoredCount).toBe(1);
  });

  it("rejects invalid JSON structure", async () => {
    await expect(importConversations("{}")).rejects.toThrow(
      "missing conversations array",
    );
  });

  it("skips records missing required fields or with only malformed messages", async () => {
    const data = {
      version: 1,
      conversations: [
        { id: "valid", createdAt: 123, messages: [] },
        { title: "no-id" },
        { id: "no-created", messages: [] },
        // Every message lacks string content / is null — nothing survives the
        // filter (and importing the husk would crash searchConversations), so
        // these records are skipped wholesale.
        { id: "bad-msg", createdAt: 2, messages: [{ role: "user" }] },
        { id: "bad-msg-2", createdAt: 3, messages: [null] },
      ],
    };

    const { newCount, skippedCount } = await importConversations(
      JSON.stringify(data),
    );

    expect(newCount).toBe(1);
    expect(skippedCount).toBe(4);
  });

  it("imports a record with mixed messages, dropping only the malformed ones", async () => {
    const data = {
      version: 1,
      conversations: [
        {
          id: "mixed",
          createdAt: 1,
          // One bad entry between two good ones must not strand the whole
          // conversation — only the bad entry is dropped.
          messages: [
            { role: "user", content: "keep me" },
            { role: "user" },
            { role: "assistant", content: "and me" },
          ],
        },
      ],
    };

    const imported = await importThenReread(data, "mixed");

    // The record survived (not skipped wholesale) and kept only its good
    // messages.
    expect(imported.messages.map((m) => m.content)).toStrictEqual([
      "keep me",
      "and me",
    ]);
  });

  it("coerces a non-string title to null so search can't crash", async () => {
    const data = {
      version: 1,
      conversations: [
        {
          id: "bad-title",
          createdAt: 1,
          // A hand-edited/corrupt import can carry a non-string title; it must
          // not be persisted as-is or search's `title.toLowerCase()` throws.
          title: 42,
          messages: [{ role: "user", content: "hello" }],
        },
      ],
    };

    const imported = await importThenReread(data, "bad-title");

    expect(imported.title).toBeNull();
    // Search over the whole list must not throw on the poisoned record.
    const matches = await searchConversations("hello");

    expect(matches.has("bad-title")).toBe(true);
  });

  it("exports a single conversation by ID", async () => {
    await saveConversation(makeRecord("a", "Session A"));
    await saveConversation(makeRecord("b", "Session B"));

    const { json, title } = await exportConversation("a");

    expect(title).toBe("Session A");

    const parsed = JSON.parse(json) as {
      version: number;
      conversations: ConversationRecord[];
    };

    expect(parsed.version).toBe(1);
    expect(parsed.conversations).toHaveLength(1);
    expect(parsed.conversations[0]?.id).toBe("a");
  });

  it("throws when exporting a non-existent conversation", async () => {
    await expect(exportConversation("missing")).rejects.toThrow("not found");
  });

  it("normalizes missing optional fields", async () => {
    const data = {
      version: 1,
      conversations: [{ id: "minimal", createdAt: 100, messages: [] }],
    };

    const imported = await importThenReread(data, "minimal");

    expect(imported.bookmarked).toBe(false);
    expect(imported.provider).toBeNull();
    expect(imported.model).toBeNull();
    expect(imported.modelLabel).toBeNull();
    expect(imported.title).toBeNull();
    expect(imported.updatedAt).toBe(100);
    expect(imported.sessionType).toBe("text");
    expect(imported.voiceHistory).toBeNull();
  });

  it("round-trips fork pointers so branch families re-import linked", async () => {
    // Mirror what exportConversations serializes for a fork record: a real
    // export carries forkParentId/forkedAtIndex, so import must preserve them or
    // the re-imported fork is orphaned out of its divergence set.
    const data = {
      version: 1,
      conversations: [
        {
          id: "fork",
          createdAt: 100,
          messages: [{ role: "user", content: "forked" }],
          forkParentId: "trunk",
          forkedAtIndex: 2,
        },
      ],
    };

    const importedFork = await importThenReread(data, "fork");

    expect(importedFork.forkParentId).toBe("trunk");
    expect(importedFork.forkedAtIndex).toBe(2);
  });

  it("protects a pre-existing trunk from the import trim when a fork of it is imported", async () => {
    // Fill to the cap. "trunk" is the oldest, unbookmarked record; "second" is
    // the next oldest. Importing a fork of the trunk pushes one over the cap and
    // triggers a trim. The trunk belongs to the imported fork's family, so the
    // trim must spare it and evict the next-oldest unprotected record instead —
    // otherwise importing a fork would silently delete its local trunk.
    await deleteAllConversations(); // earlier tests leave records (resetDbCache only closes)
    await saveConversation(createTestRecord({ id: "trunk", updatedAt: 1 }));
    await saveConversation(createTestRecord({ id: "second", updatedAt: 2 }));

    for (let i = 2; i < MAX_CONVERSATIONS; i++) {
      await saveConversation(
        createTestRecord({ id: `filler-${i}`, updatedAt: 1000 + i }),
      );
    }

    await importConversations(
      JSON.stringify({
        version: 1,
        conversations: [
          {
            id: "imported-fork",
            createdAt: 5000,
            updatedAt: 5000,
            messages: [{ role: "user", content: "forked" }],
            forkParentId: "trunk",
            forkedAtIndex: 0,
          },
        ],
      }),
    );

    expect(await loadConversation("trunk")).toBeDefined(); // protected family
    expect(await loadConversation("second")).toBeUndefined(); // trimmed instead
    expect(await loadConversation("imported-fork")).toBeDefined();
  });

  it("drops a self-referential fork pointer on import", async () => {
    // A corrupt/hand-edited export naming itself as its own trunk would split
    // its family across roots and confuse the ‹ n/m › arrows; import strips it.
    const data = {
      version: 1,
      conversations: [
        {
          id: "self",
          createdAt: 100,
          messages: [{ role: "user", content: "loop" }],
          forkParentId: "self",
          forkedAtIndex: 1,
        },
      ],
    };

    const imported = await importThenReread(data, "self");

    expect(imported).not.toHaveProperty("forkParentId");
    expect(imported).not.toHaveProperty("forkedAtIndex");
  });

  it("drops the pointers of a two-node fork cycle on import", async () => {
    // A↔B each name the other as trunk. Both pointers are cyclic, so both are
    // stripped, leaving two independent (un-linked) records rather than a broken
    // family that never collapses.
    await importConversations(
      JSON.stringify({
        version: 1,
        conversations: [
          {
            id: "cyc-a",
            createdAt: 100,
            messages: [{ role: "user", content: "a" }],
            forkParentId: "cyc-b",
            forkedAtIndex: 1,
          },
          {
            id: "cyc-b",
            createdAt: 101,
            messages: [{ role: "user", content: "b" }],
            forkParentId: "cyc-a",
            forkedAtIndex: 1,
          },
        ],
      }),
    );

    expect(await loadConversation("cyc-a")).not.toHaveProperty("forkParentId");
    expect(await loadConversation("cyc-b")).not.toHaveProperty("forkParentId");
  });

  it("keeps a valid fork pointer to a missing trunk on import", async () => {
    // A pointer whose trunk doesn't exist is orphaned, not cyclic, so it must
    // survive (orphaned siblings still collapse via the referenced root).
    const data = {
      version: 1,
      conversations: [
        {
          id: "orphan",
          createdAt: 100,
          messages: [{ role: "user", content: "x" }],
          forkParentId: "deleted-trunk",
          forkedAtIndex: 3,
        },
      ],
    };

    const imported = await importThenReread(data, "orphan");

    expect(imported.forkParentId).toBe("deleted-trunk");
    expect(imported.forkedAtIndex).toBe(3);
  });

  it("leaves non-forked records without branch pointers on import", async () => {
    const data = {
      version: 1,
      conversations: [{ id: "plain", createdAt: 100, messages: [] }],
    };

    const imported = await importThenReread(data, "plain");

    expect(imported).not.toHaveProperty("forkParentId");
    expect(imported).not.toHaveProperty("forkedAtIndex");
  });

  it("preserves sessionType and voiceHistory on import", async () => {
    const voiceItems = [{ type: "message", role: "user", content: [] }];
    const data = {
      version: 1,
      conversations: [
        {
          id: "voice-record",
          createdAt: 100,
          messages: [],
          sessionType: "voice",
          voiceHistory: voiceItems,
        },
      ],
    };

    const imported = await importThenReread(data, "voice-record");

    expect(imported.sessionType).toBe("voice");
    expect(imported.voiceHistory).toStrictEqual(voiceItems);
  });

  it("round-trips the system-prompt snapshot on import", async () => {
    const data = {
      version: 1,
      conversations: [
        {
          id: "with-prompt",
          createdAt: 100,
          messages: [{ role: "user", content: "hi" }],
          systemInstruction: "You are a custom assistant.",
        },
      ],
    };

    const imported = await importThenReread(data, "with-prompt");

    expect(imported.systemInstruction).toBe("You are a custom assistant.");
  });

  it("leaves records without a system-prompt snapshot unchanged", async () => {
    const data = {
      version: 1,
      conversations: [
        {
          id: "no-prompt",
          createdAt: 100,
          messages: [{ role: "user", content: "hi" }],
        },
      ],
    };

    const imported = await importThenReread(data, "no-prompt");

    expect(imported).not.toHaveProperty("systemInstruction");
  });

  it("round-trips the notation snapshot on import", async () => {
    const data = {
      version: 1,
      conversations: [
        {
          id: "with-notation",
          createdAt: 100,
          messages: [{ role: "user", content: "hi" }],
          notation: "stark",
        },
      ],
    };

    const imported = await importThenReread(data, "with-notation");

    expect(imported.notation).toBe("stark");
  });

  it("drops an unknown notation rather than importing it", async () => {
    // It would be sent as a header the server can't resolve, so the record is
    // better off with no opinion at all.
    const data = {
      version: 1,
      conversations: [
        {
          id: "bad-notation",
          createdAt: 100,
          messages: [{ role: "user", content: "hi" }],
          notation: "tablature",
        },
      ],
    };

    const imported = await importThenReread(data, "bad-notation");

    expect(imported).not.toHaveProperty("notation");
  });

  it("round-trips the toolset the conversation last connected with", async () => {
    const data = {
      version: 1,
      conversations: [
        {
          id: "with-tools",
          createdAt: 100,
          messages: [{ role: "user", content: "hi" }],
          enabledTools: { "ppal-library": false },
        },
      ],
    };

    const imported = await importThenReread(data, "with-tools");

    expect(imported.enabledTools).toStrictEqual({ "ppal-library": false });
  });

  it("drops a malformed toolset rather than importing it", async () => {
    // It gets compared against live settings, so a non-boolean map would report
    // a bogus divergence forever.
    const data = {
      version: 1,
      conversations: [
        {
          id: "bad-tools",
          createdAt: 100,
          messages: [{ role: "user", content: "hi" }],
          enabledTools: ["ppal-library"],
        },
      ],
    };

    const imported = await importThenReread(data, "bad-tools");

    expect(imported).not.toHaveProperty("enabledTools");
  });

  it("round-trips a well-formed subagent transcript and index", async () => {
    const imported = await importThenReread(
      withSubagentResult("good-subagent", {
        subagentTranscript: [{ role: "user", content: "do the thing" }],
        subagentIndex: 2,
      }),
      "good-subagent",
    );
    const entry = imported.messages[0]!.toolResults![0]!;

    expect(entry.subagentIndex).toBe(2);
    expect(entry.subagentTranscript).toStrictEqual([
      { role: "user", content: "do the thing" },
    ]);
  });

  it("drops only the malformed messages from a subagent transcript", async () => {
    // A transcript is spliced verbatim into a resumed worker's chat history, so
    // a message without string content has to go. The rest stays: dropping the
    // whole array leaves the index behind, and that card renders empty and
    // fails to resume.
    const imported = await importThenReread(
      withSubagentResult("bad-transcript", {
        subagentTranscript: [{}, { role: "user", content: "do the thing" }],
        subagentIndex: 1,
      }),
      "bad-transcript",
    );
    const entry = imported.messages[0]!.toolResults![0]!;

    expect(entry.subagentTranscript).toStrictEqual([
      { role: "user", content: "do the thing" },
    ]);
    expect(entry.subagentIndex).toBe(1);
  });

  it("drops a subagent index that isn't a whole number from 1", async () => {
    // highestSubagentIndex compares with `>`, so a numeric string would seed the
    // allocator while collectSubagentTranscript's `===` never matches it.
    const imported = await importThenReread(
      withSubagentResult("bad-index", { subagentIndex: "2" }),
      "bad-index",
    );

    expect(imported.messages[0]!.toolResults![0]!).not.toHaveProperty(
      "subagentIndex",
    );
  });

  it("falls back to createdAt for a non-numeric updatedAt", async () => {
    const data = {
      version: 1,
      conversations: [
        {
          id: "bad-timestamp",
          createdAt: 100,
          updatedAt: "2026-01-01",
          messages: [{ role: "user", content: "hi" }],
        },
      ],
    };

    const imported = await importThenReread(data, "bad-timestamp");

    expect(imported.updatedAt).toBe(100);
  });

  it("drops a toolResults that isn't an array", async () => {
    // Every reader treats it as one, and the throw lands outside the
    // per-message error boundary — so importing this used to persist a
    // conversation that could never be opened again.
    const data = {
      version: 1,
      conversations: [
        {
          id: "not-an-array",
          createdAt: 100,
          messages: [
            {
              role: "assistant",
              content: "hi",
              toolCalls: [{ id: "1", name: "ppal-read-song", args: {} }],
              toolResults: { id: "1" },
            },
          ],
        },
      ],
    };

    const imported = await importThenReread(data, "not-an-array");

    expect(imported.messages[0]).not.toHaveProperty("toolResults");
    // The rest of the message survives.
    expect(imported.messages[0]!.content).toBe("hi");
  });

  it("leaves a tool result that isn't an object alone", async () => {
    const data = {
      version: 1,
      conversations: [
        {
          id: "odd-entry",
          createdAt: 100,
          messages: [
            { role: "assistant", content: "spawned", toolResults: [null] },
          ],
        },
      ],
    };

    const imported = await importThenReread(data, "odd-entry");

    expect(imported.messages[0]!.toolResults).toStrictEqual([null]);
  });
});
