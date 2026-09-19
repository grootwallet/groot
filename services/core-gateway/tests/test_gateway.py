from __future__ import annotations

import base64
import hashlib
import http.client
import json
import sys
import tempfile
import threading
import unittest
from unittest import mock
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SERVICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE))

from gateway import (  # noqa: E402
    CoreCookie,
    CredentialStore,
    EnrollmentStore,
    Gateway,
    GatewayConfig,
    GatewayServer,
    MAX_HANDLER_CONCURRENCY,
    RequestRejected,
    TokenBuckets,
    restore_response_identities,
    validate_payload,
)


PASSWORD = b"correct horse battery staple"
USERNAME = "test-client"
HASH = "00" * 32


class FakeCoreHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_POST(self) -> None:
        length = int(self.headers["Content-Length"])
        request = json.loads(self.rfile.read(length))
        self.server.requests.append((self.headers, request))  # type: ignore[attr-defined]
        requests = request if isinstance(request, list) else [request]
        responses = []
        for item in requests:
            result = {
                "method": item["method"],
                "params": item["params"],
            }
            responses.append({"result": result, "error": None, "id": item["id"]})
        body = json.dumps(responses if isinstance(request, list) else responses[0]).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format: str, *_args: object) -> None:
        return


class FakeCore(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self):
        self.requests = []
        super().__init__(("127.0.0.1", 0), FakeCoreHandler)


def credential_document(password: bytes = PASSWORD) -> dict:
    salt = b"0123456789abcdef"
    digest = hashlib.scrypt(password, salt=salt, n=1 << 14, r=8, p=1, dklen=32)
    return {
        "version": 1,
        "principals": [
            {
                "username": USERNAME,
                "salt": base64.b64encode(salt).decode(),
                "password_scrypt": base64.b64encode(digest).decode(),
                "n": 1 << 14,
                "r": 8,
                "p": 1,
            }
        ],
    }


def authorization(password: bytes = PASSWORD) -> str:
    return "Basic " + base64.b64encode(USERNAME.encode() + b":" + password).decode()


class GatewayIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        directory = Path(self.temporary.name)
        self.clients = directory / "clients.json"
        self.clients.write_text(json.dumps(credential_document()))
        self.clients.chmod(0o640)
        self.cookie = directory / ".cookie"
        self.cookie.write_bytes(b"__cookie__:core-secret\n")
        self.cookie.chmod(0o640)
        self.enrolled = directory / "enrolled.json"
        enrollment = EnrollmentStore(self.enrolled)
        self.core = FakeCore()
        self.core_thread = threading.Thread(target=self.core.serve_forever, daemon=True)
        self.core_thread.start()
        self.gateway = Gateway(
            GatewayConfig(
                clients=CredentialStore((self.clients, self.enrolled)),
                core_cookie=CoreCookie(self.cookie),
                enrollment=enrollment,
                core_port=self.core.server_port,
            )
        )
        self.server = GatewayServer(("127.0.0.1", 0), self.gateway)
        self.server_thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.server_thread.start()

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.core.shutdown()
        self.core.server_close()
        self.temporary.cleanup()

    def request(
        self,
        body: object,
        *,
        auth: str | None = None,
        method: str = "POST",
        content_type: str = "application/json",
        extra_headers: dict[str, str] | None = None,
        path: str = "/",
    ) -> tuple[int, dict | list | None, dict]:
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=2)
        encoded = json.dumps(body).encode()
        headers = {"Content-Type": content_type}
        if auth is not None:
            headers["Authorization"] = auth
        if extra_headers:
            headers.update(extra_headers)
        connection.request(method, path, body=encoded, headers=headers)
        response = connection.getresponse()
        response_body = response.read()
        result = json.loads(response_body) if response_body else None
        response_headers = dict(response.getheaders())
        connection.close()
        return response.status, result, response_headers

    def test_enrolls_a_unique_revocable_principal_without_shared_credentials(self) -> None:
        status, result, headers = self.request({"version": 1}, path="/enroll")
        self.assertEqual(status, 201)
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertEqual(result["version"], 1)
        self.assertRegex(result["username"], r"^groot-[0-9a-f]{24}$")
        self.assertGreaterEqual(len(result["password"]), 32)

        encoded = base64.b64encode(
            f'{result["username"]}:{result["password"]}'.encode("ascii")
        ).decode("ascii")
        status, rpc_result, _ = self.request(
            {"id": 1, "method": "getblockcount", "params": []},
            auth=f"Basic {encoded}",
        )
        self.assertEqual(status, 200)
        self.assertEqual(rpc_result["result"]["method"], "getblockcount")
        persisted = json.loads(self.enrolled.read_text())
        self.assertNotIn(result["password"], self.enrolled.read_text())
        self.assertEqual(persisted["principals"][0]["username"], result["username"])

    def test_enrollment_is_strict_and_separately_rate_limited(self) -> None:
        status, result, _ = self.request({"version": 2}, path="/enroll")
        self.assertEqual((status, result), (400, {"error": "invalid_request"}))
        for _ in range(8):
            status, _, _ = self.request({"version": 1}, path="/enroll")
            self.assertEqual(status, 201)
        status, result, _ = self.request({"version": 1}, path="/enroll")
        self.assertEqual((status, result), (429, {"error": "rate_limited"}))

    def test_allows_only_validated_groot_method_and_hides_core_cookie(self) -> None:
        status, result, _ = self.request(
            {"jsonrpc": "2.0", "id": "client-id", "method": "getblock", "params": [HASH, 0]},
            auth=authorization(),
        )
        self.assertEqual(status, 200)
        self.assertEqual(result["id"], "client-id")
        self.assertEqual(result["jsonrpc"], "2.0")
        self.assertEqual(result["result"], {"method": "getblock", "params": [HASH, 0]})
        headers, upstream = self.core.requests[0]
        self.assertNotEqual(upstream["id"], "client-id")
        self.assertEqual(upstream["method"], "getblock")
        self.assertEqual(
            headers["Authorization"],
            "Basic " + base64.b64encode(b"__cookie__:core-secret").decode(),
        )
        self.assertNotEqual(headers["Authorization"], authorization())

    def test_rejects_unknown_method_before_contacting_core(self) -> None:
        status, result, _ = self.request(
            {"id": 1, "method": "stop", "params": []}, auth=authorization()
        )
        self.assertEqual((status, result), (403, {"error": "method_not_allowed"}))
        self.assertEqual(self.core.requests, [])

    def test_rejects_invalid_parameters_before_contacting_core(self) -> None:
        status, result, _ = self.request(
            {"id": 1, "method": "getblock", "params": [HASH, 2]}, auth=authorization()
        )
        self.assertEqual((status, result), (400, {"error": "invalid_params"}))
        self.assertEqual(self.core.requests, [])

    def test_batch_is_validated_all_or_nothing_and_identity_is_restored(self) -> None:
        valid = [
            {"jsonrpc": "2.0", "id": 8, "method": "getblockcount", "params": []},
            {"jsonrpc": "2.0", "id": 9, "method": "getblockhash", "params": [12]},
        ]
        status, result, _ = self.request(valid, auth=authorization())
        self.assertEqual(status, 200)
        self.assertEqual([item["id"] for item in result], [8, 9])
        self.assertEqual([item["result"]["method"] for item in result], ["getblockcount", "getblockhash"])

        invalid = valid + [{"id": 10, "method": "getnetworkinfo", "params": []}]
        status, result, _ = self.request(invalid, auth=authorization())
        self.assertEqual((status, result), (403, {"error": "method_not_allowed"}))
        self.assertEqual(len(self.core.requests), 1)

    def test_single_item_batch_preserves_batch_shape(self) -> None:
        batch = [
            {"jsonrpc": "2.0", "id": "solo", "method": "getblock", "params": [HASH, 1]}
        ]
        status, result, _ = self.request(batch, auth=authorization())

        self.assertEqual(status, 200)
        self.assertIsInstance(result, list)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["id"], "solo")
        self.assertEqual(result[0]["jsonrpc"], "2.0")
        _, upstream = self.core.requests[0]
        self.assertIsInstance(upstream, list)
        self.assertEqual(len(upstream), 1)
        self.assertEqual(upstream[0]["method"], "getblock")

    def test_requires_valid_basic_credentials_and_post(self) -> None:
        request = {"id": 1, "method": "getblockcount", "params": []}
        status, _, headers = self.request(request)
        self.assertEqual(status, 401)
        self.assertEqual(headers["WWW-Authenticate"], 'Basic realm="groot-gateway"')
        status, _, _ = self.request(request, auth=authorization(b"wrong password value"))
        self.assertEqual(status, 401)
        status, result, headers = self.request(request, auth=authorization(), method="GET")
        self.assertEqual((status, result), (405, {"error": "method_not_allowed"}))
        self.assertEqual(headers["Allow"], "POST")
        self.assertEqual(self.core.requests, [])

    def test_rejects_wrong_content_type(self) -> None:
        status, result, _ = self.request(
            {"id": 1, "method": "getblockcount", "params": []},
            auth=authorization(),
            content_type="text/plain",
        )
        self.assertEqual((status, result), (415, {"error": "unsupported_media_type"}))
        self.assertEqual(self.core.requests, [])

    def test_accepts_only_a_valid_nginx_source_address_header(self) -> None:
        request = {"id": 1, "method": "getblockcount", "params": []}
        status, _, _ = self.request(
            request,
            auth=authorization(),
            extra_headers={"X-Real-IP": "198.51.100.10"},
        )
        self.assertEqual(status, 200)
        status, result, _ = self.request(
            request,
            auth=authorization(),
            extra_headers={"X-Real-IP": "not-an-ip"},
        )
        self.assertEqual((status, result), (400, {"error": "invalid_request"}))

    def test_rate_limits_source_and_authenticated_principal(self) -> None:
        request = {"id": 1, "method": "getblockcount", "params": []}
        self.gateway.ip_limits = TokenBuckets(rate=0.01, burst=1)
        status, _, _ = self.request(request, auth=authorization())
        self.assertEqual(status, 200)
        status, result, _ = self.request(request, auth=authorization())
        self.assertEqual((status, result), (429, {"error": "rate_limited"}))

        self.gateway.ip_limits = TokenBuckets(rate=100, burst=100)
        self.gateway.principal_limits = TokenBuckets(rate=0.01, burst=1)
        status, _, _ = self.request(request, auth=authorization())
        self.assertEqual(status, 200)
        status, result, _ = self.request(request, auth=authorization())
        self.assertEqual((status, result), (429, {"error": "rate_limited"}))

    def test_handler_saturation_returns_explicit_busy_response(self) -> None:
        acquired = 0
        try:
            for _ in range(MAX_HANDLER_CONCURRENCY):
                self.assertTrue(self.server._handler_slots.acquire(blocking=False))
                acquired += 1
            status, result, headers = self.request(
                {"id": 1, "method": "getblockcount", "params": []},
                auth=authorization(),
            )
            self.assertEqual((status, result), (503, {"error": "gateway_busy"}))
            self.assertEqual(headers["Cache-Control"], "no-store")
            self.assertEqual(headers["Connection"], "close")
        finally:
            for _ in range(acquired):
                self.server._handler_slots.release()

    def test_rejects_a_second_indexed_scan_before_contacting_core(self) -> None:
        self.assertTrue(self.gateway.scan_slot.acquire(blocking=False))
        try:
            status, result, _ = self.request(
                {
                    "id": 1,
                    "method": "scanblocks",
                    "params": ["start", ["raw(0014" + "11" * 20 + ")"], 1, 100, "basic"],
                },
                auth=authorization(),
            )
            self.assertEqual((status, result), (503, {"error": "gateway_busy"}))
            self.assertEqual(self.core.requests, [])
        finally:
            self.gateway.scan_slot.release()

    def test_rejects_an_oversized_core_response(self) -> None:
        request = {"id": 1, "method": "getblockcount", "params": []}
        with mock.patch("gateway.MAX_RESPONSE_BYTES", 16):
            status, result, _ = self.request(request, auth=authorization())
        self.assertEqual((status, result), (502, {"error": "core_unavailable"}))

    def test_uses_the_extended_timeout_only_for_indexed_block_scans(self) -> None:
        response = mock.Mock(status=200)
        response.read.return_value = b"{}"
        connection = mock.Mock()
        connection.getresponse.return_value = response
        with mock.patch("gateway.http.client.HTTPConnection", return_value=connection) as factory:
            self.gateway._call_core({"id": 1, "method": "scanblocks", "params": []})
            self.assertEqual(factory.call_args.kwargs["timeout"], 120.0)
            self.gateway._call_core({"id": 2, "method": "getblockcount", "params": []})
            self.assertEqual(factory.call_args.kwargs["timeout"], 10.0)


class GatewayValidationTests(unittest.TestCase):
    def test_outer_proxy_timeout_exceeds_the_indexed_scan_timeout(self) -> None:
        nginx = (SERVICE / "deploy" / "nginx-location.conf").read_text()
        self.assertIn("scan_timeout_seconds: float = 120.0", (SERVICE / "gateway.py").read_text())
        self.assertIn("proxy_read_timeout 125s;", nginx)

    def test_rejects_world_accessible_private_files(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "clients.json"
            path.write_text(json.dumps(credential_document()))
            path.chmod(0o644)
            with self.assertRaises(ValueError):
                CredentialStore(path).authenticate(authorization())

    def test_rejects_symlinked_private_files(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            target = directory / "target.json"
            target.write_text(json.dumps(credential_document()))
            target.chmod(0o640)
            link = directory / "clients.json"
            link.symlink_to(target)
            with self.assertRaises(OSError):
                CredentialStore(link).authenticate(authorization())

    def test_rejects_excessively_nested_json(self) -> None:
        nested = ("[" * 1200 + "0" + "]" * 1200).encode()
        with self.assertRaises(RequestRejected) as rejection:
            validate_payload(nested)
        self.assertIn(rejection.exception.code, {"invalid_json", "invalid_request"})

    def test_supported_method_parameter_contracts(self) -> None:
        accepted = [
            {"id": 1, "method": "getblockchaininfo", "params": []},
            {"id": 1, "method": "getblock", "params": [HASH, 0]},
            {"id": 1, "method": "getblock", "params": [HASH, 1]},
            {"id": 1, "method": "getblockfilter", "params": [HASH]},
            {"id": 1, "method": "getblockfilter", "params": [HASH, "basic"]},
            {
                "id": 1,
                "method": "scanblocks",
                "params": ["start", ["raw(0014" + "11" * 20 + ")"], 100, 200, "basic"],
            },
            {
                "id": 1,
                "method": "getdescriptoractivity",
                "params": [[], ["raw(0014" + "11" * 20 + ")"], True],
            },
            {"id": 1, "method": "help", "params": ["scanblocks"]},
            {"id": 1, "method": "help", "params": ["getdescriptoractivity"]},
            {"id": 1, "method": "getrawmempool", "params": []},
            {"id": 1, "method": "getrawtransaction", "params": [HASH, False]},
            {"id": 1, "method": "getrawtransaction", "params": [HASH, True, HASH]},
            {"id": 1, "method": "getmempoolentry", "params": [HASH]},
            {"id": 1, "method": "getmempoolinfo", "params": []},
            {"id": 1, "method": "getindexinfo", "params": []},
            {"id": 1, "method": "estimatesmartfee", "params": [6, "CONSERVATIVE"]},
            {"id": 1, "method": "sendrawtransaction", "params": ["0200"]},
        ]
        for request in accepted:
            with self.subTest(request["method"]):
                self.assertEqual(validate_payload(json.dumps(request).encode()), ([request], False))

    def test_rejects_notifications_extra_keys_and_oversized_batches(self) -> None:
        rejected = [
            {"method": "getblockcount", "params": []},
            {"id": 1, "method": "getblockcount", "params": [], "wallet": "other"},
            [{"id": index, "method": "getblockcount", "params": []} for index in range(257)],
        ]
        for request in rejected:
            with self.subTest(type=type(request).__name__):
                with self.assertRaises(RequestRejected):
                    validate_payload(json.dumps(request).encode())

    def test_rejects_broader_core_options_groot_does_not_use(self) -> None:
        rejected = [
            {"id": 1, "method": "getrawmempool", "params": [True]},
            {"id": 1, "method": "getblock", "params": [HASH]},
            {"id": 1, "method": "getblock", "params": [HASH, True]},
            {"id": 1, "method": "getblock", "params": [HASH, 2]},
            {"id": 1, "method": "getblockfilter", "params": []},
            {"id": 1, "method": "getblockfilter", "params": [HASH, "extended"]},
            {"id": 1, "method": "scanblocks", "params": ["status"]},
            {
                "id": 1,
                "method": "scanblocks",
                "params": ["start", ["addr(bc1qexample)"], 100, 200, "basic"],
            },
            {
                "id": 1,
                "method": "scanblocks",
                "params": ["start", ["raw(0014aa)"], 200, 100, "basic"],
            },
            {
                "id": 1,
                "method": "getdescriptoractivity",
                "params": [[HASH], ["raw(0014" + "11" * 20 + ")"], True],
            },
            {
                "id": 1,
                "method": "getdescriptoractivity",
                "params": [[], ["raw(0014" + "11" * 20 + ")"], False],
            },
            {"id": 1, "method": "help", "params": []},
            {"id": 1, "method": "help", "params": ["stop"]},
            {"id": 1, "method": "getindexinfo", "params": ["basic block filter index"]},
            {"id": 1, "method": "sendrawtransaction", "params": ["0200", 0.1]},
        ]
        for request in rejected:
            with self.subTest(request["method"]):
                with self.assertRaises(RequestRejected):
                    validate_payload(json.dumps(request).encode())

    def test_core_errors_are_bounded_and_drop_data(self) -> None:
        body = json.dumps(
            {"id": 4, "result": None, "error": {"code": -5, "message": "missing", "data": "secret"}}
        ).encode()
        restored = json.loads(restore_response_identities(body, {4: ("original", "2.0")}, False))
        self.assertEqual(restored["id"], "original")
        self.assertEqual(restored["error"], {"code": -5, "message": "missing"})
        self.assertNotIn("data", restored["error"])


if __name__ == "__main__":
    unittest.main()
