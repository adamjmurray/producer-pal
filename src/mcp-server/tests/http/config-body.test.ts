// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { MAX_CONTEXT_CONTENT_LENGTH } from "#src/tools/constants.ts";
import { parseConfigBody } from "../../helpers/http/config-body.ts";

describe("parseConfigBody", () => {
  it("accepts a valid body", () => {
    const result = parseConfigBody({ jsonOutput: true }, false);

    expect(result).toStrictEqual({ ok: true, value: { jsonOutput: true } });
  });

  it("refuses a null body under the `body` key", () => {
    const result = parseConfigBody(null, false);

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
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.fields).toStrictEqual({
      jsonOutput: "must be a boolean",
      projectContext: "must be a string",
    });
  });

  it("caps projectContext like a ppal-context write", () => {
    const longest = "é".repeat(MAX_CONTEXT_CONTENT_LENGTH);

    expect(parseConfigBody({ projectContext: longest }, false).ok).toBe(true);

    const result = parseConfigBody({ projectContext: `${longest}x` }, false);

    expect(!result.ok && result.error.fields).toStrictEqual({
      projectContext: `must be at most ${MAX_CONTEXT_CONTENT_LENGTH} characters`,
    });
  });

  it("keeps the longest projectContext whole in one Max atom", () => {
    // Max cuts an atom at 32,767 bytes; one UTF-16 unit is at most 3 bytes.
    expect(MAX_CONTEXT_CONTENT_LENGTH * 3).toBeLessThanOrEqual(32_767);
  });

  it("refuses a non-boolean remoteScriptEnabled", () => {
    expect(
      parseConfigBody({ remoteScriptEnabled: "yes" }, false),
    ).toStrictEqual({
      ok: false,
      error: {
        error: "remoteScriptEnabled: must be a boolean",
        fields: { remoteScriptEnabled: "must be a boolean" },
      },
    });
  });

  it("takes remoteScriptMinVersion as a string or null", () => {
    for (const value of ["2.9.0", null]) {
      expect(
        parseConfigBody({ remoteScriptMinVersion: value }, false),
      ).toStrictEqual({
        ok: true,
        value: { remoteScriptMinVersion: value },
      });
    }

    expect(parseConfigBody({ remoteScriptMinVersion: 3 }, false)).toStrictEqual(
      {
        ok: false,
        error: {
          error: "remoteScriptMinVersion: must be a string",
          fields: { remoteScriptMinVersion: "must be a string" },
        },
      },
    );
  });

  it("checks tools against the body's liveApiEnabled, else the current one", () => {
    const tools = ["ppal-connect", "ppal-live-api"];

    expect(parseConfigBody({ tools }, true).ok).toBe(true);

    const refused = parseConfigBody(
      { tools, liveApiEnabled: false, jsonOutput: 1 },
      true,
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
    const result = parseConfigBody({ notation: "nope" }, false);

    expect(!result.ok && result.error.fields.notation).toMatch(
      /^must be one of: /,
    );
  });
});
