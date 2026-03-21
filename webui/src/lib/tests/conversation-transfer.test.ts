// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "fake-indexeddb/auto";
import { describe, expect, it, beforeEach } from "vitest";
import {
  type ConversationRecord,
  saveConversation,
  resetDbCache,
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

  it("skips records missing required fields", async () => {
    const data = {
      version: 1,
      conversations: [
        { id: "valid", createdAt: 123, messages: [] },
        { title: "no-id" },
        { id: "no-created", messages: [] },
      ],
    };

    const { newCount, skippedCount } = await importConversations(
      JSON.stringify(data),
    );

    expect(newCount).toBe(1);
    expect(skippedCount).toBe(2);
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

    await importConversations(JSON.stringify(data));

    const { json } = await exportConversations();
    const parsed = JSON.parse(json) as {
      conversations: ConversationRecord[];
    };
    const imported = parsed.conversations.find((c) => c.id === "minimal")!;

    expect(imported.bookmarked).toBe(false);
    expect(imported.provider).toBeNull();
    expect(imported.model).toBeNull();
    expect(imported.modelLabel).toBeNull();
    expect(imported.title).toBeNull();
    expect(imported.updatedAt).toBe(100);
  });
});
