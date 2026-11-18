#!/usr/bin/env python3
"""Create or rotate one Groot gateway client credential without storing its password."""

from __future__ import annotations

import argparse
import base64
import getpass
import grp
import hashlib
import json
import os
import secrets
import stat
import tempfile
from pathlib import Path

from gateway import EnrollmentStore, USERNAME, is_public_username


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--clients", type=Path, required=True)
    parser.add_argument("--username")
    parser.add_argument(
        "--issuer-clients", type=Path,
        help="enrolled-client file owning issuer state when --clients names a separate manual store",
    )
    parser.add_argument("--group", default="groot-gateway")
    action = parser.add_mutually_exclusive_group()
    action.add_argument(
        "--generate",
        action="store_true",
        help="generate and print a one-time password instead of prompting",
    )
    action.add_argument(
        "--remove",
        action="store_true",
        help="revoke the named principal without prompting for a password",
    )
    action.add_argument(
        "--initialize-enrollment", action="store_true",
        help="explicitly create the separate owner-only issuer state; never overwrite it",
    )
    return parser.parse_args()


def atomic_write(path: Path, document: dict, group_id: int) -> None:
    path.parent.mkdir(mode=0o750, parents=True, exist_ok=True)
    owner_id = -1
    target_group_id = group_id
    mode = 0o640
    if path.exists():
        metadata = os.stat(path, follow_symlinks=False)
        if not stat.S_ISREG(metadata.st_mode) or stat.S_IMODE(metadata.st_mode) & 0o027:
            raise SystemExit("client credential file permissions are unsafe")
        owner_id = metadata.st_uid
        target_group_id = metadata.st_gid
        mode = stat.S_IMODE(metadata.st_mode)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        os.fchown(descriptor, owner_id, target_group_id)
        os.fchmod(descriptor, mode)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(document, handle, separators=(",", ":"), sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main() -> None:
    args = parse_args()
    if args.initialize_enrollment:
        if os.geteuid() == 0:
            raise SystemExit("initialize enrollment as the unprivileged gateway service user")
        if args.username is not None:
            raise SystemExit("initialization does not accept a username")
        EnrollmentStore(args.clients).initialize()
        print("Initialized enrollment issuer state; back it up privately before enabling enrollment.")
        return
    if args.username is None or USERNAME.fullmatch(args.username) is None:
        raise SystemExit("username must contain 1-64 letters, digits, dots, dashes, or underscores")
    try:
        group_id = grp.getgrnam(args.group).gr_gid
    except KeyError:
        raise SystemExit(f"group does not exist: {args.group}") from None
    if args.clients.exists():
        document = json.loads(args.clients.read_text(encoding="utf-8"))
        if document.get("version") != 1 or not isinstance(document.get("principals"), list):
            raise SystemExit("unsupported client credential file")
    else:
        document = {"version": 1, "principals": []}
    if args.remove:
        retained = [
            item for item in document["principals"] if item.get("username") != args.username
        ]
        if is_public_username(args.username):
            issuer_clients = getattr(args, "issuer_clients", None) or args.clients
            issuer_state = issuer_clients.with_name(f"{issuer_clients.name}.issuer.json")
            if not issuer_clients.exists() or not issuer_state.exists():
                raise SystemExit(
                    "public credential revocation requires its readable issuer state; "
                    "restore it or select --issuer-clients before removing a legacy record"
                )
            try:
                EnrollmentStore(issuer_clients).revoke(args.username)
            except (OSError, ValueError):
                raise SystemExit(
                    "public credential revocation failed: issuer state is unsafe, corrupt, "
                    "unwritable, or full; no legacy record was removed"
                ) from None
        elif len(retained) == len(document["principals"]):
            raise SystemExit("client principal does not exist")
        if len(retained) != len(document["principals"]):
            document["principals"] = retained
            atomic_write(args.clients, document, group_id)
        print(f"Revoked {args.username} in {args.clients}")
        return
    if args.generate:
        password = secrets.token_urlsafe(32)
    else:
        password = getpass.getpass("Client password: ")
        confirmation = getpass.getpass("Confirm password: ")
        if password != confirmation:
            raise SystemExit("passwords do not match")
    encoded = password.encode("utf-8")
    if not 24 <= len(encoded) <= 256:
        raise SystemExit("client password must be 24-256 UTF-8 bytes")
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(encoded, salt=salt, n=1 << 14, r=8, p=1, dklen=32)
    record = {
        "username": args.username,
        "salt": base64.b64encode(salt).decode("ascii"),
        "password_scrypt": base64.b64encode(digest).decode("ascii"),
        "n": 1 << 14,
        "r": 8,
        "p": 1,
    }
    document["principals"] = [
        item for item in document["principals"] if item.get("username") != args.username
    ] + [record]
    atomic_write(args.clients, document, group_id)
    print(f"Provisioned {args.username} in {args.clients}")
    if args.generate:
        print("One-time client password (save it now):")
        print(password)


if __name__ == "__main__":
    main()
