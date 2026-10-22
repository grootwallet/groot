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
            let lower = frame.to_ascii_lowercase();
            let (kind, payload) =
                ur::ur::decode(&lower).map_err(|_| CoordinationUrError::InvalidFrame)?;
            if !matches!(kind, Kind::MultiPart) {
                return Err(CoordinationUrError::InvalidFrame);
            }
            validate_fountain_part(&payload)?;
            decoder
                .receive(&lower)
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

/// Read one canonical minimal-length CBOR head for `major` (0 = unsigned int,
/// 2 = byte string, 4 = array) and return its value. Anything else fails
/// closed, so a head accepted here decodes to exactly one value under every
/// compliant parser and Groot cannot disagree with the downstream `ur` decoder
/// about what the counterparty declared.
fn cbor_head(input: &mut &[u8], major: u8) -> Result<u32, CoordinationUrError> {
    let (&head, rest) = input
        .split_first()
        .ok_or(CoordinationUrError::InvalidFrame)?;
    if head >> 5 != major {
        return Err(CoordinationUrError::InvalidFrame);
    }
    let (value, rest) = match head & 0x1f {
        info @ 0..=23 => (u32::from(info), rest),
        24 => {
            let (&byte, rest) = rest
                .split_first()
                .ok_or(CoordinationUrError::InvalidFrame)?;
            if byte < 24 {
                return Err(CoordinationUrError::InvalidFrame);
            }
            (u32::from(byte), rest)
        }
        25 => {
            let bytes: [u8; 2] = rest
                .get(..2)
                .ok_or(CoordinationUrError::InvalidFrame)?
                .try_into()
                .map_err(|_| CoordinationUrError::InvalidFrame)?;
            let value = u16::from_be_bytes(bytes);
            if value < 256 {
                return Err(CoordinationUrError::InvalidFrame);
            }
            (u32::from(value), &rest[2..])
        }
        26 => {
            let bytes: [u8; 4] = rest
                .get(..4)
                .ok_or(CoordinationUrError::InvalidFrame)?
                .try_into()
                .map_err(|_| CoordinationUrError::InvalidFrame)?;
            let value = u32::from_be_bytes(bytes);
            if value < 65_536 {
                return Err(CoordinationUrError::InvalidFrame);
            }
            (value, &rest[4..])
        }
        _ => return Err(CoordinationUrError::InvalidFrame),
    };
    *input = rest;
    Ok(value)
}

/// Bound the attacker-controlled fountain `Part` header of one multipart frame
/// before the pinned `ur` decoder adopts it. The decoder trusts the CBOR
/// `sequence_count`/`message_length` fields and allocates and shuffles vectors
/// proportional to them on first receive, so one small frame could otherwise
/// abort or hang the process. Coordination payloads (`MAX_COORDINATION_UR_BYTES`
/// plus the <= 3-byte envelope) always decode from at most
/// `MAX_COORDINATION_UR_FRAMES` frames, so larger declared counts can never
/// complete and fail closed before any allocation. Decode is exposed before
/// invitation/session authentication, so this boundary must hold
/// unauthenticated.
///
/// Only canonical minimal-length CBOR exactly matching the pinned encoder is
/// accepted, so no compliant peer's frame can be rejected.
fn validate_fountain_part(cbor: &[u8]) -> Result<(), CoordinationUrError> {
    let mut input = cbor;
    if cbor_head(&mut input, 4)? != 5 {
        return Err(CoordinationUrError::InvalidFrame);
    }
    let sequence = cbor_head(&mut input, 0)?;
    let sequence_count = cbor_head(&mut input, 0)?;
    let message_length = cbor_head(&mut input, 0)?;
    cbor_head(&mut input, 0)?; // checksum: inert for acceptance bounds
    let fragment_length = cbor_head(&mut input, 2)? as usize;
    input = input
        .get(fragment_length..)
        .ok_or(CoordinationUrError::InvalidFrame)?;
    if !input.is_empty()
        || sequence == 0
        || sequence_count == 0
        || sequence_count as usize > MAX_COORDINATION_UR_FRAMES
        || message_length == 0
        || message_length as usize > MAX_COORDINATION_UR_BYTES + 3
        || fragment_length == 0
        || fragment_length > MAX_COORDINATION_UR_FRAME_BYTES
    {
        return Err(CoordinationUrError::InvalidFrame);
    }
    Ok(())
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
            "ur:groot-invite/1-2/{}",
            ur::bytewords::encode(&cbor, ur::bytewords::Style::Minimal)
        )
    }

    #[test]
    fn fountain_header_bounds_match_compliant_frames() {
        for (sequence_count, message_length, fragment_length) in
            [(1, 100, 16), (512, 65_539, 4_096), (2, 512, 50)]
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
                "compliant header {sequence_count}/{message_length}/{fragment_length} must pass"
            );
        }
        for (sequence_count, message_length, fragment_length) in
            [(513, 100, 16), (2, 65_540, 16), (2, 100, 4_097)]
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
                Err(CoordinationUrError::InvalidFrame)
            );
        }
    }

    #[test]
    fn fountain_header_rejects_noncanonical_cbor_and_trailing_junk() {
        for cbor in [
            vec![0x9a, 0, 0, 0, 5],       // non-minimal array length
            vec![0x9f],                   // indefinite array
            vec![0x85, 0x1a, 0, 0, 0, 2], // non-minimal u32 value 2
            vec![0x86],                   // array(6)
        ] {
            assert!(
                validate_fountain_part(&cbor).is_err(),
                "non-canonical header {cbor:02x?} must fail"
            );
        }
        let frame = part_frame(2, 2, 100, &[0; 16]);
        let (_, mut trailing) = ur::ur::decode(&frame).unwrap();
        trailing.push(0);
        assert_eq!(
            validate_fountain_part(&trailing),
            Err(CoordinationUrError::InvalidFrame)
        );
    }

    #[test]
    fn hostile_fountain_headers_are_rejected_before_the_decoder_amplifies() {
        // The u32-scale declaration would otherwise allocate tens of gigabytes
        // inside the decoder and abort the process before any MAC/token
        // authentication could run; these assertions returning proves the gate
        // held unauthenticated.
        let cases = [
            part_frame(2, u32::MAX, 1_000, &[7; 16]), // allocation bomb
            part_frame(0, 2, 1_000, &[7; 16]),        // zero sequence
            part_frame(2, 0, 1_000, &[7; 16]),        // zero count
            part_frame(2, 2, 0, &[7; 16]),            // empty declared message
            part_frame(2, 2, u32::MAX, &[7; 16]),     // unbounded declared message
        ];
        for frame in cases {
            assert_eq!(
                decode(CoordinationUrType::Invitation, &[frame]),
                Err(CoordinationUrError::InvalidFrame),
                "hostile fountain header must fail closed"
            );
        }
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
