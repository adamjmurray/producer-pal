# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

"""Hot reload: the /reload route, what it reloads, and the hash it reports.

Each test copies the script into a temp folder under its own package name, so
edits and reloads never touch the real modules.

Run: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s remote-script/tests
"""

import importlib
import itertools
import os
import shutil
import sys
import tempfile
import types
import unittest

# Keep __pycache__ out of the checkout.
sys.dont_write_bytecode = True
TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
SCRIPT_DIR = os.path.join(os.path.dirname(TESTS_DIR), "Producer_Pal")
REGISTRATION_FILE = os.path.join(
    os.path.dirname(os.path.dirname(TESTS_DIR)),
    "scripts",
    "live-api",
    "hot-reload",
    "reload-registration.py",
)
# Only Live's own Python has this module; the package imports it on load.
sys.modules.setdefault("Live", types.ModuleType("Live"))
sys.path.insert(0, os.path.dirname(TESTS_DIR))

from Producer_Pal import hot_reload as real_hot_reload  # noqa: E402

# The hash of fixture_files(), also pinned in the TypeScript tests so both
# languages are held to the same value.
FIXTURE_HASH = "ef65924eed9afdbfa81ade6f73039bf11bab300dfbee03cf70ab80759514642b"

_counter = itertools.count()


def fixture_files():
    return {
        "a.py": "x = 1\n",
        "b.py": "y = 2\n",
        # Bootstrap, not Python, and hidden files aren't hashed.
        "bridge.py": "z = 3\n",
        "notes.txt": "ignored\n",
        ".hidden.py": "h = 1\n",
        "sub/c.py": "c = 1\n",
    }


def write_tree(directory, files):
    for name, text in files.items():
        path = os.path.join(directory, name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as file:
            file.write(text)


def registration():
    """What the installer appends to routes.py to add /reload."""
    with open(REGISTRATION_FILE, encoding="utf-8") as file:
        return "\n" + file.read().split("\n\n", 1)[1]


class FakeCInstance:
    def __init__(self):
        self.messages = []

    def log_message(self, message):
        self.messages.append(message)


class HashTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.dir)
        write_tree(self.dir, fixture_files())

    def hash(self):
        return real_hot_reload.implementation_hash(self.dir)

    def test_matches_the_value_the_typescript_installer_expects(self):
        self.assertEqual(self.hash(), FIXTURE_HASH)

    def test_hashes_only_implementation_files_in_name_order(self):
        self.assertEqual(
            real_hot_reload.implementation_files(self.dir), ["a.py", "b.py"]
        )

    def test_is_the_same_each_time(self):
        self.assertEqual(self.hash(), self.hash())

    def test_ignores_bootstrap_hidden_and_non_python_files(self):
        before = self.hash()
        write_tree(
            self.dir,
            {"bridge.py": "z = 4\n", "notes.txt": "x", ".hidden.py": "h = 2\n"},
        )
        self.assertEqual(self.hash(), before)

    def test_changes_with_a_file_edit(self):
        before = self.hash()
        write_tree(self.dir, {"a.py": "x = 2\n"})
        self.assertNotEqual(self.hash(), before)

    def test_changes_with_a_file_name(self):
        before = self.hash()
        os.rename(os.path.join(self.dir, "b.py"), os.path.join(self.dir, "c.py"))
        self.assertNotEqual(self.hash(), before)

    def test_unreadable_files_give_no_hash_instead_of_an_error(self):
        missing = os.path.join(self.dir, "missing")
        self.assertIsNone(real_hot_reload._hash_or_none(missing))

    def test_the_loaded_hash_starts_as_the_hash_of_the_files(self):
        self.assertEqual(
            real_hot_reload.loaded_hash, real_hot_reload.implementation_hash()
        )


class ReloadOrderTest(unittest.TestCase):
    def test_each_module_comes_after_the_ones_it_imports(self):
        order = real_hot_reload.reload_order()
        deps = {
            name: real_hot_reload._local_imports(SCRIPT_DIR, name, order)
            for name in order
        }
        for name, imports in deps.items():
            for dep in imports:
                self.assertLess(order.index(dep), order.index(name), (dep, name))
        self.assertEqual(order[-1], "routes")

    def test_covers_every_implementation_module(self):
        self.assertEqual(
            sorted(real_hot_reload.reload_order()),
            [name[:-3] for name in real_hot_reload.implementation_files()],
        )

    def test_bootstrap_files_exist(self):
        for name in real_hot_reload.BOOTSTRAP:
            self.assertTrue(os.path.isfile(os.path.join(SCRIPT_DIR, name + ".py")))

    def test_an_import_cycle_is_an_error(self):
        directory = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, directory)
        write_tree(directory, {"a.py": "from . import b\n", "b.py": "from . import a\n"})
        with self.assertRaises(ValueError):
            real_hot_reload.reload_order(directory)


class ReloadTest(unittest.TestCase):
    """Reloads a private copy of the script, installed the way --probe does."""

    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.package = "PP_reload_test_%d" % next(_counter)
        self.dir = os.path.join(self.root, self.package)
        shutil.copytree(
            SCRIPT_DIR, self.dir, ignore=shutil.ignore_patterns("__pycache__")
        )
        self.append("routes.py", registration())
        # A route the failure tests check still answers afterwards.
        self.append("routes.py", '\nROUTES["/answer"] = lambda bridge, params: {"a": 1}\n')
        sys.path.insert(0, self.root)
        self.addCleanup(self.cleanup)
        self.bridge = importlib.import_module(self.package + ".bridge")
        self.routes = sys.modules[self.package + ".routes"]
        self.hot_reload = sys.modules[self.package + ".hot_reload"]
        self.errors = sys.modules[self.package + ".errors"]
        self.c_instance = FakeCInstance()
        self.surface = object.__new__(self.bridge.ProducerPalBridge)
        self.surface._c_instance = self.c_instance
        # Live runs each job as soon as it's queued.
        self.surface._jobs = types.SimpleNamespace(put=lambda queued: queued.run())

    def cleanup(self):
        sys.path.remove(self.root)
        for name in [name for name in sys.modules if name.startswith(self.package)]:
            del sys.modules[name]
        shutil.rmtree(self.root)

    def append(self, name, text):
        with open(os.path.join(self.dir, name), "a", encoding="utf-8") as file:
            file.write(text)

    def replace(self, name, old, new):
        path = os.path.join(self.dir, name)
        with open(path, encoding="utf-8") as file:
            text = file.read()
        self.assertIn(old, text)
        with open(path, "w", encoding="utf-8") as file:
            file.write(text.replace(old, new))

    def post(self, path, params=None):
        return self.surface._dispatch("POST", path, params or {})

    def reload(self):
        return self.post("/reload")

    # --- a reload takes effect -----------------------------------------

    def test_registers_the_reload_route_as_post_only(self):
        self.assertIn("/reload", self.routes.ROUTES)
        self.assertEqual(self.surface._dispatch("GET", "/reload", {})[0], 405)

    def test_reports_the_hash_and_what_it_reloaded(self):
        status, payload = self.reload()

        self.assertEqual(status, 200)
        self.assertEqual(payload["hash"], self.hot_reload.implementation_hash())
        self.assertEqual(payload["reloaded"], self.hot_reload.reload_order())
        self.assertEqual(payload["reloaded"][-1], "routes")
        self.assertNotIn("bridge", payload["reloaded"])
        self.assertEqual(self.hot_reload.loaded_hash, payload["hash"])

    def test_a_new_route_is_found_without_restarting(self):
        self.assertEqual(self.post("/hello")[0], 404)
        self.append(
            "routes.py",
            '\nROUTES["/hello"] = lambda bridge, params: {"hello": 2}\n',
        )

        self.assertEqual(self.reload()[0], 200)

        self.assertEqual(self.post("/hello"), (200, {"hello": 2}))

    def test_an_edited_handler_runs_its_new_code(self):
        self.append("routes.py", '\nROUTES["/v"] = lambda bridge, params: 1\n')
        self.reload()
        self.assertEqual(self.post("/v"), (200, 1))
        self.replace("routes.py", 'lambda bridge, params: 1', 'lambda bridge, params: 2')

        self.reload()

        self.assertEqual(self.post("/v"), (200, 2))

    def test_a_module_that_imports_an_edited_one_gets_the_new_code(self):
        clip_address = sys.modules[self.package + ".clip_address"]
        self.append("params.py", "\n\ndef parse_index(value, name):\n    return 42\n")

        self.reload()

        self.assertEqual(clip_address.parse_index("1", "x"), 42)

    def test_the_hash_changes_when_the_code_does(self):
        before = self.reload()[1]["hash"]
        self.append("version.py", "# edited\n")

        after = self.reload()[1]["hash"]

        self.assertNotEqual(after, before)

    def test_a_module_added_since_startup_is_loaded(self):
        write_tree(self.dir, {"extra.py": "VALUE = 7\n"})
        self.append("routes.py", "\nfrom . import extra\n")

        status, payload = self.reload()

        self.assertEqual(status, 200)
        self.assertLess(payload["reloaded"].index("extra"), payload["reloaded"].index("routes"))
        self.assertEqual(self.routes.extra.VALUE, 7)

    # --- RouteError -------------------------------------------------------

    def test_a_route_error_from_reloaded_code_keeps_its_status(self):
        self.append(
            "routes.py",
            "\ndef _teapot(bridge, params):\n"
            "    raise RouteError(418, 'short and stout', spout=True)\n"
            '\nROUTES["/teapot"] = _teapot\n',
        )
        self.reload()

        self.assertEqual(
            self.post("/teapot"), (418, {"error": "short and stout", "spout": True})
        )

    def test_a_job_queued_before_a_reload_still_maps_its_route_error(self):
        # The handler is looked up when the request arrives, so one queued
        # across a reload still runs the old code and raises the old error.
        self.append(
            "routes.py",
            "\ndef _teapot(bridge, params):\n"
            "    raise RouteError(418, 'old')\n"
            '\nROUTES["/teapot"] = _teapot\n',
        )
        self.reload()
        job = self.bridge._Job(self.routes.ROUTES["/teapot"], self.surface, {})

        self.reload()
        job.run()

        self.assertEqual(job.wait(), (418, {"error": "old"}))

    def test_the_route_error_class_survives_a_reload(self):
        before = self.routes.RouteError

        self.reload()

        self.assertIs(self.routes.RouteError, before)
        self.assertIs(self.bridge.RouteError, before)
        self.assertIs(sys.modules[self.package + ".envelopes"].RouteError, before)

    # --- a failed reload --------------------------------------------------

    def assert_still_running_old_code(self, old_routes, old_hash):
        self.assertIs(self.routes.ROUTES, old_routes)
        self.assertEqual(self.hot_reload.loaded_hash, old_hash)
        self.assertEqual(self.post("/nope")[0], 404)
        self.assertEqual(self.post("/answer"), (200, {"a": 1}))

    def test_a_syntax_error_fails_the_reload_and_changes_nothing(self):
        old_routes, old_hash = self.routes.ROUTES, self.hot_reload.loaded_hash
        self.append("envelopes.py", "\ndef broken(:\n")

        status, payload = self.reload()

        self.assertEqual(status, 500)
        self.assertIn("SyntaxError", payload["traceback"])
        self.assertIn("the previous code is still running", payload["error"])
        self.assert_still_running_old_code(old_routes, old_hash)

    def test_an_error_while_loading_puts_every_module_back(self):
        old_routes, old_hash = self.routes.ROUTES, self.hot_reload.loaded_hash
        params = sys.modules[self.package + ".params"]
        old_parse_index = params.parse_index
        # A leaf reloads fine, then routes (last) fails after rebuilding ROUTES.
        self.append("params.py", "\n\ndef parse_index(value, name):\n    return 42\n")
        self.append("routes.py", '\nROUTES["/half"] = None\nraise RuntimeError("boom")\n')

        status, payload = self.reload()

        self.assertEqual(status, 500)
        self.assertEqual(payload["module"], "routes")
        self.assertIn("RuntimeError: boom", payload["traceback"])
        self.assertIs(params.parse_index, old_parse_index)
        self.assert_still_running_old_code(old_routes, old_hash)
        self.assertNotIn("/half", self.routes.ROUTES)

    def test_a_module_first_imported_by_a_failed_reload_is_forgotten(self):
        write_tree(self.dir, {"extra.py": "VALUE = 7\n"})
        self.append("routes.py", "\nfrom . import extra\nraise RuntimeError('boom')\n")

        self.assertEqual(self.reload()[0], 500)

        self.assertNotIn(self.package + ".extra", sys.modules)

    def test_fixing_the_error_and_reloading_again_works(self):
        self.append("browser.py", "\nraise RuntimeError('boom')\n")
        self.assertEqual(self.reload()[0], 500)
        self.replace("browser.py", "raise RuntimeError('boom')", "pass")

        self.assertEqual(self.reload()[0], 200)

    def test_the_failure_is_logged(self):
        self.append("version.py", "\nraise RuntimeError('boom')\n")

        self.reload()

        self.assertTrue(
            any("reload failed in version" in m for m in self.c_instance.messages)
        )

    # --- ping -------------------------------------------------------------

    def test_ping_reports_the_loaded_hash(self):
        app = types.SimpleNamespace(
            get_major_version=lambda: 12,
            get_minor_version=lambda: 0,
            get_bugfix_version=lambda: 1,
        )
        fake_bridge = types.SimpleNamespace(app=app)
        before = self.routes.ping(fake_bridge, {})["source_hash"]
        self.assertEqual(before, self.hot_reload.implementation_hash())
        self.append("version.py", "# edited\n")
        # Editing a file doesn't change what's loaded...
        self.assertEqual(self.routes.ping(fake_bridge, {})["source_hash"], before)

        self.reload()

        # ...a reload does.
        self.assertNotEqual(self.routes.ping(fake_bridge, {})["source_hash"], before)
        self.assertEqual(
            self.routes.ping(fake_bridge, {})["source_hash"],
            self.hot_reload.implementation_hash(),
        )


if __name__ == "__main__":
    unittest.main()
