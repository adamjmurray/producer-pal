#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Put the local extension build (claude-desktop-extension/Producer_Pal.mcpb,
 * made by `npm run build`) into Claude Desktop.
 *
 * Usage: npm run install:mcpb
 *
 * If it's installed, replaces the installed files and the manifest copy in
 * extensions-installations.json, since Claude Desktop won't reinstall the same
 * version. Otherwise opens the .mcpb in Claude Desktop to install it. Either
 * way, restart Claude Desktop (or toggle the extension) to load it.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { unpackExtension } from "@anthropic-ai/mcpb";
import {
  type Installations,
  findInstalledExtensionId,
  installedExtensionDir,
  replaceFolder,
  writeJsonViaTemp,
} from "./installed-extension.ts";
import { runInstallReport } from "./run-install-report.ts";

const rootDir = join(import.meta.dirname, "../../..");
const mcpbFile = join(rootDir, "claude-desktop-extension/Producer_Pal.mcpb");

await runInstallReport(installMcpb);

/**
 * @returns What happened, or throws with why it couldn't
 */
async function installMcpb(): Promise<{ lines: string[]; ok: boolean }> {
  if (!existsSync(mcpbFile)) {
    throw new Error(`${mcpbFile} not found. Run \`npm run build\` first.`);
  }

  const claudeDir = claudeDataDir();
  const installationsFile = join(claudeDir, "extensions-installations.json");
  const installations = existsSync(installationsFile)
    ? (JSON.parse(readFileSync(installationsFile, "utf8")) as Installations)
    : {};
  const extensions = (installations.extensions ??= {});
  const unpackDir = mkdtempSync(join(tmpdir(), "producer-pal-mcpb-"));

  try {
    // Unpacked in-process: spawning npx on Windows needs a shell, which
    // doesn't quote a path with a space in it.
    if (
      !(await unpackExtension({ mcpbPath: mcpbFile, outputDir: unpackDir }))
    ) {
      throw new Error(`Couldn't unpack ${mcpbFile}.`);
    }

    const manifest = JSON.parse(
      readFileSync(join(unpackDir, "manifest.json"), "utf8"),
    ) as { name: string; version: string };

    // Found by name, not id: the id is derived from the author and name.
    const id = findInstalledExtensionId(installations, manifest.name);

    if (id == null) {
      openInClaudeDesktop();

      return {
        lines: [
          `Opened ${mcpbFile} in Claude Desktop. Confirm the install there.`,
        ],
        ok: true,
      };
    }

    const installedDir = installedExtensionDir(claudeDir, id);
    const entry = extensions[id] ?? {};
    const previousVersion = entry.version;

    extensions[id] = {
      ...entry,
      version: manifest.version,
      manifest,
    };
    const leftover = replaceFolder(installedDir, unpackDir, () => {
      writeJsonViaTemp(installationsFile, installations);
    });

    return {
      lines: [
        `Replaced ${installedDir}`,
        `Version: ${previousVersion ?? "unknown"} -> ${manifest.version}`,
        ...(leftover == null
          ? []
          : [`Couldn't delete the old copy; delete it yourself: ${leftover}`]),
        "Restart Claude Desktop, or turn the extension off and on, to load it.",
      ],
      ok: true,
    };
  } finally {
    rmSync(unpackDir, { recursive: true, force: true });
  }
}

/** @returns Claude Desktop's data folder, or throws where it doesn't run */
function claudeDataDir(): string {
  if (process.platform === "darwin") {
    return join(homedir(), "Library/Application Support/Claude");
  }

  if (process.platform === "win32") {
    return join(
      process.env.APPDATA ?? join(homedir(), "AppData/Roaming"),
      "Claude",
    );
  }

  throw new Error(`Claude Desktop doesn't run on ${process.platform}.`);
}

/** Hand the .mcpb to Claude Desktop, which asks to confirm the install. */
function openInClaudeDesktop(): void {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", ["-a", "Claude", mcpbFile]]
      : ["cmd", ["/c", "start", "", mcpbFile]];

  if (spawnSync(cmd, args, { stdio: "inherit" }).status !== 0) {
    throw new Error("Couldn't open it in Claude Desktop. Is it installed?");
  }
}
