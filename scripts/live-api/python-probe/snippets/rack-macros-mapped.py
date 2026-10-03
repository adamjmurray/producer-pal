# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

# Every rack in the Set, with which of its macros are mapped (macros_mapped,
# which Max's LiveAPI can't read). Run with run-probe.ts.
racks = []


def walk(devices, path):
    for i, device in enumerate(devices):
        device_path = "%s devices %d" % (path, i)
        if device.can_have_chains:
            racks.append({
                "path": device_path,
                "name": device.name,
                "visible_macro_count": device.visible_macro_count,
                "has_macro_mappings": device.has_macro_mappings,
                "macros_mapped": list(device.macros_mapped),
                "macro_names": [p.name for p in device.parameters[1:17]],
            })
            for c, chain in enumerate(device.chains):
                walk(chain.devices, "%s chains %d" % (device_path, c))


for t, track in enumerate(song.tracks):
    walk(track.devices, "live_set tracks %d" % t)

result = racks
