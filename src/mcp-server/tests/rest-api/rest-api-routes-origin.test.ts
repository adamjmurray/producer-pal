// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { mcpRequests } from "#src/test/mocks/mock-max.ts";
import { sendRaw, setupExpressAppServer } from "../express-app-test-helpers.ts";

// A web page can send a POST with no body and no preflight (fetch with
// mode "no-cors"), and the server read that as a tool call with no arguments.
describe("REST API Routes – browser origin", () => {
  const appState = setupExpressAppServer();

  const post = (headers: Record<string, string> = {}): Promise<Response> =>
    fetch(`${appState.baseUrl}/api/tools/ppal-connect`, {
      method: "POST",
      headers,
    });

  /**
   * POST with a custom Host, which fetch won't send.
   * @param headers - Headers to send, Host included
   * @returns The response status
   */
  function postWithHost(headers: Record<string, string>): Promise<number> {
    return sendRaw(Number(new URL(appState.baseUrl).port), {
      path: "/api/tools/ppal-connect",
      method: "POST",
      headers,
    }).then((answer) => answer.status);
  }

  it.each([
    "https://evil.example",
    "http://evil.example:3350",
    "null",
    "http://localhost.evil.example",
    "not a url",
  ])("refuses Origin %s before the tool runs", async (origin) => {
    const before = mcpRequests.length;
    const response = await post({ Origin: origin });

    expect(response.status).toBe(403);
    expect(await response.json()).toStrictEqual({
      error: "cross-site /api/tools calls are not allowed",
    });
    expect(mcpRequests).toHaveLength(before);
  });

  it("refuses a foreign Origin even with a JSON body", async () => {
    const before = mcpRequests.length;
    const response = await fetch(`${appState.baseUrl}/api/tools/ppal-connect`, {
      method: "POST",
      headers: {
        Origin: "https://evil.example",
        "Content-Type": "application/json",
      },
      body: "{}",
    });

    expect(response.status).toBe(403);
    expect(mcpRequests).toHaveLength(before);
  });

  it("answers a foreign Origin with 403 for an unknown tool too", async () => {
    const response = await fetch(`${appState.baseUrl}/api/tools/no-such-tool`, {
      method: "POST",
      headers: { Origin: "https://evil.example" },
    });

    expect(response.status).toBe(403);
  });

  it("runs the tool for a request with no Origin (curl, scripts)", async () => {
    const before = mcpRequests.length;
    const response = await post();

    expect(response.status).toBe(200);
    expect(mcpRequests).toHaveLength(before + 1);
  });

  it.each([
    "http://localhost:3350",
    "http://127.0.0.1:3350",
    "http://[::1]:3350",
  ])("runs the tool for localhost Origin %s", async (origin) => {
    const response = await post({ Origin: origin });

    expect(response.status).toBe(200);
  });

  it("runs the tool for the chat UI on the same origin", async () => {
    const response = await post({ Origin: appState.baseUrl });

    expect(response.status).toBe(200);
  });

  it.each([
    ["a LAN address", "192.168.1.20:3350", "http://192.168.1.20:3350"],
    ["a tunnel", "demo.trycloudflare.com", "https://demo.trycloudflare.com"],
  ])("runs the tool for the chat UI over %s", async (_name, host, origin) => {
    expect(await postWithHost({ Host: host, Origin: origin })).toBe(200);
  });

  it("still lets anyone read the tool list", async () => {
    const response = await fetch(`${appState.baseUrl}/api/tools`, {
      headers: { Origin: "https://evil.example" },
    });

    expect(response.status).toBe(200);
  });
});
