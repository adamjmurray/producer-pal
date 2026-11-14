// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { useGlobalSettings } from "#webui/hooks/connection/use-global-settings";
import { useNetworkAccess } from "#webui/hooks/settings/installation/use-network-access";
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

/**
 * "Remote Control": the same switch as on the Max for Live device. Applies on
 * change, like the device, and shows what the server says.
 * @returns {JSX.Element} The checkbox, its warning, and the server's message
 */
export function NetworkAccessOption() {
  const network = useNetworkAccess();
  // Turning it on is only possible from the computer running Live.
  const blocked = network.allowNetwork === false && !network.onThisComputer;

  // Turning it off from another phone or computer cuts it off.
  const leaving = network.allowNetwork === true && !network.onThisComputer;

  return (
    <div
      className="flex flex-col gap-1.5 border-t border-zinc-300 pt-3 dark:border-zinc-600"
      data-testid="network-access-option"
    >
      <h4 className="text-[13px] font-semibold">Remote Control</h4>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          data-testid="allow-network"
          aria-describedby={[
            "allow-network-warning",
            network.loadFailed && "allow-network-unavailable",
            blocked && "allow-network-blocked",
            leaving && "allow-network-leaving",
          ]
            .filter(Boolean)
            .join(" ")}
          checked={network.allowNetwork === true}
          disabled={network.allowNetwork == null || network.busy || blocked}
          onChange={(e) => {
            const input = e.target as HTMLInputElement;

            network.setAllowNetwork(input.checked);
            // Show only what the server reports: put the old value back now,
            // and the reported one replaces it. Without this a cancelled or
            // refused change would leave the box flipped.
            input.checked = network.allowNetwork === true;
          }}
        />
        Allow other computers to connect
      </label>
      <p
        id="allow-network-warning"
        className="text-xs text-zinc-600 dark:text-zinc-400"
      >
        Lets a phone or another computer on your network connect.{" "}
        <span className="text-amber-700 dark:text-amber-300">
          Warning: anyone on that network can control Live, and there&apos;s no
          password, so only use it on a network you trust.
        </span>
      </p>
      {network.loadFailed && (
        <p
          id="allow-network-unavailable"
          className="text-xs"
          data-testid="allow-network-unavailable"
        >
          Couldn&apos;t read this setting from the server. Switch to another tab
          and back to try again.
        </p>
      )}
      {blocked && (
        <p
          id="allow-network-blocked"
          className="text-xs"
          data-testid="allow-network-blocked"
        >
          It can only be turned on from the computer running Live.
        </p>
      )}
      {leaving && (
        <p
          id="allow-network-leaving"
          className="text-xs"
          data-testid="allow-network-leaving"
        >
          Turning it off will disconnect you.
        </p>
      )}
      {/* Always rendered, so a screen reader announces the text put into it. */}
      <p
        className="text-xs empty:hidden"
        role="status"
        data-testid="allow-network-message"
      >
        {network.message}
      </p>
    </div>
  );
}
