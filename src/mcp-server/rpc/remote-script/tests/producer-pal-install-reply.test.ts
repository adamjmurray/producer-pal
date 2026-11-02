// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type InstallPart } from "#src/tools/core/helpers/manage-contract.ts";
import {
  installProducerPalReply,
  type ProducerPalInstallSteps,
} from "../install/producer-pal-install-reply.ts";
import { ASK_FOR_LIBRARY } from "../install/remote-script-install-reply.ts";
import { makeScratchUserLibrary } from "./remote-script-test-helpers.ts";

const OK: InstallPart = { status: "installed", path: "/x" };
let library: string;

beforeEach(() => {
  library = makeScratchUserLibrary("producer-pal-install");
});

afterEach(() => {
  rmSync(library, { recursive: true, force: true });
});

/**
 * @param overrides - What this test changes
 * @returns Steps that find the scratch library and install fine
 */
function steps(
  overrides: Partial<ProducerPalInstallSteps> = {},
): ProducerPalInstallSteps {
  return {
    findUserLibrary: vi.fn(() => Promise.resolve(library)),
    installRemoteScript: vi.fn(() => OK),
    installDevice: vi.fn(() => OK),
    installPluginHost: vi.fn(() => []),
    ...overrides,
  };
}

describe("installProducerPalReply", () => {
  it("runs both installs against the library it finds", async () => {
    const used = steps();

    expect(await installProducerPalReply(undefined, used)).toStrictEqual({
      ran: true,
      remoteScript: OK,
      device: OK,
    });
    expect(used.installRemoteScript).toHaveBeenCalledWith(library);
    expect(used.installDevice).toHaveBeenCalledWith(library);
    expect(used.installPluginHost).toHaveBeenCalledWith(library);
  });

  it("carries the wrappers' parts, and leaves the field out when there are none", async () => {
    const parts = [
      { name: "A", status: "installed" as const, path: "/a" },
      { name: "B", ok: false as const, path: "/b", detail: "No." },
    ];

    expect(
      await installProducerPalReply(
        library,
        steps({ installPluginHost: () => parts }),
      ),
    ).toStrictEqual({
      ran: true,
      remoteScript: OK,
      device: OK,
      pluginHost: parts,
    });
    expect(await installProducerPalReply(library, steps())).not.toHaveProperty(
      "pluginHost",
    );
  });

  it("runs the device install even when the script's failed, and the reverse", async () => {
    const failed: InstallPart = { ok: false, detail: "x" };

    expect(
      await installProducerPalReply(
        library,
        steps({ installRemoteScript: () => failed }),
      ),
    ).toStrictEqual({ ran: true, remoteScript: failed, device: OK });
    expect(
      await installProducerPalReply(
        library,
        steps({ installDevice: () => failed }),
      ),
    ).toStrictEqual({ ran: true, remoteScript: OK, device: failed });
  });

  it("tries neither when a lookup throws something that isn't a bad folder", async () => {
    const used = steps({
      findUserLibrary: () => Promise.reject(new Error("disk gone")),
    });

    expect(await installProducerPalReply("  ", used)).toStrictEqual({
      ran: false,
      error: `couldn't look up Live's User Library (disk gone), so nothing was installed. ${ASK_FOR_LIBRARY}`,
    });
    expect(used.installRemoteScript).not.toHaveBeenCalled();
    expect(used.installDevice).not.toHaveBeenCalled();
    expect(used.installPluginHost).not.toHaveBeenCalled();
  });
});
