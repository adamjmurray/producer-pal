// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { parseConfigBody } from "../../helpers/http/config-body.ts";

describe("parseConfigBody", () => {
  it("accepts a valid body", () => {
    const result = parseConfigBody({ jsonOutput: true }, false, false);

    expect(result).toStrictEqual({ ok: true, value: { jsonOutput: true } });
  });

  it("refuses a null body under the `body` key", () => {
    const result = parseConfigBody(null, false, false);

    expect(result).toStrictEqual({
      ok: false,
      error: {
        error: "body: must be a value",
        fields: { body: "must be a value" },
      },
    });
  });

  it("names each bad field once with its expected type", () => {
    const result = parseConfigBody(
      { jsonOutput: "false", projectContext: 5 },
      false,
      false,
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.fields).toStrictEqual({
      jsonOutput: "must be a boolean",
      projectContext: "must be a string",
    });
  });

  it("refuses remoteScriptEnabled type errors only on a debug build", () => {
    const body = { remoteScriptEnabled: "yes" };

    expect(parseConfigBody(body, false, false).ok).toBe(true);
    expect(parseConfigBody(body, false, true)).toStrictEqual({
      ok: false,
      error: {
        error: "remoteScriptEnabled: must be a boolean",
        fields: { remoteScriptEnabled: "must be a boolean" },
      },
    });
  });

  it("checks tools against the body's liveApiEnabled, else the current one", () => {
    const tools = ["ppal-connect", "ppal-live-api"];

    expect(parseConfigBody({ tools }, true, false).ok).toBe(true);

    const refused = parseConfigBody(
      { tools, liveApiEnabled: false, jsonOutput: 1 },
      true,
      false,
    );

    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error.fields).toStrictEqual({
      jsonOutput: "must be a boolean",
      tools: "Invalid tool name(s): ppal-live-api",
    });
    expect(!refused.ok && refused.error.validToolNames).not.toContain(
      "ppal-live-api",
    );
  });

  it("uses the schema's own message for a bad notation", () => {
    const result = parseConfigBody({ notation: "nope" }, false, false);

    expect(!result.ok && result.error.fields.notation).toMatch(
      /^must be one of: /,
    );
  });
});
