// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { mcpRequests, setMcpResponse } from "#src/test/mocks/mock-max.ts";
import { setupExpressAppServer } from "../express-app-test-helpers.ts";

// Every body a caller can post, including the ones the route cannot turn into
// arguments. Normalizing used to run outside the handler's try, so a refusal
// meant for the caller escaped to Express's default error handler: an HTML
// page carrying a stack trace and the server's absolute paths, on a JSON API
// that is deliberately reachable from off the machine.
describe("REST API Routes – request bodies", () => {
  const appState = setupExpressAppServer();

  // Omits the JSON content type along with the body: that is what a caller
  // sending nothing actually looks like, and it is the shape Express hands
  // over as `undefined` rather than `{}`.
  async function postBody(
    name: string,
    body?: string,
  ): Promise<{ response: Response; text: string }> {
    const response = await fetch(`${appState.baseUrl}/api/tools/${name}`, {
      method: "POST",
      ...(body == null
        ? {}
        : { headers: { "Content-Type": "application/json" }, body }),
    });

    return { response, text: await response.text() };
  }

  it("refuses a blank on a param that has no blank value", async () => {
    const { response, text } = await postBody(
      "ppal-read-track",
      '{"trackIndex":""}',
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(JSON.parse(text).error).toBe(
      "trackIndex: a blank string is not a value for this param. Leave it out instead.",
    );
  });

  it("refuses a blank a level down, inside a nested query", async () => {
    // This one throws out of safeParse rather than out of unsetEmptyParams:
    // optionalParams runs the same refusal as a preprocess, and safeParse does
    // not catch it. Both need the same 400.
    const { response, text } = await postBody(
      "ppal-library",
      '{"action":"search","searches":[{"kind":""}]}',
    );

    expect(response.status).toBe(400);
    expect(JSON.parse(text).error).toBe(
      "kind: a blank string is not a value for this param. Leave it out instead.",
    );
  });

  it("refuses an argument that names a prototype member", async () => {
    // `schema[name]` found Object.prototype.toString, so the blank check
    // called safeParse on a function and reported that as the caller's
    // mistake. It is an argument no param accepts, like any other.
    setMcpResponse({ content: [{ type: "text", text: '{"id":"3"}' }] });

    const { response, text } = await postBody(
      "ppal-update-track",
      '{"path":"t1","toString":""}',
    );
    const body = JSON.parse(text);

    expect(response.status).toBe(200);
    expect(body.warnings).toStrictEqual([
      "ignored unexpected argument(s): toString",
    ]);
  });

  it("refuses an array body instead of reading its indexes as params", async () => {
    // JSON parses an array without complaint, and rebuilding it into
    // {"0": {...}} validates as a call that sent no arguments — so the tool
    // answered by naming a param the caller did send, inside the element the
    // route had discarded.
    const { response, text } = await postBody(
      "ppal-update-track",
      '[{"path":"t1","name":"Zzz"}]',
    );

    expect(response.status).toBe(400);
    expect(JSON.parse(text).error).toBe(
      "Request body must be a JSON object of tool arguments.",
    );
  });

  it("reads a missing body as no arguments", async () => {
    // Reading its keys threw. A tool with no required params is callable this
    // way, and one that needs arguments answers with its own error.
    setMcpResponse({ content: [{ type: "text", text: '{"connected":true}' }] });

    const { response, text } = await postBody("ppal-connect");

    expect(response.status).toBe(200);
    expect(JSON.parse(text).isError).toBe(false);
    expect(JSON.parse(mcpRequests.at(-1)!.argsJSON)).toStrictEqual({});
  });

  it("still forwards a normal object body", async () => {
    setMcpResponse({ content: [{ type: "text", text: '{"id":"3"}' }] });

    const { response, text } = await postBody(
      "ppal-update-track",
      '{"path":"t1","name":"Zzz"}',
    );

    expect(response.status).toBe(200);
    expect(JSON.parse(text).result).toStrictEqual({ id: "3" });
    expect(JSON.parse(mcpRequests.at(-1)!.argsJSON)).toStrictEqual({
      path: "t1",
      name: "Zzz",
    });
  });

  it("keeps a schema violation on its own error, not the blank one", async () => {
    const { response, text } = await postBody(
      "ppal-read-track",
      '{"include":"not-an-array"}',
    );
    const body = JSON.parse(text);

    expect(response.status).toBe(400);
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeInstanceOf(Array);
  });
});
