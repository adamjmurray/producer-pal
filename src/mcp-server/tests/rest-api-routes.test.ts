// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import Max from "max-api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_ERROR_DELIMITER } from "#src/shared/mcp-response-utils.ts";
import { TOOL_NAMES } from "../create-mcp-server.ts";

// Type for mock Max module with test-specific properties
type MockMax = typeof Max & {
  defaultMcpResponseHandler:
    | ((requestId: string, ...chunks: string[]) => void)
    | null;
};
const mockMax = Max as MockMax;

describe("REST API Routes", () => {
  let server: Server | undefined;
  let baseUrl: string;

  beforeAll(async () => {
    const { createExpressApp } = await import("../create-express-app.ts");
    const app = createExpressApp();
    const port = await new Promise<number>((resolve) => {
      server = app.listen(0, () => {
        resolve((server!.address() as AddressInfo).port);
      });
    });

    baseUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
  });

  describe("GET /api/tools", () => {
    it("should return all enabled tools with correct structure", async () => {
      const response = await fetch(`${baseUrl}/api/tools`);

      expect(response.status).toBe(200);

      const body = await response.json();

      expect(body.tools).toBeInstanceOf(Array);
      expect(body.tools).toHaveLength(TOOL_NAMES.length);

      const tool = body.tools[0];

      expect(tool).toHaveProperty("name");
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("inputSchema");
      expect(tool.inputSchema).toHaveProperty("type", "object");
    });

    it("should respect tool filtering via config", async () => {
      // Update config to only include ppal-connect
      await fetch(`${baseUrl}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tools: ["ppal-connect"] }),
      });

      const response = await fetch(`${baseUrl}/api/tools`);
      const body = await response.json();

      expect(body.tools).toHaveLength(1);
      expect(body.tools[0].name).toBe("ppal-connect");

      // Restore all tools
      await fetch(`${baseUrl}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tools: [...TOOL_NAMES] }),
      });
    });
  });

  describe("POST /api/tools/:toolName", () => {
    it("should return 404 for unknown tool", async () => {
      const response = await fetch(`${baseUrl}/api/tools/nonexistent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(404);

      const body = await response.json();

      expect(body.error).toContain("Unknown or disabled tool");
    });

    it("should return 404 for disabled tool", async () => {
      // Disable all tools except ppal-connect
      await fetch(`${baseUrl}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tools: ["ppal-connect"] }),
      });

      const response = await fetch(`${baseUrl}/api/tools/ppal-read-track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(404);

      // Restore all tools
      await fetch(`${baseUrl}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tools: [...TOOL_NAMES] }),
      });
    });

    it("should return 400 for invalid input", async () => {
      const response = await fetch(`${baseUrl}/api/tools/ppal-read-track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ include: "not-an-array" }),
      });

      expect(response.status).toBe(400);

      const body = await response.json();

      expect(body.error).toBe("Validation failed");
      expect(body.details).toBeInstanceOf(Array);
    });

    it("should call tool and return unwrapped result", async () => {
      Max.outlet = ((message: string, requestId: string): Promise<void> => {
        if (message === "mcp_request") {
          setTimeout(() => {
            mockMax.defaultMcpResponseHandler!(
              requestId,
              JSON.stringify({
                content: [{ type: "text", text: "track data here" }],
              }),
              MAX_ERROR_DELIMITER,
            );
          }, 1);
        }

        return Promise.resolve();
      }) as typeof Max.outlet;

      const response = await fetch(`${baseUrl}/api/tools/ppal-connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(200);

      const body = await response.json();

      expect(body.result).toBe("track data here");
      expect(body.isError).toBe(false);
    });

    it("should return isError true when tool reports error", async () => {
      Max.outlet = ((message: string, requestId: string): Promise<void> => {
        if (message === "mcp_request") {
          setTimeout(() => {
            mockMax.defaultMcpResponseHandler!(
              requestId,
              JSON.stringify({
                content: [{ type: "text", text: "something went wrong" }],
                isError: true,
              }),
              MAX_ERROR_DELIMITER,
            );
          }, 1);
        }

        return Promise.resolve();
      }) as typeof Max.outlet;

      const response = await fetch(`${baseUrl}/api/tools/ppal-connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(200);

      const body = await response.json();

      expect(body.result).toBe("something went wrong");
      expect(body.isError).toBe(true);
    });
  });
});
