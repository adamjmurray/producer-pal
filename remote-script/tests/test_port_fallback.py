# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""The HTTP server takes the first free port and records it in the port file.

Run: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s remote-script/tests
"""

import os
import shutil
import socket
import sys
import tempfile
import types
import unittest

# Keep __pycache__ out of the checkout.
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Only Live's own Python has this module; the package imports it on load.
sys.modules.setdefault("Live", types.ModuleType("Live"))

from Producer_Pal import bridge, routes  # noqa: E402
from Producer_Pal.http_server import BridgeHTTPServer  # noqa: E402


def free_port():
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


class PortFallbackTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        # A folder that doesn't exist yet, as on a first run.
        self.port_file = os.path.join(self.dir, ".producer-pal", "port.txt")
        self.logs = []
        self.holders = []
        self.servers = []

    def tearDown(self):
        for server in self.servers:
            server.stop()
        for holder in self.holders:
            holder.close()
        shutil.rmtree(self.dir)

    def occupy(self):
        """Hold a port, so binding it fails."""
        holder = socket.socket()
        holder.bind(("127.0.0.1", 0))
        holder.listen()
        self.holders.append(holder)
        return holder.getsockname()[1]

    def server(self, ports):
        server = BridgeHTTPServer(
            ports, lambda *_: (200, {}), self.logs.append, self.port_file
        )
        self.servers.append(server)
        return server

    def written(self):
        with open(self.port_file) as file:
            return file.read()

    def test_takes_the_first_port_when_free(self):
        first, second = free_port(), free_port()
        server = self.server([first, second])

        self.assertTrue(server.start())
        self.assertEqual(server.port, first)
        self.assertEqual(self.written(), "%s\n" % first)

    def test_falls_back_to_the_next_port_when_one_is_taken(self):
        taken, free = self.occupy(), free_port()
        server = self.server([taken, free])

        self.assertTrue(server.start())
        self.assertEqual(server.port, free)
        self.assertEqual(self.written(), "%s\n" % free)
        self.assertTrue(any(str(taken) in line for line in self.logs))

    def test_gives_up_when_every_port_is_taken(self):
        server = self.server([self.occupy(), self.occupy()])

        self.assertFalse(server.start())
        self.assertIsNone(server.port)
        self.assertFalse(os.path.exists(self.port_file))
        self.assertIn("no free port", self.logs[-1])
        server.stop()

    def test_stop_leaves_the_file(self):
        # A stale port only reads as "not running", so it needn't be cleaned up.
        server = self.server([free_port()])
        server.start()
        port = server.port
        server.stop()

        self.assertEqual(self.written(), "%s\n" % port)

    def test_skips_a_port_a_wildcard_listener_has(self):
        # Binding 127.0.0.1 can succeed beside a listener on 0.0.0.0.
        wildcard = socket.socket()
        wildcard.bind(("0.0.0.0", 0))
        wildcard.listen()
        self.holders.append(wildcard)
        taken, free = wildcard.getsockname()[1], free_port()
        server = self.server([taken, free])

        self.assertTrue(server.start())
        self.assertEqual(server.port, free)
        self.assertTrue(any("in use" in line for line in self.logs))

    def test_leaves_no_temp_file_behind(self):
        server = self.server([free_port()])
        server.start()

        self.assertEqual(os.listdir(os.path.dirname(self.port_file)), ["port.txt"])

    def test_still_serves_when_the_file_cannot_be_written(self):
        # A file where the folder should go.
        blocker = os.path.join(self.dir, "blocker")
        open(blocker, "w").close()
        self.port_file = os.path.join(blocker, "port.txt")
        server = self.server([free_port()])

        self.assertTrue(server.start())
        self.assertTrue(any("could not write" in line for line in self.logs))

    def test_two_servers_get_different_ports(self):
        shared = free_port()
        other = free_port()
        first, second = self.server([shared, other]), self.server([shared, other])

        first.start()
        second.start()

        self.assertEqual((first.port, second.port), (shared, other))


class PingPortTest(unittest.TestCase):
    def ping(self, fake_bridge):
        fake_bridge.app = types.SimpleNamespace(
            get_major_version=lambda: 12,
            get_minor_version=lambda: 4,
            get_bugfix_version=lambda: 5,
        )
        return routes.ping(fake_bridge, {})

    def test_reports_the_bound_port(self):
        reply = self.ping(types.SimpleNamespace(port=3351))

        self.assertEqual(reply["port"], 3351)

    def test_reports_none_for_a_bridge_without_one(self):
        reply = self.ping(types.SimpleNamespace())

        self.assertIsNone(reply["port"])


class PortOrderTest(unittest.TestCase):
    def test_tries_3349_then_skips_the_mcp_servers_3350(self):
        self.assertEqual(bridge.PORTS[0], 3349)
        self.assertNotIn(3350, bridge.PORTS)
        self.assertEqual(bridge.PORTS[1], 3351)


if __name__ == "__main__":
    unittest.main()
