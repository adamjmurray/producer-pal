// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type DeviceInstallStatus } from "#webui/hooks/settings/installation/use-device-install";
import { versionText } from "#src/shared/version-check";

/** How the line is coloured: green is done, amber needs action. */
export type StatusTone = "good" | "warn" | "plain";

export interface DeviceStatusLine {
  text: string;
  tone: StatusTone;
}

/**
 * The one line saying whether this device is in the User Library.
 * @param status - The server's device-install status
 * @returns The line's text and tone
 */
export function deviceStatusLine(
  status: DeviceInstallStatus,
): DeviceStatusLine {
  switch (status.problem) {
    case "not-frozen":
      return plain("Development build: freeze it to copy.");
    case "unknown-source":
      return plain(
        "This device hasn't said where its file is yet. Try Refresh in a moment.",
      );
    case "unreadable-source":
      return plain("This device's file can't be read.");
    case "no-user-library":
      return plain("Enter your User Library above to check for a copy.");
    default:
      return copyLine(status);
  }
}

/**
 * @param text - The line's text
 * @returns An uncoloured line
 */
function plain(text: string): DeviceStatusLine {
  return { text, tone: "plain" };
}

/**
 * @param status - A status with no problem
 * @returns How the User Library copy compares with this device
 */
function copyLine(status: DeviceInstallStatus): DeviceStatusLine {
  const copy = versionText(status.installedVersion);
  const device = versionText(status.version);
  const theCopy = `The copy in your User Library (${copy})`;

  switch (status.state) {
    case "not-installed":
      return { text: "Not in your User Library", tone: "warn" };
    case "same":
      return { text: `In your User Library (${copy})`, tone: "good" };
    case "installed-older":
      return {
        text: `Update available: ${copy} → ${device}`,
        tone: "warn",
      };
    case "installed-newer":
      return plain(`${theCopy} is newer than this device (${device})`);
    default:
      return {
        text: `${theCopy} differs from this device (${device})`,
        tone: "warn",
      };
  }
}
