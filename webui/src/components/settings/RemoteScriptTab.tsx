// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "preact/hooks";
import {
  type RemoteScriptStatus,
  useRemoteScript,
} from "#webui/hooks/settings/use-remote-script";
import { REMOTE_SCRIPT_DOCS_URL } from "#webui/lib/config";

const buttonClass =
  "rounded-lg border border-zinc-300 bg-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-300 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-600 dark:hover:bg-zinc-700";

const inputClass =
  "w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700";

const noteClass = "text-xs text-zinc-500 dark:text-zinc-300";

/**
 * Remote Script tab: installs the Producer Pal control surface into Live's
 * User Library and shows whether Live is running it.
 * @returns {JSX.Element} Remote Script tab component
 */
export function RemoteScriptTab() {
  const remote = useRemoteScript();
  const { status } = remote;

  if (status == null) {
    return (
      <div className="space-y-2 text-sm" data-testid="remote-script-tab">
        {remote.loading ? (
          <p data-testid="remote-script-loading">Checking…</p>
        ) : (
          <>
            <LoadError
              message={
                remote.loadError ?? "Could not read the remote script status."
              }
            />
            <RefreshButton onRefresh={remote.refresh} />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm" data-testid="remote-script-tab">
      <p className={noteClass}>
        The remote script lets Producer Pal load Live devices and plugins by
        name.{" "}
        <a
          href={REMOTE_SCRIPT_DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn more
        </a>
      </p>

      <p data-testid="remote-script-status">{summarize(status)}</p>

      {/* Keyed on the detected path: a Refresh that finally finds the User
          Library has to reach the field, which holds its own edits. */}
      <InstallForm
        key={status.userLibrary ?? ""}
        status={status}
        remote={remote}
      />

      {status.installed && (
        <EnableSteps
          open={
            !status.running || status.installedVersion !== status.runningVersion
          }
          restartFor={restartVersion(status)}
        />
      )}

      {/* A failed Refresh keeps the last status on screen. */}
      {remote.loadError != null && <LoadError message={remote.loadError} />}
      <RefreshButton onRefresh={remote.refresh} />
    </div>
  );
}

// --- Helpers below main export ---

/**
 * One-line summary of what is installed and whether Live is running it.
 * @param status - The server's remote-script status
 * @returns The summary text
 */
function summarize(status: RemoteScriptStatus): string {
  if (!status.installed) {
    // Live can be running a copy from a second User Library, or one installed
    // by hand. Saying only "Not installed" would contradict what Live shows.
    return status.running
      ? `Not installed here, but Live${liveSuffix(status)} is running ${versionText(status.runningVersion)} from another location`
      : "Not installed";
  }

  const running = runningText(status);

  if (status.updateAvailable) {
    return `Update available: installed ${versionText(status.installedVersion)}, this build has v${status.bundledVersion} (${running})`;
  }

  if (status.installedNewer) {
    return `Installed ${versionText(status.installedVersion)} is newer than this device's v${status.bundledVersion} (${running})`;
  }

  return `Installed ${versionText(status.installedVersion)} (${running})`;
}

/**
 * Whether Live has the script loaded, which version, and which Live.
 * @param status - The server's remote-script status
 * @returns The running clause of the summary
 */
function runningText(status: RemoteScriptStatus): string {
  if (!status.running) {
    return "not running";
  }

  const live =
    status.liveVersion == null ? "" : ` in Live ${status.liveVersion}`;

  return `running ${versionText(status.runningVersion)}${live}`;
}

/**
 * @param version - A version the server reported, or null
 * @returns The version to show, never "vnull"
 */
function versionText(version: string | null): string {
  return version == null ? "an unknown version" : `v${version}`;
}

/**
 * @param status - The server's remote-script status
 * @returns Live's version as a suffix, or "" when it didn't say
 */
function liveSuffix(status: RemoteScriptStatus): string {
  return status.liveVersion == null ? "" : ` ${status.liveVersion}`;
}

/**
 * The version Live would pick up on a restart: an install or update landed
 * while Live is still running an older copy.
 * @param status - The server's remote-script status
 * @returns The installed version, or null when Live is already running it
 */
function restartVersion(status: RemoteScriptStatus): string | null {
  return status.running && status.installedVersion !== status.runningVersion
    ? status.installedVersion
    : null;
}

interface InstallFormProps {
  status: RemoteScriptStatus;
  remote: ReturnType<typeof useRemoteScript>;
}

/**
 * User Library path field plus the Install / Update button. The path is always
 * editable — the server's guess can be wrong, and it has none at all when Live
 * has never written its preferences.
 * @param {InstallFormProps} props - Component props
 * @param {RemoteScriptStatus} props.status - The server's remote-script status
 * @param {object} props.remote - The useRemoteScript state and actions
 * @returns {JSX.Element} The install form
 */
function InstallForm({ status, remote }: InstallFormProps) {
  const detected = status.userLibrary;
  const [path, setPath] = useState(detected ?? "");

  return (
    <div className="space-y-2">
      <label htmlFor="remote-script-path" className="block">
        {detected == null
          ? "Where is your User Library?"
          : "Is this your User Library?"}
      </label>
      <input
        id="remote-script-path"
        data-testid="remote-script-path"
        type="text"
        value={path}
        onInput={(e) => setPath((e.target as HTMLInputElement).value)}
        className={inputClass}
      />
      {detected == null && (
        <p className={noteClass}>
          Live shows it under Settings → Library → Location of User Library.
        </p>
      )}

      <button
        type="button"
        data-testid="remote-script-install"
        disabled={remote.installing || path.trim() === ""}
        onClick={() => remote.install(path.trim())}
        className={buttonClass}
      >
        {installLabel(status, remote.installing)}
      </button>

      {remote.installError != null && (
        <p
          className="text-red-600 dark:text-red-400"
          data-testid="remote-script-error"
        >
          {remote.installError}
        </p>
      )}
      {remote.installedPath != null && remote.installError == null && (
        <p
          className="text-green-600 dark:text-green-400"
          data-testid="remote-script-installed-path"
        >
          Installed to {remote.installedPath}
        </p>
      )}
    </div>
  );
}

/**
 * Text for the install button.
 * @param status - The server's remote-script status
 * @param installing - Whether an install is in flight
 * @returns The button label
 */
function installLabel(status: RemoteScriptStatus, installing: boolean): string {
  if (installing) {
    return "Installing…";
  }

  if (!status.installed) {
    return "Install";
  }

  if (status.installedNewer) {
    return "Downgrade to match";
  }

  return status.updateAvailable ? "Update" : "Reinstall";
}

/**
 * What the user still has to do in Live. Collapsed once Live is running the
 * installed version, since by then the steps are done.
 * @param {object} props - Component props
 * @param {boolean} props.open - Whether the steps start expanded
 * @param {string | null} props.restartFor - Version Live picks up on a restart, or null
 * @returns {JSX.Element} The enable steps
 */
function EnableSteps({
  open,
  restartFor,
}: {
  open: boolean;
  restartFor: string | null;
}) {
  return (
    <details open={open} data-testid="remote-script-steps">
      <summary className="cursor-pointer">Enable it in Live</summary>
      {restartFor != null && (
        <p className={`mt-2 ${noteClass}`} data-testid="remote-script-restart">
          Restart Live to load v{restartFor}.
        </p>
      )}
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>Restart Live — it only scans Remote Scripts at startup.</li>
        <li>In Live, open Settings → Tempo &amp; MIDI.</li>
        <li>
          Under Control Surface pick Producer_Pal. Leave Input and Output as
          None.
        </li>
      </ol>
      <p className={`mt-2 ${noteClass}`}>
        Once Live is running it, the status above says "running".
      </p>
    </details>
  );
}

/**
 * Re-reads the status, for after a restart in Live.
 * @param {object} props - Component props
 * @param {Function} props.onRefresh - Runs the status read
 * @returns {JSX.Element} The refresh button
 */
function RefreshButton({ onRefresh }: { onRefresh: () => void }) {
  return (
    <button
      type="button"
      data-testid="remote-script-refresh"
      onClick={onRefresh}
      className={buttonClass}
    >
      Refresh
    </button>
  );
}

/**
 * Why the status read failed.
 * @param {object} props - Component props
 * @param {string} props.message - The error to show
 * @returns {JSX.Element} The error line
 */
function LoadError({ message }: { message: string }) {
  return (
    <p
      className="text-red-600 dark:text-red-400"
      data-testid="remote-script-load-error"
    >
      {message}
    </p>
  );
}
