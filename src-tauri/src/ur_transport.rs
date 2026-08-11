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
            decoder
                .receive(&frame.to_ascii_lowercase())
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
