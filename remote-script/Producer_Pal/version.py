# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""The Producer Pal release this script was built from.

The build rewrites this line with package.json's version when it embeds the
script in the device, so an installed copy reports what installed it. The
checked-in value is held in step by version-agreement.test.ts.
"""

import os

VERSION = "2.5.0"

# Written next to this file by the installer: the commit of the device that
# installed it. Not a .py file, so it stays out of the build hash.
BUILD_COMMIT_FILE = "BUILD_COMMIT"


def build_commit():
    """The installing device's commit SHA, or None when unknown."""
    try:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), BUILD_COMMIT_FILE)
        with open(path, encoding="utf-8") as file:
            return file.read().strip() or None
    except OSError:
        return None
