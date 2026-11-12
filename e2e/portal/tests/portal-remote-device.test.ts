// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A portal pointed at another computer: ppal-manage install, add and update
// are refused, and every other call gets the remote guidance, without the
// portal looking at this machine (the remote script here, or the User Library).
//
// The "other computer" is a `.invalid` name: reserved, so it can never be this
// machine, and the lookup fails at once.
//
// Run with: npm run e2e:portal

import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  callToolText,
  copyPortal,
  listToolNames,
  startPortal,
  stopAfterEach,
  tempFolders,
} from "../portal-test-helpers";
import { createStubRemoteScript } from "../stub-remote-script";

const track = stopAfterEach();
const newFolder = tempFolders();

/**
 * A portal whose device is on "another computer" and never answers, beside a
 * remote script on this machine that answers everything.
 * @returns The portal, the script, and the address the portal was given
 */
async function remotePortal(): Promise<{
  portal: Awaited<ReturnType<typeof startPortal>>;
  script: Awaited<ReturnType<typeof createStubRemoteScript>>;
  host: string;
}> {
  const host = "other-computer.invalid:3350";
  const script = track(await createStubRemoteScript());
  const copy = track(copyPortal(true));
  const home = newFolder();
  const portal = track(
    await startPortal(
      `http://${host}`,
      [],
      { ...script.env, HOME: home, USERPROFILE: home },
      copy.file,
    ),
  );

  return { portal, script, host };
}

describe("a portal whose device is on another computer", () => {
  it.each([
    ["install-producer-pal", "install"],
    ["add-producer-pal", "add"],
    ["update-producer-pal", "update"],
  ])(
    "refuses ppal-manage %s and touches nothing here",
    async (action, verb) => {
      const { portal, script, host } = await remotePortal();
      const library = newFolder();

      expect(await listToolNames(portal)).toContain("ppal-manage");

      const { text, isError } = await callToolText(portal, "ppal-manage", {
        action,
        userLibrary: library,
      });

      expect(isError).toBe(true);
      expect(text).toContain(`another computer (${host})`);
      expect(text).toContain(`can't ${verb} Producer Pal there`);
      expect(script.requests).toStrictEqual([]);
      expect(existsSync(join(library, "Remote Scripts"))).toBe(false);
      expect(existsSync(join(library, "Presets"))).toBe(false);
    },
  );

  it("tells every other call what to check on Live's computer", async () => {
    const { portal, script, host } = await remotePortal();

    for (const [name, args] of [
      ["ppal-connect", {}],
      ["ppal-manage", { action: "undo" }],
    ] as const) {
      const { text, isError } = await callToolText(portal, name, args);

      expect(isError).toBe(true);
      expect(text).toContain(`Producer Pal at ${host} didn't answer.`);
      expect(text).toContain("Remote Control");
      expect(text).not.toContain("Cannot connect to Ableton Live");
    }

    expect(script.requests).toStrictEqual([]);
  });
});
