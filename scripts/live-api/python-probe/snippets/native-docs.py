# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

# The docstring of every class member and module function in the `Live`
# module, plus the native modules only control surfaces use. Most include the
# C++ signature, which gives argument types. Run with run-probe.ts.
import re
import sys

MODULES = ["MidiRemoteScript", "MxDManager", "ListWrapper"]


def doc(value):
    return re.sub(r"\s+", " ", getattr(value, "__doc__", None) or "").strip()


def visit(cls, key):
    result[key] = {
        name: doc(value)
        for name, value in vars(cls).items()
        if not name.startswith("__") and not name.endswith("_listener")
    }
    for name, value in vars(cls).items():
        if isinstance(value, type) and value is not cls and not name.startswith("__"):
            visit(value, key + "." + name)


result = {}
for module_name in MODULES + sorted(n for n in sys.modules if n.startswith("Live.")):
    for name, value in vars(sys.modules[module_name]).items():
        if name.startswith("_"):
            continue
        if isinstance(value, type):
            visit(value, module_name + "." + name)
        elif callable(value):
            result[module_name + "." + name] = doc(value)
