// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * How the installed device compares with the bundled one.
 * - `not-installed`: nothing at the device path.
 * - `same`: identical bytes.
 * - `installed-older` / `installed-newer`: both name a version, installed is
 *   older / newer.
 * - `different`: the bytes differ and the versions can't order them: one or
 *   both name no version, both name the same one, or their tags can't be
 *   ordered (`-beta` vs `-rc1`).
 */
export type DeviceState =
  | "not-installed"
  | "same"
  | "installed-older"
  | "installed-newer"
  | "different";

/**
 * Why the running device can't be copied into the User Library.
 * - `unknown-source`: the device hasn't said where its file is.
 * - `unreadable-source`: the file it named can't be read.
 * - `not-frozen`: a development device, which needs the files beside it.
 * - `no-user-library`: no User Library found, and none given.
 */
export type DeviceInstallProblem =
  | "unknown-source"
  | "unreadable-source"
  | "not-frozen"
  | "no-user-library";

/** What the chat UI and the device notice need to offer an install. */
export interface DeviceInstallStatus {
  /** The running device's file, or null before it has said where it is */
  source: string | null;
  /** Why it can't be installed, or null when it can */
  problem: DeviceInstallProblem | null;
  /** The User Library asked about: the one given, else the one found */
  userLibrary: string | null;
  /** Where the device is installed, or would be */
  path: string | null;
  /** Whether the running device is that User Library file itself */
  inUserLibrary: boolean;
  /** The installed copy compared with the running device; null with a problem */
  state: DeviceState | null;
  /** This device's version */
  version: string;
  /** Version of the installed copy, when it names one */
  installedVersion: string | null;
  /** Other Producer_Pal .amxd files in the User Library, never touched */
  otherCopies: string[];
}
