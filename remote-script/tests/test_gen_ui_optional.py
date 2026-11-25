# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""A release build leaves out the generative UI's files (gen_ui_routes.py,
watches.py, ui_widgets.py). Everything that ships must work without them, and
must never import them.

Each test copies the script into a temp folder under its own package name.

Run: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s remote-script/tests
"""

import ast
import importlib
import itertools
import os
import re
import shutil
import sys
import tempfile
import types
import unittest

sys.dont_write_bytecode = True
TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
SCRIPT_DIR = os.path.join(os.path.dirname(TESTS_DIR), "Producer_Pal")
FILE_LIST = os.path.join(
    os.path.dirname(os.path.dirname(TESTS_DIR)),
    "src",
    "mcp-server",
    "rpc",
    "remote-script",
    "bundle",
    "gen-ui-remote-script-files.ts",
)
REGISTRATION_FILE = os.path.join(
    os.path.dirname(os.path.dirname(TESTS_DIR)),
    "scripts",
    "live-api",
    "hot-reload",
    "reload-registration.py",
)
# Only Live's own Python has this module; the package imports it on load.
sys.modules.setdefault("Live", types.ModuleType("Live"))

_counter = itertools.count()


def gen_ui_files():
    """The file list the build uses, read from its one definition."""
    with open(FILE_LIST, encoding="utf-8") as file:
        source = file.read()
    block = source.split("GEN_UI_REMOTE_SCRIPT_FILES", 1)[1].split("];", 1)[0]
    return re.findall(r'"([\w]+\.py)"', block)


def modules_of(name):
    """The sibling modules a file imports, from `from .x`, `from . import x`
    and `import <package>.x`."""
    with open(os.path.join(SCRIPT_DIR, name), "rb") as file:
        tree = ast.parse(file.read(), name)
    found = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.level >= 1:
            if node.module:
                found.add(node.module.split(".")[0])
            else:
                found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.Import):
            for alias in node.names:
                found.update(alias.name.split("."))
    return found


class GuardTest(unittest.TestCase):
    def test_the_file_list_names_real_files(self):
        files = gen_ui_files()

        self.assertIn("gen_ui_routes.py", files)
        for name in files:
            self.assertTrue(os.path.isfile(os.path.join(SCRIPT_DIR, name)), name)

    def test_only_gen_ui_routes_imports_the_other_gen_ui_modules(self):
        hidden = {name[:-3] for name in gen_ui_files() if name != "gen_ui_routes.py"}
        importers = [
            name
            for name in sorted(os.listdir(SCRIPT_DIR))
            if name.endswith(".py") and modules_of(name) & hidden
        ]

        self.assertEqual(importers, ["gen_ui_routes.py"])

    def test_only_routes_imports_gen_ui_routes(self):
        importers = [
            name
            for name in sorted(os.listdir(SCRIPT_DIR))
            if name.endswith(".py") and "gen_ui_routes" in modules_of(name)
        ]

        self.assertEqual(importers, ["routes.py"])


class PrivateCopyCase(unittest.TestCase):
    """A copy of the script; `without_gen_ui` is the release build's file set."""

    without_gen_ui = True

    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.package = "PP_gen_ui_test_%d" % next(_counter)
        self.dir = os.path.join(self.root, self.package)
        shutil.copytree(
            SCRIPT_DIR, self.dir, ignore=shutil.ignore_patterns("__pycache__")
        )
        if self.without_gen_ui:
            for name in gen_ui_files():
                os.remove(os.path.join(self.dir, name))
        sys.path.insert(0, self.root)
        self.addCleanup(self.cleanup)

    def cleanup(self):
        sys.path.remove(self.root)
        for name in [n for n in sys.modules if n.startswith(self.package)]:
            del sys.modules[name]
        shutil.rmtree(self.root)

    def load(self, name):
        return importlib.import_module("%s.%s" % (self.package, name))

    def make_bridge(self):
        bridge = self.load("bridge")
        surface = object.__new__(bridge.ProducerPalBridge)
        surface._c_instance = types.SimpleNamespace(log_message=lambda m: None)
        surface._server = types.SimpleNamespace(stop=lambda: None)
        surface._jobs = types.SimpleNamespace(put=lambda queued: queued.run())
        surface.cleanups = {}
        return surface


class ReleaseBuildTest(PrivateCopyCase):
    def test_routes_load_with_no_gen_ui_routes(self):
        routes = self.load("routes")

        self.assertIn("/ping", routes.ROUTES)
        for path in ("/watch", "/unwatch", "/events", "/watches", "/ui-widgets"):
            self.assertNotIn(path, routes.ROUTES)
        self.assertNotIn("/watch", routes.POST_ONLY)
        self.assertNotIn("/ui-widgets/save", routes.POST_ONLY)

    def test_a_gen_ui_route_is_an_unknown_route(self):
        self.load("routes")
        surface = self.make_bridge()

        status, _ = surface._dispatch("POST", "/watch", {})

        self.assertEqual(status, 404)

    def test_disconnect_and_cleanups_work(self):
        self.load("routes")
        surface = self.make_bridge()
        ran = []
        surface.cleanups["x"] = lambda: ran.append("x")

        surface.disconnect()
        surface.disconnect()

        self.assertEqual(ran, ["x"])
        self.assertEqual(surface.cleanups, {})

    def test_a_failing_cleanup_does_not_stop_the_rest(self):
        surface = self.make_bridge()
        ran = []

        def broken():
            raise RuntimeError("x")

        surface.cleanups = {"a": broken, "b": lambda: ran.append("b")}
        surface.run_cleanups()

        self.assertEqual(ran, ["b"])

    def test_a_hot_reload_works(self):
        with open(REGISTRATION_FILE, encoding="utf-8") as file:
            registration = "\n" + file.read().split("\n\n", 1)[1]
        with open(os.path.join(self.dir, "routes.py"), "a", encoding="utf-8") as file:
            file.write(registration)
        self.load("routes")
        surface = self.make_bridge()

        status, payload = surface._dispatch("POST", "/reload", {})

        self.assertEqual(status, 200)
        self.assertEqual(payload["reloaded"][-1], "routes")
        for name in ("gen_ui_routes", "watches", "ui_widgets"):
            self.assertNotIn(name, payload["reloaded"])

    def test_an_import_error_inside_gen_ui_routes_is_not_hidden(self):
        # A gen-UI build with a broken module must fail loudly, not quietly
        # lose its routes.
        shutil.copy(
            os.path.join(SCRIPT_DIR, "gen_ui_routes.py"),
            os.path.join(self.dir, "gen_ui_routes.py"),
        )
        with open(
            os.path.join(self.dir, "gen_ui_routes.py"), "a", encoding="utf-8"
        ) as file:
            file.write("\nfrom .no_such_module import nothing\n")

        with self.assertRaises(ModuleNotFoundError):
            self.load("routes")


class GenUiBuildTest(PrivateCopyCase):
    without_gen_ui = False

    def test_routes_include_the_gen_ui_routes(self):
        routes = self.load("routes")

        for path in ("/watch", "/unwatch", "/events", "/watches", "/ui-widgets"):
            self.assertIn(path, routes.ROUTES)
        self.assertIn("/watch", routes.POST_ONLY)
        self.assertIn("/ui-widgets/save", routes.POST_ONLY)

    def test_a_hot_reload_reloads_the_gen_ui_modules_before_routes(self):
        hot_reload = self.load("hot_reload")
        order = hot_reload.reload_order(self.dir)

        self.assertLess(order.index("watches"), order.index("gen_ui_routes"))
        self.assertLess(order.index("gen_ui_routes"), order.index("routes"))

    def test_the_watch_registry_is_closed_by_the_bridges_cleanups(self):
        self.load("routes")
        watches = self.load("watches")
        surface = self.make_bridge()
        surface.log = lambda message: None
        registry = watches._registry(surface)
        closed = []
        registry.close = lambda: closed.append(True)

        surface.disconnect()

        self.assertEqual(closed, [True])
        self.assertIsNone(getattr(surface, "watches", None))


if __name__ == "__main__":
    unittest.main()
