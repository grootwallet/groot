#!/usr/bin/env python3
"""Narrow, authenticated JSON-RPC gateway for Groot's Bitcoin Core calls."""

from __future__ import annotations

import argparse
import base64
import binascii
import hashlib
import hmac
import http.client
import ipaddress
import json
import os
import re
import stat
import threading
import time
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable


MAX_REQUEST_BYTES = 2 * 1024 * 1024
MAX_RESPONSE_BYTES = 16 * 1024 * 1024
MAX_BATCH_SIZE = 256
MAX_UPSTREAM_CONCURRENCY = 16
MAX_HANDLER_CONCURRENCY = 16
BUSY_RESPONSE_BODY = b'{"error":"gateway_busy"}'
BUSY_RESPONSE = (
    b"HTTP/1.1 503 Service Unavailable\r\n"
    b"Content-Type: application/json\r\n"
    + f"Content-Length: {len(BUSY_RESPONSE_BODY)}\r\n".encode("ascii")
    + b"Cache-Control: no-store\r\n"
    b"Connection: close\r\n"
    b"\r\n"
    + BUSY_RESPONSE_BODY
)
HEX_64 = re.compile(r"^[0-9a-fA-F]{64}$")
TX_HEX = re.compile(r"^(?:[0-9a-fA-F]{2})+$")
USERNAME = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


class RequestRejected(Exception):
    def __init__(self, status: int, code: str):
        super().__init__(code)
        self.status = status
        self.code = code


@dataclass(frozen=True)
class Principal:
    username: str
    salt: bytes
    password_scrypt: bytes
    n: int
    r: int
    p: int


class CredentialStore:
    def __init__(self, path: Path):
        self._path = path
        self._lock = threading.Lock()
        self._stamp: tuple[int, int] | None = None
        self._principals: dict[str, Principal] = {}

    def authenticate(self, authorization: str | None) -> str | None:
        parsed = parse_basic_authorization(authorization)
        if parsed is None:
            return None
        username, password = parsed
        self._reload_if_changed()
        principal = self._principals.get(username)
        if principal is None:
            # Match the cost of a real credential check without keeping a shared
            # fallback secret or revealing whether a username exists.
            hashlib.scrypt(
                password,
                salt=b"groot-unknown-client",
                n=1 << 14,
                r=8,
                p=1,
                dklen=32,
            )
            return None
        candidate = hashlib.scrypt(
            password,
            salt=principal.salt,
            n=principal.n,
            r=principal.r,
            p=principal.p,
            dklen=len(principal.password_scrypt),
        )
        return username if hmac.compare_digest(candidate, principal.password_scrypt) else None

    def _reload_if_changed(self) -> None:
        stamp, raw = read_private_file(self._path, 256 * 1024)
        with self._lock:
            if stamp == self._stamp:
                return
            document = json.loads(raw)
            if document.get("version") != 1 or not isinstance(document.get("principals"), list):
                raise ValueError("unsupported client credential file")
            principals: dict[str, Principal] = {}
            for item in document["principals"]:
                username = item.get("username")
                n, r, p = item.get("n"), item.get("r"), item.get("p")
                if (
                    not isinstance(username, str)
                    or USERNAME.fullmatch(username) is None
                    or username in principals
                    or not isinstance(n, int)
                    or n < 1 << 14
                    or n > 1 << 18
                    or n & (n - 1)
                    or r != 8
                    or p != 1
                ):
                    raise ValueError("invalid client credential record")
                salt = decode_b64(item.get("salt"), 16, 64)
                password_scrypt = decode_b64(item.get("password_scrypt"), 32, 32)
                principals[username] = Principal(username, salt, password_scrypt, n, r, p)
            if not principals:
                raise ValueError("at least one client principal is required")
            self._principals = principals
            self._stamp = stamp


class CoreCookie:
    def __init__(self, path: Path):
        self._path = path
        self._lock = threading.Lock()
        self._stamp: tuple[int, int] | None = None
        self._authorization = ""

    def authorization(self) -> str:
        stamp, cookie = read_private_file(self._path, 4096)
        with self._lock:
            if stamp != self._stamp:
                if b":" not in cookie:
                    raise ValueError("invalid Bitcoin Core cookie")
                cookie = cookie.strip()
                if not cookie or b"\r" in cookie or b"\n" in cookie:
                    raise ValueError("invalid Bitcoin Core cookie")
                self._authorization = "Basic " + base64.b64encode(cookie).decode("ascii")
                self._stamp = stamp
            return self._authorization


def read_private_file(path: Path, maximum: int) -> tuple[tuple[int, int], bytes]:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(path, flags)
    try:
        metadata = os.fstat(descriptor)
        mode = stat.S_IMODE(metadata.st_mode)
        if not stat.S_ISREG(metadata.st_mode) or mode & 0o027:
            raise ValueError("private file permissions are unsafe")
        if metadata.st_size > maximum:
            raise ValueError("private file is too large")
        chunks: list[bytes] = []
        remaining = maximum + 1
        while remaining:
            chunk = os.read(descriptor, min(64 * 1024, remaining))
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
        value = b"".join(chunks)
        if len(value) > maximum:
            raise ValueError("private file is too large")
        return (metadata.st_mtime_ns, metadata.st_size), value
    finally:
        os.close(descriptor)


class TokenBuckets:
    def __init__(self, rate: float, burst: float):
        self._rate = rate
        self._burst = burst
        self._lock = threading.Lock()
        self._buckets: dict[str, tuple[float, float]] = {}

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            tokens, updated = self._buckets.get(key, (self._burst, now))
            tokens = min(self._burst, tokens + (now - updated) * self._rate)
            allowed = tokens >= 1.0
            if allowed:
                tokens -= 1.0
            self._buckets[key] = (tokens, now)
            if len(self._buckets) > 4096:
                expiry = now - (self._burst / self._rate) * 2
                self._buckets = {
                    item_key: value
                    for item_key, value in self._buckets.items()
                    if value[1] >= expiry
                }
            return allowed


@dataclass(frozen=True)
class GatewayConfig:
    clients: CredentialStore
    core_cookie: CoreCookie
    core_host: str = "127.0.0.1"
    core_port: int = 8332
    core_timeout_seconds: float = 10.0


class Gateway:
    def __init__(self, config: GatewayConfig):
        self.config = config
        self.ip_limits = TokenBuckets(rate=10.0, burst=20.0)
        self.principal_limits = TokenBuckets(rate=25.0, burst=100.0)
        self.upstream_slots = threading.BoundedSemaphore(MAX_UPSTREAM_CONCURRENCY)
        self._id_lock = threading.Lock()
        self._next_id = 0

    def handle(self, authorization: str | None, client_ip: str, body: bytes) -> bytes:
        if not self.ip_limits.allow(client_ip):
            raise RequestRejected(429, "rate_limited")
        try:
            principal = self.config.clients.authenticate(authorization)
        except (OSError, ValueError, json.JSONDecodeError):
            raise RequestRejected(503, "gateway_unavailable") from None
        if principal is None:
            raise RequestRejected(401, "unauthorized")
        if not self.principal_limits.allow(principal):
            raise RequestRejected(429, "rate_limited")
        requests = validate_payload(body)
        upstream_requests, identities = self._reconstruct(requests)
        response = self._call_core(upstream_requests)
        return restore_response_identities(response, identities, len(requests) > 1)

    def _reconstruct(self, requests: list[dict[str, Any]]) -> tuple[Any, dict[int, tuple[Any, str | None]]]:
        rebuilt: list[dict[str, Any]] = []
        identities: dict[int, tuple[Any, str | None]] = {}
        with self._id_lock:
            for request in requests:
                self._next_id += 1
                upstream_id = self._next_id
                identities[upstream_id] = (request["id"], request.get("jsonrpc"))
                item: dict[str, Any] = {
                    "id": upstream_id,
                    "method": request["method"],
                    "params": request.get("params", []),
                }
                if request.get("jsonrpc") is not None:
                    item["jsonrpc"] = request["jsonrpc"]
                rebuilt.append(item)
        return (rebuilt if len(rebuilt) > 1 else rebuilt[0]), identities

    def _call_core(self, request: Any) -> bytes:
        encoded = json.dumps(request, separators=(",", ":"), ensure_ascii=True).encode("ascii")
        if not self.upstream_slots.acquire(blocking=False):
            raise RequestRejected(503, "gateway_busy")
        try:
            try:
                authorization = self.config.core_cookie.authorization()
                connection = http.client.HTTPConnection(
                    self.config.core_host,
                    self.config.core_port,
                    timeout=self.config.core_timeout_seconds,
                )
                connection.request(
                    "POST",
                    "/",
                    body=encoded,
                    headers={
                        "Authorization": authorization,
                        "Content-Type": "application/json",
                        "Connection": "close",
                    },
                )
                response = connection.getresponse()
                response_body = response.read(MAX_RESPONSE_BYTES + 1)
                connection.close()
            except (OSError, ValueError, http.client.HTTPException):
                raise RequestRejected(502, "core_unavailable") from None
        finally:
            self.upstream_slots.release()
        if response.status != 200 or len(response_body) > MAX_RESPONSE_BYTES:
            raise RequestRejected(502, "core_unavailable")
        return response_body


def decode_b64(value: Any, minimum: int, maximum: int) -> bytes:
    if not isinstance(value, str):
        raise ValueError("invalid base64 value")
    try:
        decoded = base64.b64decode(value, validate=True)
    except (ValueError, binascii.Error) as error:
        raise ValueError("invalid base64 value") from error
    if not minimum <= len(decoded) <= maximum:
        raise ValueError("invalid decoded length")
    return decoded


def parse_basic_authorization(value: str | None) -> tuple[str, bytes] | None:
    if not value or not value.startswith("Basic ") or len(value) > 1024:
        return None
    try:
        decoded = base64.b64decode(value[6:], validate=True)
        username_bytes, password = decoded.split(b":", 1)
        username = username_bytes.decode("ascii")
    except (ValueError, UnicodeDecodeError, binascii.Error):
        return None
    if USERNAME.fullmatch(username) is None or not 16 <= len(password) <= 256:
        return None
    return username, password


def validate_payload(body: bytes) -> list[dict[str, Any]]:
    if not body or len(body) > MAX_REQUEST_BYTES:
        raise RequestRejected(413, "request_too_large")
    try:
        payload = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError, RecursionError):
        raise RequestRejected(400, "invalid_json") from None
    is_batch = isinstance(payload, list)
    requests = payload if is_batch else [payload]
    if not requests or len(requests) > MAX_BATCH_SIZE:
        raise RequestRejected(400, "invalid_batch")
    for request in requests:
        validate_request(request)
    return requests


def validate_request(request: Any) -> None:
    if not isinstance(request, dict) or not set(request).issubset({"jsonrpc", "id", "method", "params"}):
        raise RequestRejected(400, "invalid_request")
    if "id" not in request or isinstance(request["id"], (dict, list, bool)):
        raise RequestRejected(400, "invalid_request")
    if request.get("jsonrpc") not in (None, "1.0", "2.0"):
        raise RequestRejected(400, "invalid_request")
    method = request.get("method")
    params = request.get("params", [])
    if not isinstance(method, str) or not isinstance(params, list):
        raise RequestRejected(400, "invalid_request")
    validator = METHOD_VALIDATORS.get(method)
    if validator is None:
        raise RequestRejected(403, "method_not_allowed")
    if not validator(params):
        raise RequestRejected(400, "invalid_params")


def no_params(params: list[Any]) -> bool:
    return not params


def hash_value(value: Any) -> bool:
    return isinstance(value, str) and HEX_64.fullmatch(value) is not None


def nonnegative_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= 10_000_000


def block_params(params: list[Any]) -> bool:
    return (
        len(params) == 2
        and hash_value(params[0])
        and isinstance(params[1], int)
        and not isinstance(params[1], bool)
        and params[1] in {0, 1}
    )


def block_filter_params(params: list[Any]) -> bool:
    return (
        1 <= len(params) <= 2
        and hash_value(params[0])
        and (len(params) == 1 or params[1] == "basic")
    )


def raw_transaction_params(params: list[Any]) -> bool:
    return (
        2 <= len(params) <= 3
        and hash_value(params[0])
        and isinstance(params[1], bool)
        and (len(params) == 2 or params[2] is None or hash_value(params[2]))
    )


def raw_mempool_params(params: list[Any]) -> bool:
    return not params


def index_info_params(params: list[Any]) -> bool:
    return not params


def smart_fee_params(params: list[Any]) -> bool:
    return (
        1 <= len(params) <= 2
        and isinstance(params[0], int)
        and not isinstance(params[0], bool)
        and 1 <= params[0] <= 1008
        and (
            len(params) == 1
            or params[1] is None
            or (
                isinstance(params[1], str)
                and params[1].upper() in {"ECONOMICAL", "CONSERVATIVE"}
            )
        )
    )


def send_transaction_params(params: list[Any]) -> bool:
    return (
        len(params) == 1
        and isinstance(params[0], str)
        and 2 <= len(params[0]) <= 1_000_000
        and TX_HEX.fullmatch(params[0]) is not None
    )


METHOD_VALIDATORS: dict[str, Callable[[list[Any]], bool]] = {
    "getblockchaininfo": no_params,
    "getblockcount": no_params,
    "getblockhash": lambda params: len(params) == 1 and nonnegative_int(params[0]),
    "getblock": block_params,
    "getblockfilter": block_filter_params,
    "getrawmempool": raw_mempool_params,
    "getrawtransaction": raw_transaction_params,
    "getmempoolentry": lambda params: len(params) == 1 and hash_value(params[0]),
    "getmempoolinfo": no_params,
    "getindexinfo": index_info_params,
    "estimatesmartfee": smart_fee_params,
    "sendrawtransaction": send_transaction_params,
}


def restore_response_identities(
    upstream_body: bytes,
    identities: dict[int, tuple[Any, str | None]],
    batch: bool,
) -> bytes:
    try:
        payload = json.loads(upstream_body)
    except (UnicodeDecodeError, json.JSONDecodeError, RecursionError):
        raise RequestRejected(502, "invalid_core_response") from None
    responses = payload if isinstance(payload, list) else [payload]
    if len(responses) != len(identities):
        raise RequestRejected(502, "invalid_core_response")
    restored: dict[int, dict[str, Any]] = {}
    for response in responses:
        if not isinstance(response, dict) or not set(response).issubset({"jsonrpc", "id", "result", "error"}):
            raise RequestRejected(502, "invalid_core_response")
        upstream_id = response.get("id")
        if not isinstance(upstream_id, int) or upstream_id not in identities or upstream_id in restored:
            raise RequestRejected(502, "invalid_core_response")
        original_id, original_version = identities[upstream_id]
        item: dict[str, Any] = {"result": response.get("result"), "error": sanitize_core_error(response.get("error")), "id": original_id}
        if original_version == "2.0":
            item["jsonrpc"] = "2.0"
        restored[upstream_id] = item
    ordered = [restored[item] for item in identities]
    output: Any = ordered if batch else ordered[0]
    return json.dumps(output, separators=(",", ":"), ensure_ascii=True).encode("ascii")


def sanitize_core_error(error: Any) -> Any:
    if error is None:
        return None
    if not isinstance(error, dict) or not isinstance(error.get("code"), int):
        raise RequestRejected(502, "invalid_core_response")
    message = error.get("message")
    if not isinstance(message, str):
        message = "Bitcoin Core rejected the request"
    return {"code": error["code"], "message": message[:512]}


class GatewayHandler(BaseHTTPRequestHandler):
    server_version = "GrootGateway"
    sys_version = ""
    protocol_version = "HTTP/1.1"

    @property
    def gateway(self) -> Gateway:
        return self.server.gateway  # type: ignore[attr-defined]

    def setup(self) -> None:
        super().setup()
        self.connection.settimeout(15)

    def do_POST(self) -> None:
        content_lengths = self.headers.get_all("Content-Length", [])
        authorizations = self.headers.get_all("Authorization", [])
        if (
            self.path != "/"
            or self.headers.get("Transfer-Encoding") is not None
            or len(content_lengths) != 1
            or len(authorizations) > 1
        ):
            self._error(400, "invalid_request")
            return
        content_type = self.headers.get_content_type()
        if content_type != "application/json":
            self._error(415, "unsupported_media_type")
            return
        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self._error(411, "content_length_required")
            return
        if length <= 0 or length > MAX_REQUEST_BYTES:
            self._error(413, "request_too_large")
            return
        body = self.rfile.read(length)
        if len(body) != length:
            self._error(400, "invalid_request")
            return
        try:
            client_ip = self._client_ip()
            response = self.gateway.handle(
                self.headers.get("Authorization"), client_ip, body
            )
        except RequestRejected as error:
            self._error(error.status, error.code)
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(response)

    def _client_ip(self) -> str:
        peer = ipaddress.ip_address(self.client_address[0])
        forwarded = self.headers.get("X-Real-IP")
        if forwarded is None:
            return str(peer)
        if not peer.is_loopback:
            raise RequestRejected(400, "invalid_request")
        try:
            return str(ipaddress.ip_address(forwarded))
        except ValueError:
            raise RequestRejected(400, "invalid_request") from None

    def do_GET(self) -> None:
        self._error(405, "method_not_allowed")

    def do_HEAD(self) -> None:
        self._error(405, "method_not_allowed", include_body=False)

    def do_PUT(self) -> None:
        self._error(405, "method_not_allowed")

    def do_DELETE(self) -> None:
        self._error(405, "method_not_allowed")

    def log_message(self, _format: str, *_args: Any) -> None:
        # Request paths, bodies, RPC methods, transaction ids, and credentials
        # must not enter process logs.
        return

    def _error(self, status: int, code: str, include_body: bool = True) -> None:
        body = json.dumps({"error": code}, separators=(",", ":")).encode("ascii")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Allow", "POST")
        if status == 401:
            self.send_header("WWW-Authenticate", 'Basic realm="groot-gateway"')
        self.send_header("Content-Length", str(len(body) if include_body else 0))
        self.send_header("Connection", "close")
        self.end_headers()
        if include_body:
            self.wfile.write(body)


class GatewayServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 64

    def __init__(self, address: tuple[str, int], gateway: Gateway):
        self.gateway = gateway
        self._handler_slots = threading.BoundedSemaphore(MAX_HANDLER_CONCURRENCY)
        super().__init__(address, GatewayHandler)

    def process_request(self, request: Any, client_address: Any) -> None:
        if not self._handler_slots.acquire(blocking=False):
            # Closing a saturated connection without an HTTP response makes
            # NGINX surface a misleading 502. Return an explicit bounded busy
            # response without allocating another handler thread.
            try:
                request.settimeout(1)
                request.sendall(BUSY_RESPONSE)
            except OSError:
                pass
            finally:
                self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self._handler_slots.release()
            raise

    def process_request_thread(self, request: Any, client_address: Any) -> None:
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._handler_slots.release()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--listen", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8432)
    parser.add_argument("--clients", type=Path, required=True)
    parser.add_argument("--core-cookie", type=Path, required=True)
    parser.add_argument("--core-port", type=int, default=8332)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.listen not in {"127.0.0.1", "::1"}:
        raise SystemExit("the gateway must listen on loopback")
    if not 1 <= args.port <= 65535 or not 1 <= args.core_port <= 65535:
        raise SystemExit("invalid port")
    gateway = Gateway(
        GatewayConfig(
            clients=CredentialStore(args.clients),
            core_cookie=CoreCookie(args.core_cookie),
            core_port=args.core_port,
        )
    )
    server = GatewayServer((args.listen, args.port), gateway)
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
