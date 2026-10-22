"""One client, one fresh full-account proof, at most one authorized action.

Native routing currently admits Testnet4 only. Mainnet request validation is
prepared for review but cannot be reached from Groot until its separate gate is
approved. No state survives process exit. Rust authenticates the whole runtime
before spawn and independently checks identity/result afterward.
"""
import contextlib
import json
import re
import sys

MAX_INPUT = 402432
MAX_VALUE = 393216
SUPPORTED = {"coldcard", "ledger", "bitbox02", "trezor", "jade"}
KEYS = {"version", "chain", "deviceType", "devicePath", "accountPath", "expected", "action", "value"}
ACCOUNT_SCOPE = {
    "testnet4": ("m/48'/1'/0'/2'", "m/84'/1'/0'", "tpub"),
    "main": ("m/48'/0'/0'/2'", "m/84'/0'/0'", "xpub"),
}

def validate(request):
    if not isinstance(request, dict) or set(request) != KEYS:
        raise ValueError("request")
    if type(request["version"]) is not int or request["version"] != 1 or request["chain"] not in ACCOUNT_SCOPE:
        raise ValueError("scope")
    multisig_path, singlesig_path, xpub_prefix = ACCOUNT_SCOPE[request["chain"]]
    if request["deviceType"] not in SUPPORTED:
        raise ValueError("device")
    path = request["devicePath"]
    if not isinstance(path, str) or not 0 < len(path) <= 4096 or any(ord(c) < 32 for c in path):
        raise ValueError("path")
    if request["accountPath"] not in (multisig_path, singlesig_path):
        raise ValueError("account")
    action, value = request["action"], request["value"]
    if action not in ("identity", "display", "sign", "probe"):
        raise ValueError("action")
    if action in ("identity", "probe"):
        if value is not None:
            raise ValueError("value")
    elif not isinstance(value, str) or not 0 < len(value) <= MAX_VALUE or "\x00" in value:
        raise ValueError("value")
    expected = request["expected"]
    if not isinstance(expected, list) or len(expected) > 16 or (not expected and action != "probe"):
        raise ValueError("expected")
    for item in expected:
        if not isinstance(item, dict) or set(item) != {"fingerprint", "xpub", "allowAction"}:
            raise ValueError("identity")
        if not isinstance(item["fingerprint"], str) or not re.fullmatch("[0-9a-f]{8}", item["fingerprint"]):
            raise ValueError("fingerprint")
        if not isinstance(item["xpub"], str) or not re.fullmatch(xpub_prefix + "[1-9A-HJ-NP-Za-km-z]{100,120}", item["xpub"]):
            raise ValueError("xpub")
        if type(item["allowAction"]) is not bool:
            raise ValueError("authorization")
    return request

def safe_error(error):
    code = getattr(error, "code", -13)
    if type(code) is not int or not -18 <= code <= -1:
        code = -13
    detail = str(error).lower()
    message = "session_failed"
    if "network type inconsistent with prior usage" in detail:
        return {"error": "wrong_network", "code": -3}
    for allowed in (
        "multisig account configuration with this name already exists",
        "multisig wallet with those fingerprints not found",
        "cla_not_supported",
    ):
        if allowed in detail:
            message = allowed
            break
    return {"error": message, "code": code}

def vendor_chain(request, chain_enum):
    if request["chain"] == "main":
        return chain_enum.MAIN
    # HWI's Jade adapter has no TESTNET4 entry; its `testnet` network is shared.
    return chain_enum.TEST if request["deviceType"] == "jade" else chain_enum.TESTNET4

def execute(request, get_client, chain, display, sign):
    validate(request)
    if request["action"] == "probe":
        return {"probe": "groot-hwi-session-v1", "vendor": "3.2.0"}
    client = get_client(request["deviceType"], request["devicePath"], chain=chain)
    if client is None:
        raise ValueError("client")
    try:
        fingerprint = client.get_master_fingerprint().hex().lower()
        xpub = client.get_pubkey_at_path(request["accountPath"]).to_string()
        matching = [item for item in request["expected"] if item["fingerprint"] == fingerprint and item["xpub"] == xpub]
        if len(matching) != 1:
            return {"error": "identity_mismatch", "code": -100}
        # This is only public material freshly read on this same connection.
        client.xpub_cache[request["accountPath"]] = xpub
        result = None
        if request["action"] != "identity" and matching[0]["allowAction"]:
            try:
                if request["action"] == "display":
                    result = display(client, desc=request["value"])
                else:
                    result = sign(client, psbt=request["value"])
            except Exception as error:
                result = safe_error(error)
        return {"fingerprint": fingerprint, "xpub": xpub, "result": result}
    finally:
        client.close()

def strict_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate")
        result[key] = value
    return result

def reject_constant(_value):
    raise ValueError("constant")

def main():
    try:
        raw = sys.stdin.buffer.readline(MAX_INPUT + 1)
        if len(raw) > MAX_INPUT or not raw.endswith(b"\n") or b"\x00" in raw:
            raise ValueError("input")
        request = validate(json.loads(raw, object_pairs_hook=strict_object, parse_constant=reject_constant))
        from hwilib import __version__
        if __version__ != "3.2.0":
            raise ValueError("vendor")
        from hwilib.common import Chain
        from hwilib.commands import get_client, displayaddress, signtx
        if request["action"] == "probe":
            # Load the selected original driver and native extensions without
            # constructing a client, enumerating, or opening any USB device.
            import importlib
            module = importlib.import_module("hwilib.devices." + request["deviceType"])
            getattr(module, request["deviceType"].capitalize() + "Client")
        # Vendor progress belongs on the already bounded private stderr pipe.
        with contextlib.redirect_stdout(sys.stderr):
            response = execute(request, get_client, vendor_chain(request, Chain), displayaddress, signtx)
    except Exception as error:
        # Never return arbitrary vendor errors, selectors, PSBTs or credentials.
        response = safe_error(error)
    sys.stdout.write(json.dumps(response, ensure_ascii=True, allow_nan=False) + "\n")
    sys.stdout.flush()

if __name__ == "__main__":
    main()
