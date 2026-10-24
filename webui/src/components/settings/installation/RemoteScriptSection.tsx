// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type RemoteScriptStatus,
  type useRemoteScript,
} from "#webui/hooks/settings/installation/use-remote-script";
import { REMOTE_SCRIPT_DOCS_URL } from "#webui/lib/config";
import {
  buttonClass,
  errorTextClass,
  goodTextClass,
  linkClass,
  noteClass,
} from "./helpers/installation-classes";
import {
  installLabel,
  needsEnabling,
  remoteScriptLook,
  restartVersion,
  summarize,
} from "./helpers/remote-script-summary";
import { RemoteScriptSteps } from "./RemoteScriptSteps";
import { SectionCard } from "./SectionCard";

type Remote = ReturnType<typeof useRemoteScript>;

interface RemoteScriptSectionProps {
  remote: Remote;
  /** The User Library path in the tab's shared field. */
  path: string;
  /** The User Library the server detected, or null. */
  detected: string | null;
}

/**
 * Remote script card of the Installation tab: installs the Producer Pal
 * control surface into the User Library and shows whether Live is running it.
 * @param {RemoteScriptSectionProps} props - Component props
 * @param {object} props.remote - The useRemoteScript state and actions
 * @param {string} props.path - The User Library path in the shared field
 * @param {string | null} props.detected - The detected User Library, or null
 * @returns {JSX.Element} The remote script card
 */
export function RemoteScriptSection({
  remote,
  path,
  detected,
}: RemoteScriptSectionProps) {
  const { status } = remote;

  if (status == null) {
    return (
      <SectionCard
        id="remote-script"
        testId="remote-script-section"
        kind="unknown"
        title="Remote script"
      >
        <Description />
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
      </SectionCard>
    );
  }

  const look = remoteScriptLook(status);
  const expanded = status.installed && needsEnabling(status);

  return (
    <SectionCard
      id="remote-script"
      testId="remote-script-section"
      kind={look.kind}
      title="Remote script"
      aside={
        <InstallButton
          status={status}
          remote={remote}
          path={path}
          detected={detected}
        />
      }
    >
      <Description />
      <div className="flex items-center justify-between gap-2">
        <p
          className={`font-medium ${look.textClass}`}
          data-testid="remote-script-status"
        >
          {summarize(status)}
        </p>
        {/* The expanded steps have their own "Check again". */}
        {!expanded && <RefreshButton onRefresh={remote.refresh} />}
      </div>
      <InstallMessages remote={remote} />
      {status.installed && (
        <RemoteScriptSteps
          expanded={expanded}
          restartFor={restartVersion(status)}
          onRefresh={remote.refresh}
        />
      )}
      {/* A failed Refresh keeps the last status on screen. */}
      {remote.loadError != null && <LoadError message={remote.loadError} />}
    </SectionCard>
  );
}

// --- Helpers below main export ---

/**
 * @returns {JSX.Element} What the remote script is for, with a docs link
 */
function Description() {
  return (
    <p className={noteClass}>
      Adds clip automation, undo, and loading plug-ins and device presets.{" "}
      <a
        href={REMOTE_SCRIPT_DOCS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        Learn more
      </a>
    </p>
  );
}

interface InstallButtonProps {
  status: RemoteScriptStatus;
  remote: Remote;
  path: string;
  detected: string | null;
}

/**
 * The Install / Update button for the User Library in the shared field.
 * @param {InstallButtonProps} props - Component props
 * @param {RemoteScriptStatus} props.status - The server's remote-script status
 * @param {object} props.remote - The useRemoteScript state and actions
 * @param {string} props.path - The User Library path in the shared field
 * @param {string | null} props.detected - The detected User Library, or null
 * @returns {JSX.Element} The install button
 */
function InstallButton({ status, remote, path, detected }: InstallButtonProps) {
  return (
    <button
      type="button"
      data-testid="remote-script-install"
      disabled={remote.installing || path.trim() === ""}
      onClick={() => remote.install(path.trim())}
      className={`flex-none ${buttonClass}`}
    >
      {installLabel(status, remote.installing, path.trim() === detected)}
    </button>
  );
}

/**
 * What came of the last install.
 * @param {object} props - Component props
 * @param {Remote} props.remote - The useRemoteScript state
 * @returns {JSX.Element | null} The result, or nothing
 */
function InstallMessages({ remote }: { remote: Remote }) {
  if (remote.installError != null) {
    return (
      <p className={errorTextClass} data-testid="remote-script-error">
        {remote.installError}
      </p>
    );
  }

  if (remote.installedPath != null) {
    return (
      <p className={goodTextClass} data-testid="remote-script-installed-path">
        Installed to {remote.installedPath}
      </p>
    );
  }

  return null;
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
      className={`flex-none self-start ${buttonClass}`}
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
    <p className={errorTextClass} data-testid="remote-script-load-error">
      {message}
    </p>
  );
}
