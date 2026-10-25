// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mcpRequests, setMcpResponse } from "#src/test/mocks/mock-max.ts";
import { resetHubForTesting } from "../gen-ui-hub.ts";
import { resetWidgetStoreForTesting } from "../widget-store.ts";
import { setupExpressAppServer } from "../../../tests/express-app-test-helpers.ts";
import { openEventStream } from "./event-stream-test-helpers.ts";

// The flag is read when the app module loads, so set it before the app starts.
const previous = process.env.ENABLE_GEN_UI;
const app = setupExpressAppServer({
  beforeStart: () => {
    process.env.ENABLE_GEN_UI = "true";
  },
});

beforeEach(() => {
  resetHubForTesting();
  resetWidgetStoreForTesting();
});

afterAll(() => {
  if (previous == null) {
    delete process.env.ENABLE_GEN_UI;
  } else {
    process.env.ENABLE_GEN_UI = previous;
  }
});

interface ToolReply {
  result: unknown;
  isError: boolean;
}

/**
 * @param tool - Tool name
 * @param body - Tool arguments
 * @returns The REST reply
 */
async function callTool(tool: string, body: object): Promise<ToolReply> {
  const response = await fetch(`${app.baseUrl}/api/tools/${tool}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return (await response.json()) as ToolReply;
}

/**
 * @param path - A server path
 * @returns The parsed JSON the server answers
 */
async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${app.baseUrl}${path}`);

  return (await response.json()) as T;
}

describe("generative UI in a build with ENABLE_GEN_UI", () => {
  it("lists ppal-ui among the tools", async () => {
    const config = await getJson<{ tools: string[] }>("/config");
    const catalog = await getJson<{ tools: Array<{ name: string }> }>(
      "/api/tools",
    );

    expect(config.tools).toContain("ppal-ui");
    expect(catalog.tools.map((t) => t.name)).toContain("ppal-ui");
  });

  it("runs ppal-ui in Node without calling V8", async () => {
    const reply = await callTool("ppal-ui", {
      action: "create",
      kind: "clip",
      ref: "t0/s0",
      title: "Bass",
    });
    const listed = await getJson<{ widgets: unknown[] }>("/api/ui/widgets");

    expect(reply).toStrictEqual({
      isError: false,
      result: {
        created: { id: "w1", kind: "clip", ref: "t0/s0", title: "Bass" },
      },
    });
    expect(listed.widgets).toHaveLength(1);
    expect(mcpRequests).toHaveLength(0);
  });

  it("reports a bad ppal-ui call as a tool error", async () => {
    const reply = await callTool("ppal-ui", { action: "update" });

    expect(reply.isError).toBe(true);
    expect(reply.result).toContain("needs the widget's id");
  });

  it("tells viewers which clip a REST write touched, and leaves the result alone", async () => {
    setMcpResponse({
      content: [
        { type: "text", text: JSON.stringify({ id: "12", path: "t0/s0" }) },
      ],
    });

    const stream = await openEventStream(`${app.baseUrl}/api/ui/events`);

    try {
      await stream.next();

      const reply = await callTool("ppal-create-clip", {
        path: "t0/s0",
        notes: "C3 1|1",
      });

      expect(reply.result).toStrictEqual({ id: "12", path: "t0/s0" });
      expect(await stream.next()).toStrictEqual({
        type: "live",
        version: 1,
        tool: "ppal-create-clip",
        ids: ["12"],
        paths: ["t0/s0"],
        all: false,
      });
    } finally {
      await stream.close();
    }
  });
});
