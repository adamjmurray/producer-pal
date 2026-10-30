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
import { currentRemoteScriptStatus } from "#src/mcp-server/rpc/remote-script/tests/remote-script-test-helpers.ts";
import { type RemoteScriptStatus } from "#src/mcp-server/rpc/remote-script/remote-script-status.ts";
import { VERSION } from "#src/shared/config.ts";
import { UP_TO_DATE_NEW_CHAT } from "#src/shared/version-check.ts";
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

beforeEach(() => {
  remoteScriptPing.mockReset();
  remoteScriptStatus.mockReset();
  remoteScriptPing.mockResolvedValue({
    running: true,
    liveVersion: "12.4.0",
    scriptVersion: VERSION,
    scriptBuild: null,
    scriptCommit: null,
    userLibrary: null,
    otherOnPort: null,
  });
  remoteScriptStatus.mockResolvedValue(currentRemoteScriptStatus());
});

/**
 * Run the full enrichment chain over a ppal-connect call.
 * @param overrides - Device settings to override the defaults
 * @param args - The ppal-connect args
 * @returns The text of every content block, in order
 */
async function enrichedBlocks(
  overrides: Partial<ConnectEnrichmentConfig> = {},
  args: object = {},
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
  )("ppal-connect", args);

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
    expect(blocks[5]).toContain("rewrite that entry now, even unasked");
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
      currentRemoteScriptStatus({
        installedVersion: "0.0.1",
        updateAvailable: true,
      }),
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
      remoteScriptStatus.mockResolvedValue(
        currentRemoteScriptStatus(NOT_INSTALLED),
      );

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

  it("marks a user with no global context and no memories as new", async () => {
    const blocks = await enrichedBlocks();

    expect(blocks.at(-1)).toContain("nothing is saved about them yet");
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

  it("drops the new-user marker once a memory exists, and keeps the next step last", async () => {
    rememberMemory({
      name: "prefers-dark-techno",
      description: "Default genre for new material",
      body: "Dark, hypnotic techno around 138 BPM.",
    });

    const blocks = await enrichedBlocks();

    expect(blocks.at(-1)).not.toContain("nothing is saved about them yet");
    expect(blocks.at(-1)).toContain("Report the connection status");
  });

  // The result's marker and the Skill's paragraph come from one check, so each
  // appears exactly when the other does.
  it("sends the New user paragraph only with the new-user marker", async () => {
    const PARAGRAPH = "**New user** (connect says";
    const MARKER = "nothing is saved about them yet";

    const newUser = await enrichedBlocks();

    expect(newUser[2]).toContain(PARAGRAPH);
    expect(newUser.at(-1)).toContain(MARKER);

    rememberMemory({
      name: "prefers-dark-techno",
      description: "Default genre for new material",
      body: "Dark, hypnotic techno around 138 BPM.",
    });

    const known = await enrichedBlocks();

    expect(known[2]).toContain("## Context & Memory");
    expect(known[2]).not.toContain(PARAGRAPH);
    expect(known.at(-1)).not.toContain(MARKER);
  });

  describe("versionCheck", () => {
    const CHECK = { versionCheck: true };

    it("keeps only the connect result, the portal line, the script line and the new-chat line", async () => {
      writeFileSync(join(getDir(), "context.md"), "I make ambient techno.");

      const blocks = await enrichedBlocks(
        { portalVersion: VERSION, projectContext: "House track." },
        CHECK,
      );

      expect(blocks).toHaveLength(4);
      expect(blocks[1]).toBe(`portalVersion: ${VERSION}`);
      expect(blocks[2]).toBe(`remoteScript: v${VERSION} running`);
      expect(blocks[3]).toBe(UP_TO_DATE_NEW_CHAT);
    });

    it("pings the remote script and reads its status once", async () => {
      await enrichedBlocks({}, CHECK);

      expect(remoteScriptPing).toHaveBeenCalledOnce();
      expect(remoteScriptStatus).toHaveBeenCalledOnce();
    });

    it("treats versionCheck false as a full connect", async () => {
      const blocks = await enrichedBlocks({}, { versionCheck: false });

      expect(blocks.at(-1)).toContain("Report the connection status");
      expect(blocks).not.toContain(UP_TO_DATE_NEW_CHAT);
    });

    it("suggests a new chat when there is no portal", async () => {
      const blocks = await enrichedBlocks({}, CHECK);

      expect(blocks).toHaveLength(3);
      expect(blocks.at(-1)).toBe(UP_TO_DATE_NEW_CHAT);
    });

    it.each([
      {
        name: "the script is not installed",
        status: { installed: false, installedVersion: null, running: false },
      },
      {
        name: "the script is installed but not running",
        status: { running: false, runningVersion: null },
      },
      {
        name: "the installed script is behind",
        status: { installedVersion: "0.0.1", updateAvailable: true },
      },
      {
        name: "Live runs another copy than the installed one",
        status: { runningVersion: "0.0.1" },
      },
      {
        name: "another program answers on the port",
        status: { running: false, otherOnPort: 3350 },
      },
    ])(
      "still says what is wrong, with no new-chat line, when $name",
      async ({ status }) => {
        remoteScriptStatus.mockResolvedValue(currentRemoteScriptStatus(status));

        const blocks = await enrichedBlocks({}, CHECK);

        expect(blocks).toHaveLength(2);
        expect(blocks[1]).toMatch(/^remoteScript: /);
        expect(blocks).not.toContain(UP_TO_DATE_NEW_CHAT);
      },
    );

    it("gives no new-chat line when the remote script status can't be read", async () => {
      remoteScriptStatus.mockRejectedValue(new Error("no library"));

      const blocks = await enrichedBlocks({}, CHECK);

      expect(blocks).toHaveLength(1);
    });

    it.each([
      { name: "older than the device", portalVersion: "1.0.0" },
      { name: "newer than the device", portalVersion: "99.0.0" },
    ])(
      "gives no new-chat line when the portal is $name",
      async ({ portalVersion }) => {
        const blocks = await enrichedBlocks({ portalVersion }, CHECK);

        expect(blocks[1]).toContain(`portalVersion: ${portalVersion}`);
        expect(blocks).not.toContain(UP_TO_DATE_NEW_CHAT);
      },
    );

    it("puts the update-the-portal advice in the portal line when the portal is older", async () => {
      const blocks = await enrichedBlocks({ portalVersion: "1.0.0" }, CHECK);

      expect(blocks[1]).toContain("The portal is older than the device");
    });
  });
});
