# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

# What Max's LiveAPI may reach on each Live class, read from the allowlist in
# Live's own _MxDCore package. Max refuses any member of a Live object that
# isn't listed. Keys match python-surface.py. Run with run-probe.ts.
import importlib

lom_types = importlib.import_module("_MxDCore.LomTypes")

result = {
    t.__module__ + "." + t.__name__: sorted(p.name for p in props)
    for t, props in lom_types.AVAILABLE_TYPE_PROPERTIES.items()
}
