// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  lastMcpContext,
  mcpRequests,
  neverRespondToMcp,
  setMcpResponse,
} from "#src/test/mocks/mock-max.ts";
import { TOOL_NAMES } from "../../create-mcp-server.ts";
import { setupExpressAppServer } from "../express-app-test-helpers.ts";

// Parsed body of a REST tool-call response. Every field is optional because
// which ones appear depends on the route outcome and the ?format mode.
type ToolCallBody = {
  result?: unknown;
  isError?: boolean;
  errorCode?: string;
  warnings?: string[];
  appended?: string[];
};

describe("REST API Routes", () => {
  const appState = setupExpressAppServer();

  async function setEnabledTools(tools: string[]): Promise<void> {
    await fetch(`${appState.baseUrl}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tools }),
    });
  }

  async function setLiveApiEnabled(enabled: boolean): Promise<void> {
    await fetch(`${appState.baseUrl}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ liveApiEnabled: enabled }),
    });
  }

  async function setNotation(notation: string): Promise<void> {
    await fetch(`${appState.baseUrl}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notation }),
    });
  }

  beforeAll(async () => {
    // Most tests assume the Live API tool is enabled and whitelisted.
    await setLiveApiEnabled(true);
  });

  afterEach(async () => {
    await setLiveApiEnabled(true);
    await setEnabledTools([...TOOL_NAMES, "ppal-live-api"]);
    await setNotation("barbeat");
  });

  async function callTool(
    name: string,
    input: Record<string, unknown> = {},
  ): Promise<Response> {
    return await fetch(`${appState.baseUrl}/api/tools/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async function callToolWithQuery(
    name: string,
    query: string,
  ): Promise<Response> {
    return await fetch(`${appState.baseUrl}/api/tools/${name}?${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  }

  /**
   * Stub ppal-connect to report a tool error carrying the given text, call it,
   * and return the HTTP response alongside its parsed body.
   * @param text - Error text the stubbed tool returns in its isError response
   * @returns The HTTP response and its parsed JSON body
   */
  async function callConnectReportingToolError(text: string): Promise<{
    response: Response;
    body: ToolCallBody;
  }> {
    setMcpResponse({
      content: [{ type: "text", text }],
      isError: true,
    });

    const response = await callTool("ppal-connect");

    return { response, body: (await response.json()) as ToolCallBody };
  }

  describe("GET /api/tools", () => {
    it("should return all enabled tools with correct structure", async () => {
      const response = await fetch(`${appState.baseUrl}/api/tools`);

      expect(response.status).toBe(200);

      const body = await response.json();

      expect(body.tools).toBeInstanceOf(Array);
      // STANDARD_TOOL_DEFS + ppal-live-api (auto-added when liveApiEnabled flips on)
      expect(body.tools).toHaveLength(TOOL_NAMES.length + 1);

      const tool = body.tools[0];

      expect(tool).toHaveProperty("name");
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("inputSchema");
      expect(tool.inputSchema).toHaveProperty("type", "object");
    });

    it("should respect tool filtering via config", async () => {
      await setEnabledTools(["ppal-connect"]);

      const response = await fetch(`${appState.baseUrl}/api/tools`);
      const body = await response.json();

      expect(body.tools).toHaveLength(1);

      const names = body.tools.map((t: { name: string }) => t.name);

      expect(names).toStrictEqual(["ppal-connect"]);
    });

    it("resolves tool/param descriptions against the active notation", async () => {
      const notesDescription = async (): Promise<string> => {
        const response = await fetch(`${appState.baseUrl}/api/tools`);
        const body = await response.json();
        const createClip = body.tools.find(
          (t: { name: string }) => t.name === "ppal-create-clip",
        );

        return createClip.inputSchema.properties.notes.description;
      };

      expect(await notesDescription()).toContain("bar|beat notation");

      await setNotation("stark");

      const starkDescription = await notesDescription();

      expect(starkDescription).toContain("stark notation");
      expect(starkDescription).not.toContain("bar|beat notation");
    });

    it("hides deprecated params, the same as the MCP catalog", async () => {
      // The catalog is how an agent discovers the tool surface, so serving a
      // retired param here teaches the model the name MCP is hiding.
      const response = await fetch(`${appState.baseUrl}/api/tools`);
      const body = await response.json();
      const duplicate = body.tools.find(
        (t: { name: string }) => t.name === "ppal-duplicate",
      );
      const params = Object.keys(duplicate.inputSchema.properties);

      expect(params).toContain("toPath");
      expect(params).not.toContain("toSlot");
    });

    it("allows cross-origin requests (LAN/tunnel chat uses a non-localhost origin)", async () => {
      // /api/tools is intentionally NOT localhost-gated like /config: the chat
      // UI reaches it same-origin from the page URL, which over LAN/tunnel is a
      // non-localhost origin. A localhost gate would break that documented
      // remote-access feature. Locked so the gate isn't added by mistake.
      const response = await fetch(`${appState.baseUrl}/api/tools`, {
        headers: { Origin: "https://remote.example.com" },
      });

      expect(response.status).toBe(200);
    });
  });

  describe("ppal-live-api gating", () => {
    it("appears in tool list when liveApiEnabled and whitelisted", async () => {
      const response = await fetch(`${appState.baseUrl}/api/tools`);
      const body = await response.json();
      const names = body.tools.map((t: { name: string }) => t.name);

      expect(names).toContain("ppal-live-api");
    });

    it("returns 404 when removed from the tools whitelist", async () => {
      await setEnabledTools([...TOOL_NAMES]); // omit ppal-live-api

      const response = await callTool("ppal-live-api");

      expect(response.status).toBe(404);
    });

    it("disappears from tool list and returns 404 when liveApiEnabled is false", async () => {
      await setLiveApiEnabled(false);

      const listRes = await fetch(`${appState.baseUrl}/api/tools`);
      const listBody = await listRes.json();
      const names = listBody.tools.map((t: { name: string }) => t.name);

      expect(names).not.toContain("ppal-live-api");

      const callRes = await callTool("ppal-live-api");

      expect(callRes.status).toBe(404);
    });
  });

  describe("POST /api/tools/:toolName", () => {
    it("should return 404 for unknown tool", async () => {
      const response = await callTool("nonexistent");

      expect(response.status).toBe(404);

      const body = await response.json();

      expect(body.error).toContain("Unknown or disabled tool");
    });

    it("allows cross-origin tool calls (LAN/tunnel chat uses a non-localhost origin)", async () => {
      // Tool execution is intentionally NOT localhost-gated like /config (a gate
      // would break the documented LAN/tunnel chat). A cross-origin POST reaches
      // normal tool lookup — 404 for an unknown tool — rather than a 403 origin
      // block. Locked so the gate isn't added by mistake.
      const response = await fetch(
        `${appState.baseUrl}/api/tools/nonexistent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://remote.example.com",
          },
          body: "{}",
        },
      );

      expect(response.status).toBe(404);
    });

    it("should return 404 for disabled tool", async () => {
      await setEnabledTools(["ppal-connect"]);

      const response = await callTool("ppal-read-track");

      expect(response.status).toBe(404);
    });

    it("should return 400 for invalid input", async () => {
      const response = await callTool("ppal-read-track", {
        include: "not-an-array",
      });

      expect(response.status).toBe(400);

      const body = await response.json();

      expect(body.error).toBe("Validation failed");
      expect(body.details).toBeInstanceOf(Array);
    });

    it("should call tool and return unwrapped result", async () => {
      setMcpResponse({
        content: [{ type: "text", text: "track data here" }],
      });

      const response = await callTool("ppal-connect");

      expect(response.status).toBe(200);

      const body = await response.json();

      expect(body.result).toBe("track data here");
      expect(body.isError).toBe(false);
    });

    it("honors a deprecated param and warns that it is deprecated", async () => {
      // The catalog no longer lists it, so this notice is the only signal a
      // REST caller gets. The value is still forwarded.
      //
      // Regression: the notice was spelled "Warning: " while the splitter
      // matches "WARNING: ", so it arrived filed as an appended block — for
      // every REST caller that didn't ask for compact, which is the default.
      setMcpResponse({ content: [{ type: "text", text: "moved" }] });

      const response = await callTool("ppal-duplicate", {
        type: "clip",
        id: "1",
        toSlot: "2/0",
      });
      const body = (await response.json()) as ToolCallBody;

      expect(JSON.parse(mcpRequests.at(-1)!.argsJSON)).toMatchObject({
        toSlot: "2/0",
      });
      expect(body.warnings?.join("\n")).toContain(
        'param "toSlot" is deprecated',
      );
      expect(body.appended).toBeUndefined();
    });

    it("should return isError true when tool reports error", async () => {
      const { response, body } = await callConnectReportingToolError(
        "something went wrong",
      );

      expect(response.status).toBe(200);
      expect(body.result).toBe("something went wrong");
      expect(body.isError).toBe(true);
    });
  });

  describe("?format query param", () => {
    async function callToolWithFormat(
      name: string,
      format: string,
    ): Promise<Response> {
      return await fetch(
        `${appState.baseUrl}/api/tools/${name}?format=${format}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
    }

    /**
     * Stub a `{"ok":true}` JSON result followed by the given extra content
     * blocks, then call the tool in json mode and return the parsed body. Uses
     * a non-connect tool so the real skills block isn't also appended by the
     * wrapper and mistaken for one of the extra blocks under test.
     * @param extraTexts - Text of each content block appended after the result
     * @returns The parsed JSON response body
     */
    async function readTrackJsonWithExtraBlocks(
      extraTexts: string[],
    ): Promise<ToolCallBody> {
      setMcpResponse({
        content: [
          { type: "text", text: '{"ok":true}' },
          ...extraTexts.map((text) => ({ type: "text", text })),
        ],
      });

      const response = await callToolWithFormat("ppal-read-track", "json");

      return (await response.json()) as ToolCallBody;
    }

    it("should default to compactOutput: false (json) when format is omitted", async () => {
      setMcpResponse({
        content: [{ type: "text", text: '{"ok":true}' }],
      });

      await callTool("ppal-connect");

      expect(lastMcpContext()).not.toBeNull();
      expect(lastMcpContext()).toMatchObject({ compactOutput: false });
    });

    it("should parse the result as JSON when format is omitted (json default)", async () => {
      setMcpResponse({
        content: [
          { type: "text", text: '{"tempo":120}' },
          { type: "text", text: "WARNING: heads up" },
        ],
      });

      const response = await callTool("ppal-connect");
      const body = await response.json();

      expect(body.result).toStrictEqual({ tempo: 120 });
      expect(body.warnings).toStrictEqual(["heads up"]);
    });

    it("should pass compactOutput: false when format=json", async () => {
      setMcpResponse({
        content: [{ type: "text", text: '{"ok":true}' }],
      });

      const response = await callToolWithFormat("ppal-connect", "json");

      expect(response.status).toBe(200);
      expect(lastMcpContext()).toMatchObject({ compactOutput: false });
    });

    it("should return parsed object as result when format=json", async () => {
      setMcpResponse({
        content: [{ type: "text", text: '{"tempo":120,"scale":"C Major"}' }],
      });

      const response = await callToolWithFormat("ppal-connect", "json");
      const body = await response.json();

      expect(body.result).toStrictEqual({ tempo: 120, scale: "C Major" });
      expect(body.isError).toBe(false);
      expect(body.warnings).toBeUndefined();
    });

    it("should expose warnings as an array when format=json", async () => {
      setMcpResponse({
        content: [
          { type: "text", text: '{"ok":true}' },
          { type: "text", text: "WARNING: quantize ignored" },
          { type: "text", text: "WARNING: clip already looped" },
        ],
      });

      const response = await callToolWithFormat("ppal-connect", "json");
      const body = await response.json();

      expect(body.result).toStrictEqual({ ok: true });
      expect(body.warnings).toStrictEqual([
        "quantize ignored",
        "clip already looped",
      ]);
    });

    it("should keep error responses as a joined string even when format=json", async () => {
      setMcpResponse({
        content: [{ type: "text", text: "Error: bad input" }],
        isError: true,
      });

      const response = await callToolWithFormat("ppal-connect", "json");
      const body = await response.json();

      expect(body.result).toBe("Error: bad input");
      expect(body.isError).toBe(true);
    });

    it("should fall back to raw text when format=json receives malformed JSON", async () => {
      setMcpResponse({
        content: [{ type: "text", text: "{ malformed: not-json" }],
      });

      const response = await callToolWithFormat("ppal-connect", "json");

      expect(response.status).toBe(200);

      const body = await response.json();

      expect(body.result).toBe("{ malformed: not-json");
      expect(body.isError).toBe(false);
    });

    it("should surface non-WARNING appended blocks under `appended` when format=json", async () => {
      // The ppal-connect skills blob and global context are pushed as plain
      // extra content blocks with no WARNING: prefix (see connect-append.ts).
      // JSON mode must preserve them, not silently drop them. Use a non-connect
      // tool so the real skills block isn't also appended by the wrapper.
      const body = await readTrackJsonWithExtraBlocks([
        "WARNING: real warning",
        "# Producer Pal Skills\n...",
        "# Global context\n...",
      ]);

      expect(body.result).toStrictEqual({ ok: true });
      expect(body.warnings).toStrictEqual(["real warning"]);
      expect(body.appended).toStrictEqual([
        "# Producer Pal Skills\n...",
        "# Global context\n...",
      ]);
    });

    it("delivers the appended skills block under `appended` for ppal-connect (json)", async () => {
      // End-to-end guard: the withConnectAppend wiring pushes the skills block
      // and JSON mode must surface it, not drop it (regression for the bug
      // where JSON mode silently discarded connect's appended content).
      setMcpResponse({
        content: [{ type: "text", text: '{"connected":true}' }],
      });

      const response = await callToolWithFormat("ppal-connect", "json");
      const body = await response.json();

      expect(body.result).toStrictEqual({ connected: true });
      expect(body.appended).toBeInstanceOf(Array);
      expect(body.appended.join("\n")).toContain("# Producer Pal Skills");
    });

    it("omits `appended` when there are no non-WARNING extra blocks (format=json)", async () => {
      const body = await readTrackJsonWithExtraBlocks(["WARNING: heads up"]);

      expect(body.result).toStrictEqual({ ok: true });
      expect(body.warnings).toStrictEqual(["heads up"]);
      expect(body.appended).toBeUndefined();
    });

    it("should join content as a string when format=compact", async () => {
      // Use a non-connect tool: ppal-connect now gets a Node-side skills block
      // appended (see skills-inject.ts), which would pollute the join under test.
      setMcpResponse({
        content: [
          { type: "text", text: "{ok:true}" },
          { type: "text", text: "WARNING: heads up" },
        ],
      });

      const response = await callToolWithFormat("ppal-read-track", "compact");
      const body = await response.json();

      expect(body.result).toBe("{ok:true}\nWARNING: heads up");
      expect(body.warnings).toBeUndefined();
    });

    it("appends the Node-side skills block to ppal-connect (compact)", async () => {
      // Guards the create-express-app wiring: withSkills is composed into the
      // REST/MCP call path, so ppal-connect's joined output carries the skills.
      setMcpResponse({
        content: [{ type: "text", text: "{connected:true}" }],
      });

      const response = await callToolWithFormat("ppal-connect", "compact");
      const body = await response.json();

      expect(body.result).toContain("{connected:true}");
      expect(body.result).toContain("# Producer Pal Skills");
    });

    it("should pass compactOutput: true when format=compact", async () => {
      setMcpResponse({
        content: [{ type: "text", text: "ok" }],
      });

      const response = await callToolWithFormat("ppal-connect", "compact");

      expect(response.status).toBe(200);
      expect(lastMcpContext()).toMatchObject({ compactOutput: true });
    });

    it("should return 400 for invalid format value", async () => {
      const response = await callToolWithFormat("ppal-connect", "yaml");

      expect(response.status).toBe(400);

      const body = await response.json();

      expect(body.error).toContain("Invalid format query param");
    });
  });

  describe("?timeoutMs query param", () => {
    it("should pass timeoutMs into context when provided", async () => {
      setMcpResponse({
        content: [{ type: "text", text: "ok" }],
      });

      const response = await callToolWithQuery(
        "ppal-connect",
        "timeoutMs=5000",
      );

      expect(response.status).toBe(200);
      expect(lastMcpContext()).toMatchObject({ timeoutMs: 5000 });
    });

    it("should combine ?format and ?timeoutMs in the same call", async () => {
      setMcpResponse({
        content: [{ type: "text", text: '{"ok":true}' }],
      });

      const response = await callToolWithQuery(
        "ppal-connect",
        "format=json&timeoutMs=2500",
      );

      expect(response.status).toBe(200);
      expect(lastMcpContext()).toMatchObject({
        compactOutput: false,
        timeoutMs: 2500,
      });
    });

    it("should return 400 for non-numeric timeoutMs", async () => {
      const response = await callToolWithQuery("ppal-connect", "timeoutMs=abc");

      expect(response.status).toBe(400);

      const body = await response.json();

      expect(body.error).toContain("Invalid timeoutMs query param");
    });

    it("should return 400 for zero or negative timeoutMs", async () => {
      const response = await callToolWithQuery("ppal-connect", "timeoutMs=0");

      expect(response.status).toBe(400);
    });

    it("should return 400 for timeoutMs above the cap", async () => {
      const response = await callToolWithQuery(
        "ppal-connect",
        "timeoutMs=60001",
      );

      expect(response.status).toBe(400);
    });

    it("should return 400 when timeoutMs is repeated (array-valued)", async () => {
      // Express parses a repeated query key into an array; a non-string timeout
      // is rejected as invalid rather than silently picking one of the values.
      const response = await callToolWithQuery(
        "ppal-connect",
        "timeoutMs=1&timeoutMs=2",
      );

      expect(response.status).toBe(400);

      const body = await response.json();

      expect(body.error).toContain("Invalid timeoutMs query param");
    });
  });

  describe("tool-call timeout", () => {
    it("should return HTTP 504 when the tool call times out", async () => {
      // Max accepts the request but never responds, so the adapter's real
      // timeout path fires and tags the response with errorCode: "timeout".
      neverRespondToMcp();

      const response = await callToolWithQuery("ppal-connect", "timeoutMs=1");

      expect(response.status).toBe(504);

      const body = await response.json();

      expect(body.errorCode).toBe("timeout");
      expect(body.error).toContain("timed out");
    });

    it("should keep returning HTTP 200 for an ordinary (non-timeout) tool error", async () => {
      // An ordinary error carries isError but no timeout discriminator, so the
      // legacy 200 + isError contract is preserved.
      const { response, body } = await callConnectReportingToolError(
        "something went wrong",
      );

      expect(response.status).toBe(200);
      expect(body.isError).toBe(true);
      expect(body.result).toBe("something went wrong");
      expect(body.errorCode).toBeUndefined();
    });

    it("should keep returning HTTP 200 on success", async () => {
      setMcpResponse({
        content: [{ type: "text", text: "ok" }],
      });

      const response = await callTool("ppal-connect");

      expect(response.status).toBe(200);

      const body = await response.json();

      expect(body.isError).toBe(false);
      expect(body.result).toBe("ok");
    });
  });
});
