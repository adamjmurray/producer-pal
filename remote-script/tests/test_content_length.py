# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: MIT

"""A POST with a bad Content-Length is answered with a 400, not dropped, and
one declaring a body over the cap with a 413, before the body is read.

Run: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s remote-script/tests
"""

import json
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

from Producer_Pal.http_server import MAX_BODY_BYTES, BridgeHTTPServer  # noqa: E402


def free_port():
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


class ContentLengthTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.server = BridgeHTTPServer(
            [free_port()],
            lambda method, path, params: (200, {"params": params}),
            lambda _message: None,
            os.path.join(self.dir, "port.txt"),
        )
        self.assertTrue(self.server.start())

    def tearDown(self):
        self.server.stop()
        shutil.rmtree(self.dir)

    def post(self, length_header, body=b"{}"):
        """Send a POST; returns (status, parsed JSON body)."""
        request = b"POST /x HTTP/1.1\r\nHost: 127.0.0.1\r\n"
        if length_header is not None:
            request += b"Content-Length: " + length_header + b"\r\n"
        request += b"\r\n" + body
        with socket.create_connection(("127.0.0.1", self.server.port), timeout=5) as sock:
            sock.sendall(request)
            data = b""
            while True:
                chunk = sock.recv(4096)
                if not chunk:
                    break
                data += chunk
        head, _, payload = data.partition(b"\r\n\r\n")
        status = int(head.split(b" ")[1])
        return status, json.loads(payload)

    def assert_rejected(self, length_header):
        status, payload = self.post(length_header)
        self.assertEqual(status, 400)
        self.assertEqual(payload, {"error": "invalid Content-Length"})

    def test_non_numeric_is_rejected(self):
        self.assert_rejected(b"abc")

    def test_negative_is_rejected(self):
        self.assert_rejected(b"-5")

    def test_signed_decimal_and_underscored_values_are_rejected(self):
        for value in (b"+2", b"2.5", b"1_0", b"0x2", "٢".encode("utf-8")):
            with self.subTest(value=value):
                self.assert_rejected(value)

    def test_valid_length_still_reads_the_body(self):
        status, payload = self.post(b"12", b'{"a":"body"}')

        self.assertEqual(status, 200)
        self.assertEqual(payload, {"params": {"a": "body"}})

    def test_missing_or_zero_length_means_no_body(self):
        for header in (None, b"0"):
            with self.subTest(header=header):
                status, payload = self.post(header, b"")
                self.assertEqual(status, 200)
                self.assertEqual(payload, {"params": {}})

    def test_body_over_the_cap_is_refused_unread(self):
        # No body is sent: an answer at all shows it wasn't waited for.
        status, payload = self.post(str(MAX_BODY_BYTES + 1).encode(), b"")

        self.assertEqual(status, 413)
        self.assertEqual(
            payload,
            {"error": "request body too large: %d bytes, max %d" % (MAX_BODY_BYTES + 1, MAX_BODY_BYTES)},
        )

    def test_body_at_the_cap_is_read(self):
        body = b'{"a":"' + b"x" * (MAX_BODY_BYTES - 8) + b'"}'
        status, payload = self.post(str(len(body)).encode(), body)

        self.assertEqual(status, 200)
        self.assertEqual(len(payload["params"]["a"]), MAX_BODY_BYTES - 8)


if __name__ == "__main__":
    unittest.main()
