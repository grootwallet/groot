use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use bdk_wallet::bitcoin::{
    bip32::Fingerprint, psbt::Psbt, secp256k1::Secp256k1, sighash::SighashCache, EcdsaSighashType,
};
use serde::Serialize;
use std::{collections::HashSet, fmt};

const MAX_PSBT_BYTES: usize = 1_048_576;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProposalError {
    MalformedPsbt,
    PsbtTooLarge,
    ProposalMismatch,
    UnknownSigner,
    UnsupportedSighash,
    InvalidSignature,
    PrematureFinalization,
    NoInputs,
    NoNewSignatures,
    MergeFailed,
}

impl ProposalError {
    pub fn code(self) -> &'static str {
        match self {
            Self::MalformedPsbt => "malformed_psbt",
            Self::PsbtTooLarge => "psbt_too_large",
            Self::ProposalMismatch => "proposal_mismatch",
            Self::UnknownSigner => "unknown_signer",
            Self::UnsupportedSighash => "unsupported_sighash",
            Self::InvalidSignature => "invalid_signature",
            Self::PrematureFinalization => "premature_finalization",
            Self::NoInputs => "no_inputs",
            Self::NoNewSignatures => "no_new_signatures",
            Self::MergeFailed => "psbt_merge_failed",
        }
    }
}

impl fmt::Display for ProposalError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.code())
    }
}

impl std::error::Error for ProposalError {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignatureProgress {
    pub signed_fingerprints: Vec<String>,
    pub signed: usize,
    pub required: usize,
    pub can_finalize: bool,
}

pub fn encode_psbt(psbt: &Psbt) -> String {
    BASE64.encode(psbt.serialize())
}

pub fn decode_psbt(encoded: &str) -> Result<Psbt, ProposalError> {
    let trimmed = encoded.trim();
    if trimmed.len() > MAX_PSBT_BYTES * 2 {
        return Err(ProposalError::PsbtTooLarge);
    }
    let bytes = BASE64
        .decode(trimmed)
        .map_err(|_| ProposalError::MalformedPsbt)?;
    if bytes.len() > MAX_PSBT_BYTES {
        return Err(ProposalError::PsbtTooLarge);
    }
    Psbt::deserialize(&bytes).map_err(|_| ProposalError::MalformedPsbt)
}

fn signed_on_input(
    psbt: &Psbt,
    input_index: usize,
    allowed: &HashSet<Fingerprint>,
) -> Result<HashSet<Fingerprint>, ProposalError> {
    let input = psbt
        .inputs
        .get(input_index)
        .ok_or(ProposalError::NoInputs)?;
    let mut signed = HashSet::new();
    for (public_key, signature) in &input.partial_sigs {
        if signature.sighash_type != EcdsaSighashType::All {
            return Err(ProposalError::UnsupportedSighash);
        }
        let (fingerprint, _) = input
            .bip32_derivation
            .get(&public_key.inner)
            .ok_or(ProposalError::UnknownSigner)?;
        if !allowed.contains(fingerprint) {
            return Err(ProposalError::UnknownSigner);
        }
        signed.insert(*fingerprint);
    }
    Ok(signed)
}

fn verify_partial_signatures(psbt: &Psbt) -> Result<(), ProposalError> {
    let secp = Secp256k1::verification_only();
    let mut cache = SighashCache::new(&psbt.unsigned_tx);
    for (input_index, input) in psbt.inputs.iter().enumerate() {
        if input.partial_sigs.is_empty() {
            continue;
        }
        let (message, sighash_type) = psbt
            .sighash_ecdsa(input_index, &mut cache)
            .map_err(|_| ProposalError::InvalidSignature)?;
        for (public_key, signature) in &input.partial_sigs {
            if signature.sighash_type != EcdsaSighashType::All
                || signature.sighash_type != sighash_type
            {
                return Err(ProposalError::UnsupportedSighash);
            }
            secp.verify_ecdsa(&message, &signature.signature, &public_key.inner)
                .map_err(|_| ProposalError::InvalidSignature)?;
        }
    }
    Ok(())
}

pub fn signature_progress(
    psbt: &Psbt,
    allowed_fingerprints: &[Fingerprint],
    required: usize,
) -> Result<SignatureProgress, ProposalError> {
    if psbt.inputs.is_empty() {
        return Err(ProposalError::NoInputs);
    }
    verify_partial_signatures(psbt)?;
    let allowed = allowed_fingerprints.iter().copied().collect::<HashSet<_>>();
    let mut common = signed_on_input(psbt, 0, &allowed)?;
    for index in 1..psbt.inputs.len() {
        let input_signed = signed_on_input(psbt, index, &allowed)?;
        common.retain(|fingerprint| input_signed.contains(fingerprint));
    }
    let mut signed_fingerprints = common
        .into_iter()
        .map(|value| value.to_string())
        .collect::<Vec<_>>();
    signed_fingerprints.sort();
    let signed = signed_fingerprints.len();
    Ok(SignatureProgress {
        signed_fingerprints,
        signed,
        required,
        can_finalize: signed >= required,
    })
}

pub fn merge_signed_psbt(
    original: &mut Psbt,
    imported: Psbt,
    allowed_fingerprints: &[Fingerprint],
    required: usize,
) -> Result<SignatureProgress, ProposalError> {
    if original.unsigned_tx != imported.unsigned_tx
        || original.inputs.len() != imported.inputs.len()
    {
        return Err(ProposalError::ProposalMismatch);
    }
    if imported
        .inputs
        .iter()
        .any(|input| input.final_script_sig.is_some() || input.final_script_witness.is_some())
    {
        return Err(ProposalError::PrematureFinalization);
    }
    let mut original_metadata = original.clone();
    let mut imported_metadata = imported.clone();
    for input in &mut original_metadata.inputs {
        input.partial_sigs.clear();
    }
    for input in &mut imported_metadata.inputs {
        input.partial_sigs.clear();
    }
    if original_metadata != imported_metadata {
        return Err(ProposalError::ProposalMismatch);
    }
    verify_partial_signatures(&imported)?;
    let allowed = allowed_fingerprints.iter().copied().collect::<HashSet<_>>();
    for (index, imported_input) in imported.inputs.iter().enumerate() {
        let original_input = &original.inputs[index];
        for (public_key, signature) in &imported_input.partial_sigs {
            if signature.sighash_type != EcdsaSighashType::All {
                return Err(ProposalError::UnsupportedSighash);
            }
            let (fingerprint, _) = original_input
                .bip32_derivation
                .get(&public_key.inner)
                .ok_or(ProposalError::UnknownSigner)?;
            if !allowed.contains(fingerprint) {
                return Err(ProposalError::UnknownSigner);
            }
        }
    }
    let previous = signature_progress(original, allowed_fingerprints, required)?;
    let mut combined = original.clone();
    combined
        .combine(imported)
        .map_err(|_| ProposalError::MergeFailed)?;
    let progress = signature_progress(&combined, allowed_fingerprints, required)?;
    if progress.signed <= previous.signed {
        return Err(ProposalError::NoNewSignatures);
    }
    *original = combined;
    Ok(progress)
}

#[cfg(test)]
mod tests {
    use super::*;
    use bdk_wallet::bitcoin::{
        absolute,
        bip32::DerivationPath,
        ecdsa,
        hashes::Hash,
        opcodes::all::OP_CHECKMULTISIG,
        script::Builder,
        secp256k1::{Message, Secp256k1, SecretKey},
        sighash::SighashCache,
        transaction, Amount, OutPoint, PublicKey, ScriptBuf, Sequence, Transaction, TxIn, TxOut,
        Txid, Witness,
    };
    use std::str::FromStr;

    fn unsigned_tx(tag: u8) -> Transaction {
        Transaction {
            version: transaction::Version::TWO,
            lock_time: absolute::LockTime::ZERO,
            input: (0..2)
                .map(|index| TxIn {
                    previous_output: OutPoint {
                        txid: Txid::from_byte_array([tag + index; 32]),
                        vout: 0,
                    },
                    script_sig: ScriptBuf::new(),
                    sequence: Sequence::ENABLE_RBF_NO_LOCKTIME,
                    witness: Witness::new(),
                })
                .collect(),
            output: vec![TxOut {
                value: Amount::from_sat(10_000),
                script_pubkey: ScriptBuf::new(),
            }],
        }
    }

    fn signer(index: u8) -> (SecretKey, PublicKey, Fingerprint) {
        let secp = Secp256k1::new();
        let secret = SecretKey::from_slice(&[index; 32]).unwrap();
        let public = PublicKey::new(secret.public_key(&secp));
        let fingerprint = Fingerprint::from([index; 4]);
        (secret, public, fingerprint)
    }

    fn proposal() -> (Psbt, Vec<(SecretKey, PublicKey, Fingerprint)>) {
        let mut psbt = Psbt::from_unsigned_tx(unsigned_tx(1)).unwrap();
        let signers = vec![signer(1), signer(2), signer(3)];
        let witness_script = Builder::new()
            .push_int(2)
            .push_key(&signers[0].1)
            .push_key(&signers[1].1)
            .push_key(&signers[2].1)
            .push_int(3)
            .push_opcode(OP_CHECKMULTISIG)
            .into_script();
        for input in &mut psbt.inputs {
            input.witness_utxo = Some(TxOut {
                value: Amount::from_sat(20_000),
                script_pubkey: ScriptBuf::new_p2wsh(&witness_script.wscript_hash()),
            });
            input.witness_script = Some(witness_script.clone());
            for (_, public, fingerprint) in &signers {
                input.bip32_derivation.insert(
                    public.inner,
                    (
                        *fingerprint,
                        DerivationPath::from_str("m/48'/1'/0'/2'/0/0").unwrap(),
                    ),
                );
            }
        }
        (psbt, signers)
    }

    fn sign_all_inputs(psbt: &mut Psbt, signer: &(SecretKey, PublicKey, Fingerprint)) {
        let secp = Secp256k1::new();
        let signatures = {
            let mut cache = SighashCache::new(&psbt.unsigned_tx);
            (0..psbt.inputs.len())
                .map(|index| {
                    let (message, sighash_type) = psbt.sighash_ecdsa(index, &mut cache).unwrap();
                    ecdsa::Signature {
                        signature: secp.sign_ecdsa(&message, &signer.0),
                        sighash_type,
                    }
                })
                .collect::<Vec<_>>()
        };
        for (input, signature) in psbt.inputs.iter_mut().zip(signatures) {
            input.partial_sigs.insert(signer.1, signature);
        }
    }

    fn sign_input(
        psbt: &mut Psbt,
        input_index: usize,
        signer: &(SecretKey, PublicKey, Fingerprint),
    ) {
        let secp = Secp256k1::new();
        let mut cache = SighashCache::new(&psbt.unsigned_tx);
        let (message, sighash_type) = psbt.sighash_ecdsa(input_index, &mut cache).unwrap();
        psbt.inputs[input_index].partial_sigs.insert(
            signer.1,
            ecdsa::Signature {
                signature: secp.sign_ecdsa(&message, &signer.0),
                sighash_type,
            },
        );
    }

    fn allowed_fingerprints(signers: &[(SecretKey, PublicKey, Fingerprint)]) -> Vec<Fingerprint> {
        signers.iter().map(|signer| signer.2).collect()
    }

    fn assert_merge_rejected_without_mutation(
        original: &mut Psbt,
        imported: Psbt,
        allowed: &[Fingerprint],
        expected: ProposalError,
    ) {
        let preserved = original.clone();
        assert_eq!(
            merge_signed_psbt(original, imported, allowed, 2),
            Err(expected)
        );
        assert_eq!(*original, preserved);
    }

    #[test]
    fn psbt_base64_round_trips_and_rejects_malformed_or_oversized_payloads() {
        let (psbt, _) = proposal();
        assert_eq!(decode_psbt(&encode_psbt(&psbt)).unwrap(), psbt);
        assert_eq!(
            decode_psbt("not a psbt").unwrap_err().code(),
            "malformed_psbt"
        );
        assert_eq!(
            decode_psbt(&"A".repeat(MAX_PSBT_BYTES * 2 + 1))
                .unwrap_err()
                .code(),
            "psbt_too_large"
        );
    }

    #[test]
    fn counts_only_signers_that_signed_every_input() {
        let (mut psbt, signers) = proposal();
        sign_all_inputs(&mut psbt, &signers[0]);
        sign_input(&mut psbt, 0, &signers[1]);
        let allowed = signers.iter().map(|signer| signer.2).collect::<Vec<_>>();
        let progress = signature_progress(&psbt, &allowed, 2).unwrap();
        assert_eq!(progress.signed, 1);
        assert!(!progress.can_finalize);
    }

    #[test]
    fn merges_matching_partial_psbts_until_threshold() {
        let (mut original, signers) = proposal();
        let allowed = signers.iter().map(|signer| signer.2).collect::<Vec<_>>();
        let mut first = original.clone();
        sign_all_inputs(&mut first, &signers[0]);
        assert_eq!(
            merge_signed_psbt(&mut original, first, &allowed, 2)
                .unwrap()
                .signed,
            1
        );
        let mut second = original.clone();
        sign_all_inputs(&mut second, &signers[1]);
        assert!(
            merge_signed_psbt(&mut original, second, &allowed, 2)
                .unwrap()
                .can_finalize
        );
    }

    #[test]
    fn rejects_duplicate_or_incomplete_signatures_without_mutating_the_proposal() {
        let (mut original, signers) = proposal();
        let allowed = signers.iter().map(|signer| signer.2).collect::<Vec<_>>();
        let mut first = original.clone();
        sign_all_inputs(&mut first, &signers[0]);
        merge_signed_psbt(&mut original, first, &allowed, 2).unwrap();

        let preserved = original.clone();
        assert_eq!(
            merge_signed_psbt(&mut original, preserved.clone(), &allowed, 2)
                .unwrap_err()
                .code(),
            "no_new_signatures"
        );
        assert_eq!(original, preserved);

        let mut incomplete = preserved.clone();
        sign_input(&mut incomplete, 0, &signers[1]);
        assert_eq!(
            merge_signed_psbt(&mut original, incomplete, &allowed, 2)
                .unwrap_err()
                .code(),
            "no_new_signatures"
        );
        assert_eq!(original, preserved);
    }

    #[test]
    fn rejects_changed_transactions_unknown_keys_non_all_sighashes_and_final_scripts() {
        let (mut original, signers) = proposal();
        let allowed = signers.iter().map(|signer| signer.2).collect::<Vec<_>>();
        let mismatch = Psbt::from_unsigned_tx(unsigned_tx(9)).unwrap();
        assert_eq!(
            merge_signed_psbt(&mut original, mismatch, &allowed, 2)
                .unwrap_err()
                .code(),
            "proposal_mismatch"
        );

        let mut unknown = original.clone();
        let stranger = signer(9);
        sign_all_inputs(&mut unknown, &stranger);
        assert_eq!(
            merge_signed_psbt(&mut original, unknown, &allowed, 2)
                .unwrap_err()
                .code(),
            "unknown_signer"
        );

        let mut unsupported = original.clone();
        sign_all_inputs(&mut unsupported, &signers[0]);
        unsupported.inputs[0]
            .partial_sigs
            .get_mut(&signers[0].1)
            .unwrap()
            .sighash_type = EcdsaSighashType::Single;
        assert_eq!(
            merge_signed_psbt(&mut original, unsupported, &allowed, 2)
                .unwrap_err()
                .code(),
            "unsupported_sighash"
        );

        let mut finalized = original.clone();
        finalized.inputs[0].final_script_witness = Some(Witness::from_slice(&[b"untrusted"]));
        assert_eq!(
            merge_signed_psbt(&mut original, finalized, &allowed, 2)
                .unwrap_err()
                .code(),
            "premature_finalization"
        );
    }

    #[test]
    fn rejects_invalid_partial_signatures_without_mutating_or_counting_them() {
        let (mut original, signers) = proposal();
        let allowed = allowed_fingerprints(&signers);
        let mut imported = original.clone();
        let secp = Secp256k1::new();
        let invalid = ecdsa::Signature::sighash_all(
            secp.sign_ecdsa(&Message::from_digest([9; 32]), &signers[0].0),
        );
        for input in &mut imported.inputs {
            input.partial_sigs.insert(signers[0].1, invalid);
        }

        assert_merge_rejected_without_mutation(
            &mut original,
            imported.clone(),
            &allowed,
            ProposalError::InvalidSignature,
        );
        assert_eq!(
            signature_progress(&imported, &allowed, 2),
            Err(ProposalError::InvalidSignature)
        );
    }

    #[test]
    fn rejects_every_non_signature_psbt_mutation() {
        use bdk_wallet::bitcoin::psbt::raw;

        let (mut original, signers) = proposal();
        let allowed = signers.iter().map(|signer| signer.2).collect::<Vec<_>>();

        let mut changed_origin = original.clone();
        changed_origin.inputs[0]
            .bip32_derivation
            .get_mut(&signers[0].1.inner)
            .unwrap()
            .1 = DerivationPath::from_str("m/48'/1'/9'/2'/0/0").unwrap();
        sign_all_inputs(&mut changed_origin, &signers[0]);
        assert_eq!(
            merge_signed_psbt(&mut original, changed_origin, &allowed, 2),
            Err(ProposalError::ProposalMismatch)
        );

        let mut proprietary = original.clone();
        proprietary.unknown.insert(
            raw::Key {
                type_value: 0xfc,
                key: b"malicious-metadata".to_vec(),
            },
            b"unreviewed".to_vec(),
        );
        sign_all_inputs(&mut proprietary, &signers[0]);
        assert_eq!(
            merge_signed_psbt(&mut original, proprietary, &allowed, 2),
            Err(ProposalError::ProposalMismatch)
        );
    }

    #[test]
    fn rejects_transaction_version_mutation_without_mutating_original() {
        let (mut original, signers) = proposal();
        let allowed = allowed_fingerprints(&signers);
        let mut imported = original.clone();
        imported.unsigned_tx.version = transaction::Version::ONE;
        sign_all_inputs(&mut imported, &signers[0]);

        assert_merge_rejected_without_mutation(
            &mut original,
            imported,
            &allowed,
            ProposalError::ProposalMismatch,
        );
    }

    #[test]
    fn rejects_recipient_script_mutation_without_mutating_original() {
        let (mut original, signers) = proposal();
        let allowed = allowed_fingerprints(&signers);
        let mut imported = original.clone();
        imported.unsigned_tx.output[0].script_pubkey = ScriptBuf::from_bytes(vec![0x51]);
        sign_all_inputs(&mut imported, &signers[0]);

        assert_merge_rejected_without_mutation(
            &mut original,
            imported,
            &allowed,
            ProposalError::ProposalMismatch,
        );
    }

    #[test]
    fn rejects_output_amount_mutation_without_mutating_original() {
        let (mut original, signers) = proposal();
        let allowed = allowed_fingerprints(&signers);
        let mut imported = original.clone();
        imported.unsigned_tx.output[0].value = Amount::from_sat(9_999);
        sign_all_inputs(&mut imported, &signers[0]);

        assert_merge_rejected_without_mutation(
            &mut original,
            imported,
            &allowed,
            ProposalError::ProposalMismatch,
        );
    }

    #[test]
    fn rejects_output_set_mutation_without_mutating_original() {
        let (mut original, signers) = proposal();
        let allowed = allowed_fingerprints(&signers);
        let mut imported = original.clone();
        imported.unsigned_tx.output.push(TxOut {
            value: Amount::from_sat(1),
            script_pubkey: ScriptBuf::from_bytes(vec![0x51]),
        });
        sign_all_inputs(&mut imported, &signers[0]);

        assert_merge_rejected_without_mutation(
            &mut original,
            imported,
            &allowed,
            ProposalError::ProposalMismatch,
        );
    }

    #[test]
    fn rejects_input_outpoint_mutation_without_mutating_original() {
        let (mut original, signers) = proposal();
        let allowed = allowed_fingerprints(&signers);
        let mut imported = original.clone();
        imported.unsigned_tx.input[0].previous_output.vout = 1;
        sign_all_inputs(&mut imported, &signers[0]);

        assert_merge_rejected_without_mutation(
            &mut original,
            imported,
            &allowed,
            ProposalError::ProposalMismatch,
        );
    }

    #[test]
    fn rejects_sequence_mutation_without_mutating_original() {
        let (mut original, signers) = proposal();
        let allowed = allowed_fingerprints(&signers);
        let mut imported = original.clone();
        imported.unsigned_tx.input[0].sequence = Sequence::MAX;
        sign_all_inputs(&mut imported, &signers[0]);

        assert_merge_rejected_without_mutation(
            &mut original,
            imported,
            &allowed,
            ProposalError::ProposalMismatch,
        );
    }

    #[test]
    fn rejects_locktime_mutation_without_mutating_original() {
        let (mut original, signers) = proposal();
        let allowed = allowed_fingerprints(&signers);
        let mut imported = original.clone();
        imported.unsigned_tx.lock_time = absolute::LockTime::from_consensus(1);
        sign_all_inputs(&mut imported, &signers[0]);

        assert_merge_rejected_without_mutation(
            &mut original,
            imported,
            &allowed,
            ProposalError::ProposalMismatch,
        );
    }

    #[test]
    fn rejects_fee_source_mutation_without_mutating_original() {
        let (mut original, signers) = proposal();
        let allowed = allowed_fingerprints(&signers);
        original.inputs[0].witness_utxo = Some(TxOut {
            value: Amount::from_sat(12_000),
            script_pubkey: ScriptBuf::from_bytes(vec![0x51]),
        });
        let mut imported = original.clone();
        imported.inputs[0].witness_utxo.as_mut().unwrap().value = Amount::from_sat(12_001);
        sign_all_inputs(&mut imported, &signers[0]);

        assert_merge_rejected_without_mutation(
            &mut original,
            imported,
            &allowed,
            ProposalError::ProposalMismatch,
        );
    }

    #[test]
    fn rejects_declared_sighash_mutation_without_mutating_original() {
        let (mut original, signers) = proposal();
        let allowed = allowed_fingerprints(&signers);
        let mut imported = original.clone();
        imported.inputs[0].sighash_type = Some(EcdsaSighashType::Single.into());
        sign_all_inputs(&mut imported, &signers[0]);

        assert_merge_rejected_without_mutation(
            &mut original,
            imported,
            &allowed,
            ProposalError::ProposalMismatch,
        );
    }

    #[test]
    fn rejects_key_origin_mutation_without_mutating_original() {
        let (mut original, signers) = proposal();
        let allowed = allowed_fingerprints(&signers);
        let mut imported = original.clone();
        imported.inputs[0]
            .bip32_derivation
            .get_mut(&signers[0].1.inner)
            .unwrap()
            .0 = Fingerprint::from([8; 4]);
        sign_all_inputs(&mut imported, &signers[0]);

        assert_merge_rejected_without_mutation(
            &mut original,
            imported,
            &allowed,
            ProposalError::ProposalMismatch,
        );
    }

    #[test]
    fn rejects_proprietary_metadata_mutations_at_every_scope() {
        use bdk_wallet::bitcoin::psbt::raw::ProprietaryKey;

        let (mut original, signers) = proposal();
        let allowed = allowed_fingerprints(&signers);
        let key = ProprietaryKey {
            prefix: b"groot-test".to_vec(),
            subtype: 1_u8,
            key: b"unreviewed".to_vec(),
        };

        for scope in 0..3 {
            let mut imported = original.clone();
            match scope {
                0 => {
                    imported.proprietary.insert(key.clone(), vec![1]);
                }
                1 => {
                    imported.inputs[0].proprietary.insert(key.clone(), vec![1]);
                }
                _ => {
                    imported.outputs[0].proprietary.insert(key.clone(), vec![1]);
                }
            }
            sign_all_inputs(&mut imported, &signers[0]);
            assert_merge_rejected_without_mutation(
                &mut original,
                imported,
                &allowed,
                ProposalError::ProposalMismatch,
            );
        }
    }

    #[test]
    fn rejects_both_finalization_forms_without_mutating_original() {
        let (mut original, signers) = proposal();
        let allowed = allowed_fingerprints(&signers);

        let mut script_sig = original.clone();
        script_sig.inputs[0].final_script_sig = Some(ScriptBuf::from_bytes(vec![0x51]));
        assert_merge_rejected_without_mutation(
            &mut original,
            script_sig,
            &allowed,
            ProposalError::PrematureFinalization,
        );

        let mut witness = original.clone();
        witness.inputs[0].final_script_witness = Some(Witness::from_slice(&[b"untrusted"]));
        assert_merge_rejected_without_mutation(
            &mut original,
            witness,
            &allowed,
            ProposalError::PrematureFinalization,
        );
    }

    #[test]
    fn rejects_injected_signer_origin_before_signature_acceptance() {
        let (mut original, signers) = proposal();
        let allowed = allowed_fingerprints(&signers);
        let stranger = signer(9);
        let mut imported = original.clone();
        for input in &mut imported.inputs {
            input.bip32_derivation.insert(
                stranger.1.inner,
                (
                    stranger.2,
                    DerivationPath::from_str("m/48'/1'/0'/2'/0/0").unwrap(),
                ),
            );
        }
        sign_all_inputs(&mut imported, &stranger);

        assert_merge_rejected_without_mutation(
            &mut original,
            imported,
            &allowed,
            ProposalError::ProposalMismatch,
        );
    }

    #[test]
    fn rejects_signature_from_known_but_disallowed_origin_without_mutating_original() {
        let (mut original, signers) = proposal();
        let allowed = allowed_fingerprints(&signers);
        let stranger = signer(9);
        for input in &mut original.inputs {
            input.bip32_derivation.insert(
                stranger.1.inner,
                (
                    stranger.2,
                    DerivationPath::from_str("m/48'/1'/0'/2'/0/0").unwrap(),
                ),
            );
        }
        let mut imported = original.clone();
        sign_all_inputs(&mut imported, &stranger);

        assert_merge_rejected_without_mutation(
            &mut original,
            imported,
            &allowed,
            ProposalError::UnknownSigner,
        );
    }

    #[test]
    fn empty_psbt_progress_fails_closed() {
        let empty = Psbt::from_unsigned_tx(Transaction {
            version: transaction::Version::TWO,
            lock_time: absolute::LockTime::ZERO,
            input: vec![],
            output: vec![],
        })
        .unwrap();
        assert_eq!(
            signature_progress(&empty, &[], 1).unwrap_err().code(),
            "no_inputs"
        );
    }

    #[test]
    fn every_proposal_error_has_a_stable_code_and_display() {
        let cases = [
            (ProposalError::MalformedPsbt, "malformed_psbt"),
            (ProposalError::PsbtTooLarge, "psbt_too_large"),
            (ProposalError::ProposalMismatch, "proposal_mismatch"),
            (ProposalError::UnknownSigner, "unknown_signer"),
            (ProposalError::UnsupportedSighash, "unsupported_sighash"),
            (ProposalError::InvalidSignature, "invalid_signature"),
            (
                ProposalError::PrematureFinalization,
                "premature_finalization",
            ),
            (ProposalError::NoInputs, "no_inputs"),
            (ProposalError::NoNewSignatures, "no_new_signatures"),
            (ProposalError::MergeFailed, "psbt_merge_failed"),
        ];
        for (error, code) in cases {
            assert_eq!(error.code(), code);
            assert_eq!(error.to_string(), code);
        }
        let oversized_decoded = BASE64.encode(vec![0_u8; MAX_PSBT_BYTES + 1]);
        assert_eq!(
            decode_psbt(&oversized_decoded),
            Err(ProposalError::PsbtTooLarge)
        );
    }
}
