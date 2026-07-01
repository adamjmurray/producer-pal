// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import Max from "max-api";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { MAX_ERROR_DELIMITER } from "#src/shared/mcp-response-utils.ts";
import { TOOL_NAMES } from "../../create-mcp-server.ts";
import { setupExpressAppServer } from "../express-app-test-helpers.ts";

// Type for mock Max module with test-specific properties
type MockMax = typeof Max & {
  defaultMcpResponseHandler:
    | ((requestId: string, ...chunks: string[]) => void)
    | null;
};
const mockMax = Max as MockMax;

/**
 * Stub Max.outlet to resolve MCP requests with a given response payload.
 * Returns a holder whose `.lastContext` field is populated with the parsed
 * contextJSON of the most recent mcp_request call.
 * @param payload - JSON-serializable MCP response body
 * @returns Holder for inspecting the most recent contextJSON
 */
function stubMaxOutlet(payload: Record<string, unknown>): {
  lastContext: Record<string, unknown> | null;
} {
  const holder: { lastContext: Record<string, unknown> | null } = {
    lastContext: null,
  };

  Max.outlet = ((
    message: string,
    requestId: string,
    _tool?: string,
    _argsJSON?: string,
    contextJSON?: string,
  ): Promise<void> => {
    if (message === "mcp_request") {
      if (typeof contextJSON === "string") {
        holder.lastContext = JSON.parse(contextJSON) as Record<string, unknown>;
      }

      setTimeout(() => {
        mockMax.defaultMcpResponseHandler!(
          requestId,
          JSON.stringify(payload),
          MAX_ERROR_DELIMITER,
        );
      }, 1);
    }

    return Promise.resolve();
  }) as typeof Max.outlet;

  return holder;
}

/**
 * Stub Max.outlet so it accepts the request but never sends a response,
 * forcing the adapter's timeout path to fire. Used to exercise the REST
 * route's timeout → HTTP 504 mapping end-to-end through the real adapter.
 */
function stubMaxOutletNeverResponds(): void {
  Max.outlet = ((): Promise<void> => Promise.resolve()) as typeof Max.outlet;
}

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

  beforeAll(async () => {
    // Most tests assume the Live API tool is enabled and whitelisted.
    await setLiveApiEnabled(true);
  });

  afterEach(async () => {
    await setLiveApiEnabled(true);
    await setEnabledTools([...TOOL_NAMES, "ppal-live-api"]);
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
      stubMaxOutlet({
        content: [{ type: "text", text: "track data here" }],
      });

      const response = await callTool("ppal-connect");

      expect(response.status).toBe(200);

      const body = await response.json();

      expect(body.result).toBe("track data here");
      expect(body.isError).toBe(false);
    });

    it("should return isError true when tool reports error", async () => {
      stubMaxOutlet({
        content: [{ type: "text", text: "something went wrong" }],
        isError: true,
      });

      const response = await callTool("ppal-connect");

      expect(response.status).toBe(200);

      const body = await response.json();

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

    it("should default to compactOutput: false (json) when format is omitted", async () => {
      const holder = stubMaxOutlet({
        content: [{ type: "text", text: '{"ok":true}' }],
      });

      await callTool("ppal-connect");

      expect(holder.lastContext).not.toBeNull();
      expect(holder.lastContext).toMatchObject({ compactOutput: false });
    });

    it("should parse the result as JSON when format is omitted (json default)", async () => {
      stubMaxOutlet({
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
      const holder = stubMaxOutlet({
        content: [{ type: "text", text: '{"ok":true}' }],
      });

      const response = await callToolWithFormat("ppal-connect", "json");

      expect(response.status).toBe(200);
      expect(holder.lastContext).toMatchObject({ compactOutput: false });
    });

    it("should return parsed object as result when format=json", async () => {
      stubMaxOutlet({
        content: [{ type: "text", text: '{"tempo":120,"scale":"C Major"}' }],
      });

      const response = await callToolWithFormat("ppal-connect", "json");
      const body = await response.json();

      expect(body.result).toStrictEqual({ tempo: 120, scale: "C Major" });
      expect(body.isError).toBe(false);
      expect(body.warnings).toBeUndefined();
    });

    it("should expose warnings as an array when format=json", async () => {
      stubMaxOutlet({
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
      stubMaxOutlet({
        content: [{ type: "text", text: "Error: bad input" }],
        isError: true,
      });

      const response = await callToolWithFormat("ppal-connect", "json");
      const body = await response.json();

      expect(body.result).toBe("Error: bad input");
      expect(body.isError).toBe(true);
    });

    it("should fall back to raw text when format=json receives malformed JSON", async () => {
      stubMaxOutlet({
        content: [{ type: "text", text: "{ malformed: not-json" }],
      });

      const response = await callToolWithFormat("ppal-connect", "json");

      expect(response.status).toBe(200);

      const body = await response.json();

      expect(body.result).toBe("{ malformed: not-json");
      expect(body.isError).toBe(false);
    });

    it("should ignore non-WARNING content items past the first when format=json", async () => {
      stubMaxOutlet({
        content: [
          { type: "text", text: '{"ok":true}' },
          { type: "text", text: "WARNING: real warning" },
          { type: "text", text: "some unexpected debug item" },
        ],
      });

      const response = await callToolWithFormat("ppal-connect", "json");
      const body = await response.json();

      expect(body.result).toStrictEqual({ ok: true });
      expect(body.warnings).toStrictEqual(["real warning"]);
    });

    it("should join content as a string when format=compact", async () => {
      // Use a non-connect tool: ppal-connect now gets a Node-side skills block
      // appended (see skills-inject.ts), which would pollute the join under test.
      stubMaxOutlet({
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
      stubMaxOutlet({
        content: [{ type: "text", text: "{connected:true}" }],
      });

      const response = await callToolWithFormat("ppal-connect", "compact");
      const body = await response.json();

      expect(body.result).toContain("{connected:true}");
      expect(body.result).toContain("# Producer Pal Skills");
    });

    it("should pass compactOutput: true when format=compact", async () => {
      const holder = stubMaxOutlet({
        content: [{ type: "text", text: "ok" }],
      });

      const response = await callToolWithFormat("ppal-connect", "compact");

      expect(response.status).toBe(200);
      expect(holder.lastContext).toMatchObject({ compactOutput: true });
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
      const holder = stubMaxOutlet({
        content: [{ type: "text", text: "ok" }],
      });

      const response = await callToolWithQuery(
        "ppal-connect",
        "timeoutMs=5000",
      );

      expect(response.status).toBe(200);
      expect(holder.lastContext).toMatchObject({ timeoutMs: 5000 });
    });

    it("should combine ?format and ?timeoutMs in the same call", async () => {
      const holder = stubMaxOutlet({
        content: [{ type: "text", text: '{"ok":true}' }],
      });

      const response = await callToolWithQuery(
        "ppal-connect",
        "format=json&timeoutMs=2500",
      );

      expect(response.status).toBe(200);
      expect(holder.lastContext).toMatchObject({
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
  });

  describe("tool-call timeout", () => {
    it("should return HTTP 504 when the tool call times out", async () => {
      // Max accepts the request but never responds, so the adapter's real
      // timeout path fires and tags the response with errorCode: "timeout".
      stubMaxOutletNeverResponds();

      const response = await callToolWithQuery("ppal-connect", "timeoutMs=1");

      expect(response.status).toBe(504);

      const body = await response.json();

      expect(body.errorCode).toBe("timeout");
      expect(body.error).toContain("timed out");
    });

    it("should keep returning HTTP 200 for an ordinary (non-timeout) tool error", async () => {
      // An ordinary error carries isError but no timeout discriminator, so the
      // legacy 200 + isError contract is preserved.
      stubMaxOutlet({
        content: [{ type: "text", text: "something went wrong" }],
        isError: true,
      });

      const response = await callTool("ppal-connect");

      expect(response.status).toBe(200);

      const body = await response.json();

      expect(body.isError).toBe(true);
      expect(body.result).toBe("something went wrong");
      expect(body.errorCode).toBeUndefined();
    });

    it("should keep returning HTTP 200 on success", async () => {
      stubMaxOutlet({
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
