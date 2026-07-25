// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { SMALL_MODEL_MODE_HEADER } from "#src/shared/config.ts";
import { setupExpressAppServer } from "../express-app-test-helpers.ts";
import {
  connectSkillsBlock,
  connectWithHeaders,
  SKILLS_HEADER,
} from "./mcp-header-test-helpers.ts";

/**
 * Headers for a given small-model-mode value, or none when it is omitted.
 *
 * @param header - Value for the small-model-mode header, or undefined to omit it
 * @returns The request headers to send
 */
function headers(header: string | undefined): Record<string, string> {
  return header == null ? {} : { [SMALL_MODEL_MODE_HEADER]: header };
}

/**
 * Whether ppal-create-track's schema still exposes the `count` param — present
 * in full mode, dropped under small-model mode. A clean, stable discriminator
 * for the per-request schema shrink (the first of the two consumers the header
 * drives).
 *
 * @param serverUrl - The running server's /mcp URL
 * @param header - Value for the small-model-mode header, or undefined to omit it
 * @returns True when `count` is present in ppal-create-track's input schema
 */
async function createTrackHasCount(
  serverUrl: string,
  header: string | undefined,
): Promise<boolean> {
  const { client, transport } = await connectWithHeaders(
    serverUrl,
    headers(header),
  );

  try {
    const { tools } = await client.listTools();
    const createTrack = tools.find((t) => t.name === "ppal-create-track");

    return createTrack?.inputSchema.properties?.count != null;
  } finally {
    await transport.close();
  }
}

// The harness leaves the global config.smallModelMode at its default (false).
describe("POST /mcp per-request small-model-mode header", () => {
  const appState = setupExpressAppServer();

  describe("tool-schema shrink", () => {
    it("shrinks tool schemas for this request when the header is true", async () => {
      expect(await createTrackHasCount(appState.serverUrl, "true")).toBe(false);
    });

    it("keeps full schemas when the header is explicitly false", async () => {
      expect(await createTrackHasCount(appState.serverUrl, "false")).toBe(true);
    });

    it("falls back to the global default (full schemas) when absent", async () => {
      // Proves an external MCP client that sends no header is unaffected.
      expect(await createTrackHasCount(appState.serverUrl, undefined)).toBe(
        true,
      );
    });

    it("does not leak one request's mode onto the next", async () => {
      // A shrunk request must not mutate the global for a later headerless one.
      await createTrackHasCount(appState.serverUrl, "true");

      expect(await createTrackHasCount(appState.serverUrl, undefined)).toBe(
        true,
      );
    });
  });

  describe("skills variant", () => {
    it("serves a different skills variant per-request driven by the header", async () => {
      const basic = await connectSkillsBlock(
        appState.serverUrl,
        headers("true"),
      );
      const standard = await connectSkillsBlock(
        appState.serverUrl,
        headers("false"),
      );

      // Both connect requests inject a skills block...
      expect(basic.startsWith(SKILLS_HEADER)).toBe(true);
      expect(standard.startsWith(SKILLS_HEADER)).toBe(true);
      // ...but the small-model (basic) variant differs from the standard one,
      // proving the per-request header — not just the global — selects it.
      expect(basic).not.toBe(standard);
    });
  });
});
