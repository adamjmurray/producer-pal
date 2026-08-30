// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { NOTATION_HEADER } from "#src/shared/notation.ts";
import { setupExpressAppServer } from "../../express-app-test-helpers.ts";
import {
  callToolRequestContext,
  connectSkillsBlock,
  connectWithHeaders,
  SKILLS_HEADER,
} from "./mcp-header-test-helpers.ts";

/**
 * Headers for a given notation value, or none when it is omitted.
 *
 * @param header - Value for the notation header, or undefined to omit it
 * @returns The request headers to send
 */
function headers(header: string | undefined): Record<string, string> {
  return header == null ? {} : { [NOTATION_HEADER]: header };
}

/**
 * ppal-create-clip's `notes` param description, which carries notation-keyed
 * override text — the discriminator for the per-request schema consumer.
 *
 * @param serverUrl - The running server's /mcp URL
 * @param header - Value for the notation header, or undefined to omit it
 * @returns The `notes` param description
 */
async function notesDescription(
  serverUrl: string,
  header: string | undefined,
): Promise<string> {
  const { client, transport } = await connectWithHeaders(
    serverUrl,
    headers(header),
  );

  try {
    const { tools } = await client.listTools();
    const createClip = tools.find((t) => t.name === "ppal-create-clip");
    const notes = createClip?.inputSchema.properties?.notes as
      | { description?: string }
      | undefined;

    return notes?.description ?? "";
  } finally {
    await transport.close();
  }
}

// The harness leaves the global config.notation at its default (barbeat).
describe("POST /mcp per-request notation header", () => {
  const appState = setupExpressAppServer();

  describe("V8 request override", () => {
    it("carries the header's notation in the context handed to V8", async () => {
      // The whole point of the header over a POST /config: execution — how notes
      // are parsed and formatted — moves with the skills, not just the prose.
      const context = await callToolRequestContext(
        appState.serverUrl,
        headers("stark"),
        "ppal-read-clip",
      );

      expect(context.notation).toBe("stark");
    });

    it("carries the global notation when the header is absent", async () => {
      const context = await callToolRequestContext(
        appState.serverUrl,
        {},
        "ppal-read-clip",
      );

      expect(context.notation).toBe("barbeat");
    });

    it("falls back to the global for an unrecognized notation", async () => {
      // A stray value must not wedge the request into an invalid notation.
      const context = await callToolRequestContext(
        appState.serverUrl,
        headers("tablature"),
        "ppal-read-clip",
      );

      expect(context.notation).toBe("barbeat");
    });

    it("does not leak one request's notation onto the next", async () => {
      await callToolRequestContext(
        appState.serverUrl,
        headers("stark"),
        "ppal-read-clip",
      );

      const context = await callToolRequestContext(
        appState.serverUrl,
        {},
        "ppal-read-clip",
      );

      expect(context.notation).toBe("barbeat");
    });
  });

  describe("tool schemas", () => {
    it("serves notation-keyed param descriptions per-request", async () => {
      const stark = await notesDescription(appState.serverUrl, "stark");
      const global = await notesDescription(appState.serverUrl, undefined);

      expect(stark).not.toBe("");
      expect(global).not.toBe("");
      expect(stark).not.toBe(global);
    });
  });

  describe("skills variant", () => {
    it("serves a different skills variant per-request driven by the header", async () => {
      const stark = await connectSkillsBlock(
        appState.serverUrl,
        headers("stark"),
      );
      const global = await connectSkillsBlock(appState.serverUrl, {});

      expect(stark.startsWith(SKILLS_HEADER)).toBe(true);
      expect(global.startsWith(SKILLS_HEADER)).toBe(true);
      expect(stark).not.toBe(global);
    });
  });
});
