// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { setupExpressAppServer } from "../express-app-test-helpers.ts";

vi.mock(import("#src/mcp-server/node-for-max-logger.ts"), () => ({
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

describe("errors that never reach a route", () => {
  const appState = setupExpressAppServer();

  const TOOL_URL = "/api/tools/ppal-read-track";

  /**
   * POST a raw body and read the answer as text.
   *
   * @param path - Path to post to
   * @param body - The raw request body
   * @returns The response and its text
   */
  async function postRaw(
    path: string,
    body: string,
  ): Promise<{ response: Response; text: string }> {
    const response = await fetch(`${appState.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    return { response, text: await response.text() };
  }

  it.each([
    ["malformed JSON", "{bad", 400],
    ["a bare string", '"hi"', 400],
    ["a bare number", "5", 400],
    ["null", "null", 400],
    // express.json is capped at 2mb.
    ["an oversized body", JSON.stringify({ a: "x".repeat(3_000_000) }), 413],
  ])("answers JSON for %s", async (_label, body, status) => {
    const { response, text } = await postRaw(TOOL_URL, body);

    expect(response.status).toBe(status);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(text).not.toContain("<!DOCTYPE html>");
    expect(JSON.parse(text).error).toStrictEqual(expect.any(String));
  });

  // A stack trace names the files it passed through, and on this server those
  // are absolute paths under the user's home directory.
  it("never echoes a stack trace", async () => {
    const { text } = await postRaw(TOOL_URL, "{bad");

    expect(text).not.toContain("node_modules");
    expect(text).not.toMatch(/\.(?:ts|js|mjs):\d+/);
    expect(text).not.toMatch(/\bat \w+ \(/);
  });

  // Raised by the router decoding the path, not by a route.
  it("answers JSON for a path that isn't valid percent-encoding", async () => {
    const response = await fetch(`${appState.baseUrl}/api/tools/%E0%A4%A`, {
      method: "POST",
    });
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).not.toContain("<!DOCTYPE html>");
    expect(JSON.parse(text).error).toStrictEqual(expect.any(String));
  });

  // A 404 goes through finalhandler, which the error chain never sees.
  it("leaves an unmatched route alone", async () => {
    const response = await fetch(`${appState.baseUrl}/no-such-route`);

    expect(response.status).toBe(404);
  });

  // The /mcp route has its own try/catch and the SDK transport answers protocol
  // errors from inside it, so the handler must not be reached at all here.
  it("leaves the MCP transport's own protocol errors alone", async () => {
    const response = await fetch(appState.serverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ not: "jsonrpc" }),
    });
    const body = await response.json();

    expect(body.error.code).toBe(-32700);
    expect(body.error.message).toContain("Invalid JSON-RPC message");
  });

  // The same leak on /mcp: this one did come back as an HTML stack trace.
  it("answers JSON for malformed JSON on the MCP endpoint", async () => {
    const { response, text } = await postRaw("/mcp", "{bad");

    expect(response.status).toBe(400);
    expect(text).not.toContain("<!DOCTYPE html>");
    expect(JSON.parse(text).error).toStrictEqual(expect.any(String));
  });
});
