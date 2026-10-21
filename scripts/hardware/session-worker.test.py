"""Device-free operation boundary tests; never imports HWI or opens USB."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import Mock
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location("worker", Path(__file__).with_name("session-worker.py"))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

class SessionTests(unittest.TestCase):
    def setUp(self):
        self.key = "tpub" + "1" * 107
        self.request = dict(version=1, chain="testnet4", deviceType="ledger", devicePath="selected-path", accountPath="m/48'/1'/0'/2'", expected=[dict(fingerprint="12345678", xpub=self.key, allowAction=True)], action="sign", value="reviewed-psbt")
        self.client = Mock()
        self.client.get_master_fingerprint.return_value = bytes.fromhex("12345678")
        self.client.get_pubkey_at_path.return_value.to_string.return_value = self.key
        self.client.xpub_cache = {}
        self.open = Mock(return_value=self.client)
        self.display = Mock(return_value=dict(address="test-address"))
        self.sign = Mock(return_value=dict(psbt="signed-psbt"))
    def run_request(self, request=None):
        return worker.execute(self.request if request is None else request, self.open, "explicit-testnet4", self.display, self.sign)
    def test_only_jade_uses_hwi_shared_test_network(self):
        chains = SimpleNamespace(TEST="hwi-test", TESTNET4="hwi-testnet4")
        for family in ("coldcard", "ledger", "bitbox02", "trezor", "jade"):
            self.request["deviceType"] = family
            self.assertEqual(worker.vendor_chain(self.request, chains), "hwi-test" if family == "jade" else "hwi-testnet4")

    def test_one_connection_full_proof_then_one_action_on_all_five_families(self):
        for family in ("coldcard", "ledger", "bitbox02", "trezor", "jade"):
            with self.subTest(family=family):
                self.setUp()
                self.request["deviceType"] = family
                result = self.run_request()
                self.open.assert_called_once_with(family, "selected-path", chain="explicit-testnet4")
                self.client.get_master_fingerprint.assert_called_once_with()
                self.client.get_pubkey_at_path.assert_called_once_with("m/48'/1'/0'/2'")
                self.sign.assert_called_once_with(self.client, psbt="reviewed-psbt")
                self.display.assert_not_called()
                self.client.close.assert_called_once_with()
                self.assertEqual(result["result"], dict(psbt="signed-psbt"))
    def test_no_identity_cache_between_operations(self):
        self.run_request()
        self.client.get_master_fingerprint.return_value = bytes.fromhex("87654321")
        result = self.run_request()
        self.assertEqual(self.open.call_count, 2)
        self.assertEqual(result["code"], -100)
        self.assertEqual(self.sign.call_count, 1)
        self.assertEqual(self.client.close.call_count, 2)
    def test_full_account_mismatch_duplicate_and_denied_policy_never_act(self):
        for variant in ("fingerprint", "xpub", "duplicate", "policy"):
            with self.subTest(variant=variant):
                self.setUp()
                if variant == "duplicate":
                    self.request["expected"].append(copy.deepcopy(self.request["expected"][0]))
                elif variant == "policy":
                    self.request["expected"][0]["allowAction"] = False
                else:
                    self.request["expected"][0][variant] = "87654321" if variant == "fingerprint" else "tpub" + "2" * 107
                self.run_request()
                self.sign.assert_not_called()
                self.display.assert_not_called()
                self.client.close.assert_called_once_with()
    def test_other_candidate_permission_does_not_authorize_matched_device(self):
        self.request["expected"][0]["allowAction"] = False
        self.request["expected"].append(dict(fingerprint="87654321", xpub=self.key, allowAction=True))
        result = self.run_request()
        self.assertIsNone(result["result"])
        self.sign.assert_not_called()
        self.client.close.assert_called_once_with()
    def test_identity_only_and_probe_never_act(self):
        for action in ("identity", "probe"):
            self.setUp()
            self.request.update(action=action, value=None)
            self.run_request()
            self.sign.assert_not_called()
            self.display.assert_not_called()
            self.assertEqual(self.open.call_count, int(action == "identity"))
    def test_display_and_cleanup_on_vendor_failure(self):
        self.request.update(action="display", value="reviewed-descriptor")
        self.display.side_effect = RuntimeError("secret-psbt-mnemonic-address")
        result = self.run_request()
        self.display.assert_called_once_with(self.client, desc="reviewed-descriptor")
        self.client.close.assert_called_once_with()
        self.assertNotIn("secret", json.dumps(result))
        self.assertEqual(result["result"], dict(error="session_failed", code=-13))
    def test_proof_failure_closes_before_any_action(self):
        self.client.get_pubkey_at_path.side_effect = RuntimeError("secret")
        with self.assertRaises(RuntimeError):
            self.run_request()
        self.client.close.assert_called_once_with()
        self.sign.assert_not_called()
    def test_bad_scope_shape_bounds_rejected_before_open(self):
        changes = [dict(version=True), dict(chain="main"), dict(deviceType="unsupported"), dict(devicePath=""), dict(devicePath="bad\npath"), dict(accountPath="m/0'"), dict(action="wipe"), dict(expected=[]), dict(expected=self.request["expected"] * 17), dict(value="x" * (worker.MAX_VALUE + 1))]
        for change in changes:
            request = copy.deepcopy(self.request)
            request.update(change)
            with self.assertRaises((ValueError, TypeError)):
                self.run_request(request)
        self.open.assert_not_called()
    def test_errors_redact_payload_and_preserve_cancel_code(self):
        error = RuntimeError("private payload")
        error.code = -14
        self.assertEqual(worker.safe_error(error), dict(error="session_failed", code=-14))
        error.code = "secret"
        self.assertEqual(worker.safe_error(error)["code"], -13)
        network_error = RuntimeError("Network type inconsistent with prior usage")
        self.assertEqual(worker.safe_error(network_error), dict(error="wrong_network", code=-3))
        with self.assertRaises(ValueError):
            json.loads('{"action":1,"action":2}', object_pairs_hook=worker.strict_object)
        with self.assertRaises(ValueError):
            json.loads('NaN', parse_constant=worker.reject_constant)

if __name__ == "__main__":
    unittest.main()
