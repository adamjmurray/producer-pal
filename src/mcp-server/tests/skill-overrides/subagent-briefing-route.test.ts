// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { request as httpRequest } from "node:http";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  type CallLiveApiFunction,
  TOOL_NAMES,
} from "#src/mcp-server/create-mcp-server.ts";
import { writeGlobalContext } from "#src/mcp-server/helpers/global-context/global-context-store.ts";
import { rememberMemory } from "#src/mcp-server/helpers/memory/memory-store.ts";
import { type McpResponse } from "#src/mcp-server/max-api-adapter.ts";
import { writeSkillOverride } from "#src/mcp-server/helpers/skill-overrides-store.ts";
import * as maxConsole from "#src/mcp-server/node-for-max-logger.ts";
import {
  registerSubagentBriefingRoute,
  type SubagentBriefingConfig,
} from "#src/mcp-server/routes/subagent-briefing-route.ts";
import {
  BRIEFING_REQUEST_HEADER,
  DISABLED_TOOLS_HEADER,
  SMALL_MODEL_MODE_HEADER,
} from "#src/shared/config.ts";
import { NOTATION_HEADER } from "#src/shared/notation.ts";
import {
  type MarkdownRouteServer,
  startMarkdownRouteServer,
  useTempConfigDir,
} from "../config-dir-test-helpers.ts";

// A fresh temp config dir per test so global-context / memory writes don't leak.
useTempConfigDir();

const LIVE_SET_TEXT = "connected: true, tempo: 96, timeSignature: 6/8";

let server: MarkdownRouteServer;
let base = "";
let config: SubagentBriefingConfig;
let liveSet: McpResponse;

const callLiveApi: CallLiveApiFunction = vi.fn(
  async (): Promise<McpResponse> => liveSet,
);

beforeAll(async () => {
  server = await startMarkdownRouteServer((app) => {
    registerSubagentBriefingRoute(app, () => config, callLiveApi);
  });
  base = `${server.baseUrl}/subagent-briefing`;
});

beforeEach(() => {
  config = {
    tools: [...TOOL_NAMES],
    notation: "barbeat",
    smallModelMode: false,
    liveApiEnabled: false,
    projectContext: "",
  };
  liveSet = { content: [{ type: "text", text: LIVE_SET_TEXT }] };
  vi.mocked(callLiveApi).mockClear();
});

afterAll(async () => {
  await server.close();
});

/**
 * GET the briefing endpoint carrying the client header the route requires.
 * @param headers - Extra headers to send
 * @returns The raw response
 */
function briefingFetch(
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(base, {
    headers: { [BRIEFING_REQUEST_HEADER]: "1", ...headers },
  });
}

/**
 * GET the briefing over raw http, which — unlike fetch — lets a test set Host.
 * The same-origin check compares Origin against it, so the tunnel case can't be
 * staged any other way.
 * @param headers - The full header set to send
 * @returns The response status
 */
function rawBriefingGet(headers: Record<string, string>): Promise<number> {
  const { port } = new URL(server.baseUrl);

  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { hostname: "127.0.0.1", port, path: "/subagent-briefing", headers },
      (res) => {
        res.resume(); // drain, or the socket holds the server open
        resolve(res.statusCode ?? 0);
      },
    );

    req.on("error", reject);
    req.end();
  });
}

/**
 * GET a briefing with the given per-request headers.
 * @param headers - Headers to send (the caller's profile)
 * @returns The briefing text
 */
async function getBriefing(
  headers: Record<string, string> = {},
): Promise<string> {
  const res = await briefingFetch(headers);

  expect(res.status).toBe(200);

  const body = (await res.json()) as { briefing: string };

  return body.briefing;
}

describe("subagent-briefing route", () => {
  it("leads with the Live Set overview probed from V8", async () => {
    const briefing = await getBriefing();

    expect(briefing).toContain("## Ableton Live Set");
    expect(briefing).toContain(LIVE_SET_TEXT);
    expect(callLiveApi).toHaveBeenCalledWith(
      "ppal-connect",
      {},
      {
        compactOutput: true,
      },
    );
  });

  it("carries the skills for the caller's profile", async () => {
    const briefing = await getBriefing();

    expect(briefing).toContain("# Producer Pal Skills");
    expect(briefing).toContain("## Positions & Meter"); // bar|beat head
  });

  it("ends with the subagent framing, not the user-facing next step", async () => {
    const briefing = await getBriefing();

    // No block follows it: the framing has to get the last word over the
    // user-facing instruction it inherits.
    expect(briefing).toContain("## You are a subagent");
    expect(briefing.lastIndexOf("\n## ")).toBe(
      briefing.indexOf("\n## You are a subagent"),
    );
    expect(briefing).not.toContain("wait for their instructions");
  });

  it("never carries the memory index, which a briefed worker cannot read", async () => {
    // ppal-context is withheld from a briefed worker, so an index pointing at
    // its read action would be a dead end — same reasoning as small-model mode.
    rememberMemory({
      name: "hat-shuffle-habit",
      description: "Zzyzx recall hook",
      body: "Zzyzx.",
    });

    const briefing = await getBriefing();

    expect(briefing).not.toContain("Memory index");
    expect(briefing).not.toContain("Zzyzx");
  });

  it("carries the project and global context blocks when they have content", async () => {
    config.projectContext = "Techno EP, 128 BPM";
    writeGlobalContext("Prefers dark minor keys");

    const briefing = await getBriefing();

    expect(briefing).toContain("Project context (this Live Set):");
    expect(briefing).toContain("Techno EP, 128 BPM");
    expect(briefing).toContain("Global context (all projects):");
    expect(briefing).toContain("Prefers dark minor keys");
  });

  it("omits an empty context layer entirely", async () => {
    const briefing = await getBriefing();

    expect(briefing).not.toContain("Project context");
    expect(briefing).not.toContain("Global context");
  });

  it("selects the notation from the header", async () => {
    const briefing = await getBriefing({ [NOTATION_HEADER]: "stark" });

    expect(briefing).not.toContain("## Positions & Meter");
    expect(briefing).toContain("# Producer Pal Skills");
  });

  it("selects the small-model variant from the header", async () => {
    const briefing = await getBriefing({
      [SMALL_MODEL_MODE_HEADER]: "true",
    });

    expect(briefing).not.toContain("## Devices & Instruments");
    expect(briefing).toContain("## Editing a clip that already has notes");
  });

  it("drops the fragments for tools the header withholds", async () => {
    const briefing = await getBriefing({
      [DISABLED_TOOLS_HEADER]: "ppal-library,ppal-context",
    });

    expect(briefing).not.toContain("## Finding Library Content");
    expect(briefing).not.toContain("## Context & Memory");
    expect(briefing).toContain("## Devices & Instruments");
  });

  it("drops the conversation-only guidance for every caller", async () => {
    // Audience is fixed by the endpoint, not by a header: everything this route
    // serves is for a worker.
    expect(await getBriefing()).not.toContain("## Getting Help");
  });

  it("falls back to the device globals when headers are absent", async () => {
    config.notation = "stark";
    config.tools = TOOL_NAMES.filter((name) => name !== "ppal-library");

    const briefing = await getBriefing();

    expect(briefing).not.toContain("## Positions & Meter");
    expect(briefing).not.toContain("## Finding Library Content");
  });

  it("answers 502 when Live reports an error, so the caller can fall back", async () => {
    liveSet = {
      content: [{ type: "text", text: "Ableton Live is not running" }],
      isError: true,
    };

    const res = await briefingFetch();

    expect(res.status).toBe(502);
    expect((await res.json()) as { error: string }).toStrictEqual({
      error: "Ableton Live is not running",
    });
  });

  it("answers 502 when Live returns nothing at all", async () => {
    liveSet = { content: [] };

    const res = await briefingFetch();

    expect(res.status).toBe(502);
  });

  it("reports a broken user override to the Max window", async () => {
    // The blob would otherwise just come back short, with nothing to say why.
    const warn = vi.spyOn(maxConsole, "warn").mockImplementation(() => {});

    try {
      writeSkillOverride("standard", {
        content: '# Skills\n\n@include "./no-such-fragment.md"',
      });

      await getBriefing();

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("Subagent briefing skills:"),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("is never cached", async () => {
    // Overrides, context, and the Live Set all change between spawns.
    const res = await briefingFetch();

    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("blocks a foreign origin with 403 before reaching Live", async () => {
    // A GET, but it drives the Live Set — so any page the user has open could
    // loop it and hold a socket per request until the tool timeout.
    const res = await briefingFetch({ Origin: "https://evil.example.com" });

    expect(res.status).toBe(403);
    expect(callLiveApi).not.toHaveBeenCalled();
  });

  it("blocks a request with no client header, whatever its origin", async () => {
    // The origin gate lets an Origin-less request through, and a browser sends
    // no Origin for `<img src>` / `<script src>` — which also cannot set a
    // header. That combination is the only trivially cross-site-reachable path
    // to a Live API dispatch.
    const res = await fetch(base);

    expect(res.status).toBe(403);
    expect(callLiveApi).not.toHaveBeenCalled();
  });

  it("still serves a browser on the same server", async () => {
    const res = await briefingFetch({ Origin: server.baseUrl });

    expect(res.status).toBe(200);
  });

  it("still serves the chat over a tunnel, where same-origin isn't localhost", async () => {
    // A public https Origin whose host matches the forwarded Host — the shape a
    // TLS-terminating tunnel produces. Getting this wrong 403s the remote chat's
    // own spawns, so the composition is worth a test and not just the unit one
    // on isSameOriginRequest.
    const status = await rawBriefingGet({
      Host: "ppal.trycloudflare.com",
      Origin: "https://ppal.trycloudflare.com",
      [BRIEFING_REQUEST_HEADER]: "1",
    });

    expect(status).toBe(200);
  });
});
