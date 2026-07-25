// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { DISABLED_TOOLS_HEADER } from "#src/shared/config.ts";
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
        headers(
          "ppal-library",
          "ppal-read-device",
          "ppal-create-device",
          "ppal-update-device",
        ),
      );

      expect(narrow).not.toContain(LIBRARY_SECTION);
      expect(narrow).not.toContain("## Devices & Instruments");
      expect(narrow).not.toContain("### Specialized Device Controls");
      expect(narrow.length).toBeLessThan(full.length);
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
