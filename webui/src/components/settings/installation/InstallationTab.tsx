// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { useState } from "preact/hooks";
import { type UseInstallationReturn } from "#webui/hooks/settings/installation/use-installation";
import { DeviceSection } from "./DeviceSection";
import { InstallationOptions } from "./InstallationOptions";
import { RemoteScriptSection } from "./RemoteScriptSection";
import { UserLibraryField } from "./UserLibraryField";

/**
 * Installation tab: puts the Producer Pal device and its remote script in
 * Live's User Library, in install order: the remote script loads the device
 * from there. Both installs use the one User Library path above them.
 * The state is owned by the settings screen, which also reads it for the tab
 * button's attention dot.
 * @param {object} props - Component props
 * @param {UseInstallationReturn} props.installation - The device and remote script state
 * @returns {JSX.Element} Installation tab component
 */
export function InstallationTab({
  installation,
}: {
  installation: UseInstallationReturn;
}) {
  const { remote, device, swap } = installation;
  // Either status may be the one that finds it; a failed read has none.
  const detected =
    remote.status?.userLibrary ?? device.status?.userLibrary ?? null;
  // Null until the user edits, so a Refresh that finds the User Library reaches
  // the field without ever overwriting a typed path.
  const [typed, setTyped] = useState<string | null>(null);
  const path = typed ?? detected ?? "";

  return (
    <div className="space-y-3.5 text-sm" data-testid="installation-tab">
      <UserLibraryField detected={detected} value={path} onInput={setTyped} />
      <DeviceSection
        device={device}
        swap={swap}
        path={path}
        detected={detected}
      />
      <RemoteScriptSection remote={remote} path={path} detected={detected} />
      <InstallationOptions />
    </div>
  );
}
