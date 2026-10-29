// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What the E2E suites that need the Producer Pal remote script share.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { presetFileIsFor } from "#src/mcp-server/rpc/remote-script/browser/preset-file-device.ts";
import { resolveRemoteScriptPort } from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import { beforeAll } from "vitest";
import {
  callToolAndSettle,
  parseToolResult,
  sleep,
} from "../../mcp-test-helpers";
import {
  LIBRARY_NEEDS,
  remoteScriptAnswers,
  skipTestBeforeLive,
} from "../../workflow/helpers/server-capability-test-helpers";

/** Whether the suites that need the remote script run at all. */
export const REMOTE_SCRIPT_E2E = process.env.E2E_REMOTE_SCRIPT === "true";

/**
 * Long enough for the end-undo-step request, which a write call doesn't wait
 * for, to reach Live.
 */
export const END_LANDS_MS = 300;

/**
 * One ppal-create-track call that appends `count` tracks, then a wait for its
 * undo step to close.
 * @param client - Connected MCP client
 * @param count - How many tracks the one call makes
 */
export async function appendTracksInOneCall(
  client: Client,
  count: number,
): Promise<void> {
  await client.callTool({
    name: "ppal-create-track",
    arguments: { path: Array(count).fill("t+").join(",") },
  });
  await sleep(END_LANDS_MS);
}

/**
 * Fail the suite, rather than skip it, when E2E_REMOTE_SCRIPT is set but the
 * remote script isn't answering. Call it ahead of setupMcpTestContext, so it
 * fails before any Live Set opens.
 */
export function requireRemoteScript(): void {
  beforeAll(async () => {
    if (!(await remoteScriptAnswers())) {
      throw new Error(
        `E2E_REMOTE_SCRIPT=true, but the Producer Pal remote script isn't running: nothing answered GET /ping on 127.0.0.1:${String(await resolveRemoteScriptPort())}. Install it and select it as a control surface (see remote-script/README.md).`,
      );
    }
  });
}

/** A preset as the remote script lists it. */
export interface Preset {
  name: string;
  /** Its path under its browser section */
  path: string;
}

/**
 * A device's presets, straight from the remote script, so a test picks one this
 * machine's Live has instead of naming one another edition may lack.
 * @param type - The remote script `type` of the device's section
 * @param device - The device's browser name
 * @returns Each preset's name and path under the section
 */
export async function listPresets(
  type: string,
  device: string,
): Promise<Preset[]> {
  const query = new URLSearchParams({ type, path: device, presets: "true" });
  const response = await fetch(
    `http://127.0.0.1:${String(await resolveRemoteScriptPort())}/list?${query.toString()}`,
  );
  const body = (await response.json()) as { items?: Preset[] };

  return body.items ?? [];
}

/**
 * The first preset of one file type.
 * @param presets - A device's presets
 * @param suffix - ".adv" or ".adg"
 * @returns The preset
 * @throws Error when the device has none, so the test fails rather than passes
 */
export function presetEndingIn(presets: Preset[], suffix: string): Preset {
  const preset = presets.find(({ name }) => name.endsWith(suffix));

  if (preset == null) {
    throw new Error(`no ${suffix} preset in this Live`);
  }

  return preset;
}

/**
 * A preset's name as the tools take it: without its file suffix.
 * @param name - The browser's name for it
 * @returns The name
 */
export function presetName(name: string): string {
  return name.replace(/\.(?:adv|adg)$/, "");
}

/** What `ppal-read-device` returns for a device, as far as the tests look. */
export interface DeviceRead {
  id: string;
  type: string;
  name?: string;
}

/**
 * Read a device.
 * @param client - Connected MCP client
 * @param path - The device's path
 * @returns Its id, type and name
 */
export async function readDevice(
  client: Client,
  path: string,
): Promise<DeviceRead> {
  return parseToolResult<DeviceRead>(
    await callToolAndSettle(client, "ppal-read-device", { path }),
  );
}

/**
 * A pack's drum kit whose name nothing else in the library shares, found with
 * ppal-library. Installed packs differ per machine, so a test picks one at run
 * time and skips when there is none. Live's browser files these under Drums,
 * not under any device, so only the library has them. Some kits are an
 * Instrument Rack holding a Drum Rack, so only a kit that is a Drum Rack counts.
 * @param client - Connected MCP client
 * @param skip - The test's `skip`, called when no pack has such a kit or Live
 *   has no library
 * @returns The kit's file name and absolute path
 */
export async function packDrumKitOrSkip(
  client: Client,
  skip: (note?: string) => never,
): Promise<Preset> {
  await skipTestBeforeLive(client, skip, "12.4", LIBRARY_NEEDS);

  const search = async (kind: string, query: string): Promise<Preset[]> =>
    parseToolResult<{ items?: Preset[] }>(
      await callToolAndSettle(client, "ppal-library", {
        kind,
        query,
        source: "pack",
        limit: 200,
      }),
    ).items ?? [];

  const kits = (await search("device-group", "Kit")).filter(
    ({ name, path }) => name.endsWith(".adg") && path.includes("/Drums/"),
  );

  for (const kit of kits) {
    if (!(await presetFileIsFor(kit.path, "Drum Rack"))) {
      continue;
    }

    const name = presetName(kit.name).toLowerCase();
    const same = [
      ...(await search("device-group", presetName(kit.name))),
      ...(await search("preset", presetName(kit.name))),
    ].filter((item) => presetName(item.name).toLowerCase() === name);

    if (same.length === 1) {
      return kit;
    }
  }

  return skip();
}

/**
 * The Wasted Space pack's `Transmission.adv`, a Max device preset sharing its
 * name with a Shifter preset that Live's browser lists. Not every machine has
 * the pack, so a test skips when it's missing.
 * @param client - Connected MCP client
 * @param skip - The test's `skip`, called when the pack or the library is
 *   missing
 * @returns The preset's absolute path
 */
export async function wastedSpaceTransmissionOrSkip(
  client: Client,
  skip: (note?: string) => never,
): Promise<string> {
  await skipTestBeforeLive(client, skip, "12.4", LIBRARY_NEEDS);

  const found = parseToolResult<{ items?: Preset[] }>(
    await callToolAndSettle(client, "ppal-library", {
      kind: "preset",
      query: "Transmission",
      source: "pack",
      limit: 200,
    }),
  ).items;
  const file = found?.find(
    ({ name, path }) =>
      name === "Transmission.adv" && path.includes("Wasted Space"),
  );

  return file?.path ?? skip("the Wasted Space pack isn't installed");
}

// Puts the rack preset holding Producer Pal where Live can load it. Live only
// loads presets from the User Library or a Places folder, and the committed
// file points at User Library copies of the device and sample that no other
// machine has. So the staged copy points at the repo's files instead, by paths
// relative to the copy, with Live's size and checksum checks off, as the test
// Sets do.
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const PRESET = join(
  REPO,
  "e2e/live-sets/presets/ppal-drum-pad-test-rack-preset.adg",
);
const PRESET_FILES = [
  join(REPO, "max-for-live-device/Producer_Pal.amxd"),
  join(REPO, "e2e/live-sets/samples/drums/synth-snare.wav"),
];
/** Our own folder in the User Library, removed whole afterwards. */
const STAGING_FOLDER = "Producer Pal e2e";

/** A staged copy of the preset. */
export interface StagedPreset {
  /** Its absolute path, which a tool's `preset` takes */
  path: string;
  /** Delete the copy and its folder */
  remove: () => void;
}

/**
 * Write the preset into the User Library, pointed at the repo's device and sample.
 * @returns Where it is, and how to remove it
 */
export async function stagePpalPreset(): Promise<StagedPreset> {
  const folder = join(await userLibrary(), STAGING_FOLDER);
  const path = join(folder, basename(PRESET));
  const staged = PRESET_FILES.reduce(
    (xml, file) => pointFileRef(xml, file, folder),
    gunzipSync(readFileSync(PRESET)).toString("utf8"),
  );

  mkdirSync(folder, { recursive: true });
  writeFileSync(path, gzipSync(staged));

  return {
    path,
    remove: () => rmSync(folder, { recursive: true, force: true }),
  };
}

/** The User Library the running Live uses, as the remote script reports it. */
async function userLibrary(): Promise<string> {
  const port = await resolveRemoteScriptPort();
  const ping = (await (
    await fetch(`http://127.0.0.1:${String(port)}/ping`)
  ).json()) as { user_library?: string };

  if (ping.user_library == null) {
    throw new Error("the remote script reported no User Library");
  }

  return ping.user_library;
}

/**
 * Point the FileRef for a file's name at that file, relative to `folder`.
 * @param xml - The preset's XML
 * @param file - Absolute path of the repo's copy
 * @param folder - Where the staged preset goes
 * @returns The XML with that FileRef replaced
 */
function pointFileRef(xml: string, file: string, folder: string): string {
  const name = basename(file).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // From RelativePathType through OriginalCrc
  const fileRef = new RegExp(
    `<RelativePathType Value="\\d+" />(\\s*)<RelativePath Value="[^"]*${name}" />(\\s*)<Path Value="[^"]*${name}" />([\\s\\S]*?)<OriginalFileSize Value="\\d+" />(\\s*)<OriginalCrc Value="\\d+" />`,
  );

  if (!fileRef.test(xml)) {
    throw new Error(`${PRESET} has no ${basename(file)} file reference`);
  }

  return xml.replace(
    fileRef,
    (_match, a: string, b: string, middle: string, c: string) =>
      `<RelativePathType Value="1" />${a}` +
      `<RelativePath Value="${relative(folder, file)}" />${b}` +
      `<Path Value="${file}" />${middle}` +
      `<OriginalFileSize Value="0" />${c}<OriginalCrc Value="0" />`,
  );
}
