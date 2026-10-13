// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { BRIEFING_REQUEST_HEADER } from "#src/shared/config.ts";
import { withExpressApp } from "../express-app-test-helpers.ts";

interface Probe {
  /** Origin header to send; none when omitted */
  origin?: string;
  /** Default OPTIONS, sent with the headers a browser's preflight carries */
  method?: string;
  path?: string;
  headers?: Record<string, string>;
}

interface CorsAnswer {
  status: number;
  allowOrigin: string | null;
  vary: string | null;
  allowMethods: string | null;
  allowHeaders: string | null;
}

/**
 * Ask a fresh Express app for a path and read back what it says about CORS.
 * @param probe - The request to send
 * @returns The status and the CORS response headers
 */
async function ask(probe: Probe = {}): Promise<CorsAnswer> {
  const method = probe.method ?? "OPTIONS";
  const headers: Record<string, string> = { ...probe.headers };

  if (probe.origin != null) {
    headers.Origin = probe.origin;
  }

  if (method === "OPTIONS") {
    headers["Access-Control-Request-Method"] = "POST";
    headers["Access-Control-Request-Headers"] = "content-type";
  }

  const res = await withExpressApp((baseUrl) =>
    fetch(`${baseUrl}${probe.path ?? "/mcp"}`, { method, headers }),
  );

  return {
    status: res.status,
    allowOrigin: res.headers.get("access-control-allow-origin"),
    vary: res.headers.get("vary"),
    allowMethods: res.headers.get("access-control-allow-methods"),
    allowHeaders: res.headers.get("access-control-allow-headers"),
  };
}

/**
 * Run a check as a build made with ENABLE_REMOTE_CORS=true.
 * @param check - The check to run
 */
async function inRemoteCorsBuild(check: () => Promise<void>): Promise<void> {
  vi.stubEnv("ENABLE_REMOTE_CORS", "true");

  try {
    await check();
  } finally {
    // Back to unset, which is how every other test in this file runs.
    vi.stubEnv("ENABLE_REMOTE_CORS", undefined);
  }
}

describe("CORS on the MCP Express app", () => {
  describe("without ENABLE_REMOTE_CORS", () => {
    it.each(["http://localhost:5173", "http://127.0.0.1:8080"])(
      "answers a preflight from %s by echoing that origin",
      async (origin) => {
        const answer = await ask({ origin });

        expect(answer).toStrictEqual({
          status: 200,
          allowOrigin: origin,
          vary: "Origin",
          allowMethods: "GET, POST, OPTIONS, DELETE",
          allowHeaders: "*",
        });
      },
    );

    it("also echoes a localhost origin on an ordinary request", async () => {
      const answer = await ask({
        method: "GET",
        origin: "http://127.0.0.1:8080",
        path: "/config",
      });

      expect(answer.allowOrigin).toBe("http://127.0.0.1:8080");
    });

    it.each([
      ["a foreign origin", "https://evil.example"],
      ["no origin", undefined],
    ])("sends no allow-origin header for %s", async (_what, origin) => {
      const answer = await ask({ origin });

      expect(answer.allowOrigin).toBeNull();
    });
  });

  describe("with ENABLE_REMOTE_CORS", () => {
    it("allows every origin with a wildcard", async () => {
      await inRemoteCorsBuild(async () => {
        const answer = await ask({ origin: "https://anywhere.example" });

        expect(answer).toStrictEqual({
          status: 200,
          allowOrigin: "*",
          vary: null,
          allowMethods: "GET, POST, OPTIONS, DELETE",
          allowHeaders: "*",
        });
      });
    });

    it("still refuses a foreign origin on /subagent-briefing", async () => {
      // CORS no longer keeps the response from a foreign page in this build, so
      // the briefing's own origin check is the only thing standing between that
      // page and the result of every Live call it triggered.
      await inRemoteCorsBuild(async () => {
        const answer = await ask({
          method: "GET",
          path: "/subagent-briefing",
          origin: "https://evil.example",
          headers: { [BRIEFING_REQUEST_HEADER]: "1" },
        });

        expect(answer.status).toBe(403);
        expect(answer.allowOrigin).toBe("*");
      });
    });
  });
});
