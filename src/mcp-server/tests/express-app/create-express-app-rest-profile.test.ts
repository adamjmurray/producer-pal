// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The REST endpoints honoring the notation and small-model-mode headers, the two
// POST /mcp had to itself for a release. The toolset header's REST coverage lives
// in create-express-app-tool-gating.test.ts alongside its /mcp half.
//
// The point of each test is the same: the header moves this request only. A REST
// caller that wants stark must not drag the chat UI along, which is exactly what
// the POST /config it used to need would have done.

import { describe, expect, it } from "vitest";
import { SMALL_MODEL_MODE_HEADER } from "#src/shared/config.ts";
import { NOTATION_HEADER } from "#src/shared/notation.ts";
import { setupExpressAppServer } from "../express-app-test-helpers.ts";
import { lastMcpContext } from "#src/test/mocks/mock-max.ts";
import { SKILLS_HEADER } from "./mcp-header-test-helpers.ts";

// The harness leaves the globals at their defaults: barbeat, small-model off.
const appState = setupExpressAppServer();

/** One tool entry as GET /api/tools serves it. */
interface CatalogTool {
  name: string;
  description: string;
  inputSchema: { properties?: Record<string, { description?: string }> };
}

/**
 * The catalog GET /api/tools serves with the given headers.
 *
 * @param headers - Request headers to send
 * @returns The catalog's tools, by name
 */
async function catalog(
  headers: Record<string, string>,
): Promise<Map<string, CatalogTool>> {
  const response = await fetch(`${appState.baseUrl}/api/tools`, { headers });
  const body = (await response.json()) as { tools: CatalogTool[] };

  return new Map(body.tools.map((tool) => [tool.name, tool]));
}

/**
 * ppal-create-clip's `notes` param description, which carries notation-keyed
 * override text — the discriminator for the catalog's notation resolution.
 *
 * @param headers - Request headers to send
 * @returns The `notes` param description
 */
async function notesDescription(
  headers: Record<string, string>,
): Promise<string> {
  const tools = await catalog(headers);

  return tools.get("ppal-create-clip")?.inputSchema.properties?.notes
    ?.description as string;
}

/**
 * Call a tool over REST and return the per-request context V8 received — the
 * seam the notation override travels through to reach note parsing/formatting.
 *
 * @param toolName - Tool to call
 * @param headers - Request headers to send
 * @returns The parsed contextJSON blob for that call
 */
async function callToolRequestContext(
  toolName: string,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  await fetch(`${appState.baseUrl}/api/tools/${toolName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: "{}",
  });

  return lastMcpContext() ?? {};
}

/**
 * Call ppal-connect over REST and return the injected skills block. Under
 * `?format=json` (the REST default) the Node-appended blocks arrive as
 * `appended`.
 *
 * @param headers - Request headers to send
 * @returns The skills block text, or "" when none was found
 */
async function connectSkillsBlock(
  headers: Record<string, string>,
): Promise<string> {
  const response = await fetch(`${appState.baseUrl}/api/tools/ppal-connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: "{}",
  });
  const body = (await response.json()) as { appended?: string[] };

  return body.appended?.find((text) => text.startsWith(SKILLS_HEADER)) ?? "";
}

describe("REST API per-request notation header", () => {
  describe("V8 request override", () => {
    it("carries the header's notation in the context handed to V8", async () => {
      // The half a POST /config could never do per-caller: execution — how notes
      // are parsed and formatted — moves with the descriptions.
      const context = await callToolRequestContext("ppal-read-clip", {
        [NOTATION_HEADER]: "stark",
      });

      expect(context.notation).toBe("stark");
    });

    it("carries the global notation when the header is absent", async () => {
      const context = await callToolRequestContext("ppal-read-clip", {});

      expect(context.notation).toBe("barbeat");
    });

    it("falls back to the global for an unrecognized notation", async () => {
      const context = await callToolRequestContext("ppal-read-clip", {
        [NOTATION_HEADER]: "tablature",
      });

      expect(context.notation).toBe("barbeat");
    });

    it("does not leak one request's notation onto the next", async () => {
      await callToolRequestContext("ppal-read-clip", {
        [NOTATION_HEADER]: "stark",
      });

      const context = await callToolRequestContext("ppal-read-clip", {});

      expect(context.notation).toBe("barbeat");
    });
  });

  describe("GET /api/tools", () => {
    it("serves notation-keyed param descriptions per-request", async () => {
      const stark = await notesDescription({ [NOTATION_HEADER]: "stark" });
      const global = await notesDescription({});

      expect(stark).toContain("stark notation");
      expect(global).toContain("bar|beat notation");
    });

    it("does not leak one request's notation onto the next", async () => {
      await notesDescription({ [NOTATION_HEADER]: "stark" });

      expect(await notesDescription({})).toContain("bar|beat notation");
    });
  });

  describe("skills variant", () => {
    it("serves a different skills variant per-request driven by the header", async () => {
      const stark = await connectSkillsBlock({ [NOTATION_HEADER]: "stark" });
      const global = await connectSkillsBlock({});

      expect(stark.startsWith(SKILLS_HEADER)).toBe(true);
      expect(global.startsWith(SKILLS_HEADER)).toBe(true);
      expect(stark).not.toBe(global);
    });
  });
});

describe("REST API per-request small-model-mode header", () => {
  /**
   * Whether ppal-create-track's catalog schema still exposes the `count` param —
   * present in full mode, dropped under small-model mode.
   *
   * @param headers - Request headers to send
   * @returns True when `count` is in the served schema
   */
  async function createTrackHasCount(
    headers: Record<string, string>,
  ): Promise<boolean> {
    const tools = await catalog(headers);

    return (
      tools.get("ppal-create-track")?.inputSchema.properties?.count != null
    );
  }

  describe("GET /api/tools", () => {
    it("shrinks the served schemas when the header is true", async () => {
      expect(
        await createTrackHasCount({ [SMALL_MODEL_MODE_HEADER]: "true" }),
      ).toBe(false);
    });

    it("keeps full schemas when the header is explicitly false", async () => {
      expect(
        await createTrackHasCount({ [SMALL_MODEL_MODE_HEADER]: "false" }),
      ).toBe(true);
    });

    it("falls back to the global default (full schemas) when absent", async () => {
      expect(await createTrackHasCount({})).toBe(true);
    });

    it("does not leak one request's mode onto the next", async () => {
      await createTrackHasCount({ [SMALL_MODEL_MODE_HEADER]: "true" });

      expect(await createTrackHasCount({})).toBe(true);
    });
  });

  describe("execution", () => {
    it("still accepts a param the shrunk catalog hides", async () => {
      // The catalog shrinks; validation stays on the full schema, so a caller
      // that ignores the smaller catalog isn't 400ed off a supported param.
      const response = await fetch(
        `${appState.baseUrl}/api/tools/ppal-create-track`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [SMALL_MODEL_MODE_HEADER]: "true",
          },
          body: JSON.stringify({ trackIndex: 0, count: 2 }),
        },
      );

      expect(response.status).toBe(200);
    });
  });

  describe("skills variant", () => {
    it("serves a different skills variant per-request driven by the header", async () => {
      const basic = await connectSkillsBlock({
        [SMALL_MODEL_MODE_HEADER]: "true",
      });
      const standard = await connectSkillsBlock({
        [SMALL_MODEL_MODE_HEADER]: "false",
      });

      expect(basic.startsWith(SKILLS_HEADER)).toBe(true);
      expect(standard.startsWith(SKILLS_HEADER)).toBe(true);
      expect(basic).not.toBe(standard);
    });
  });
});
