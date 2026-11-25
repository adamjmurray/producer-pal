// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Protects the developer's real ~/.producer-pal/context.md from e2e tests that
 * overwrite it. A test's own `finally` can't help after a hard abort (Ctrl-C,
 * a timeout kill), so the original is also copied to a file beside it. The next
 * run restores a leftover copy before touching anything.
 *
 * Importing the server's path code isn't possible here (it needs `max-api`), so
 * the path is resolved the same way by hand. The device runs on this machine
 * but in its own process, so a PRODUCER_PAL_CONFIG_DIR override only counts if
 * it is also set for the test run; {@link backupGlobalContext} checks that both
 * sides see the same file.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { REST_BASE_URL } from "#evals/shared/config.ts";

const BACKUP_SUFFIX = ".e2e-backup";

/**
 * Where the device keeps the global context (see config-markdown-store.ts).
 *
 * @returns Absolute path to context.md
 */
function contextPath(): string {
  return join(
    process.env.PRODUCER_PAL_CONFIG_DIR ?? join(homedir(), ".producer-pal"),
    "context.md",
  );
}

/**
 * Read a file, or "" when it doesn't exist.
 *
 * @param path - Absolute path
 * @returns File contents, or "" when absent
 */
function readOrEmpty(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

/**
 * Write through a temp file and a rename, so an abort can't leave half a file.
 *
 * @param path - Absolute path
 * @param content - Full file contents
 */
function writeAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });

  const temp = `${path}.e2e-tmp-${process.pid}`;

  writeFileSync(temp, content);
  renameSync(temp, path);
}

/**
 * Put the saved global context back and delete the saved copy. Does nothing
 * when there is no saved copy. The copy is deleted only after the write works.
 */
export function restoreGlobalContext(): void {
  const path = contextPath();
  const backup = path + BACKUP_SUFFIX;

  if (!existsSync(backup)) {
    return;
  }

  writeAtomic(path, readFileSync(backup, "utf8"));
  unlinkSync(backup);
}

/**
 * Save the real global context beside itself before a test overwrites it. A
 * saved copy left by a killed run is restored first, with a console notice.
 * Pair with {@link restoreGlobalContext} in `afterAll`.
 *
 * @throws When the device serves a different file than this process resolves,
 * so the copy would protect the wrong file
 */
export async function backupGlobalContext(): Promise<void> {
  const path = contextPath();
  const backup = path + BACKUP_SUFFIX;

  if (existsSync(backup)) {
    console.warn(
      `e2e: a previous run was killed before restoring ${path}; restoring it from ${backup} first.`,
    );
    restoreGlobalContext();
  }

  const current = readOrEmpty(path);
  const served = (await (
    await fetch(`${REST_BASE_URL}/global-context`)
  ).json()) as {
    content?: string;
  };

  if ((served.content ?? "") !== current) {
    throw new Error(
      `The device's global context differs from ${path}. Set PRODUCER_PAL_CONFIG_DIR for the test run if the device uses another config dir.`,
    );
  }

  writeAtomic(backup, current);
}
