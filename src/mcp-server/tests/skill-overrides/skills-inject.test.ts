// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { type McpResponse } from "#src/mcp-server/max-api-adapter.ts";
import {
  withRemoteScriptAnswer,
  withSkills,
} from "#src/mcp-server/helpers/skills-inject.ts";
import { setRemoteScriptMinVersion } from "#src/mcp-server/rpc/remote-script/port/remote-script-version.ts";
import { startFakeRemoteScript } from "#src/mcp-server/rpc/remote-script/tests/remote-script-test-helpers.ts";
import { writeSkillOverride } from "#src/mcp-server/helpers/skill-overrides-store.ts";
import { buildSkills } from "#src/skills/build-skills.ts";
import { useTempConfigDir } from "../config-dir-test-helpers.ts";

// Capture the Node-for-Max logger so a broken-override warning can be asserted
// (and to keep Max.post out of the test). vi.hoisted keeps the factory free of
// import references (see the async-mock guard meta test).
const loggerWarn = vi.hoisted(() => vi.fn());

vi.mock(import("#src/mcp-server/node-for-max-logger.ts"), () => ({
  warn: loggerWarn,
  log: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

useTempConfigDir();

/**
 * A fake inner callLiveApi that resolves to the given response.
 * @param response - The response the fake resolves with
 * @returns A vi.fn matching the callLiveApi signature
 */
function fakeInner(response: McpResponse) {
  return vi.fn(async () => response);
}

/**
 * A minimal successful connect-style response with a single content block.
 * @returns A fresh McpResponse
 */
function connectResponse(): McpResponse {
  return { content: [{ type: "text", text: "{connected:true}" }] };
}

/**
 * The last content block's text (the injected skills block, when present).
 * @param result - The wrapped call's response
 * @returns The last block's text, or "" when empty
 */
function lastText(result: McpResponse): string {
  return result.content.at(-1)?.text ?? "";
}

describe("withSkills", () => {
  it("appends the assembled skills block to a ppal-connect response", async () => {
    const wrapped = withSkills(fakeInner(connectResponse()), () => ({}));

    const result = await wrapped("ppal-connect", {});

    expect(result.content).toHaveLength(2);
    expect(lastText(result)).toBe(buildSkills({}));
    expect(lastText(result).startsWith("# Producer Pal Skills")).toBe(true);
  });

  it("assembles for the notation/small-model context from getContext", async () => {
    const wrapped = withSkills(fakeInner(connectResponse()), () => ({
      notation: "stark",
      smallModelMode: true,
    }));

    const result = await wrapped("ppal-connect", {});

    expect(lastText(result)).toBe(
      buildSkills({ notation: "stark", smallModelMode: true }),
    );
  });

  it("applies a user fragment override read from disk", async () => {
    writeSkillOverride("barbeat-standard", { content: "MY OVERRIDDEN HEAD" });
    const wrapped = withSkills(fakeInner(connectResponse()), () => ({}));

    const result = await wrapped("ppal-connect", {});

    expect(lastText(result)).toContain("MY OVERRIDDEN HEAD");
    expect(lastText(result)).toBe(
      buildSkills(
        {},
        { fragments: { "barbeat-standard": "MY OVERRIDDEN HEAD" } },
      ),
    );
  });

  it("drops a fragment the user switched off, from disk", async () => {
    writeSkillOverride("library", { enabled: false });
    const wrapped = withSkills(fakeInner(connectResponse()), () => ({}));

    const result = await wrapped("ppal-connect", {});

    expect(lastText(result)).not.toContain("## Finding Library Content");
    expect(lastText(result)).toBe(buildSkills({}, { disabled: ["library"] }));
  });

  it("passes the original tool, args, and overrides through to the inner", async () => {
    const inner = fakeInner(connectResponse());
    const overrides = { timeoutMs: 5000 };

    await withSkills(inner, () => ({}))("ppal-connect", { foo: 1 }, overrides);

    expect(inner).toHaveBeenCalledWith("ppal-connect", { foo: 1 }, overrides);
  });

  it("leaves non-connect tool responses untouched", async () => {
    const wrapped = withSkills(fakeInner(connectResponse()), () => ({}));

    const result = await wrapped("ppal-read-track", {});

    expect(result.content).toHaveLength(1);
  });

  it("logs assembly warnings from a broken override instead of failing silently", async () => {
    // A driver override naming a fragment that no longer exists: the blob is
    // still returned (degraded), and the warning is logged rather than
    // swallowed — the whole point of surfacing a stale override.
    writeSkillOverride("standard", {
      content: `INTRO\n\n@include "./core-devices.md"`,
    });
    const wrapped = withSkills(fakeInner(connectResponse()), () => ({}));

    const result = await wrapped("ppal-connect", {});

    expect(lastText(result)).toContain("INTRO");
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining("unknown fragment"),
    );
  });

  it("does not inject when the connect response is an error", async () => {
    const wrapped = withSkills(
      fakeInner({ content: [{ type: "text", text: "boom" }], isError: true }),
      () => ({}),
    );

    const result = await wrapped("ppal-connect", {});

    expect(result.content).toHaveLength(1);
  });
});

describe("withRemoteScriptAnswer", () => {
  const HEADING = "### Plug-Ins, Max for Live Devices & Presets";

  it("teaches loading plug-ins while the remote script answers its ping", async () => {
    const remote = await startFakeRemoteScript(() => ({
      body: { ok: true, script_version: "2.5.0" },
    }));

    try {
      expect(await withRemoteScriptAnswer({})).toStrictEqual({
        remoteScript: true,
      });

      const wrapped = withSkills(fakeInner(connectResponse()), () => ({}));

      expect(lastText(await wrapped("ppal-connect", {}))).toContain(HEADING);
    } finally {
      await remote.close();
    }
  });

  it("doesn't when the script is older than this server needs", async () => {
    const remote = await startFakeRemoteScript(() => ({
      body: { ok: true, script_version: "2.4.0" },
    }));

    try {
      expect(await withRemoteScriptAnswer({})).toStrictEqual({
        remoteScript: false,
      });

      const wrapped = withSkills(fakeInner(connectResponse()), () => ({}));

      expect(lastText(await wrapped("ppal-connect", {}))).not.toContain(
        HEADING,
      );
    } finally {
      await remote.close();
    }
  });

  it("doesn't when the dev override makes the script too old", async () => {
    const remote = await startFakeRemoteScript(() => ({
      body: { ok: true, script_version: "2.5.0" },
    }));

    setRemoteScriptMinVersion("9.0.0");

    try {
      expect(await withRemoteScriptAnswer({})).toStrictEqual({
        remoteScript: false,
      });
    } finally {
      setRemoteScriptMinVersion(null);
      await remote.close();
    }
  });

  it("uses the ping it is given instead of asking the remote script", async () => {
    const getPing = vi.fn(async () => ({
      running: true,
      liveVersion: null,
      scriptVersion: "2.5.0",
      otherOnPort: null,
    }));

    expect(await withRemoteScriptAnswer({}, getPing)).toStrictEqual({
      remoteScript: true,
    });

    const wrapped = withSkills(
      fakeInner(connectResponse()),
      () => ({}),
      getPing,
    );

    expect(lastText(await wrapped("ppal-connect", {}))).toContain(HEADING);
    expect(getPing).toHaveBeenCalledTimes(2);
  });

  it("doesn't when something else answers the port", async () => {
    const remote = await startFakeRemoteScript(() => ({ body: { ok: true } }));

    try {
      expect(await withRemoteScriptAnswer({})).toStrictEqual({
        remoteScript: false,
      });
    } finally {
      await remote.close();
    }
  });

  it("doesn't when nothing answers", async () => {
    expect(await withRemoteScriptAnswer({})).toStrictEqual({
      remoteScript: false,
    });
  });

  it("doesn't ping in small-model mode", async () => {
    const remote = await startFakeRemoteScript(() => ({ body: { ok: true } }));

    try {
      expect(
        await withRemoteScriptAnswer({ smallModelMode: true }),
      ).toStrictEqual({ smallModelMode: true, remoteScript: false });
      expect(remote.requests).toStrictEqual([]);
    } finally {
      await remote.close();
    }
  });
});
