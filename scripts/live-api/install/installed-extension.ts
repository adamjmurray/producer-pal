// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { randomUUID } from "node:crypto";
import { cpSync, existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { errorMessage } from "#src/shared/error-message.ts";

/** The part of Claude Desktop's extensions-installations.json this reads. */
export interface Installations {
  extensions?: Record<
    string,
    { version?: string; manifest?: { name?: string } } | undefined
  >;
}

/**
 * Find an installed extension by manifest name (the id is derived from the
 * author and name, so it can't be built from the name alone).
 *
 * @param installations - Claude Desktop's installation record
 * @param name - The extension's manifest name
 * @returns The id it's installed under, if any
 */
export function findInstalledExtensionId(
  installations: Installations,
  name: string,
): string | undefined {
  const extensions = installations.extensions ?? {};

  return Object.keys(extensions).find(
    (key) => extensions[key]?.manifest?.name === name,
  );
}

/**
 * Where an installed extension's files are. The id comes from a JSON file and
 * the folder gets deleted, so it must name a folder directly under
 * `Claude Extensions`.
 *
 * @param claudeDir - Claude Desktop's data folder
 * @param id - A key from extensions-installations.json
 * @returns The extension's folder
 */
export function installedExtensionDir(claudeDir: string, id: string): string {
  const base = resolve(claudeDir, "Claude Extensions");
  const dir = resolve(base, id);

  if (dirname(dir) !== base) {
    throw new Error(
      `Refusing extension id "${id}": it isn't a folder directly under ${base}`,
    );
  }

  return dir;
}

/**
 * Replace a folder with a copy of another: copy next to it, move the old one
 * aside, move the copy in. The folder is missing only between the two moves
 * (a kill there leaves the old one at `<target>.old-*`). If any step fails,
 * including `onReplaced`, the old folder is put back. If that fails too, the
 * thrown error gives both reasons and says where the old folder is.
 *
 * @param target - The folder to replace
 * @param source - The folder to copy in
 * @param onReplaced - Runs once the new folder is in place
 * @returns The path of the old folder when it couldn't be removed afterwards
 */
export function replaceFolder(
  target: string,
  source: string,
  onReplaced: () => void,
): string | undefined {
  const temp = `${target}.tmp-${randomUUID()}`;
  const backup = `${target}.old-${randomUUID()}`;
  let movedAside = false;
  let movedIn = false;

  try {
    cpSync(source, temp, { recursive: true });

    if (existsSync(target)) {
      renameSync(target, backup);
      movedAside = true;
    }

    renameSync(temp, target);
    movedIn = true;
    onReplaced();
  } catch (error) {
    removeQuietly(temp);

    try {
      if (movedIn) {
        rmSync(target, { recursive: true, force: true });
      }

      if (movedAside) {
        renameSync(backup, target);
      }
    } catch (restoreError) {
      throw new Error(
        `${errorMessage(error)} (and the old copy couldn't be put back: ` +
          `${errorMessage(restoreError)}; it is at ${backup})`,
        { cause: restoreError },
      );
    }

    throw error;
  }

  try {
    rmSync(backup, { recursive: true, force: true });
  } catch {
    return backup;
  }

  return undefined;
}

/**
 * Write a JSON file so a failed write can't leave it cut short: write beside
 * it, then rename over it.
 *
 * @param file - The file to write
 * @param data - What to store as JSON
 */
export function writeJsonViaTemp(file: string, data: unknown): void {
  const temp = `${file}.tmp-${randomUUID()}`;

  try {
    writeFileSync(temp, JSON.stringify(data, null, 2));
    renameSync(temp, file);
  } catch (error) {
    removeQuietly(temp);
    throw error;
  }
}

/**
 * @param path - A file or folder to delete, if it can be
 */
function removeQuietly(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {
    // A leftover temp is harmless.
  }
}
