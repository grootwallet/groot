use crate::{coordination::CoordinationError, coordination_transport::CoordinationUrError};

use super::{api_error, ApiError};

pub(super) fn invalid_payload(message: impl Into<String>) -> ApiError {
    api_error("invalid_coordination_payload", message.into())
}

pub(super) fn session_missing() -> ApiError {
    api_error(
        "pairing_session_not_found",
        "This one-time pairing session is missing, expired, or was cancelled.",
    )
}

pub(super) fn coordination_api_error(error: CoordinationError) -> ApiError {
    let message = match error {
        CoordinationError::TooLarge => "The coordination payload exceeds Groot's safety limit.",
        CoordinationError::InvalidToken | CoordinationError::AuthenticationFailed => {
            "The encrypted response does not authenticate to this one-time desktop invitation."
        }
        CoordinationError::InvalidSignature => {
            "The mobile signer identity proof is invalid. Nothing was paired."
        }
        CoordinationError::WrongNetwork => "The coordination payload belongs to another network.",
        CoordinationError::WrongDerivation => {
            "Groot mobile V1 requires the compiled-network BIP48 native-SegWit account."
        }
        CoordinationError::DescriptorMismatch => {
            "The final policy does not exactly contain the invited signer and agreed policy."
        }
        CoordinationError::UnsupportedVersion => "This coordination version is unsupported.",
        CoordinationError::ExpiredInvitation => {
            "This pairing invitation expired. Ask desktop for a new QR."
        }
        CoordinationError::InvalidEncoding | CoordinationError::InvalidKeyRecord => {
            "The coordination payload is malformed or unsupported."
        }
    };
    api_error(error.code(), message)
}

pub(super) fn coordination_ur_api_error(error: CoordinationUrError) -> ApiError {
    let message = match error {
        CoordinationUrError::TooLarge | CoordinationUrError::TooManyFrames => {
            "The coordination QR exceeds Groot's bounded transport limits."
        }
        CoordinationUrError::WrongType => "Scan the QR requested by this exact step.",
        CoordinationUrError::Empty
        | CoordinationUrError::InvalidFrame
        | CoordinationUrError::Incomplete
        | CoordinationUrError::InvalidCbor => "The coordination QR is malformed or incomplete.",
    };
    api_error("invalid_coordination_qr", message)
}
