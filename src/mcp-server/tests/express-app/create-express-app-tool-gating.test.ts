// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  BRIEFING_REQUEST_HEADER,
  DISABLED_TOOLS_HEADER,
} from "#src/shared/config.ts";
import { setupExpressAppServer } from "../express-app-test-helpers.ts";
import {
  connectSkillsBlock,
  listToolNames,
  SKILLS_HEADER,
} from "./mcp-header-test-helpers.ts";

/** The section heading the ppal-library fragment owns. */
const LIBRARY_SECTION = "## Finding Library Content";

/**
 * Headers withholding the given tools, or none when the list is empty.
 *
 * @param disabled - Tool names this request withholds
 * @returns The request headers to send
 */
function headers(...disabled: string[]): Record<string, string> {
  return disabled.length === 0
    ? {}
    : { [DISABLED_TOOLS_HEADER]: disabled.join(",") };
}

// The harness leaves the global config.tools at its default (every tool).
const appState = setupExpressAppServer();

describe("POST /mcp per-request disabled-tools header", () => {
  describe("tool registration", () => {
    it("withholds the named tools from this request", async () => {
      const names = await listToolNames(
        appState.serverUrl,
        headers("ppal-library", "ppal-playback"),
      );

      expect(names).not.toContain("ppal-library");
      expect(names).not.toContain("ppal-playback");
      expect(names).toContain("ppal-connect");
    });

    it("serves the full toolset when the header is absent", async () => {
      // Proves an external MCP client that sends no header is unaffected.
      expect(await listToolNames(appState.serverUrl, headers())).toContain(
        "ppal-library",
      );
    });

    it("ignores a name the server doesn't offer", async () => {
      const names = await listToolNames(
        appState.serverUrl,
        headers("spawn_subagent"),
      );

      expect(names).toContain("ppal-connect");
    });

    it("does not leak one request's toolset onto the next", async () => {
      await listToolNames(appState.serverUrl, headers("ppal-library"));

      expect(await listToolNames(appState.serverUrl, headers())).toContain(
        "ppal-library",
      );
    });
  });

  describe("skills gating", () => {
    it("omits the skills fragment for a tool this request withheld", async () => {
      const gated = await connectSkillsBlock(
        appState.serverUrl,
        headers("ppal-library"),
      );

      expect(gated.startsWith(SKILLS_HEADER)).toBe(true);
      expect(gated).not.toContain(LIBRARY_SECTION);
      // Only that fragment goes — the rest of the document is intact.
      expect(gated).toContain("## Devices & Instruments");
    });

    it("keeps every fragment when the header is absent", async () => {
      const full = await connectSkillsBlock(appState.serverUrl, headers());

      expect(full).toContain(LIBRARY_SECTION);
    });

    it("shrinks the blob in proportion to what was withheld", async () => {
      const full = await connectSkillsBlock(appState.serverUrl, headers());
      const narrow = await connectSkillsBlock(
        appState.serverUrl,
        // The path grammar goes with the last tool that addresses a device by
        // path, not with the last device tool — hence select/delete/duplicate.
        headers(
          "ppal-library",
          "ppal-read-device",
          "ppal-create-device",
          "ppal-update-device",
          "ppal-select",
          "ppal-delete",
          "ppal-duplicate",
        ),
      );

      expect(narrow).not.toContain(LIBRARY_SECTION);
      expect(narrow).not.toContain("## Devices & Instruments");
      expect(narrow).not.toContain("### Specialized Device Controls");
      expect(narrow.length).toBeLessThan(full.length);
    });
  });
});

describe("REST API per-request disabled-tools header", () => {
  /**
   * The tool names GET /api/tools serves with the given headers.
   *
   * @param requestHeaders - Request headers to send
   * @returns The catalog's tool names
   */
  async function restToolNames(
    requestHeaders: Record<string, string>,
  ): Promise<string[]> {
    const response = await fetch(`${appState.baseUrl}/api/tools`, {
      headers: requestHeaders,
    });
    const body = (await response.json()) as { tools: Array<{ name: string }> };

    return body.tools.map((tool) => tool.name);
  }

  /**
   * POST a tool call with the given headers.
   *
   * @param toolName - Tool to call
   * @param requestHeaders - Request headers to send
   * @returns The raw response
   */
  function restCallTool(
    toolName: string,
    requestHeaders: Record<string, string>,
  ): Promise<Response> {
    return fetch(`${appState.baseUrl}/api/tools/${toolName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...requestHeaders },
      body: "{}",
    });
  }

  describe("GET /api/tools", () => {
    it("withholds the named tools from this request's catalog", async () => {
      const names = await restToolNames(headers("ppal-library", "ppal-select"));

      expect(names).not.toContain("ppal-library");
      expect(names).not.toContain("ppal-select");
      expect(names).toContain("ppal-connect");
    });

    it("serves the full catalog when the header is absent", async () => {
      expect(await restToolNames(headers())).toContain("ppal-library");
    });

    it("does not leak one request's toolset onto the next", async () => {
      await restToolNames(headers("ppal-library"));

      expect(await restToolNames(headers())).toContain("ppal-library");
    });
  });

  describe("POST /api/tools/:toolName", () => {
    it("404s a tool this request withheld", async () => {
      const response = await restCallTool(
        "ppal-library",
        headers("ppal-library"),
      );

      expect(response.status).toBe(404);
    });

    it("still serves a tool the request kept", async () => {
      const response = await restCallTool(
        "ppal-library",
        headers("ppal-select"),
      );

      expect(response.status).toBe(200);
    });

    it("lets a caller withhold ppal-connect itself, reserving nothing", async () => {
      // Matches POST /mcp: a caller that has no use for the entry point pays
      // nothing for it.
      const response = await restCallTool(
        "ppal-connect",
        headers("ppal-connect"),
      );

      expect(response.status).toBe(404);
    });
  });

  describe("skills gating", () => {
    /**
     * Call ppal-connect over REST and return the injected skills block. In
     * `?format=json` (the REST default) the Node-appended blocks arrive as
     * `appended`.
     *
     * @param requestHeaders - Request headers to send
     * @returns The skills block text, or "" when none was found
     */
    async function restConnectSkillsBlock(
      requestHeaders: Record<string, string>,
    ): Promise<string> {
      const response = await restCallTool("ppal-connect", requestHeaders);
      const body = (await response.json()) as { appended?: string[] };

      return (
        body.appended?.find((text) => text.startsWith(SKILLS_HEADER)) ?? ""
      );
    }

    it("omits the fragment for a tool this request withheld", async () => {
      // The reason the header matters here at all: a coding agent driving the
      // REST API pays for the skills blob on every session's bootstrap.
      const gated = await restConnectSkillsBlock(headers("ppal-library"));

      expect(gated.startsWith(SKILLS_HEADER)).toBe(true);
      expect(gated).not.toContain(LIBRARY_SECTION);
      expect(gated).toContain("## Devices & Instruments");
    });

    it("keeps every fragment when the header is absent", async () => {
      expect(await restConnectSkillsBlock(headers())).toContain(
        LIBRARY_SECTION,
      );
    });
  });
});

describe("GET /skills-preview tool gating", () => {
  /**
   * Fetch the assembled preview blob.
   *
   * @returns The `skills` field of the preview response
   */
  async function fetchPreview(): Promise<string> {
    const response = await fetch(`${appState.baseUrl}/skills-preview`);
    const body = (await response.json()) as { skills: string };

    return body.skills;
  }

  it("reflects the device tool whitelist, not just the built-in manifest", async () => {
    // What the preview promises is the blob an external MCP client receives, so
    // a tool switched off on the device has to show as gone here too.
    expect(await fetchPreview()).toContain(LIBRARY_SECTION);

    const configResponse = await fetch(appState.configUrl);
    const full = (await configResponse.json()) as { tools: string[] };

    try {
      await appState.postConfig({
        tools: full.tools.filter((name) => name !== "ppal-library"),
      });

      expect(await fetchPreview()).not.toContain(LIBRARY_SECTION);
    } finally {
      await appState.postConfig({ tools: full.tools });
    }
  });
});

describe("GET /subagent-briefing tool gating", () => {
  it("gates a worker's briefing on the same header its tool calls send", async () => {
    // The briefing route reads the device config through a getter, exactly as
    // POST /mcp does, so the two can't drift on what a worker is allowed.
    const response = await fetch(`${appState.baseUrl}/subagent-briefing`, {
      headers: {
        ...headers("ppal-library"),
        [BRIEFING_REQUEST_HEADER]: "1",
      },
    });

    expect(response.status).toBe(200);

    const { briefing } = (await response.json()) as { briefing: string };

    expect(briefing).toContain(SKILLS_HEADER);
    expect(briefing).not.toContain(LIBRARY_SECTION);
    expect(briefing).toContain("## Devices & Instruments");
    // Never the user-facing next step — a worker has nobody to report to.
    expect(briefing).toContain("## You are a subagent");
  });
});
