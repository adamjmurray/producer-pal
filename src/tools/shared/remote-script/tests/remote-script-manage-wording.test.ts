// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findSourceFiles,
  projectRoot,
  repoPath,
} from "#src/test/helpers/meta-test-helpers.ts";
import { MANAGE_TOOL_ID } from "#src/shared/tool-groups.ts";
import { presetNeedsRemoteScript } from "#src/tools/device/create/helpers/browser-presets.ts";
import { convertNeedsRemoteScript } from "#src/tools/clip/convert/apply-clip-convert.ts";
import {
  differentBuildReason,
  outdatedFor,
  outdatedReason,
  whyUnavailable,
  type RemoteScriptUnavailable,
} from "../outdated-remote-script.ts";
import { manageOffered, remoteScriptSetup } from "../remote-script-setup.ts";

// A refusal names only tools the caller could have written, so every message
// that points at ppal-manage has a version for a caller without it.
const OUTDATED_REPLY: RemoteScriptUnavailable = {
  available: false,
  outdated: outdatedReason("2.4.0", "2.5.0"),
  outdatedWithoutManage: outdatedReason("2.4.0", "2.5.0", "device", false),
};
const MISSING = "the remote script isn't running";

/** Every device-side message, built for a caller with or without the tool. */
const MESSAGES: Array<[string, (manage: boolean) => string]> = [
  ["remoteScriptSetup", remoteScriptSetup],
  ["presetNeedsRemoteScript", presetNeedsRemoteScript],
  ["convertNeedsRemoteScript", convertNeedsRemoteScript],
  [
    "outdatedReason",
    (manage) => outdatedReason("2.4.0", "2.5.0", "device", manage),
  ],
  [
    "outdatedReason, version unknown",
    (manage) => outdatedReason(null, "2.5.0", "device", manage),
  ],
  [
    "differentBuildReason",
    (manage) => differentBuildReason("2.5.0", "device", manage),
  ],
  ["outdatedFor", (manage) => outdatedFor(OUTDATED_REPLY, manage) ?? ""],
  [
    "whyUnavailable, outdated",
    (manage) => whyUnavailable(OUTDATED_REPLY, MISSING, manage),
  ],
];

describe("remote script refusals and ppal-manage", () => {
  it.each(MESSAGES)(
    "%s names ppal-manage only when it is offered",
    (_name, build) => {
      expect(build(true)).toContain(MANAGE_TOOL_ID);

      const without = build(false);

      expect(without).not.toContain(MANAGE_TOOL_ID);
      expect(without).toContain("chat UI");
    },
  );

  it("sends a caller without the tool to the chat UI and Live, in that order", () => {
    expect(remoteScriptSetup(false)).toMatch(
      /Settings → Installation.*restart Live.*Control Surface/,
    );
  });

  it("names the tool in none of the messages a missing script gets", () => {
    expect(whyUnavailable({ available: false }, MISSING, false)).toBe(MISSING);
    expect(whyUnavailable({ available: false }, MISSING, true)).toBe(MISSING);
  });

  it("falls back to the one reason when only it was sent", () => {
    const portal: RemoteScriptUnavailable = {
      available: false,
      outdated: "old",
    };

    expect(outdatedFor(portal, false)).toBe("old");
  });

  it("keeps the portal's wording on the tool, which its callers always have", () => {
    expect(outdatedReason("2.4.0", "2.5.0", "portal", false)).toContain(
      MANAGE_TOOL_ID,
    );
    expect(differentBuildReason("2.5.0", "portal", false)).toContain(
      MANAGE_TOOL_ID,
    );
  });
});

describe("manageOffered", () => {
  it("follows what the device sent for this request", () => {
    expect(
      manageOffered({ manageAvailable: false, smallModelMode: false }),
    ).toBe(false);
    expect(manageOffered({ manageAvailable: true, smallModelMode: true })).toBe(
      true,
    );
  });

  it("falls back to small-model mode when the device sent nothing", () => {
    expect(manageOffered({ smallModelMode: true })).toBe(false);
    expect(manageOffered({ smallModelMode: false })).toBe(true);
    expect(manageOffered({})).toBe(true);
  });
});

describe("where ppal-manage is named", () => {
  // A refusal that names the tool must be built from the shared wording above,
  // or a caller without ppal-manage gets sent to it. This lists every file
  // outside the portal whose code (not comments) names the tool, so a new one
  // has to be looked at and added here.
  const NAMING =
    /ppal-manage|INSTALL_WITH_TOOL|MANAGE_TOOL_ID|install-producer-pal/;
  const ALLOWED = [
    // ppal-manage itself: its caller just called it.
    /^src\/tools\/core\//,
    // The shared wording, which takes `manage`.
    "src/tools/shared/remote-script/outdated-remote-script.ts",
    "src/tools/device/create/helpers/call/plugin-host-setup.ts",
    "src/tools/shared/remote-script/remote-script-setup.ts",
    // The connect notice, which splits on whether the tool is offered.
    "src/mcp-server/helpers/connect/remote-script-line.ts",
    // Dispatch table entry for the tool.
    "src/live-api-adapter/live-api-adapter.ts",
    // Skips the undo-step end for ppal-manage's own calls; not a message.
    "src/mcp-server/rpc/remote-script/forwarded/with-undo-step-end.ts",
    // Skills, sent only while ppal-manage is on (the fragment's tool gate).
    "src/skills/fragments/history.ts",
    "src/skills/fragment-tool-gates.ts",
    // The Skills settings blurb, which a person reads.
    "src/skills/skill-slots.ts",
  ];

  /**
   * @param file - A project-relative path
   * @returns Whether the file may name the tool
   */
  function allowed(file: string): boolean {
    return ALLOWED.some((entry) =>
      typeof entry === "string" ? entry === file : entry.test(file),
    );
  }

  it("is only in the allowed files", () => {
    const naming: string[] = [];

    for (const dir of [
      "src/tools",
      "src/live-api-adapter",
      "src/mcp-server",
      "src/skills",
    ]) {
      for (const file of findSourceFiles(path.join(projectRoot, dir), true)) {
        const code = fs
          .readFileSync(file, "utf8")
          .split("\n")
          .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
          .join("\n");

        if (NAMING.test(code)) {
          naming.push(repoPath(file));
        }
      }
    }

    expect(naming.filter((file) => !allowed(file))).toStrictEqual([]);
  });
});
