// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * A REST body the route cannot turn into arguments answers 400 JSON.
 *
 * Normalizing used to run outside the handler's try, so a refusal meant for
 * the caller escaped to Express's default error handler: an HTML page carrying
 * a stack trace and the server's absolute paths, from an endpoint that is
 * deliberately reachable from off the machine. Only the built device can leak
 * those paths, so only this suite can prove they are gone — and it pins that
 * MCP's answer to the same input is unchanged.
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
  const response = await fetch(`${REST_BASE_URL}/api/tools/${toolName}`, {
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
