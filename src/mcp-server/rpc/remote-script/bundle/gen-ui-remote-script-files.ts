// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The remote script files that exist only for the experimental generative UI.
// A release build leaves them out (the device bundle, the dev installer and the
// remote-script version check all read this list). Import-free, because
// config/*.mjs imports it too.

/**
 * Files in remote-script/Producer_Pal that only a gen-UI build ships.
 * gen_ui_routes.py is the only module that imports the other two
 * (remote-script/tests/test_gen_ui_optional.py enforces that).
 */
export const GEN_UI_REMOTE_SCRIPT_FILES: readonly string[] = [
  "gen_ui_routes.py",
  "ui_widgets.py",
  "watches.py",
];

/**
 * Drop the gen-UI files from a script's files unless this is a gen-UI build.
 *
 * @param files - Path relative to the script folder, to contents
 * @param genUiEnabled - Whether the build has `ENABLE_GEN_UI=true`
 * @returns The files that build ships
 */
export function shippedScriptFiles<T>(
  files: Record<string, T>,
  genUiEnabled: boolean,
): Record<string, T> {
  if (genUiEnabled) {
    return files;
  }

  return Object.fromEntries(
    Object.entries(files).filter(([name]) => !isGenUiScriptFile(name)),
  );
}

/**
 * @param path - A file path, relative to the script folder or to the repo
 * @returns Whether it is one of the gen-UI files
 */
export function isGenUiScriptFile(path: string): boolean {
  return GEN_UI_REMOTE_SCRIPT_FILES.some(
    (name) => path === name || path.endsWith(`/${name}`),
  );
}
