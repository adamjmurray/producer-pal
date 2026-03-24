// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import Max from "max-api";
import { describe, expect, it } from "vitest";
import { MAX_ERROR_DELIMITER } from "#src/shared/mcp-response-utils.ts";
import { TOOL_NAMES } from "../create-mcp-server.ts";
import { setupExpressAppServer } from "./express-app-test-helpers.ts";

// Type for mock Max module with test-specific properties
type MockMax = typeof Max & {
  defaultMcpResponseHandler:
    | ((requestId: string, ...chunks: string[]) => void)
    | null;
};
const mockMax = Max as MockMax;

/**
 * Stub Max.outlet to resolve MCP requests with a given response payload.
 * @param payload - JSON-serializable MCP response body
 */
function stubMaxOutlet(payload: Record<string, unknown>): void {
  Max.outlet = ((message: string, requestId: string): Promise<void> => {
    if (message === "mcp_request") {
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
}

describe("REST API Routes", () => {
  const appState = setupExpressAppServer();

  describe("GET /api/tools", () => {
    it("should return all enabled tools with correct structure", async () => {
      const response = await fetch(`${appState.baseUrl}/api/tools`);

      expect(response.status).toBe(200);

      const body = await response.json();

      expect(body.tools).toBeInstanceOf(Array);
      // +1 for ppal-raw-live-api which is always included in REST
      expect(body.tools).toHaveLength(TOOL_NAMES.length + 1);

      const tool = body.tools[0];

      expect(tool).toHaveProperty("name");
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("inputSchema");
      expect(tool.inputSchema).toHaveProperty("type", "object");
    });

    it("should respect tool filtering via config", async () => {
      // Update config to only include ppal-connect
      await fetch(`${appState.baseUrl}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tools: ["ppal-connect"] }),
      });

      const response = await fetch(`${appState.baseUrl}/api/tools`);
      const body = await response.json();

      // ppal-connect + ppal-raw-live-api (always included)
      expect(body.tools).toHaveLength(2);

      const names = body.tools.map((t: { name: string }) => t.name);

      expect(names).toContain("ppal-connect");
      expect(names).toContain("ppal-raw-live-api");

      // Restore all tools
      await fetch(`${appState.baseUrl}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tools: [...TOOL_NAMES] }),
      });
    });
  });

  describe("ppal-raw-live-api (always available)", () => {
    it("should always include raw tool in tool list", async () => {
      const response = await fetch(`${appState.baseUrl}/api/tools`);
      const body = await response.json();
      const names = body.tools.map((t: { name: string }) => t.name);

      expect(names).toContain("ppal-raw-live-api");
    });

    it("should allow calling raw tool even when not in enabled config", async () => {
      await fetch(`${appState.baseUrl}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tools: ["ppal-connect"] }),
      });

      // Raw tool should still be callable (returns 400 for missing input, not 404)
      const response = await fetch(
        `${appState.baseUrl}/api/tools/ppal-raw-live-api`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );

      expect(response.status).toBe(400);

      // Restore all tools
      await fetch(`${appState.baseUrl}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tools: [...TOOL_NAMES] }),
      });
    });
  });

  describe("POST /api/tools/:toolName", () => {
    it("should return 404 for unknown tool", async () => {
      const response = await fetch(
        `${appState.baseUrl}/api/tools/nonexistent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );

      expect(response.status).toBe(404);

      const body = await response.json();

      expect(body.error).toContain("Unknown or disabled tool");
    });

    it("should return 404 for disabled tool", async () => {
      // Disable all tools except ppal-connect
      await fetch(`${appState.baseUrl}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tools: ["ppal-connect"] }),
      });

      const response = await fetch(
        `${appState.baseUrl}/api/tools/ppal-read-track`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );

      expect(response.status).toBe(404);

      // Restore all tools
      await fetch(`${appState.baseUrl}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tools: [...TOOL_NAMES] }),
      });
    });

    it("should return 400 for invalid input", async () => {
      const response = await fetch(
        `${appState.baseUrl}/api/tools/ppal-read-track`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ include: "not-an-array" }),
        },
      );

      expect(response.status).toBe(400);

      const body = await response.json();

      expect(body.error).toBe("Validation failed");
      expect(body.details).toBeInstanceOf(Array);
    });

    it("should call tool and return unwrapped result", async () => {
      stubMaxOutlet({
        content: [{ type: "text", text: "track data here" }],
      });

      const response = await fetch(
        `${appState.baseUrl}/api/tools/ppal-connect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );

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

      const response = await fetch(
        `${appState.baseUrl}/api/tools/ppal-connect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );

      expect(response.status).toBe(200);

      const body = await response.json();

      expect(body.result).toBe("something went wrong");
      expect(body.isError).toBe(true);
    });
  });
});
