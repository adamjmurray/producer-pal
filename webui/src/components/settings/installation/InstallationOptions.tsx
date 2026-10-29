// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { useGlobalSettings } from "#webui/hooks/connection/use-global-settings";
import { FINISH_INSTALLATION_DOCS_URL } from "#webui/lib/config";
import { linkClass } from "./helpers/installation-classes";

/**
 * The machine-wide notices the Max for Live device can show: the unfinished
 * installation and a new release. They apply on change, not on Save, because
 * the device reads them too.
 * @returns {JSX.Element} The notice checkboxes
 */
export function InstallationOptions() {
  const settings = useGlobalSettings();

  return (
    <div
      role="group"
      aria-label="Notices"
      className="flex flex-col gap-1.5 border-t border-zinc-300 pt-3 dark:border-zinc-600"
      data-testid="installation-options"
    >
      <h4 className="text-[13px] font-semibold">Options</h4>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          data-testid="warn-install-incomplete"
          checked={settings.warnIfInstallIncomplete}
          onChange={(e) =>
            settings.setWarnIfInstallIncomplete(
              (e.target as HTMLInputElement).checked,
            )
          }
        />
        <span>
          Warn when installation is incomplete{" "}
          <a
            href={FINISH_INSTALLATION_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            Learn more
          </a>
        </span>
      </label>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          data-testid="auto-update-check"
          checked={settings.autoUpdateCheck}
          onChange={(e) =>
            settings.setAutoUpdateCheck((e.target as HTMLInputElement).checked)
          }
        />
        Automatically check for new versions
      </label>
    </div>
  );
}
