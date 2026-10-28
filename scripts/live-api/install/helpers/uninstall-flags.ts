// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { parseArgs } from "node:util";
import { errorMessage } from "#src/shared/error-message.ts";
import { type UninstallOptions } from "./uninstall-from-library.ts";

export const UNINSTALL_USAGE =
  "Usage: uninstall.ts [--device [--other-copies]] [--remote-script]";

/**
 * Read the uninstall script's flags.
 *
 * @param args - Command-line arguments after the script name
 * @returns What to uninstall
 * @throws {Error} On an unknown flag, no target, or `--other-copies` without `--device`
 */
export function parseUninstallFlags(args: string[]): UninstallOptions {
  let values;

  try {
    ({ values } = parseArgs({
      args,
      options: {
        device: { type: "boolean" },
        "remote-script": { type: "boolean" },
        "other-copies": { type: "boolean" },
      },
      strict: true,
    }));
  } catch (error) {
    throw new Error(`${errorMessage(error)}\n${UNINSTALL_USAGE}`, {
      cause: error,
    });
  }

  const options = {
    device: values.device === true,
    remoteScript: values["remote-script"] === true,
    otherCopies: values["other-copies"] === true,
  };

  if (options.otherCopies && !options.device) {
    throw new Error(`--other-copies needs --device.\n${UNINSTALL_USAGE}`);
  }

  if (!options.device && !options.remoteScript) {
    throw new Error(`Say what to uninstall.\n${UNINSTALL_USAGE}`);
  }

  return options;
}
