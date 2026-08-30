//! Bounded Blockchain Commons UR v2 transport for `crypto-psbt`.
//!
//! The UR library handles Bytewords and fountain coding. This module owns the security-critical
//! type check, canonical CBOR byte-string envelope, resource bounds, and PSBT validation.

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use bdk_wallet::bitcoin::psbt::Psbt;
use ur::{ur::Kind, Decoder, Encoder};

pub const MAX_UR_PAYLOAD_BYTES: usize = 256 * 1024;
pub const MAX_UR_FRAMES: usize = 1_024;
pub const MAX_UR_FRAME_BYTES: usize = 4_096;
pub const MIN_FRAGMENT_BYTES: usize = 50;
pub const MAX_FRAGMENT_BYTES: usize = 400;
const MAX_BASE64_PSBT_BYTES: usize = MAX_UR_PAYLOAD_BYTES.div_ceil(3) * 4;
const UR_TYPE: &str = "crypto-psbt";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UrTransportError {
    Empty,
    TooLarge,
    TooManyFrames,
    InvalidFrame,
    WrongType,
    Incomplete,
    InvalidCbor,
    InvalidPsbt,
}

impl UrTransportError {
    pub fn code(self) -> &'static str {
        match self {
            Self::TooLarge | Self::TooManyFrames => "psbt_too_large",
            Self::InvalidPsbt => "malformed_psbt",
            Self::Empty
            | Self::InvalidFrame
            | Self::WrongType
            | Self::Incomplete
            | Self::InvalidCbor => "invalid_ur",
        }
    }
}

pub fn encode_psbt(
    base64_psbt: &str,
    fragment_bytes: usize,
) -> Result<Vec<String>, UrTransportError> {
    if !(MIN_FRAGMENT_BYTES..=MAX_FRAGMENT_BYTES).contains(&fragment_bytes) {
        return Err(UrTransportError::InvalidFrame);
    }
    let encoded = base64_psbt.trim();
    if encoded.len() > MAX_BASE64_PSBT_BYTES {
        return Err(UrTransportError::TooLarge);
    }
    let raw = BASE64
        .decode(encoded)
        .map_err(|_| UrTransportError::InvalidPsbt)?;
    if raw.is_empty() {
        return Err(UrTransportError::Empty);
    }
    if raw.len() > MAX_UR_PAYLOAD_BYTES {
        return Err(UrTransportError::TooLarge);
    }
    validate_psbt(&raw)?;
    let cbor = encode_cbor_bytes(&raw)?;
    let mut encoder =
        Encoder::new(&cbor, fragment_bytes, UR_TYPE).map_err(|_| UrTransportError::InvalidFrame)?;
    let frame_count = encoder.fragment_count().saturating_mul(2).max(1);
    if frame_count > MAX_UR_FRAMES {
        return Err(UrTransportError::TooManyFrames);
    }
    (0..frame_count)
        .map(|_| {
            let frame = encoder
                .next_part()
                .map_err(|_| UrTransportError::InvalidFrame)?;
            if frame.len() > MAX_UR_FRAME_BYTES {
                return Err(UrTransportError::TooLarge);
            }
            Ok(frame)
        })
        .collect()
}

pub fn decode_psbt(frames: &[String]) -> Result<String, UrTransportError> {
    if frames.is_empty() {
        return Err(UrTransportError::Empty);
    }
    if frames.len() > MAX_UR_FRAMES {
        return Err(UrTransportError::TooManyFrames);
    }
    for frame in frames {
        if frame.len() > MAX_UR_FRAME_BYTES {
            return Err(UrTransportError::TooLarge);
        }
        let lower = frame.to_ascii_lowercase();
        if !lower.starts_with("ur:crypto-psbt/") {
            return Err(UrTransportError::WrongType);
        }
    }
    let first = frames.first().ok_or(UrTransportError::Empty)?;
    let first = first.to_ascii_lowercase();
    let (kind, first_payload) =
        ur::ur::decode(&first).map_err(|_| UrTransportError::InvalidFrame)?;
    let cbor = if matches!(kind, Kind::SinglePart) {
        first_payload
    } else {
        let mut decoder = Decoder::default();
        for frame in frames {
            let lower = frame.to_ascii_lowercase();
            let (kind, payload) =
                ur::ur::decode(&lower).map_err(|_| UrTransportError::InvalidFrame)?;
            if !matches!(kind, Kind::MultiPart) {
                return Err(UrTransportError::InvalidFrame);
            }
            validate_fountain_part(&payload)?;
            decoder
                .receive(&lower)
                .map_err(|_| UrTransportError::InvalidFrame)?;
            if decoder.complete() {
                break;
            }
        }
        decoder
            .message()
            .map_err(|_| UrTransportError::InvalidFrame)?
            .ok_or(UrTransportError::Incomplete)?
    };
    if cbor.len() > MAX_UR_PAYLOAD_BYTES.saturating_add(5) {
        return Err(UrTransportError::TooLarge);
    }
    let raw = decode_cbor_bytes(&cbor)?;
    validate_psbt(raw)?;
    Ok(BASE64.encode(raw))
}

fn validate_psbt(raw: &[u8]) -> Result<(), UrTransportError> {
    Psbt::deserialize(raw)
        .map(|_| ())
        .map_err(|_| UrTransportError::InvalidPsbt)
}

/// Read one canonical minimal-length CBOR head for `major` (0 = unsigned int,
/// 2 = byte string, 4 = array) and return its value. Anything else — wrong major
/// type, non-canonical length, indefinite form, overlong form — fails closed.
/// A head accepted here decodes to exactly one value under every compliant CBOR
/// parser, so Groot's own checks cannot disagree with the downstream decoder
/// about what the attacker declared.
fn cbor_head(input: &mut &[u8], major: u8) -> Result<u32, UrTransportError> {
    let (&head, rest) = input.split_first().ok_or(UrTransportError::InvalidFrame)?;
    if head >> 5 != major {
        return Err(UrTransportError::InvalidFrame);
    }
    let (value, rest) = match head & 0x1f {
        info @ 0..=23 => (u32::from(info), rest),
        24 => {
            let (&byte, rest) = rest.split_first().ok_or(UrTransportError::InvalidFrame)?;
            if byte < 24 {
                return Err(UrTransportError::InvalidFrame);
            }
            (u32::from(byte), rest)
        }
        25 => {
            let bytes: [u8; 2] = rest
                .get(..2)
                .ok_or(UrTransportError::InvalidFrame)?
                .try_into()
                .map_err(|_| UrTransportError::InvalidFrame)?;
            let value = u16::from_be_bytes(bytes);
            if value < 256 {
                return Err(UrTransportError::InvalidFrame);
            }
            (u32::from(value), &rest[2..])
        }
        26 => {
            let bytes: [u8; 4] = rest
                .get(..4)
                .ok_or(UrTransportError::InvalidFrame)?
                .try_into()
                .map_err(|_| UrTransportError::InvalidFrame)?;
            let value = u32::from_be_bytes(bytes);
            if value < 65_536 {
                return Err(UrTransportError::InvalidFrame);
            }
            (value, &rest[4..])
        }
        _ => return Err(UrTransportError::InvalidFrame),
    };
    *input = rest;
    Ok(value)
}

/// Bound the attacker-controlled fountain `Part` header of one multipart frame
/// before the pinned `ur` decoder adopts it. The decoder trusts the CBOR
/// `sequence_count`/`message_length` fields and allocates and shuffles vectors
/// proportional to them on first receive, so a single small frame could
/// otherwise abort or hang the process. A legitimate `MAX_UR_PAYLOAD_BYTES`
/// message always decodes from at most `MAX_UR_FRAMES` frames here, so larger
/// declared counts can never complete and fail closed before any allocation.
///
/// Only canonical minimal-length CBOR exactly matching the pinned encoder is
/// accepted, so no compliant peer's frame can be rejected.
fn validate_fountain_part(cbor: &[u8]) -> Result<(), UrTransportError> {
    let mut input = cbor;
    if cbor_head(&mut input, 4)? != 5 {
        return Err(UrTransportError::InvalidFrame);
    }
    let sequence = cbor_head(&mut input, 0)?;
    let sequence_count = cbor_head(&mut input, 0)?;
    let message_length = cbor_head(&mut input, 0)?;
    cbor_head(&mut input, 0)?; // checksum: inert for acceptance bounds
    let fragment_length = cbor_head(&mut input, 2)? as usize;
    input = input
        .get(fragment_length..)
        .ok_or(UrTransportError::InvalidFrame)?;
    if !input.is_empty()
        || sequence == 0
        || sequence_count == 0
        || sequence_count as usize > MAX_UR_FRAMES
        || message_length == 0
        || message_length as usize > MAX_UR_PAYLOAD_BYTES + 5
        || fragment_length == 0
        || fragment_length > MAX_UR_FRAME_BYTES
    {
        return Err(UrTransportError::InvalidFrame);
    }
    Ok(())
}

fn encode_cbor_bytes(payload: &[u8]) -> Result<Vec<u8>, UrTransportError> {
    if payload.len() > MAX_UR_PAYLOAD_BYTES {
        return Err(UrTransportError::TooLarge);
    }
    let mut encoded = Vec::with_capacity(payload.len() + 5);
    match payload.len() {
        length @ 0..=23 => encoded.push(0x40 | length as u8),
        length @ 24..=255 => encoded.extend([0x58, length as u8]),
        length @ 256..=65_535 => {
            encoded.push(0x59);
            encoded.extend_from_slice(&(length as u16).to_be_bytes());
        }
        length => {
            encoded.push(0x5a);
            encoded.extend_from_slice(&(length as u32).to_be_bytes());
        }
    }
    encoded.extend_from_slice(payload);
    Ok(encoded)
}

fn decode_cbor_bytes(encoded: &[u8]) -> Result<&[u8], UrTransportError> {
    let (&head, rest) = encoded.split_first().ok_or(UrTransportError::InvalidCbor)?;
    let (length, payload) = match head {
        0x40..=0x57 => ((head & 0x1f) as usize, rest),
        0x58 => {
            let (&length, payload) = rest.split_first().ok_or(UrTransportError::InvalidCbor)?;
            if length < 24 {
                return Err(UrTransportError::InvalidCbor);
            }
            (length as usize, payload)
        }
        0x59 => {
            let bytes: [u8; 2] = rest
                .get(..2)
                .ok_or(UrTransportError::InvalidCbor)?
                .try_into()
                .map_err(|_| UrTransportError::InvalidCbor)?;
            let length = u16::from_be_bytes(bytes) as usize;
            if length <= 255 {
                return Err(UrTransportError::InvalidCbor);
            }
            (length, &rest[2..])
        }
        0x5a => {
            let bytes: [u8; 4] = rest
                .get(..4)
                .ok_or(UrTransportError::InvalidCbor)?
                .try_into()
                .map_err(|_| UrTransportError::InvalidCbor)?;
            let length = u32::from_be_bytes(bytes) as usize;
            if length <= 65_535 {
                return Err(UrTransportError::InvalidCbor);
            }
            (length, &rest[4..])
        }
        _ => return Err(UrTransportError::InvalidCbor),
    };
    if length > MAX_UR_PAYLOAD_BYTES || payload.len() != length {
        return Err(if length > MAX_UR_PAYLOAD_BYTES {
            UrTransportError::TooLarge
        } else {
            UrTransportError::InvalidCbor
        });
    }
    Ok(payload)
}

#[cfg(test)]
mod tests {
    use super::*;
    use bdk_wallet::bitcoin::{
        absolute::LockTime, hashes::Hash, psbt::raw, transaction::Version, Amount, OutPoint,
        ScriptBuf, Sequence, Transaction, TxIn, TxOut, Txid, Witness,
    };
    use ur::ur::Type;

    fn fixture_psbt(extra_bytes: usize) -> Vec<u8> {
        let mut psbt = Psbt::from_unsigned_tx(Transaction {
            version: Version::TWO,
            lock_time: LockTime::ZERO,
            input: vec![TxIn {
                previous_output: OutPoint {
                    txid: Txid::from_byte_array([1; 32]),
                    vout: 0,
                },
                script_sig: ScriptBuf::new(),
                sequence: Sequence::ENABLE_RBF_NO_LOCKTIME,
                witness: Witness::new(),
            }],
            output: vec![TxOut {
                value: Amount::from_sat(1_000),
                script_pubkey: ScriptBuf::new(),
            }],
        })
        .unwrap();
        if extra_bytes > 0 {
            psbt.unknown.insert(
                raw::Key {
                    type_value: 0x50,
                    key: vec![1],
                },
                vec![7; extra_bytes],
            );
        }
        psbt.serialize()
    }

    #[test]
    fn animated_crypto_psbt_round_trip_accepts_out_of_order_redundant_frames() {
        let psbt = BASE64.encode(fixture_psbt(2_000));
        let mut frames = encode_psbt(&psbt, 100).unwrap();
        frames.reverse();
        assert_eq!(decode_psbt(&frames).unwrap(), psbt);
    }

    #[test]
    fn canonical_cbor_boundaries_round_trip() {
        for length in [5, 23, 24, 255, 256, 65_535, 65_536] {
            let payload = vec![7; length];
            let encoded = encode_cbor_bytes(&payload).unwrap();
            assert_eq!(decode_cbor_bytes(&encoded).unwrap(), payload);
        }
    }

    #[test]
    fn rejects_wrong_type_invalid_psbt_noncanonical_cbor_and_resource_abuse() {
        assert_eq!(decode_psbt(&[]), Err(UrTransportError::Empty));
        assert_eq!(
            decode_psbt(&["ur:bytes/abcd".to_owned()]),
            Err(UrTransportError::WrongType)
        );
        assert_eq!(
            encode_psbt(&BASE64.encode(b"not psbt"), 100),
            Err(UrTransportError::InvalidPsbt)
        );
        assert_eq!(
            encode_psbt(&BASE64.encode(fixture_psbt(0)), 1),
            Err(UrTransportError::InvalidFrame)
        );
        assert_eq!(
            encode_psbt(&BASE64.encode(b"psbt\xffnot-a-complete-psbt"), 100),
            Err(UrTransportError::InvalidPsbt)
        );
        let malformed_ur = ur::ur::encode(
            &encode_cbor_bytes(b"psbt\xffnot-a-complete-psbt").unwrap(),
            &Type::Custom(UR_TYPE),
        );
        assert_eq!(
            decode_psbt(&[malformed_ur]),
            Err(UrTransportError::InvalidPsbt)
        );
        assert_eq!(
            decode_cbor_bytes(&[0x58, 0x01, 0]),
            Err(UrTransportError::InvalidCbor)
        );
        assert_eq!(
            decode_cbor_bytes(&[0x42, 0]),
            Err(UrTransportError::InvalidCbor)
        );
        assert_eq!(
            encode_cbor_bytes(&vec![0; MAX_UR_PAYLOAD_BYTES + 1]),
            Err(UrTransportError::TooLarge)
        );
    }

    #[test]
    fn error_codes_are_stable() {
        let cases = [
            (UrTransportError::Empty, "invalid_ur"),
            (UrTransportError::TooLarge, "psbt_too_large"),
            (UrTransportError::TooManyFrames, "psbt_too_large"),
            (UrTransportError::InvalidFrame, "invalid_ur"),
            (UrTransportError::WrongType, "invalid_ur"),
            (UrTransportError::Incomplete, "invalid_ur"),
            (UrTransportError::InvalidCbor, "invalid_ur"),
            (UrTransportError::InvalidPsbt, "malformed_psbt"),
        ];
        for (error, code) in cases {
            assert_eq!(error.code(), code);
        }
    }

    #[test]
    fn rejects_empty_oversized_and_excessively_fragmented_psbts() {
        assert_eq!(
            encode_psbt(&BASE64.encode([]), MIN_FRAGMENT_BYTES),
            Err(UrTransportError::Empty)
        );
        assert_eq!(
            encode_psbt(&"A".repeat(MAX_BASE64_PSBT_BYTES + 1), MIN_FRAGMENT_BYTES),
            Err(UrTransportError::TooLarge)
        );
        assert_eq!(
            encode_psbt(&BASE64.encode(fixture_psbt(100_000)), MIN_FRAGMENT_BYTES),
            Err(UrTransportError::TooManyFrames)
        );
    }

    fn part_frame(
        sequence: u32,
        sequence_count: u32,
        message_length: u32,
        fragment: &[u8],
    ) -> String {
        let mut cbor = Vec::new();
        cbor.push(0x85);
        let mut push_u32 = |value: u32| match value {
            0..=23 => cbor.push(value as u8),
            24..=255 => cbor.extend([24, value as u8]),
            256..=65_535 => {
                cbor.push(25);
                cbor.extend_from_slice(&(value as u16).to_be_bytes());
            }
            _ => {
                cbor.push(26);
                cbor.extend_from_slice(&value.to_be_bytes());
            }
        };
        push_u32(sequence);
        push_u32(sequence_count);
        push_u32(message_length);
        push_u32(0xdead_beef);
        match fragment.len() {
            length @ 0..=23 => cbor.push(0x40 | length as u8),
            length @ 24..=255 => cbor.extend([0x58, length as u8]),
            length @ 256..=65_535 => {
                cbor.push(0x59);
                cbor.extend_from_slice(&(length as u16).to_be_bytes());
            }
            length => {
                cbor.push(0x5a);
                cbor.extend_from_slice(&(length as u32).to_be_bytes());
            }
        }
        cbor.extend_from_slice(fragment);
        format!(
            "ur:crypto-psbt/1-2/{}",
            ur::bytewords::encode(&cbor, ur::bytewords::Style::Minimal)
        )
    }

    #[test]
    fn fountain_header_bounds_match_compliant_frames() {
        for (sequence_count, message_length, fragment_length) in
            [(1, 100, 16), (1_024, 262_149, 4_096), (2, 512, 50)]
        {
            let frame = part_frame(
                sequence_count,
                sequence_count,
                message_length,
                &vec![0; fragment_length],
            );
            let (_, payload) = ur::ur::decode(&frame).unwrap();
            assert!(
                validate_fountain_part(&payload).is_ok(),
                "legitimate header {sequence_count}/{message_length}/{fragment_length} must pass"
            );
        }
        // Values just above every acceptance limit fail closed.
        for (sequence_count, message_length, fragment_length) in
            [(1_025, 100, 16), (2, 262_150, 16), (2, 100, 4_097)]
        {
            let frame = part_frame(
                sequence_count,
                sequence_count,
                message_length,
                &vec![0; fragment_length],
            );
            let (_, payload) = ur::ur::decode(&frame).unwrap();
            assert_eq!(
                validate_fountain_part(&payload),
                Err(UrTransportError::InvalidFrame)
            );
        }
    }

    #[test]
    fn fountain_header_rejects_non_canonical_cbor_and_trailing_junk() {
        // Non-minimal integer 5 encoded in four bytes; indefinite/mistyped heads.
        for mut cbor in [
            vec![0x9a, 0, 0, 0, 5],       // non-minimal array length
            vec![0x9f],                   // indefinite array
            vec![0x85, 0x1a, 0, 0, 0, 2], // non-minimal u32 value 2
            vec![0x86],                   // array(6)
        ] {
            assert!(
                validate_fountain_part(&cbor).is_err(),
                "non-canonical header {cbor:02x?} must fail"
            );
            cbor.clear();
        }
        let mut trailing = {
            let frame = part_frame(2, 2, 100, &[0; 16]);
            let (_, payload) = ur::ur::decode(&frame).unwrap();
            payload
        };
        trailing.push(0);
        assert_eq!(
            validate_fountain_part(&trailing),
            Err(UrTransportError::InvalidFrame)
        );
    }

    #[test]
    fn hostile_fountain_headers_are_rejected_before_the_decoder_amplifies() {
        // One crafted frame per attack class. Without the pre-validation the
        // u32-scale sequence_count drives ~70 GB of decoder allocations and
        // aborts the process; these assertions returning proves the gate held.
        let cases = [
            part_frame(2, u32::MAX, 1_000, &[7; 16]), // allocation bomb
            part_frame(0, 2, 1_000, &[7; 16]),        // zero sequence underflow
            part_frame(2, 0, 1_000, &[7; 16]),        // zero count
            part_frame(2, 2, 0, &[7; 16]),            // empty declared message
            part_frame(2, 2, u32::MAX, &[7; 16]),     // unbounded declared message
        ];
        for frame in cases {
            assert_eq!(
                decode_psbt(&[frame]),
                Err(UrTransportError::InvalidFrame),
                "hostile fountain header must fail closed"
            );
        }
    }

    #[test]
    fn decodes_single_part_and_rejects_frame_resource_abuse() {
        let raw = fixture_psbt(0);
        let single = ur::ur::encode(&encode_cbor_bytes(&raw).unwrap(), &Type::Custom(UR_TYPE));
        assert_eq!(decode_psbt(&[single]).unwrap(), BASE64.encode(raw));

        assert_eq!(
            decode_psbt(&vec!["ur:crypto-psbt/a".to_owned(); MAX_UR_FRAMES + 1]),
            Err(UrTransportError::TooManyFrames)
        );
        assert_eq!(
            decode_psbt(&[format!("ur:crypto-psbt/{}", "a".repeat(MAX_UR_FRAME_BYTES))]),
            Err(UrTransportError::TooLarge)
        );
        assert_eq!(
            decode_psbt(&["ur:crypto-psbt/not-bytewords".to_owned()]),
            Err(UrTransportError::InvalidFrame)
        );
    }

    #[test]
    fn rejects_truncated_noncanonical_and_oversized_cbor() {
        for encoded in [
            vec![],
            vec![0x58],
            vec![0x59, 0],
            vec![0x59, 0, 24],
            vec![0x5a, 0, 0, 1],
            vec![0x5a, 0, 0, 1, 0],
            vec![0x60],
        ] {
            assert_eq!(
                decode_cbor_bytes(&encoded),
                Err(UrTransportError::InvalidCbor)
            );
        }
        assert_eq!(
            decode_cbor_bytes(&[0x5a, 0, 4, 0, 1]),
            Err(UrTransportError::TooLarge)
        );
    }
}
