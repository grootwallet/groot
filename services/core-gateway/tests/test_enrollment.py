from __future__ import annotations

import base64
from concurrent.futures import ThreadPoolExecutor
from contextlib import redirect_stdout
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import types
import unittest
from unittest import mock

SERVICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE))
import gateway
import provision_client
from test_gateway import PASSWORD, USERNAME, authorization, credential_document

NOW = 1_800_000_000.0


class EnrollmentAdmissionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name)
        self.legacy = self.directory / 'clients.json'
        self.legacy.write_text(json.dumps(credential_document(), indent=2) + '\n')
        self.legacy.chmod(0o640)
        self.enrolled = self.directory / 'enrolled.json'
        old = credential_document()
        old['principals'][0]['username'] = 'groot-' + 'a' * 24
        self.enrolled.write_text(json.dumps(old, indent=2) + '\n')
        self.enrolled.chmod(0o600)
        self.before = self.enrolled.read_bytes()
        self.store = gateway.EnrollmentStore(self.enrolled)
        self.clock = mock.patch('gateway.time.time', return_value=NOW)
        self.clock.start()
        self.addCleanup(self.clock.stop)
        self.addCleanup(self.temporary.cleanup)

    def service(self) -> gateway.Gateway:
        return gateway.Gateway(gateway.GatewayConfig(
            clients=gateway.CredentialStore((self.legacy, self.enrolled)),
            core_cookie=gateway.CoreCookie(self.directory / 'unused-cookie'),
            enrollment=gateway.EnrollmentStore(self.enrolled),
        ))

    def initialize(self) -> gateway.Gateway:
        self.store.initialize()
        return self.service()

    def issue(self, service: gateway.Gateway, ip: str = '198.51.100.1') -> dict:
        return json.loads(service.enroll(ip, b'{"version":1}'))

    @staticmethod
    def auth(credential: dict) -> str:
        return 'Basic ' + base64.b64encode(
            f"{credential['username']}:{credential['password']}".encode('ascii')
        ).decode('ascii')

    def rpc(self, service: gateway.Gateway, auth: str, method: str = 'getblockcount') -> dict:
        def response(request):
            return json.dumps({'result':123,'error':None,'id':request['id']}).encode()
        with mock.patch.object(service, '_call_core', side_effect=response) as core:
            result = json.loads(service.handle(
                auth, '203.0.113.19', json.dumps({'id':7,'method':method,'params':[]}).encode()
            ))
            self.assertEqual(core.call_count, 1)
            return result

    def rejected(self, function, status: int, code: str) -> None:
        with self.assertRaises(gateway.RequestRejected) as caught:
            function()
        self.assertEqual((caught.exception.status,caught.exception.code),(status,code))

    def test_passive_enrollments_never_consume_or_rewrite_full_legacy_principal_capacity(self) -> None:
        service = self.initialize()
        with mock.patch('gateway.MAX_ENROLLED_PRINCIPALS', 1):
            credentials = [self.issue(service, f'198.51.{n}.1') for n in range(12)]
        self.assertEqual(self.enrolled.read_bytes(), self.before)
        self.assertEqual(self.legacy.read_text(), json.dumps(credential_document(), indent=2) + '\n')
        self.assertEqual(len(json.loads(self.enrolled.read_bytes())['principals']), 1)
        for credential in credentials:
            self.assertEqual(set(credential), {'version','username','password'})
            self.assertRegex(credential['username'], r'^groot-[0-9a-f]{24}$')
            self.assertEqual(len(credential['password']), 43)
        self.assertEqual(self.rpc(service, authorization())['result'], 123)
        self.assertEqual(self.rpc(service, self.auth(credentials[0]))['id'], 7)

    def test_same_saved_credential_authenticates_after_long_idle_and_restart_without_reenrollment(self) -> None:
        service = self.initialize()
        credential = self.issue(service)
        with mock.patch('gateway.time.time', return_value=NOW + 3650 * 86400):
            restarted = self.service()
            self.assertEqual(self.rpc(restarted, self.auth(credential))['result'], 123)
            self.issue(restarted, '198.52.100.1')
        self.assertEqual(self.enrolled.read_bytes(), self.before)

    def test_global_budget_survives_distributed_sources_and_service_restart(self) -> None:
        with mock.patch('gateway.ENROLLMENT_GLOBAL_BURST', 3.0):
            service = self.initialize()
            for ip in ['198.51.100.1','2001:db8:1::1','2001:db8:2::1']:
                self.issue(service, ip)
            restarted = self.service()
            self.rejected(lambda:self.issue(restarted,'203.0.113.1'),429,'rate_limited')
            with mock.patch('gateway.time.time', return_value=NOW + 60):
                self.issue(restarted, '203.0.113.1')

    def test_ipv6_rotation_and_ipv4_mapped_addresses_share_normalized_prefix_budgets(self) -> None:
        service = self.initialize()
        for n in range(8):
            self.issue(service, f'2001:db8:abcd:{n:x}::1')
        self.rejected(lambda:self.issue(service,'2001:0DB8:ABCD:ffff::1'),429,'rate_limited')
        for n in range(8):
            self.issue(service, f'::ffff:198.51.100.{n+1}')
        self.rejected(lambda:self.issue(service,'198.51.100.99'),429,'rate_limited')
        state = json.loads(self.store._state_path.read_bytes())
        self.assertEqual(set(state['prefixes']), {'2001:db8:abcd::/48','198.51.100.0/24'})

    def test_small_prefix_capacity_is_bounded_and_reclaimed_without_expiring_credentials(self) -> None:
        with mock.patch('gateway.MAX_ENROLLMENT_PREFIXES', 2):
            service = self.initialize()
            first = self.issue(service, '198.51.1.1')
            self.issue(service, '198.51.2.1')
            self.rejected(lambda:self.issue(service,'198.51.3.1'),429,'rate_limited')
            with mock.patch('gateway.time.time', return_value=NOW + gateway.ENROLLMENT_PREFIX_RETENTION + 1):
                self.issue(self.service(),'198.51.3.1')
                self.assertEqual(self.rpc(self.service(), self.auth(first))['result'],123)
            self.assertEqual(len(json.loads(self.store._state_path.read_bytes())['prefixes']),1)
        self.assertEqual(self.enrolled.read_bytes(), self.before)

    def test_independent_instances_cannot_race_a_small_shared_admission_budget(self) -> None:
        with mock.patch('gateway.ENROLLMENT_GLOBAL_BURST', 3.0):
            self.initialize()
            barrier = threading.Barrier(12)
            def issue(n):
                store = gateway.EnrollmentStore(self.enrolled)
                barrier.wait()
                try:
                    store.issue(f'198.51.{n}.1',set())
                    return 201
                except gateway.RequestRejected as error:
                    return error.status
            with ThreadPoolExecutor(max_workers=12) as workers:
                outcomes = list(workers.map(issue, range(12)))
            self.assertEqual(outcomes.count(201),3)
            self.assertEqual(outcomes.count(429),9)
            self.assertEqual(json.loads(self.store._state_path.read_bytes())['global'][0],0.0)
        self.assertEqual(self.enrolled.read_bytes(), self.before)

    def test_separate_processes_share_the_persisted_budget(self) -> None:
        with mock.patch('gateway.ENROLLMENT_GLOBAL_BURST', 2.0):
            self.initialize()
        # Children use the default schema burst, but only the two persisted
        # tokens are available at this clock; their flock is process-shared.
        script = '''import sys
sys.path.insert(0, sys.argv[1])
from pathlib import Path
from unittest import mock
import gateway
with mock.patch('gateway.time.time', return_value=1800000000.0):
    try:
        gateway.EnrollmentStore(Path(sys.argv[2])).issue(sys.argv[3], set())
        print('admitted')
    except gateway.RequestRejected as error:
        print(error.code)
'''
        processes = [subprocess.Popen(
            [sys.executable,'-I','-c',script,str(SERVICE),str(self.enrolled),f'198.52.{n}.1'],
            stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,
        ) for n in range(6)]
        outputs=[]
        for process in processes:
            stdout,stderr=process.communicate(timeout=10)
            self.assertEqual(process.returncode,0,stderr)
            outputs.append(stdout.strip())
        self.assertEqual(outputs.count('admitted'),2)
        self.assertEqual(outputs.count('rate_limited'),4)

    def test_revocation_persists_and_never_issues_the_revoked_username_again(self) -> None:
        service = self.initialize()
        credential = self.issue(service)
        self.store.revoke(credential['username'])
        restarted=self.service()
        self.rejected(lambda:self.rpc(restarted,self.auth(credential)),401,'unauthorized')
        with mock.patch('gateway.secrets.token_hex', return_value=credential['username'][6:]):
            self.rejected(lambda:self.issue(restarted,'198.52.100.1'),503,'enrollment_unavailable')
        self.assertEqual(self.rpc(restarted,authorization())['result'],123)
        self.assertEqual(self.enrolled.read_bytes(),self.before)

    def test_full_revocation_ledger_never_evicts_or_resurrects_a_revoked_credential(self) -> None:
        with mock.patch('gateway.MAX_ENROLLMENT_REVOCATIONS',1):
            service=self.initialize()
            first=self.issue(service)
            second=self.issue(service,'198.52.100.1')
            self.store.revoke(first['username'])
            self.store.revoke(first['username'])
            with self.assertRaisesRegex(ValueError,'ledger is full'):
                self.store.revoke(second['username'])
            self.rejected(lambda:self.issue(self.service(),'198.53.100.1'),503,'enrollment_unavailable')
            self.rejected(lambda:self.rpc(self.service(),self.auth(first)),401,'unauthorized')
            self.assertEqual(self.rpc(self.service(),self.auth(second))['result'],123)
            self.assertEqual(json.loads(self.store._state_path.read_bytes())['revoked'],[first['username']])

    def test_legacy_record_precedence_never_falls_through_after_a_wrong_password(self) -> None:
        service=self.initialize()
        credential=self.issue(service)
        document=json.loads(self.legacy.read_bytes())
        replacement=credential_document()['principals'][0]
        replacement['username']=credential['username']
        document['principals'].append(replacement)
        self.legacy.write_text(json.dumps(document))
        self.rejected(lambda:self.rpc(service,self.auth(credential)),401,'unauthorized')
        manual={'username':credential['username'],'password':PASSWORD.decode()}
        self.assertEqual(self.rpc(service,self.auth(manual))['result'],123)

    def test_empty_legacy_files_support_stateless_clients_without_a_shared_fallback(self) -> None:
        service=self.initialize()
        for path in [self.legacy,self.enrolled]:
            path.write_text('{"version":1,"principals":[]}\n')
        credential=self.issue(service)
        self.assertEqual(self.rpc(service,self.auth(credential))['result'],123)
        self.rejected(lambda:self.rpc(service,self.auth({'username':credential['username'],'password':'wrong'})),401,'unauthorized')

    def test_missing_or_unsafe_issuer_state_fails_closed_without_replacing_key_or_legacy_data(self) -> None:
        service=self.service()
        self.rejected(lambda:self.issue(service),503,'enrollment_unavailable')
        self.assertFalse(self.store._state_path.exists())
        self.assertEqual(self.rpc(service,authorization())['result'],123)
        self.store.initialize()
        before=self.store._state_path.read_bytes()
        with self.assertRaises(FileExistsError):
            self.store.initialize()
        self.assertEqual(self.store._state_path.read_bytes(),before)
        self.store._state_path.chmod(0o640)
        self.rejected(lambda:self.issue(service),503,'enrollment_unavailable')
        self.assertEqual(self.rpc(service,authorization())['result'],123)
        self.assertEqual(self.enrolled.read_bytes(),self.before)

    def test_corrupt_or_symlinked_state_does_not_authorize_stateless_requests(self) -> None:
        service=self.initialize()
        credential=self.issue(service)
        state_path=self.store._state_path
        saved=self.directory/'saved.json'
        state_path.rename(saved)
        state_path.symlink_to(saved)
        self.rejected(lambda:self.rpc(service,self.auth(credential)),503,'gateway_unavailable')
        state_path.unlink()
        state_path.write_text('{"version":1}')
        state_path.chmod(0o600)
        self.rejected(lambda:self.rpc(service,self.auth(credential)),503,'gateway_unavailable')
        self.assertEqual(self.rpc(service,authorization())['result'],123)

    def test_valid_stateless_credential_does_not_expand_rpc_methods(self) -> None:
        service=self.initialize()
        credential=self.issue(service)
        with mock.patch.object(service,'_call_core') as core:
            self.rejected(lambda:self.rpc(service,self.auth(credential),'dumpwallet'),403,'method_not_allowed')
            core.assert_not_called()

    def test_operator_remove_records_durable_stateless_revocation_without_rewriting_v1_store(self) -> None:
        service=self.initialize()
        credential=self.issue(service)
        args=types.SimpleNamespace(
            initialize_enrollment=False,clients=self.enrolled,username=credential['username'],
            group='fixture-group',remove=True,generate=False,
        )
        with mock.patch.object(provision_client,'parse_args',return_value=args),mock.patch.object(
            provision_client.grp,'getgrnam',return_value=types.SimpleNamespace(gr_gid=os.getgid())
        ),redirect_stdout(io.StringIO()):
            provision_client.main()
        self.assertEqual(self.enrolled.read_bytes(),self.before)
        self.rejected(lambda:self.rpc(self.service(),self.auth(credential)),401,'unauthorized')

    def test_enrollment_ip_bucket_population_is_bounded_without_weakening_rpc_buckets(self) -> None:
        buckets=gateway.TokenBuckets(rate=1,burst=1,maximum=2)
        self.assertTrue(buckets.allow('one'))
        self.assertTrue(buckets.allow('two'))
        self.assertFalse(buckets.allow('three'))
        self.assertEqual(len(buckets._buckets),2)


    def test_username_collisions_are_rejected_across_manual_and_enrolled_legacy_files(self) -> None:
        document = credential_document()
        document['principals'][0]['username'] = 'groot-' + 'b' * 24
        self.legacy.write_text(json.dumps(document))
        service = self.initialize()
        with mock.patch('gateway.secrets.token_hex', side_effect=['a' * 24, 'b' * 24, 'c' * 24]):
            credential = self.issue(service)
        self.assertEqual(credential['username'], 'groot-' + 'c' * 24)
        self.assertEqual(self.rpc(service,self.auth(credential))['result'],123)
        self.assertEqual(self.enrolled.read_bytes(), self.before)

    def test_issuer_write_preserves_daemon_identity_and_atomic_failure_keeps_revocations(self) -> None:
        service = self.initialize()
        credential = self.issue(service)
        metadata = self.store._state_path.stat()
        with mock.patch('gateway.os.fchown', wraps=os.fchown) as chown:
            self.store.revoke(credential['username'])
        self.assertEqual(chown.call_args.args[1:], (metadata.st_uid, metadata.st_gid))
        self.assertEqual(self.store._state_path.stat().st_uid, metadata.st_uid)
        self.assertEqual(self.store._state_path.stat().st_gid, metadata.st_gid)
        self.assertEqual(self.store._state_path.stat().st_mode & 0o777, 0o600)
        before = self.store._state_path.read_bytes()
        with mock.patch('gateway.os.replace', side_effect=OSError('injected atomic write failure')):
            self.rejected(lambda:self.issue(service,'198.52.100.1'),503,'enrollment_unavailable')
        self.assertEqual(self.store._state_path.read_bytes(), before)
        self.rejected(lambda:self.rpc(self.service(),self.auth(credential)),401,'unauthorized')
        self.assertEqual(self.enrolled.read_bytes(), self.before)

    def test_operator_reprovisioned_kdf_is_separate_authority_and_never_restores_revoked_mac(self) -> None:
        service = self.initialize()
        credential = self.issue(service)
        self.store.revoke(credential['username'])
        document = json.loads(self.enrolled.read_bytes())
        replacement = credential_document()['principals'][0]
        replacement['username'] = credential['username']
        document['principals'].append(replacement)
        self.enrolled.write_text(json.dumps(document))
        owner_credential = {'username':credential['username'],'password':PASSWORD.decode()}
        self.assertEqual(self.rpc(self.service(),self.auth(owner_credential))['result'],123)
        self.rejected(lambda:self.rpc(self.service(),self.auth(credential)),401,'unauthorized')
        self.assertEqual(json.loads(self.store._state_path.read_bytes())['revoked'],[credential['username']])
        self.store._state_path.write_text('invalid issuer state')
        self.assertEqual(self.rpc(self.service(),self.auth(owner_credential))['result'],123)
        self.rejected(lambda:self.rpc(self.service(),self.auth(credential)),401,'unauthorized')

    def test_cli_failed_tombstone_write_keeps_colliding_legacy_record_and_blocks_mac_fallback(self) -> None:
        service = self.initialize()
        credential = self.issue(service)
        document = json.loads(self.enrolled.read_bytes())
        replacement = credential_document()['principals'][0]
        replacement['username'] = credential['username']
        document['principals'].append(replacement)
        self.enrolled.write_text(json.dumps(document))
        before = self.enrolled.read_bytes()
        args=types.SimpleNamespace(
            initialize_enrollment=False,clients=self.enrolled,username=credential['username'],
            group='fixture-group',remove=True,generate=False,
        )
        with mock.patch.object(provision_client,'parse_args',return_value=args),mock.patch.object(
            provision_client.grp,'getgrnam',return_value=types.SimpleNamespace(gr_gid=os.getgid())
        ),mock.patch.object(gateway.EnrollmentStore,'_write',side_effect=OSError('injected journal failure')):
            with self.assertRaisesRegex(SystemExit,'no legacy record was removed'):
                provision_client.main()
        self.assertEqual(self.enrolled.read_bytes(),before)
        self.rejected(lambda:self.rpc(self.service(),self.auth(credential)),401,'unauthorized')

    def test_failed_key_initialization_never_publishes_partial_state_or_mutates_legacy_data(self) -> None:
        with mock.patch('gateway.os.fsync', side_effect=OSError('injected sync failure')):
            with self.assertRaises(OSError):
                self.store.initialize()
        self.assertFalse(self.store._state_path.exists())
        self.assertEqual(self.enrolled.read_bytes(),self.before)
        self.store.initialize()
        self.assertTrue(self.store._state_path.exists())


    def test_restored_issuer_state_recreates_lock_with_the_daemon_identity(self) -> None:
        service = self.initialize()
        credential = self.issue(service)
        metadata = self.store._state_path.stat()
        self.store._lock_path.unlink()
        with mock.patch('gateway.os.fchown', wraps=os.fchown) as chown:
            self.store.revoke(credential['username'])
        self.assertEqual(chown.call_args_list[0].args[1:],(metadata.st_uid,metadata.st_gid))
        self.assertEqual(self.store._lock_path.stat().st_uid,metadata.st_uid)
        self.assertEqual(self.store._lock_path.stat().st_gid,metadata.st_gid)
        self.assertEqual(self.store._lock_path.stat().st_mode & 0o777,0o600)
        self.rejected(lambda:self.rpc(self.service(),self.auth(credential)),401,'unauthorized')
        self.assertEqual(self.rpc(self.service(),authorization())['result'],123)

    def test_operator_initialization_refuses_root_before_creating_any_file(self) -> None:
        target = self.directory / 'not-created' / 'clients.json'
        args=types.SimpleNamespace(initialize_enrollment=True,username=None,clients=target)
        with mock.patch.object(provision_client,'parse_args',return_value=args),mock.patch.object(
            provision_client.os,'geteuid',return_value=0
        ):
            with self.assertRaisesRegex(SystemExit,'unprivileged gateway service user'):
                provision_client.main()
        self.assertFalse(target.parent.exists())


    def test_key_loss_cannot_report_revocation_then_restore_old_signed_authority(self) -> None:
        service=self.initialize()
        credential=self.issue(service)
        document=json.loads(self.enrolled.read_bytes())
        replacement=credential_document()['principals'][0]
        replacement['username']=credential['username']
        document['principals'].append(replacement)
        self.enrolled.write_text(json.dumps(document))
        before=self.enrolled.read_bytes()
        saved=self.directory/'issuer-backup.json'
        self.store._state_path.rename(saved)
        args=types.SimpleNamespace(
            initialize_enrollment=False,clients=self.enrolled,username=credential['username'],
            group='fixture-group',remove=True,generate=False,
        )
        with mock.patch.object(provision_client,'parse_args',return_value=args),mock.patch.object(
            provision_client.grp,'getgrnam',return_value=types.SimpleNamespace(gr_gid=os.getgid())
        ),redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(SystemExit,'requires its readable issuer state'):
                provision_client.main()
            self.assertEqual(self.enrolled.read_bytes(),before)
            saved.rename(self.store._state_path)
            provision_client.main()
        self.rejected(lambda:self.rpc(self.service(),self.auth(credential)),401,'unauthorized')
        self.assertEqual(json.loads(self.store._state_path.read_bytes())['revoked'],[credential['username']])
        self.assertEqual(json.loads(self.enrolled.read_bytes()),json.loads(self.before))

    def test_corrupt_issuer_prevents_public_name_removal_without_blocking_legacy_authentication(self) -> None:
        service=self.initialize()
        self.store._state_path.write_text('not valid issuer state')
        args=types.SimpleNamespace(
            initialize_enrollment=False,clients=self.enrolled,username='groot-'+'a'*24,
            group='fixture-group',remove=True,generate=False,
        )
        with mock.patch.object(provision_client,'parse_args',return_value=args),mock.patch.object(
            provision_client.grp,'getgrnam',return_value=types.SimpleNamespace(gr_gid=os.getgid())
        ):
            with self.assertRaisesRegex(SystemExit,'no legacy record was removed'):
                provision_client.main()
        self.assertEqual(self.enrolled.read_bytes(),self.before)
        self.assertEqual(self.rpc(service,authorization())['result'],123)

    def test_public_name_removal_from_manual_store_uses_explicit_correct_issuer(self) -> None:
        service=self.initialize()
        credential=self.issue(service)
        document=credential_document()
        replacement=credential_document()['principals'][0]
        replacement['username']=credential['username']
        document['principals'].append(replacement)
        self.legacy.write_text(json.dumps(document))
        args=types.SimpleNamespace(
            initialize_enrollment=False,clients=self.legacy,issuer_clients=self.enrolled,
            username=credential['username'],group='fixture-group',remove=True,generate=False,
        )
        with mock.patch.object(provision_client,'parse_args',return_value=args),mock.patch.object(
            provision_client.grp,'getgrnam',return_value=types.SimpleNamespace(gr_gid=os.getgid())
        ),redirect_stdout(io.StringIO()):
            provision_client.main()
        self.rejected(lambda:self.rpc(self.service(),self.auth(credential)),401,'unauthorized')
        self.assertEqual(self.rpc(self.service(),authorization())['result'],123)
        self.assertEqual(json.loads(self.store._state_path.read_bytes())['revoked'],[credential['username']])
