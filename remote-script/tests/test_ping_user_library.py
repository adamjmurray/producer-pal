# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""/ping names the User Library the script was installed into, and its build.

Run: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s remote-script/tests
"""

import os
import sys
import types
import unittest
from unittest import mock

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.modules.setdefault("Live", types.ModuleType("Live"))

from Producer_Pal import browser, hot_reload, routes, version  # noqa: E402


def ping():
    bridge = types.SimpleNamespace(
        app=types.SimpleNamespace(
            get_major_version=lambda: 12,
            get_minor_version=lambda: 4,
            get_bugfix_version=lambda: 5,
        ),
    )
    return routes.ping(bridge, {})


class PingUserLibraryTest(unittest.TestCase):
    def test_reports_the_library_the_script_runs_from(self):
        with mock.patch.object(browser, "_USER_LIBRARY", "/Music/Ableton/User Library"):
            self.assertEqual(ping()["user_library"], "/Music/Ableton/User Library")

    def test_reports_none_when_the_script_is_not_in_a_library(self):
        with mock.patch.object(browser, "_USER_LIBRARY", None):
            self.assertIsNone(ping()["user_library"])


class PingBuildTest(unittest.TestCase):
    def test_reports_the_build_live_loaded(self):
        self.assertEqual(ping()["script_build"], hot_reload.build_hash)

    def test_reports_the_installing_commit(self):
        with mock.patch("builtins.open", mock.mock_open(read_data="abc1234\n")):
            self.assertEqual(ping()["script_commit"], "abc1234")

    def test_reports_no_commit_when_the_file_is_missing(self):
        with mock.patch.object(version, "BUILD_COMMIT_FILE", "missing-file"):
            self.assertIsNone(ping()["script_commit"])


if __name__ == "__main__":
    unittest.main()
