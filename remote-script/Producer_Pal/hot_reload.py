# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

"""Dev-only hot reload, so edited code runs without restarting Live.

The bootstrap files below are loaded once and never reloaded: Live holds the
bridge, which owns the server thread and the job queue. Every other top-level
.py file is implementation and reloads. The `/reload` route (added by
`npm run remote-script:install -- --probe`) calls `reload_route`.

Main thread only. Reloading from a job means no other job is mid-run.
"""

import ast
import hashlib
import importlib
import os
import sys
import traceback

from .errors import RouteError

# Files that never reload. Mirrored in scripts/live-api/hot-reload/source-hash.ts,
# which hashes the same files.
BOOTSTRAP = ("__init__", "bridge", "errors", "hot_reload", "http_server")

PACKAGE_DIR = os.path.dirname(os.path.abspath(__file__))


class ReloadError(Exception):
    """A reload that failed and was rolled back."""

    def __init__(self, module, trace):
        super().__init__("reload failed in %s" % module)
        self.module = module
        self.trace = trace


def implementation_files(directory=PACKAGE_DIR):
    """Sorted names of the reloadable .py files: every top-level one but the bootstrap."""
    return sorted(
        name
        for name in os.listdir(directory)
        if name.endswith(".py")
        and not name.startswith(".")
        and name[:-3] not in BOOTSTRAP
        and os.path.isfile(os.path.join(directory, name))
    )


def implementation_hash(directory=PACKAGE_DIR):
    """SHA-256 hex over the implementation files' names and contents.

    Per file, in name order: `<name>\\0<sha256 of its bytes>\\n`.
    """
    digest = hashlib.sha256()
    for name in implementation_files(directory):
        with open(os.path.join(directory, name), "rb") as file:
            content_hash = hashlib.sha256(file.read()).hexdigest()
        digest.update(("%s\0%s\n" % (name, content_hash)).encode("utf-8"))
    return digest.hexdigest()


def _hash_or_none(directory=PACKAGE_DIR):
    """The hash, or None when the files can't be read: that must never stop Live loading us."""
    try:
        return implementation_hash(directory)
    except Exception:
        return None


# What `/ping` reports. Set when this module first loads, then by each reload.
loaded_hash = _hash_or_none()


def reload_order(directory=PACKAGE_DIR):
    """Implementation module names, each after the ones it imports.

    Read from the files' `from . import` lines, so a new module needs no
    registering. Raises ValueError on an import cycle.
    """
    names = [name[:-3] for name in implementation_files(directory)]
    deps = {name: _local_imports(directory, name, names) for name in names}
    order = []
    done = set()

    def visit(name, path):
        if name in done:
            return
        if name in path:
            raise ValueError("import cycle: " + " -> ".join(path + [name]))
        for dep in sorted(deps[name]):
            visit(dep, path + [name])
        done.add(name)
        order.append(name)

    for name in names:
        visit(name, [])
    return order


def reload_implementation(package=__package__):
    """Reload the implementation modules and update `loaded_hash`.

    Returns (module names reloaded, hash). If any module fails, every module is
    put back as it was and ReloadError is raised: the previous code keeps
    running.
    """
    global loaded_hash

    importlib.invalidate_caches()
    digest = implementation_hash()
    # Working out the order reads the new source, so a syntax error or an
    # import cycle fails here, before anything has changed.
    try:
        order = reload_order()
    except (ValueError, SyntaxError):
        raise ReloadError("(import order)", traceback.format_exc())

    before = {}
    for name in order:
        module = sys.modules.get("%s.%s" % (package, name))
        if module is not None:
            before[name] = dict(vars(module))

    reloaded = []
    current = None
    try:
        for current in order:
            full_name = "%s.%s" % (package, current)
            module = sys.modules.get(full_name)
            if module is None:
                importlib.import_module(full_name)
            else:
                importlib.reload(module)
            reloaded.append(current)
    except Exception:
        trace = traceback.format_exc()
        _roll_back(package, order, before)
        raise ReloadError(current, trace)

    loaded_hash = digest
    return reloaded, digest


def reload_route(bridge, params):
    """`POST /reload`: the route that calls reload_implementation."""
    try:
        reloaded, digest = reload_implementation()
    except ReloadError as err:
        bridge.log("%s; the previous code is still running\n%s" % (err, err.trace))
        raise RouteError(
            500,
            "%s; the previous code is still running" % err,
            module=err.module,
            traceback=err.trace,
        )
    bridge.log("reloaded %s (%s)" % (", ".join(reloaded), digest[:12]))
    return {"ok": True, "hash": digest, "reloaded": reloaded}


def _local_imports(directory, name, names):
    """The other implementation modules a file imports with `from .x` or `from . import x`."""
    with open(os.path.join(directory, name + ".py"), "rb") as file:
        tree = ast.parse(file.read(), name + ".py")
    found = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.ImportFrom) or node.level != 1:
            continue
        if node.module:
            found.add(node.module.split(".")[0])
        else:
            found.update(alias.name for alias in node.names)
    return {dep for dep in found if dep in names and dep != name}


def _roll_back(package, order, before):
    """Put each module's contents back as they were, in place.

    Requests on other threads read these modules while this runs, so each is
    updated rather than emptied, and the module objects stay the same.
    """
    for name in order:
        full_name = "%s.%s" % (package, name)
        if name not in before:
            # Imported for the first time by this reload.
            sys.modules.pop(full_name, None)
            continue
        namespace = vars(sys.modules[full_name])
        namespace.update(before[name])
        for key in [key for key in namespace if key not in before[name]]:
            del namespace[key]
