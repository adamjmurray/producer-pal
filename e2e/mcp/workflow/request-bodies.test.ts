// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * A body the server cannot use answers JSON, never an HTML stack trace.
 *
 * Only the built device can name the paths the leaked trace carried, so only
 * this suite can prove they are gone. It also pins that MCP's own answers to
 * the same inputs are unchanged.
 *
 * Uses: e2e-test-set - t8 "9-MIDI" (empty MIDI track)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- workflow/request-bodies
 */
import { describe, expect, it } from "vitest";
import {
  CONFIG_URL,
  getToolErrorMessage,
  isToolError,
  setupMcpTestContext,
} from "../mcp-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../e2e-test-set.ts";

const ctx = setupMcpTestContext({ once: true });

const REST_BASE_URL = CONFIG_URL.replace("/config", "");

const BLANK_TRACK_INDEX =
  "trackIndex: a blank string is not a value for this param. Leave it out instead.";

/**
 * POST a raw body to a tool and hand back the response with its text, so a
 * test can assert on a body that is not JSON.
 * @param toolName - Tool to call
 * @param body - Raw request body, or undefined to send none at all
 * @returns The response and its text
 */
async function postRawBody(
  toolName: string,
  body?: string,
): Promise<{ response: Response; text: string }> {
  return postRawPath(`/api/tools/${toolName}`, body);
}

/**
 * POST a raw body to any path, for the failures that never reach a route.
 * @param path - Path to post to
 * @param body - Raw request body, or undefined to send none at all
 * @returns The response and its text
 */
async function postRawPath(
  path: string,
  body?: string,
): Promise<{ response: Response; text: string }> {
  const response = await fetch(`${REST_BASE_URL}${path}`, {
    method: "POST",
    ...(body == null
      ? {}
      : { headers: { "Content-Type": "application/json" }, body }),
  });

  return { response, text: await response.text() };
}

describe("request bodies", () => {
  it("refuses a blank param with 400 JSON, not an HTML stack trace", async () => {
    const { response, text } = await postRawBody(
      "ppal-read-track",
      '{"trackIndex":""}',
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(JSON.parse(text).error).toBe(BLANK_TRACK_INDEX);
    expect(text).not.toContain("<!DOCTYPE html>");
    // The bundle's absolute path, which every frame of the leaked trace named.
    expect(text).not.toContain("mcp-server.mjs");
  });

  it("refuses an argument that names a prototype member", async () => {
    // `schema[name]` found Object.prototype.toString, so the blank check
    // called safeParse on a function and reported that as the caller's
    // mistake. It is an argument no param accepts, like any other.
    const { response, text } = await postRawBody(
      "ppal-read-track",
      `{"path":"t${EMPTY_MIDI_TRACK}","toString":""}`,
    );
    const body = JSON.parse(text);

    expect(response.status).toBe(200);
    expect(body.isError).toBe(false);
    expect(body.warnings).toStrictEqual([
      "ignored unexpected argument(s): toString",
    ]);
  });

  it("refuses a blank a level down, inside a nested query", async () => {
    // This one throws out of Zod's parse rather than out of the args-level
    // pass, and Zod does not catch it either. Same 400.
    const { response, text } = await postRawBody(
      "ppal-library",
      '{"action":"search","searches":[{"kind":""}]}',
    );

    expect(response.status).toBe(400);
    expect(JSON.parse(text).error).toBe(
      "kind: a blank string is not a value for this param. Leave it out instead.",
    );
  });

  it("refuses an array body instead of reading its indexes as params", async () => {
    // It used to be rebuilt into {"0": {...}}, which validates as a call that
    // sent no arguments — so the tool answered by naming a param the caller
    // did send, inside the element the route had discarded.
    const { response, text } = await postRawBody(
      "ppal-update-track",
      `[{"path":"t${EMPTY_MIDI_TRACK}","name":"Zzz"}]`,
    );

    expect(response.status).toBe(400);
    expect(JSON.parse(text).error).toBe(
      "Request body must be a JSON object of tool arguments.",
    );
  });

  it("reads a missing body as no arguments", async () => {
    // Reading its keys threw. It now reaches the tool as an empty argument
    // list, so a tool that needs one answers with its own error rather than a
    // 500 from a layer the caller can't see.
    const { response, text } = await postRawBody("ppal-read-track");

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toStrictEqual({
      result: "Error: id or path is required",
      isError: true,
    });
  });

  it("still answers a normal body", async () => {
    const { response, text } = await postRawBody(
      "ppal-read-track",
      `{"path":"t${EMPTY_MIDI_TRACK}"}`,
    );

    expect(response.status).toBe(200);
    expect(JSON.parse(text).result.type).toBe("midi");
  });

  // These never reach a route at all, so the tool route's own try can't catch
  // them. The bundle's path is what the leaked trace named on every frame.
  it.each([
    ["malformed JSON", "/api/tools/ppal-read-track", "{bad", 400],
    ["malformed JSON on the MCP endpoint", "/mcp", "{bad", 400],
    ["a bare string", "/api/tools/ppal-read-track", '"hi"', 400],
    // express.json is capped at 2mb.
    [
      "a body over the size limit",
      "/api/tools/ppal-read-track",
      JSON.stringify({ a: "x".repeat(3_000_000) }),
      413,
    ],
  ])("answers JSON for %s", async (_label, path, body, status) => {
    const { response, text } = await postRawPath(path, body);

    expect(response.status).toBe(status);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(text).not.toContain("<!DOCTYPE html>");
    expect(text).not.toContain("mcp-server.mjs");
    expect(JSON.parse(text).error).toStrictEqual(expect.any(String));
  });

  it("answers JSON for a path that isn't valid percent-encoding", async () => {
    // Raised by the router decoding the path, before any route runs.
    const { response, text } = await postRawPath("/api/tools/%E0%A4%A");

    expect(response.status).toBe(400);
    expect(text).not.toContain("<!DOCTYPE html>");
    expect(text).not.toContain("mcp-server.mjs");
    expect(JSON.parse(text).error).toBe("Bad Request");
  });

  it("keeps MCP's answer to a bad JSON-RPC message unchanged", async () => {
    // The /mcp route has its own try and the SDK transport answers protocol
    // errors from inside it, so the new handler must not see this one.
    const response = await fetch(`${REST_BASE_URL}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: '{"not":"jsonrpc"}',
    });
    const body = (await response.json()) as {
      error: { code: number; message: string };
    };

    expect(body.error.code).toBe(-32700);
    expect(body.error.message).toContain("Invalid JSON-RPC message");
  });

  it("keeps MCP's answer to the same blank param unchanged", async () => {
    // MCP delivers the refusal as a tool error, which is where REST's 400 now
    // carries the same message. Nothing about this transport changed.
    const result = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackIndex: "" },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(BLANK_TRACK_INDEX);
  });
});
