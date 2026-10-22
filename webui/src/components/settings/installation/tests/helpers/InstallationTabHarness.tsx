// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { InstallationTab } from "#webui/components/settings/installation/InstallationTab";
import { useInstallation } from "#webui/hooks/settings/installation/use-installation";

/**
 * Stands in for the settings screen, which owns the installation state the
 * tab is given.
 * @returns {JSX.Element} The Installation tab with its state
 */
export function InstallationTabHarness() {
  return <InstallationTab installation={useInstallation(true)} />;
}
