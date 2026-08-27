//! Bounded UR v2 framing for accountless coordination payloads.
//!
//! BIP129 records remain standards-defined plaintext/encrypted bytes. These Groot UR type names
//! only provide animated QR framing and are never treated as authentication.

use ur::{ur::Kind, Decoder, Encoder};

pub const MAX_COORDINATION_UR_BYTES: usize = 64 * 1024;
pub const MAX_COORDINATION_UR_FRAMES: usize = 512;
pub const MAX_COORDINATION_UR_FRAME_BYTES: usize = 4_096;
const MIN_FRAGMENT_BYTES: usize = 50;
const MAX_FRAGMENT_BYTES: usize = 400;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CoordinationUrType {
    Invitation,
    Bsms,
    Wallet,
}

impl CoordinationUrType {
    pub fn name(self) -> &'static str {
        match self {
            Self::Invitation => "groot-invite",
            Self::Bsms => "groot-bsms",
            Self::Wallet => "groot-wallet",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "groot-invite" => Some(Self::Invitation),
            "groot-bsms" => Some(Self::Bsms),
            "groot-wallet" => Some(Self::Wallet),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CoordinationUrError {
    Empty,
    TooLarge,
    TooManyFrames,
    InvalidFrame,
    WrongType,
    Incomplete,
    InvalidCbor,
}

pub fn encode(
    payload_type: CoordinationUrType,
    payload: &[u8],
    fragment_bytes: usize,
) -> Result<Vec<String>, CoordinationUrError> {
    if payload.is_empty() {
        return Err(CoordinationUrError::Empty);
    }
    if payload.len() > MAX_COORDINATION_UR_BYTES {
        return Err(CoordinationUrError::TooLarge);
    }
    if !(MIN_FRAGMENT_BYTES..=MAX_FRAGMENT_BYTES).contains(&fragment_bytes) {
        return Err(CoordinationUrError::InvalidFrame);
    }
    let cbor = encode_cbor_bytes(payload)?;
    let mut encoder = Encoder::new(&cbor, fragment_bytes, payload_type.name())
        .map_err(|_| CoordinationUrError::InvalidFrame)?;
    let count = encoder.fragment_count().saturating_mul(2).max(1);
    if count > MAX_COORDINATION_UR_FRAMES {
        return Err(CoordinationUrError::TooManyFrames);
    }
    (0..count)
        .map(|_| {
            let frame = encoder
                .next_part()
                .map_err(|_| CoordinationUrError::InvalidFrame)?;
            if frame.len() > MAX_COORDINATION_UR_FRAME_BYTES {
                return Err(CoordinationUrError::TooLarge);
            }
            Ok(frame)
        })
        .collect()
}

pub fn decode(
    expected_type: CoordinationUrType,
    frames: &[String],
) -> Result<Vec<u8>, CoordinationUrError> {
    if frames.is_empty() {
        return Err(CoordinationUrError::Empty);
    }
    if frames.len() > MAX_COORDINATION_UR_FRAMES {
        return Err(CoordinationUrError::TooManyFrames);
    }
    let prefix = format!("ur:{}/", expected_type.name());
    for frame in frames {
        if frame.len() > MAX_COORDINATION_UR_FRAME_BYTES {
            return Err(CoordinationUrError::TooLarge);
        }
        if !frame.to_ascii_lowercase().starts_with(&prefix) {
            return Err(CoordinationUrError::WrongType);
        }
    }
    let first = frames[0].to_ascii_lowercase();
    let (kind, first_payload) =
        ur::ur::decode(&first).map_err(|_| CoordinationUrError::InvalidFrame)?;
    let cbor = if matches!(kind, Kind::SinglePart) {
        first_payload
    } else {
        let mut decoder = Decoder::default();
        for frame in frames {
            decoder
                .receive(&frame.to_ascii_lowercase())
                .map_err(|_| CoordinationUrError::InvalidFrame)?;
            if decoder.complete() {
                break;
            }
        }
        decoder
            .message()
            .map_err(|_| CoordinationUrError::InvalidFrame)?
            .ok_or(CoordinationUrError::Incomplete)?
    };
    decode_cbor_bytes(&cbor).map(ToOwned::to_owned)
}

fn encode_cbor_bytes(payload: &[u8]) -> Result<Vec<u8>, CoordinationUrError> {
    if payload.len() > MAX_COORDINATION_UR_BYTES {
        return Err(CoordinationUrError::TooLarge);
    }
    let mut encoded = Vec::with_capacity(payload.len() + 5);
    match payload.len() {
        length @ 0..=23 => encoded.push(0x40 | length as u8),
        length @ 24..=255 => encoded.extend([0x58, length as u8]),
        length @ 256..=65_535 => {
            encoded.push(0x59);
            encoded.extend_from_slice(&(length as u16).to_be_bytes());
        }
        _ => return Err(CoordinationUrError::TooLarge),
    }
    encoded.extend_from_slice(payload);
    Ok(encoded)
}

fn decode_cbor_bytes(encoded: &[u8]) -> Result<&[u8], CoordinationUrError> {
    let (&head, rest) = encoded
        .split_first()
        .ok_or(CoordinationUrError::InvalidCbor)?;
    let (length, payload) = match head {
        0x40..=0x57 => ((head & 0x1f) as usize, rest),
        0x58 => {
            let (&length, payload) = rest.split_first().ok_or(CoordinationUrError::InvalidCbor)?;
            if length < 24 {
                return Err(CoordinationUrError::InvalidCbor);
            }
            (length as usize, payload)
        }
        0x59 => {
            let bytes: [u8; 2] = rest
                .get(..2)
                .ok_or(CoordinationUrError::InvalidCbor)?
                .try_into()
                .map_err(|_| CoordinationUrError::InvalidCbor)?;
            let length = u16::from_be_bytes(bytes) as usize;
            if length <= 255 {
                return Err(CoordinationUrError::InvalidCbor);
            }
            (length, &rest[2..])
        }
        _ => return Err(CoordinationUrError::InvalidCbor),
    };
    if length > MAX_COORDINATION_UR_BYTES || payload.len() != length {
        return Err(if length > MAX_COORDINATION_UR_BYTES {
            CoordinationUrError::TooLarge
        } else {
            CoordinationUrError::InvalidCbor
        });
    }
    Ok(payload)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn multipart_round_trip_is_typed_and_bounded() {
        let payload = vec![42_u8; 2_000];
        let frames = encode(CoordinationUrType::Wallet, &payload, 100).unwrap();
        assert!(frames.len() > 1);
        assert_eq!(
            decode(CoordinationUrType::Wallet, &frames).unwrap(),
            payload
        );
        assert_eq!(
            decode(CoordinationUrType::Bsms, &frames),
            Err(CoordinationUrError::WrongType)
        );
    }

    #[test]
    fn rejects_noncanonical_or_oversized_payloads() {
        assert_eq!(
            encode(
                CoordinationUrType::Invitation,
                &vec![0_u8; MAX_COORDINATION_UR_BYTES + 1],
                100,
            ),
            Err(CoordinationUrError::TooLarge)
        );
        assert_eq!(
            decode_cbor_bytes(&[0x58, 0x01, 0]),
            Err(CoordinationUrError::InvalidCbor)
        );
    }

    #[test]
    fn ur_types_and_every_public_bound_are_stable() {
        for (kind, name) in [
            (CoordinationUrType::Invitation, "groot-invite"),
            (CoordinationUrType::Bsms, "groot-bsms"),
            (CoordinationUrType::Wallet, "groot-wallet"),
        ] {
            assert_eq!(kind.name(), name);
            assert_eq!(CoordinationUrType::parse(name), Some(kind));
        }
        assert_eq!(CoordinationUrType::parse("unknown"), None);
        assert_eq!(
            encode(CoordinationUrType::Invitation, b"", 100),
            Err(CoordinationUrError::Empty)
        );
        assert_eq!(
            encode(CoordinationUrType::Invitation, b"x", 49),
            Err(CoordinationUrError::InvalidFrame)
        );
        assert_eq!(
            encode(CoordinationUrType::Invitation, b"x", 401),
            Err(CoordinationUrError::InvalidFrame)
        );
        assert_eq!(
            encode(
                CoordinationUrType::Invitation,
                &vec![0; MAX_COORDINATION_UR_BYTES - 1],
                MIN_FRAGMENT_BYTES,
            ),
            Err(CoordinationUrError::TooManyFrames)
        );
        assert_eq!(
            decode(CoordinationUrType::Wallet, &[]),
            Err(CoordinationUrError::Empty)
        );
        assert_eq!(
            decode(
                CoordinationUrType::Wallet,
                &vec!["ur:groot-wallet/a".to_owned(); MAX_COORDINATION_UR_FRAMES + 1],
            ),
            Err(CoordinationUrError::TooManyFrames)
        );
        assert_eq!(
            decode(
                CoordinationUrType::Wallet,
                &[format!(
                    "ur:groot-wallet/{}",
                    "a".repeat(MAX_COORDINATION_UR_FRAME_BYTES)
                )],
            ),
            Err(CoordinationUrError::TooLarge)
        );
        assert_eq!(
            decode(
                CoordinationUrType::Wallet,
                &["ur:groot-wallet/not-valid".to_owned()],
            ),
            Err(CoordinationUrError::InvalidFrame)
        );
    }

    #[test]
    fn canonical_cbor_lengths_and_decoder_failures_are_exhaustive() {
        for length in [1, 23, 24, 255, 256, 65_535] {
            let payload = vec![7; length];
            let encoded = encode_cbor_bytes(&payload).unwrap();
            assert_eq!(decode_cbor_bytes(&encoded).unwrap(), payload);
        }
        assert_eq!(
            encode_cbor_bytes(&vec![0; MAX_COORDINATION_UR_BYTES + 1]),
            Err(CoordinationUrError::TooLarge)
        );
        for malformed in [
            vec![],
            vec![0x58],
            vec![0x59, 0],
            vec![0x59, 0, 1, 0],
            vec![0x60],
            vec![0x41],
            vec![0x42, 1],
        ] {
            assert_eq!(
                decode_cbor_bytes(&malformed),
                Err(CoordinationUrError::InvalidCbor)
            );
        }

        let multipart = encode(CoordinationUrType::Wallet, &[9; 2_000], 100).unwrap();
        assert_eq!(
            decode(CoordinationUrType::Wallet, &multipart[..1]),
            Err(CoordinationUrError::Incomplete)
        );
        let single = encode(CoordinationUrType::Invitation, b"small", 100).unwrap();
        assert_eq!(
            decode(CoordinationUrType::Invitation, &single).unwrap(),
            b"small"
        );
    }
}
