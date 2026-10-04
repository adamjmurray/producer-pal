# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

"""`BridgeHTTPServer.busy()`: a connection waits or a request is in progress.

Run: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s remote-script/tests
"""

import os
import shutil
import socket
import sys
import tempfile
import threading
import time
import types
import unittest
from http.server import ThreadingHTTPServer
from socketserver import TCPServer
from unittest import mock

# Keep __pycache__ out of the checkout.
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Only Live's own Python has this module; the package imports it on load.
sys.modules.setdefault("Live", types.ModuleType("Live"))

from Producer_Pal.http_server import BridgeHTTPServer, _Handler, _Server  # noqa: E402

REQUEST = b"GET /x HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"


def free_port():
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def wait_until(condition, timeout=3.0):
    """Poll until `condition()` is true. Returns whether it became true."""
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if condition():
            return True
        time.sleep(0.005)
    return condition()


def read_response(sock):
    """Read one response, by its Content-Length, leaving the connection open."""
    data = b""
    while b"\r\n\r\n" not in data:
        chunk = sock.recv(4096)
        if not chunk:
            break
        data += chunk
    head, _, body = data.partition(b"\r\n\r\n")
    length = 0
    for line in head.split(b"\r\n"):
        if line.lower().startswith(b"content-length:"):
            length = int(line.split(b":")[1])
    while len(body) < length:
        body += sock.recv(4096)
    return head, body


class BusyTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.entered = threading.Event()
        self.release = threading.Event()
        self.sockets = []
        self.server = BridgeHTTPServer(
            [free_port()],
            self.dispatch,
            lambda _message: None,
            os.path.join(self.dir, "port.txt"),
        )

    def tearDown(self):
        # Let a blocked worker finish before the socket goes.
        self.release.set()
        for sock in self.sockets:
            sock.close()
        self.server.stop()
        shutil.rmtree(self.dir)

    def dispatch(self, _method, _path, _params):
        self.entered.set()
        self.release.wait(5)
        return 200, {"ok": True}

    def connect(self):
        sock = socket.create_connection(("127.0.0.1", self.server.port), timeout=5)
        self.sockets.append(sock)
        return sock

    def test_not_busy_before_start(self):
        self.assertFalse(self.server.busy())

    def test_not_busy_when_no_port_could_be_bound(self):
        with socket.socket() as holder:
            holder.bind(("127.0.0.1", 0))
            holder.listen()
            server = BridgeHTTPServer(
                [holder.getsockname()[1]],
                self.dispatch,
                lambda _message: None,
                os.path.join(self.dir, "other.txt"),
            )

            self.assertFalse(server.start())
            self.assertFalse(server.busy())

    def test_not_busy_when_idle_or_after_stop(self):
        self.server.start()
        self.assertFalse(self.server.busy())

        self.server.stop()

        self.assertFalse(self.server.busy())

    def test_busy_while_a_connection_waits_to_be_accepted(self):
        self.server.start()
        # With the serve loop stopped, nothing accepts the connection.
        self.server._server.shutdown()
        self.server._thread.join(5)

        self.connect()

        self.assertTrue(wait_until(self.server.busy))

    def test_busy_while_a_request_is_handled_then_not(self):
        self.server.start()
        sock = self.connect()
        sock.sendall(REQUEST)
        self.assertTrue(self.entered.wait(3))

        self.assertTrue(self.server.busy())

        self.release.set()
        head, _body = read_response(sock)
        self.assertIn(b"200", head)
        self.assertTrue(wait_until(lambda: not self.server.busy()))

    def test_the_connection_closes_after_the_response(self):
        self.release.set()
        self.server.start()
        sock = self.connect()
        sock.sendall(REQUEST)

        head, _body = read_response(sock)

        self.assertIn(b"Connection: close", head)
        self.assertEqual(sock.recv(4096), b"")
        self.assertTrue(wait_until(lambda: not self.server.busy()))

    def test_a_connection_that_sends_nothing_is_not_leaked(self):
        self.server.start()
        sock = self.connect()
        self.assertTrue(wait_until(self.server.busy))

        sock.close()

        self.assertTrue(wait_until(lambda: not self.server.busy()))

    def test_a_connection_that_stalls_times_out(self):
        self.server.start()
        with mock.patch.object(_Handler, "timeout", 0.1):
            sock = self.connect()
            sock.sendall(b"GET /x HTTP/1.1\r\n")
            self.assertTrue(wait_until(self.server.busy))

            self.assertTrue(wait_until(lambda: not self.server.busy()))

    def test_a_malformed_request_is_not_leaked(self):
        self.server.start()
        sock = self.connect()
        sock.sendall(b"not http at all\r\n\r\n")
        sock.recv(4096)

        self.assertTrue(wait_until(lambda: not self.server.busy()))

    def stop_serving(self):
        """Stop the serve loop, so a test can drive one accept itself."""
        self.server.start()
        self.server._server.shutdown()
        self.server._thread.join(5)
        return self.server._server

    def test_a_request_is_counted_from_accept(self):
        inner = self.stop_serving()
        self.connect()
        seen = []
        # A stand-in for the handler thread that hasn't started yet.
        with mock.patch.object(
            ThreadingHTTPServer,
            "process_request",
            side_effect=lambda *_: seen.append(inner.in_progress()),
        ):
            inner._handle_request_noblock()

        self.assertEqual(seen, [True])
        inner.shutdown_request(inner._active.copy().pop())
        self.assertFalse(inner.in_progress())

    def test_accepting_counts_as_busy(self):
        inner = self.stop_serving()
        seen = []

        def accept():
            seen.append((inner.in_progress(), self.server.busy()))
            raise OSError("timed out")

        with mock.patch.object(TCPServer, "get_request", side_effect=accept):
            inner._handle_request_noblock()

        self.assertEqual(seen, [(True, True)])
        self.assertFalse(inner.in_progress())

    def test_an_accept_nobody_answers_gives_up(self):
        inner = self.stop_serving()
        self.assertIsNotNone(inner.socket.gettimeout())

        with self.assertRaises(OSError):
            inner.get_request()

        self.assertFalse(inner.in_progress())

    def test_a_request_verify_refuses_is_not_leaked(self):
        inner = self.stop_serving()
        sock = self.connect()

        with mock.patch.object(_Server, "verify_request", return_value=False):
            inner._handle_request_noblock()

        self.assertFalse(inner.in_progress())
        self.assertEqual(sock.recv(10), b"")

    def test_a_request_the_server_fails_to_start_is_not_leaked(self):
        inner = self.stop_serving()
        sock = self.connect()

        with (
            mock.patch.object(
                ThreadingHTTPServer, "process_request", side_effect=RuntimeError
            ),
            mock.patch.object(_Server, "handle_error"),
        ):
            inner._handle_request_noblock()

        self.assertFalse(inner.in_progress())
        self.assertEqual(sock.recv(10), b"")

    def test_untracking_twice_is_harmless(self):
        self.server.start()
        inner = self.server._server
        inner._active.add("request")

        inner.untrack("request")
        inner.untrack("request")

        self.assertFalse(inner.in_progress())

    def test_a_failing_poll_reads_as_not_busy(self):
        self.server.start()
        for error in (OSError, ValueError):
            with mock.patch.object(self.server._selector, "select", side_effect=error):
                self.assertFalse(self.server.busy())


if __name__ == "__main__":
    unittest.main()
