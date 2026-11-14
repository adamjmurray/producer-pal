// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/** What the chat UI needs to offer an install, an update, or nothing. */
export interface RemoteScriptStatus {
  /** Live's User Library, or null when we couldn't work it out. */
  userLibrary: string | null;
  installed: boolean;
  installedVersion: string | null;
  /** The installed files' build ID, or null when not installed. */
  installedBuild: string | null;
  /** The version this build of Producer Pal ships. */
  bundledVersion: string;
  /** Whether Live currently has the script loaded as a control surface. */
  running: boolean;
  runningVersion: string | null;
  /** The build ID Live loaded, or null when not running or too old to say. */
  runningBuild: string | null;
  liveVersion: string | null;
  /** The port another program answered on, when it isn't our script. */
  otherOnPort: number | null;
  /**
   * Installed is older than this build, a different build of the same version,
   * or unreadable: offer an Update.
   */
  updateAvailable: boolean;
  /** Installed is newer than this build: installing would downgrade it. */
  installedNewer: boolean;
}
