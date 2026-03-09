// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "fake-indexeddb/auto";
import { describe, expect, it, beforeEach } from "vitest";
import {
  saveConversation,
  resetDbCache,
  type ConversationRecord,
} from "#webui/lib/conversation-db";
import {
  exportConversations,
  importConversations,
} from "#webui/lib/conversation-transfer";

const makeRecord = (
  id: string,
  title: string | null = null,
): ConversationRecord => ({
  id,
  title,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  bookmarked: false,
  provider: null,
  model: null,
  messages: [{ role: "user", content: `hello from ${id}` }],
});

describe("conversation-transfer", () => {
  beforeEach(() => {
    resetDbCache();
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

  it("overwrites existing conversations on matching ID", async () => {
    await saveConversation(makeRecord("x", "Original"));

    const updated = makeRecord("x", "Updated");
    const data = { version: 1, conversations: [updated] };

    const { newCount, updatedCount } = await importConversations(
      JSON.stringify(data),
    );

    expect(newCount).toBe(0);
    expect(updatedCount).toBe(1);
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

    const { newCount } = await importConversations(JSON.stringify(data));

    expect(newCount).toBe(1);
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
    expect(imported.title).toBeNull();
    expect(imported.updatedAt).toBe(100);
  });
});
