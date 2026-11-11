//! Shared allocation guard for the two bounded QR protocols.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct InvalidFountainPart;

#[derive(Clone, Copy)]
pub(crate) struct FountainLimits {
    pub max_parts: usize,
    pub max_message_bytes: usize,
    pub max_fragment_bytes: usize,
}

/// Read one canonical minimal-length CBOR head for `major` (0 = unsigned int,
/// 2 = byte string, 4 = array) and return its value. Anything else — wrong major
/// type, non-canonical length, indefinite form, overlong form — fails closed.
/// A head accepted here decodes to exactly one value under every compliant CBOR
/// parser, so Groot's own checks cannot disagree with the downstream decoder
/// about what the attacker declared.
fn cbor_head(input: &mut &[u8], major: u8) -> Result<u32, InvalidFountainPart> {
    let (&head, rest) = input.split_first().ok_or(InvalidFountainPart)?;
    if head >> 5 != major {
        return Err(InvalidFountainPart);
    }
    let (value, rest) = match head & 0x1f {
        info @ 0..=23 => (u32::from(info), rest),
        24 => {
            let (&byte, rest) = rest.split_first().ok_or(InvalidFountainPart)?;
            if byte < 24 {
                return Err(InvalidFountainPart);
            }
            (u32::from(byte), rest)
        }
        25 => {
            let bytes: [u8; 2] = rest
                .get(..2)
                .ok_or(InvalidFountainPart)?
                .try_into()
                .map_err(|_| InvalidFountainPart)?;
            let value = u16::from_be_bytes(bytes);
            if value < 256 {
                return Err(InvalidFountainPart);
            }
            (u32::from(value), &rest[2..])
        }
        26 => {
            let bytes: [u8; 4] = rest
                .get(..4)
                .ok_or(InvalidFountainPart)?
                .try_into()
                .map_err(|_| InvalidFountainPart)?;
            let value = u32::from_be_bytes(bytes);
            if value < 65_536 {
                return Err(InvalidFountainPart);
            }
            (value, &rest[4..])
        }
        _ => return Err(InvalidFountainPart),
    };
    *input = rest;
    Ok(value)
}

/// Validate canonical CBOR and bound declared allocation/work before the
/// fountain decoder sees an unauthenticated multipart frame. The caller owns
/// its protocol's envelope size, frame count and error classification.
pub(crate) fn validate_fountain_part(
    cbor: &[u8],
    limits: FountainLimits,
) -> Result<(), InvalidFountainPart> {
    let mut input = cbor;
    if cbor_head(&mut input, 4)? != 5 {
        return Err(InvalidFountainPart);
    }
    let sequence = cbor_head(&mut input, 0)?;
    let sequence_count = cbor_head(&mut input, 0)?;
    let message_length = cbor_head(&mut input, 0)?;
    cbor_head(&mut input, 0)?; // checksum: inert for acceptance bounds
    let fragment_length = cbor_head(&mut input, 2)? as usize;
    input = input.get(fragment_length..).ok_or(InvalidFountainPart)?;
    if !input.is_empty()
        || sequence == 0
        || sequence_count == 0
        || sequence_count as usize > limits.max_parts
        || message_length == 0
        || message_length as usize > limits.max_message_bytes
        || fragment_length == 0
        || fragment_length > limits.max_fragment_bytes
    {
        return Err(InvalidFountainPart);
    }
    Ok(())
}
