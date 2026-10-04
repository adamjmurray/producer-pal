// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { loadConversation, resetDbCache } from "#webui/lib/conversation-db";
import { importConversations } from "#webui/lib/conversation-transfer";

describe("importConversations imported flag", () => {
  beforeEach(async () => {
    await resetDbCache();
  });

  it("marks every imported record as imported, whatever the file says", async () => {
    const record = (id: string, extra: object = {}) => ({
      id,
      createdAt: 100,
      messages: [{ role: "user", content: "hi" }],
      ...extra,
    });

    await importConversations(
      JSON.stringify({
        version: 1,
        conversations: [
          record("plain"),
          record("claims-local", { imported: false }),
        ],
      }),
    );

    const plain = await loadConversation("plain");
    const claimsLocal = await loadConversation("claims-local");

    expect(plain?.imported).toBe(true);
    expect(claimsLocal?.imported).toBe(true);
  });
});
