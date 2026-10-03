# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

# Every class in the `Live` module with its members, every enum with its
# values, and every module-level function. Classes are keyed "Module.Class"
# (a nested View is "Track.View"). Run with run-probe.ts.
import inspect

classes = {}
enums = {}
functions = []
seen = set()


def members(obj):
    return sorted(n for n in dir(obj) if not n.startswith("__"))


def visit(cls, path):
    if id(cls) in seen:
        return
    seen.add(id(cls))
    if issubclass(cls, int):
        enums[path] = sorted(getattr(cls, "names", {}))
        return
    classes[cls.__module__ + "." + cls.__name__] = members(cls)
    for name in members(cls):
        value = getattr(cls, name, None)
        if inspect.isclass(value) and value.__module__ != "builtins":
            visit(value, path + "." + name)


for module_name in members(Live):
    module = getattr(Live, module_name)
    if inspect.ismodule(module):
        for name in members(module):
            value = getattr(module, name)
            if inspect.isclass(value):
                visit(value, module_name + "." + name)
            elif callable(value):
                functions.append(module_name + "." + name)

result = {
    "version": app.get_version_string(),
    "classes": classes,
    "enums": enums,
    "functions": sorted(functions),
}
