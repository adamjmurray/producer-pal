// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { type McpContent } from "#evals/scenarios/run-scenario/tool-override-proxy.ts";
import { VERSION } from "#src/shared/config.ts";
import {
  AFTER_RESTART_CHECK,
  UP_TO_DATE_NEW_CHAT,
  VERSION_CHECK_OR_CONNECT,
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

const REAL: McpContent = [
  { type: "text", text: "{connected:true}" },
  { type: "text", text: "remoteScript: v1.0.0 running" },
];
const callReal = vi.fn(() => Promise.resolve(REAL));
const texts = (content: McpContent): string[] =>
  content.map((block) => block.text ?? "");

describe("canned results", () => {
  it("update points at the version check or a plain connect", () => {
    const [block] = texts(updateSuccess());

    expect(block).toContain(VERSION_CHECK_OR_CONNECT);
    expect(block).toContain(`to:"${VERSION}"`);
  });

  it("install reports the files and asks for a restart", () => {
    const [block] = texts(installSuccess());

    expect(block).toContain("restart Live");
    expect(block).toContain(VERSION_CHECK_OR_CONNECT);
  });

  it("version check is versions, a running script line, then the new-chat line", () => {
    const blocks = texts(versionCheckUpToDate());

    expect(blocks[0]).toContain(`producerPalVersion:"${VERSION}"`);
    expect(blocks[1]).toBe(`remoteScript: v${VERSION} running`);
    expect(blocks.at(-1)).toBe(UP_TO_DATE_NEW_CHAT);
  });
});

describe("connect overrides", () => {
  it("answers a version check with the canned result without calling", async () => {
    callReal.mockClear();

    const result = await connectOverride()({ versionCheck: true }, callReal);

    expect(result).toStrictEqual(versionCheckUpToDate());
    expect(callReal).not.toHaveBeenCalled();
  });

  it("passes a plain connect through to the real call", async () => {
    expect(await connectOverride()({}, callReal)).toStrictEqual(REAL);
  });

  it("hands a plain connect to the given handler", async () => {
    const result = await connectOverride(connectWithOlderDevice)({}, callReal);

    expect(result.slice(0, 2)).toStrictEqual(REAL);
    expect(texts(result).at(-1)).toContain("is older than this connector");
    expect(texts(result).at(-1)).toContain('"update-producer-pal"');
  });

  it("replaces the real remote script line with the behind line", async () => {
    const blocks = texts(await connectWithBehindScript({}, callReal));

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toBe("{connected:true}");
    expect(blocks[1]).toContain("is installed, but this device ships");
    expect(blocks[1]).toContain("ppal-manage");
    expect(blocks[1]).toContain(AFTER_RESTART_CHECK);
  });
});

describe("manageOverride", () => {
  const override = manageOverride("update-producer-pal", updateSuccess);

  it("answers its action with the canned result", async () => {
    expect(
      await override({ action: "update-producer-pal" }, callReal),
    ).toStrictEqual(updateSuccess());
  });

  it("refuses any other action instead of running it", async () => {
    const [block] = texts(
      await override({ action: "install-producer-pal" }, callReal),
    );

    expect(block).toMatch(/^Error:/);
    expect(callReal).not.toHaveBeenCalled();
  });
});
