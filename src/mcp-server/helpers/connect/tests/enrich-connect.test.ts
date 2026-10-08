// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rememberMemory } from "#src/mcp-server/helpers/memory/memory-store.ts";
import {
  connectResponse,
  fakeInnerCall,
  useTempConfigDir,
} from "#src/mcp-server/tests/config-dir-test-helpers.ts";
import { type RemoteScriptPing } from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import { type RemoteScriptStatus } from "#src/mcp-server/rpc/remote-script/remote-script-status.ts";
import { VERSION } from "#src/shared/config.ts";
import { DEFAULT_NOTATION } from "#src/shared/notation.ts";
import {
  enrichConnect,
  type ConnectEnrichmentConfig,
} from "../enrich-connect.ts";

const { remoteScriptPing, remoteScriptStatus } = vi.hoisted(() => ({
  remoteScriptPing: vi.fn<() => Promise<RemoteScriptPing>>(),
  remoteScriptStatus: vi.fn<() => Promise<RemoteScriptStatus>>(),
}));

// The real ones read the developer's running Live and User Library.
vi.mock(
  import("#src/mcp-server/rpc/remote-script/remote-script-client.ts"),
  async (original) => ({ ...(await original()), remoteScriptPing }),
);

vi.mock(
  import("#src/mcp-server/rpc/remote-script/remote-script-status.ts"),
  () => ({ remoteScriptStatus }),
);

const getDir = useTempConfigDir();

/**
 * A status for an installed, current script that Live is running.
 * @param overrides - Fields to change
 * @returns The status
 */
function currentStatus(
  overrides: Partial<RemoteScriptStatus> = {},
): RemoteScriptStatus {
  return {
    userLibrary: "/lib",
    installed: true,
    installedVersion: VERSION,
    bundledVersion: VERSION,
    running: true,
    runningVersion: VERSION,
    liveVersion: "12.4.0",
    otherOnPort: null,
    updateAvailable: false,
    installedNewer: false,
    ...overrides,
  };
}

beforeEach(() => {
  remoteScriptPing.mockReset();
  remoteScriptStatus.mockReset();
  remoteScriptPing.mockResolvedValue({
    running: true,
    liveVersion: "12.4.0",
    scriptVersion: VERSION,
    otherOnPort: null,
  });
  remoteScriptStatus.mockResolvedValue(currentStatus());
});

/**
 * Run the full enrichment chain over a ppal-connect call.
 * @param overrides - Device settings to override the defaults
 * @returns The text of every content block, in order
 */
async function enrichedBlocks(
  overrides: Partial<ConnectEnrichmentConfig> = {},
): Promise<string[]> {
  const config: ConnectEnrichmentConfig = {
    notation: DEFAULT_NOTATION,
    smallModelMode: false,
    projectContext: "",
    ...overrides,
  };

  const result = await enrichConnect(
    fakeInnerCall(connectResponse()),
    () => config,
  )("ppal-connect", {});

  return result.content.map((block) => block.text);
}

describe("enrichConnect", () => {
  it("appends every block in order: skills, project, global, memory, next step", async () => {
    writeFileSync(join(getDir(), "context.md"), "I make ambient techno.");
    rememberMemory({
      name: "hates-quantized-hats",
      description: "Dislikes rigidly quantized hi-hats",
      body: "Apply swing to hi-hats by default.",
    });

    const blocks = await enrichedBlocks({ projectContext: "House track." });

    expect(blocks).toHaveLength(7); // the connect result itself, then six
    expect(blocks[1]).toContain("remoteScript:");
    expect(blocks[2]).toContain("Producer Pal"); // skills
    expect(blocks[3]).toContain("Project context (this Live Set):");
    expect(blocks[4]).toContain("Global context (all projects):");
    expect(blocks[5]).toContain("Memory index");
    expect(blocks[5]).toContain("Read an entry before work it covers");
    expect(blocks[5]).toContain("rewrite that entry right away");
    expect(blocks[6]).toContain("Report the connection status");
  });

  it("puts the portal version line right after the connect result, before the skills", async () => {
    const blocks = await enrichedBlocks({ portalVersion: "1.0.0" });

    expect(blocks[1]).toContain("portalVersion: 1.0.0");
    expect(blocks[3]).toContain("Producer Pal Skills");
    expect(blocks.at(-1)).toContain("Report the connection status");
  });

  it("puts the remote script line after the portal line and before the skills", async () => {
    remoteScriptStatus.mockResolvedValue(
      currentStatus({ installedVersion: "0.0.1", updateAvailable: true }),
    );

    const blocks = await enrichedBlocks({ portalVersion: "1.0.0" });

    expect(blocks[1]).toContain("portalVersion: 1.0.0");
    expect(blocks[2]).toContain("remoteScript:");
    expect(blocks[3]).toContain("Producer Pal Skills");
  });

  it("pings the remote script once per connect, for the skills and the notice together", async () => {
    await enrichedBlocks();

    expect(remoteScriptPing).toHaveBeenCalledOnce();
  });

  it("gives just the version when the script is current", async () => {
    const blocks = await enrichedBlocks();

    expect(blocks).toContain(`remoteScript: v${VERSION} running`);
  });

  describe("the install pointer in the remote script line", () => {
    const NOT_INSTALLED = {
      installed: false,
      installedVersion: null,
      running: false,
      runningVersion: null,
    };

    /**
     * @param overrides - Device settings to override the defaults
     * @returns The remote script line
     */
    async function lineFor(
      overrides: Partial<ConnectEnrichmentConfig>,
    ): Promise<string | undefined> {
      remoteScriptStatus.mockResolvedValue(currentStatus(NOT_INSTALLED));

      const blocks = await enrichedBlocks(overrides);

      return blocks.find((block) => block.startsWith("remoteScript:"));
    }

    it("names ppal-manage when the toolset has it", async () => {
      expect(await lineFor({})).toContain("ppal-manage");
      expect(
        await lineFor({ tools: ["ppal-connect", "ppal-manage"] }),
      ).toContain("ppal-manage");
    });

    it("names the Chat UI when the toolset leaves ppal-manage out", async () => {
      const line = await lineFor({ tools: ["ppal-connect"] });

      expect(line).toContain("Chat UI");
      expect(line).not.toContain("ppal-manage");
    });

    it("names the Chat UI in small-model mode", async () => {
      const line = await lineFor({ smallModelMode: true });

      expect(line).toContain("Chat UI");
      expect(line).not.toContain("ppal-manage");
    });
  });

  it("adds no portal line for a request that did not come through a portal", async () => {
    const blocks = await enrichedBlocks();

    expect(blocks.some((block) => block.includes("portalVersion"))).toBe(false);
  });

  // The next step reacts to the context and memory carried by the blocks before
  // it, and reads as the response's final word. Compose it anywhere but
  // outermost and it lands mid-response, ahead of the very blocks it describes —
  // which is exactly the bug that moving it out of V8's connect() result fixed.
  it("puts the next step LAST even when every other block is absent", async () => {
    const blocks = await enrichedBlocks();

    expect(blocks.at(-1)).toContain("Report the connection status");
  });

  it("offers to get to know a user with no global context and no memories", async () => {
    const blocks = await enrichedBlocks();

    expect(blocks.at(-1)).toContain("musical style, preferences, and goals");
  });

  // The project blob reaches the next step by a different route than the other
  // two layers — it's a device config value, not a file — so only the composed
  // chain proves it arrives at all. Get this wiring wrong and the report claims
  // project context is empty when the user has written pages of it.
  it("reports the empty layers, project context included", async () => {
    const blocks = await enrichedBlocks();

    expect(blocks.at(-1)).toContain(
      "Currently empty: project context, global context, memory.",
    );
  });

  it("leaves a filled project blob out of the empty-layer report", async () => {
    const blocks = await enrichedBlocks({ projectContext: "House track." });

    expect(blocks.at(-1)).toContain("Currently empty: global context, memory.");
  });

  it("drops the offer once a memory exists, and keeps the next step last", async () => {
    rememberMemory({
      name: "prefers-dark-techno",
      description: "Default genre for new material",
      body: "Dark, hypnotic techno around 138 BPM.",
    });

    const blocks = await enrichedBlocks();

    expect(blocks.at(-1)).not.toContain(
      "musical style, preferences, and goals",
    );
    expect(blocks.at(-1)).toContain("Report the connection status");
  });
});
