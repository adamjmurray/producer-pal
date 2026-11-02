// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import {
  type McpContent,
  type ToolOverrideContext,
} from "#evals/scenarios/run-scenario/tool-override-proxy.ts";
import { TOOL_NAMES } from "#src/mcp-server/create-mcp-server.ts";
import { VERSION } from "#src/shared/config.ts";
import {
  AFTER_RESTART_CHECK,
  UP_TO_DATE_NEW_CHAT,
  VERSION_CHECK_CALL,
  VERSION_CHECK_NEVER_CONNECTED,
} from "#src/shared/version-check.ts";
import {
  connectOverride,
  connectWithBehindScript,
  connectWithOlderDevice,
  installSuccess,
  manageOverride,
  updateSuccess,
  versionCheckUpToDate,
} from "../connect-manage-overrides.ts";

/** A normal run: ppal-manage is offered. */
const CONTEXT: ToolOverrideContext = {
  smallModelMode: false,
  tools: [...TOOL_NAMES],
};
/** A run whose tools leave ppal-manage out (`--tools`, or an old device). */
const NO_MANAGE: ToolOverrideContext = {
  smallModelMode: false,
  tools: TOOL_NAMES.filter((name) => name !== "ppal-manage"),
};
/** Small-model mode, as the device lists tools there. */
const SMALL_MODEL: ToolOverrideContext = {
  smallModelMode: true,
  tools: TOOL_NAMES.filter((name) => name !== "ppal-manage"),
};

const REAL: McpContent = [
  { type: "text", text: "{connected:true}" },
  { type: "text", text: "remoteScript: v1.0.0 running" },
];
const callReal = vi.fn(() => Promise.resolve(REAL));
const REAL_CHECK: McpContent = [
  {
    type: "text",
    text: 'connected:true,producerPalVersion:"9.9.9",abletonLiveVersion:"12.4.15"',
  },
  { type: "text", text: "remoteScript: not installed." },
];
const callRealCheck = vi.fn(() => Promise.resolve(REAL_CHECK));
const texts = (content: McpContent): string[] =>
  content.map((block) => block.text ?? "");

describe("canned results", () => {
  it("update tells the model to run the version check", () => {
    const [block] = texts(updateSuccess());

    expect(block).toContain(`Now call ${VERSION_CHECK_CALL}`);
    expect(block).toContain(VERSION_CHECK_NEVER_CONNECTED);
    expect(block).toContain(`to:"${VERSION}"`);
  });

  it("update, when the chat has not connected, asks for the plain connect", () => {
    const [block] = texts(updateSuccess(false));

    expect(block).toContain(
      "Now call ppal-connect to load the Skills and confirm the update.",
    );
    expect(block).not.toContain("versionCheck");
  });

  it("install reports the files and asks for a restart", () => {
    const [block] = texts(installSuccess());

    expect(block).toContain("restart Live");
    expect(block).toContain(VERSION_CHECK_CALL);
    expect(block).toContain(VERSION_CHECK_NEVER_CONNECTED);
  });

  it("version check is versions, a running script line, then the new-chat line", () => {
    const blocks = texts(versionCheckUpToDate("12.4.15", CONTEXT));

    expect(blocks[0]).toContain(`producerPalVersion:"${VERSION}"`);
    expect(blocks[0]).toContain('abletonLiveVersion:"12.4.15"');
    expect(blocks[1]).toBe(`remoteScript: v${VERSION} running`);
    expect(blocks.at(-1)).toBe(UP_TO_DATE_NEW_CHAT);
  });
});

describe("connect overrides", () => {
  it("answers a version check with the canned result and the real Live version", async () => {
    const result = await connectOverride()(
      { versionCheck: true },
      callRealCheck,
      CONTEXT,
    );

    expect(result).toStrictEqual(versionCheckUpToDate("12.4.15", CONTEXT));
    expect(texts(result)).not.toContain(REAL_CHECK[1]?.text);
  });

  it("fails loudly when the real version check has no Live version", async () => {
    await expect(
      connectOverride()({ versionCheck: true }, callReal, CONTEXT),
    ).rejects.toThrow("No Live version");
  });

  it("an empty real result fails the same way", async () => {
    await expect(
      connectOverride()(
        { versionCheck: true },
        () => Promise.resolve([]),
        CONTEXT,
      ),
    ).rejects.toThrow("No Live version");
  });

  it("passes a plain connect through to the real call", async () => {
    expect(await connectOverride()({}, callReal, CONTEXT)).toStrictEqual(REAL);
  });

  it("hands a plain connect to the given handler", async () => {
    const result = await connectOverride(connectWithOlderDevice)(
      {},
      callReal,
      CONTEXT,
    );

    expect(result.slice(0, 2)).toStrictEqual(REAL);
    expect(texts(result).at(-1)).toContain("is older than this connector");
    expect(texts(result).at(-1)).toContain('"update-producer-pal"');
  });

  it("replaces the real remote script line with the behind line", async () => {
    const blocks = texts(await connectWithBehindScript({}, callReal, CONTEXT));

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toBe("{connected:true}");
    expect(blocks[1]).toContain("is installed, but this device ships");
    expect(blocks[1]).toContain("ppal-manage");
    expect(blocks[1]).toContain(AFTER_RESTART_CHECK);
  });
});

describe("answers as the product would for the run", () => {
  const olderNote = async (context: ToolOverrideContext): Promise<string> => {
    const content = await connectWithOlderDevice({}, callReal, context);

    return texts(content).slice(REAL.length).join();
  };

  const scriptLine = async (context: ToolOverrideContext): Promise<string> => {
    const content = await connectWithBehindScript({}, callReal, context);

    return texts(content).at(-1) ?? "";
  };

  it("older device: updates in place when ppal-manage is offered", async () => {
    const note = await olderNote(CONTEXT);

    expect(note).toContain('call ppal-manage action "update-producer-pal"');
  });

  it("older device: sends the user to update by hand when ppal-manage is not offered", async () => {
    const note = await olderNote(NO_MANAGE);

    expect(note).toContain("update the Producer Pal device by hand");
    expect(note).not.toContain("ppal-manage");
  });

  it("older device: says nothing in small-model mode", async () => {
    expect(await olderNote(SMALL_MODEL)).toBe("");
  });

  it("behind script: names ppal-manage only when it is offered", async () => {
    const noManage = await scriptLine(NO_MANAGE);

    expect(await scriptLine(CONTEXT)).toContain("ppal-manage");
    expect(noManage).toContain("Chat UI");
    expect(noManage).not.toContain("ppal-manage");
  });

  it("behind script: reads as a running script in small-model mode", async () => {
    expect(await scriptLine(SMALL_MODEL)).toMatch(
      /^remoteScript: v\S+ running$/,
    );
  });
});

describe("manageOverride", () => {
  const override = manageOverride("update-producer-pal", updateSuccess);

  it("answers its action with the canned result", async () => {
    expect(
      await override({ action: "update-producer-pal" }, callReal, CONTEXT),
    ).toStrictEqual(updateSuccess());
  });

  it("refuses any other action instead of running it", async () => {
    callReal.mockClear();

    const [block] = texts(
      await override({ action: "install-producer-pal" }, callReal, CONTEXT),
    );

    expect(block).toMatch(/^Error:/);
    expect(callReal).not.toHaveBeenCalled();
  });
});
