// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { useState } from "preact/hooks";
import { useDeviceInstall } from "#webui/hooks/settings/installation/use-device-install";
import { useDeviceSwap } from "#webui/hooks/settings/installation/use-device-swap";
import { useRemoteScript } from "#webui/hooks/settings/installation/use-remote-script";
import { DeviceSection } from "./DeviceSection";
import { RemoteScriptSection } from "./RemoteScriptSection";
import { UserLibraryField } from "./UserLibraryField";

/**
 * Installation tab: puts the Producer Pal device and its remote script in
 * Live's User Library. Both installs use the one User Library path at the top.
 * @returns {JSX.Element} Installation tab component
 */
export function InstallationTab() {
  const remote = useRemoteScript();
  const device = useDeviceInstall();
  const swap = useDeviceSwap(device.refresh);
  // Either status may be the one that finds it; a failed read has none.
  const detected =
    remote.status?.userLibrary ?? device.status?.userLibrary ?? null;
  // Null until the user edits, so a Refresh that finds the User Library reaches
  // the field without ever overwriting a typed path.
  const [typed, setTyped] = useState<string | null>(null);
  const path = typed ?? detected ?? "";

  return (
    <div className="space-y-6 text-sm" data-testid="installation-tab">
      <UserLibraryField detected={detected} value={path} onInput={setTyped} />
      <DeviceSection
        device={device}
        swap={swap}
        path={path}
        detected={detected}
      />
      <RemoteScriptSection remote={remote} path={path} detected={detected} />
    </div>
  );
}
