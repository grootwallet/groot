//! Stable translation from trusted domain errors to the renderer-facing API contract.
//! This module is deliberately pure: it must not read wallet state or persistence.

use bdk_bitcoind_rpc::bitcoincore_rpc::{jsonrpc, Error as CoreRpcError};
use bdk_wallet::error::CreateTxError;

use crate::bsms::BsmsError;
use crate::build_network::{NAME as NETWORK_NAME, NETWORK};
use crate::external_signer::ExternalSignerError;
use crate::hardware::HardwareError;
use crate::multisig::PolicyError;
use crate::network::NetworkConfigError;
use crate::proposal::ProposalError;
use crate::recovery::RecoveryError;
use crate::registry::RegistryError;
use crate::secure_store::SecureStoreError;
use crate::ur_transport::UrTransportError;

use super::{api_error, internal, missing_hwi_value, ApiError};

pub(super) const RPC_UNAVAILABLE_MESSAGE: &str = "Could not connect to Bitcoin Core. Check that the node is running and review the RPC address, authentication, and network settings.";
pub(super) const RPC_PERMISSION_MESSAGE: &str = "Bitcoin Core accepted the RPC credentials, but this user is missing a required RPC permission. Add Groot's documented RPC methods to the user's rpcwhitelist and restart Bitcoin Core.";

pub(super) fn rpc_unavailable() -> ApiError {
    api_error("network_unavailable", RPC_UNAVAILABLE_MESSAGE)
}

pub(super) fn rpc_api_error(error: CoreRpcError) -> ApiError {
    match error {
        CoreRpcError::JsonRpc(jsonrpc::Error::Rpc(response))
            if response.message.contains("not allowed to call method") =>
        {
            api_error("invalid_node_config", RPC_PERMISSION_MESSAGE)
        }
        _ => rpc_unavailable(),
    }
}

pub(super) fn compact_filter_unavailable() -> ApiError {
    api_error(
        "network_unavailable",
        "Could not sync from the configured Bitcoin peers. Check the peer and proxy settings, then try again.",
    )
}

pub(super) fn registry_api_error(error: RegistryError) -> ApiError {
    match error {
        RegistryError::Missing => api_error("wallet_not_found", "No wallet exists on this device."),
        RegistryError::UnknownSelection => {
            api_error("wallet_not_found", "Select an available wallet first.")
        }
        RegistryError::InvalidName => api_error(
            "invalid_wallet_name",
            "Wallet names must contain 1 to 48 characters.",
        ),
        RegistryError::InvalidInactivityTimeout => api_error(
            "invalid_inactivity_timeout",
            "Automatic lock must be 1, 5, 15, 30, or 60 minutes.",
        ),
        RegistryError::Corrupt | RegistryError::UnsupportedVersion => api_error(
            "wallet_corrupt",
            "The wallet registry is corrupt or unsupported. No wallet was opened.",
        ),
        _ => api_error(
            "internal_error",
            "The wallet registry could not be updated.",
        ),
    }
}

pub(super) fn network_config_api_error(error: NetworkConfigError) -> ApiError {
    let message = match error {
        NetworkConfigError::InvalidUrl => "Enter a valid node URL and RPC username.",
        NetworkConfigError::InsecureRemote => {
            "Local nodes must use loopback. Remote nodes require HTTPS and username/password authentication."
        }
        NetworkConfigError::CredentialsInUrl => {
            "Do not place RPC credentials in the URL. Use the protected credential fields."
        }
        NetworkConfigError::UnsupportedScheme => "This build supports Bitcoin Core RPC backends only.",
        NetworkConfigError::UnknownPreset => "The selected backend preset is not recognized.",
        NetworkConfigError::InvalidProxy => {
            "Tor requires an HTTP v3 .onion RPC URL and a loopback SOCKS5 proxy such as 127.0.0.1:9050."
        }
        NetworkConfigError::InvalidPeerConfiguration => {
            "Enter valid numeric IP:port peers and require no more peers than manual mode provides."
        }
        NetworkConfigError::InsufficientPeerDiversity => {
            "Public test networks require at least two compact-filter peers."
        }
        NetworkConfigError::ProxyDnsLeak => {
            "Tor compact-filter sync requires manual numeric peers with public discovery disabled to prevent local DNS leaks."
        }
        NetworkConfigError::UnsupportedSyncSource => {
            "Mainnet wallets require the explicitly admitted local Bitcoin Core node for activity sync."
        }
    };
    api_error("invalid_node_config", message)
}

pub(super) fn network_config_api_error_from_url(_: url::ParseError) -> ApiError {
    network_config_api_error(NetworkConfigError::InvalidUrl)
}

pub(super) fn policy_api_error(error: PolicyError) -> ApiError {
    let message = match error {
        PolicyError::InvalidName => "Enter a wallet name and labels for every signer.",
        PolicyError::InvalidCosignerCount => "V1 requires between 3 and 7 signers.",
        PolicyError::UnsafeThreshold => "At least 2 signatures are required and the threshold cannot exceed the number of signers.",
        PolicyError::DuplicateFingerprint => "Every signer must have a unique master fingerprint.",
        PolicyError::DuplicateXpub => "Every signer must have a unique account xpub.",
        PolicyError::InvalidDescriptor => {
            if NETWORK == bdk_wallet::bitcoin::Network::Bitcoin {
                "A key or descriptor is invalid. Use a mainnet BIP48 account xpub."
            } else {
                "A key or descriptor is invalid. Use the compiled test-network BIP48 account tpub."
            }
        }
    };
    api_error(error.code(), message)
}

pub(super) fn bsms_api_error(error: BsmsError) -> ApiError {
    let message = match error {
        BsmsError::TooLarge => "BSMS descriptor records must be 256 KiB or smaller.",
        BsmsError::PrivateMaterial => {
            "A BSMS descriptor record must never contain private key material."
        }
        BsmsError::UnsupportedVersion => "Only the BIP129 BSMS 1.0 descriptor record is supported.",
        BsmsError::UnsupportedPaths => {
            "This wallet requires the standard BSMS receive/change paths /0/* and /1/*."
        }
        BsmsError::DescriptorMismatch => {
            "The receive and change descriptors do not describe the same wallet."
        }
        BsmsError::InvalidEncoding | BsmsError::InvalidDescriptor => {
            "Enter a valid public BSMS 1.0 descriptor record."
        }
    };
    api_error(error.code(), message)
}

pub(super) fn public_descriptor_api_error(error: BsmsError) -> ApiError {
    let message = match error {
        BsmsError::TooLarge => "Public descriptor backups must be 256 KiB or smaller.",
        BsmsError::PrivateMaterial => {
            "A public descriptor backup must never contain private key material."
        }
        BsmsError::UnsupportedVersion => "This descriptor backup version is not supported.",
        BsmsError::UnsupportedPaths => {
            "The backup must contain standard receive/change paths /0/* and /1/*."
        }
        BsmsError::DescriptorMismatch => {
            "The receive and change descriptors do not describe the same wallet."
        }
        BsmsError::InvalidEncoding | BsmsError::InvalidDescriptor => {
            "Enter a valid BSMS, Groot JSON, or public descriptor backup."
        }
    };
    api_error(error.code(), message)
}

pub(super) fn ur_api_error(error: UrTransportError) -> ApiError {
    let message = match error {
        UrTransportError::Empty => "Scan at least one crypto-psbt UR frame.",
        UrTransportError::TooLarge | UrTransportError::TooManyFrames => {
            "The animated QR payload exceeds Groot's safety limit."
        }
        UrTransportError::WrongType => "Scan a crypto-psbt UR, not a different QR payload type.",
        UrTransportError::Incomplete => "Keep scanning. More animated QR frames are required.",
        UrTransportError::InvalidPsbt => "The QR payload is not a valid PSBT.",
        UrTransportError::InvalidFrame | UrTransportError::InvalidCbor => {
            "The animated QR frame is malformed."
        }
    };
    api_error(error.code(), message)
}

pub(super) fn external_signer_api_error(error: ExternalSignerError) -> ApiError {
    let message = match error {
        ExternalSignerError::TooLarge => "Signer imports must be 256 KiB or smaller.",
        ExternalSignerError::PrivateMaterial => {
            "Private keys, seeds, and recovery words must never be imported into Groot."
        }
        ExternalSignerError::InvalidFormat => {
            "Use a BIP84 descriptor or a supported public-key JSON export."
        }
        ExternalSignerError::InvalidLabel => "Enter a signer label of 1 to 48 characters.",
        ExternalSignerError::InvalidFingerprint => {
            "The signer fingerprint must contain exactly 8 hexadecimal characters."
        }
        ExternalSignerError::InvalidDerivation => {
            if NETWORK == bdk_wallet::bitcoin::Network::Bitcoin {
                "Use the mainnet BIP84 account path m/84'/0'/0'."
            } else {
                "Use the test-chain BIP84 account path m/84'/1'/0'."
            }
        }
        ExternalSignerError::WrongNetwork => {
            if NETWORK == bdk_wallet::bitcoin::Network::Bitcoin {
                "Use a mainnet account xpub, not a test-network tpub."
            } else {
                "Use a test-chain account tpub, not a mainnet xpub."
            }
        }
        ExternalSignerError::InvalidDescriptor => {
            "The descriptor must be canonical public-only BIP84 single-sig."
        }
    };
    api_error(error.code(), message)
}

pub(super) fn proposal_api_error(error: ProposalError) -> ApiError {
    let message = match error {
        ProposalError::MalformedPsbt => "The PSBT is malformed.",
        ProposalError::PsbtTooLarge => "The PSBT exceeds Groot's size limit.",
        ProposalError::ProposalMismatch => {
            "The PSBT does not match the transaction you reviewed. No signatures were changed."
        }
        ProposalError::UnknownSigner => {
            "The PSBT contains a signature from an unknown signer. No signatures were changed."
        }
        ProposalError::UnsupportedSighash => {
            "The PSBT uses an unsupported signature type. Groot accepts only SIGHASH_ALL. No signatures were changed."
        }
        ProposalError::InvalidSignature => {
            "The PSBT contains an invalid signature. No signatures were changed."
        }
        ProposalError::PrematureFinalization => {
            "The PSBT was finalized outside Groot. Import a partially signed PSBT instead."
        }
        ProposalError::NoInputs => "The PSBT has no transaction inputs.",
        ProposalError::NoNewSignatures => {
            "This signer has already signed this proposal. No signatures were changed."
        }
        ProposalError::SignatureNotFound => {
            "This signer has no complete signature in the current proposal. No signatures were changed."
        }
        ProposalError::MergeFailed => {
            "Groot could not safely merge the signed PSBT. No signatures were changed."
        }
    };
    api_error(error.code(), message)
}

pub(super) fn recovery_api_error(error: RecoveryError) -> ApiError {
    api_error(error.code(), error)
}

pub(super) fn secure_store_error(error: SecureStoreError) -> ApiError {
    match error {
        SecureStoreError::InvalidCredential => {
            api_error("invalid_credential", "Incorrect passphrase / PIN.")
        }
        SecureStoreError::Corrupt => api_error(
            "wallet_corrupt",
            "The protected wallet secret is corrupt. Restore from your backup.",
        ),
        SecureStoreError::Unavailable => api_error(
            "secure_storage_unavailable",
            "Groot could not read or confirm a durable encrypted-wallet update. Check application data access and try again. The wallet remains locked; no plaintext wallet secret was written.",
        ),
    }
}

pub(super) fn hardware_api_error(error: HardwareError) -> ApiError {
    let message = match error {
        HardwareError::InvalidArgument => "The hardware signer request was rejected.",
        HardwareError::Unavailable => bundled_hwi_unavailable_message(),
        HardwareError::TimedOut => "The hardware signer did not respond in time.",
        HardwareError::Busy => "Another hardware-signer action is already in progress.",
        HardwareError::Cancelled => "The hardware-signer action was cancelled.",
        HardwareError::OutputTooLarge => "The hardware signer returned an oversized response.",
        HardwareError::CommandFailed(code) => match code {
            Some(-3 | -12) => "Unlock the signer and quit other wallet apps, then try again.",
            Some(-14) => "The action was cancelled on the hardware signer.",
            Some(-15) => "The hardware signer is busy. Close its companion app and try again.",
            Some(-8 | -9) => "This hardware signer does not support the requested operation.",
            _ => "The hardware signer rejected the request.",
        },
        HardwareError::Io => "Communication with the hardware signer failed.",
    };
    api_error(error.code(), message)
}

fn bundled_hwi_unavailable_message() -> &'static str {
    #[cfg(target_os = "macos")]
    if option_env!("GROOT_BUNDLED_HWI_RESOURCE").is_some() {
        return "Groot's bundled hardware support could not be verified or started. Reinstall this Groot release, then scan again; do not install HWI separately.";
    }
    "Bitcoin Core HWI is not installed or could not be started."
}

pub(super) fn hardware_device_api_error(error: HardwareError, device_type: &str) -> ApiError {
    if device_type.eq_ignore_ascii_case("trezor") && matches!(error, HardwareError::TimedOut) {
        return api_error(
            error.code(),
            "Trezor did not finish signing in time. If it remains on a loading screen, reconnect it, unlock it, scan again, and retry; the reviewed proposal and its signatures are unchanged.",
        );
    }
    if device_type.eq_ignore_ascii_case("ledger") {
        let message = match error {
            HardwareError::CommandFailed(Some(-3)) => {
                Some("Ledger disconnected. Reconnect it and try again.")
            }
            HardwareError::CommandFailed(Some(-12)) => {
                Some("Unlock Ledger and open the wallet's Bitcoin app, then try again.")
            }
            HardwareError::CommandFailed(Some(-13)) => {
                Some("Ledger could not register this wallet policy. Keep the Bitcoin app open and try again.")
            }
            HardwareError::CommandFailed(Some(-15)) => {
                Some("Ledger is busy. Quit Ledger Live and try again.")
            }
            _ => None,
        };
        if let Some(message) = message {
            return api_error(error.code(), message);
        }
    }
    if device_type.eq_ignore_ascii_case("coldcard")
        && matches!(error, HardwareError::CommandFailed(Some(-7)))
    {
        return api_error(
            error.code(),
            "Coldcard does not recognize this multisig wallet. Save the wallet policy in Groot, import it from Settings → Multisig Wallets → Import on Coldcard, verify the threshold and fingerprints, then try again.",
        );
    }
    if device_type.eq_ignore_ascii_case("bitbox02")
        && matches!(error, HardwareError::CommandFailed(Some(-8 | -9)))
    {
        return api_error(
            error.code(),
            "Finish the BitBox account name, policy, and address checks on-device.",
        );
    }
    if device_type.eq_ignore_ascii_case("bitbox02")
        && matches!(
            error,
            HardwareError::CommandFailed(None | Some(-3 | -12 | -13 | -15))
        )
    {
        return api_error(
            error.code(),
            "Keep BitBox connected and unlocked. Quit BitBoxApp, then try again.",
        );
    }
    hardware_api_error(error)
}

pub(super) fn missing_hardware_fingerprint(device_type: &str) -> ApiError {
    let message = match device_type.to_ascii_lowercase().as_str() {
        "ledger" => format!(
            "Unlock Ledger and open {} for this {NETWORK_NAME} wallet, then scan again.",
            if NETWORK == bdk_wallet::bitcoin::Network::Bitcoin {
                "Bitcoin"
            } else {
                "Bitcoin Test—not Bitcoin"
            }
        ),
        "bitbox02" => "Unlock BitBox, then try again.".to_owned(),
        "jade" => "Jade is still locked. Select it again and enter your PIN on Jade when prompted."
            .to_owned(),
        "coldcard" => "Unlock Coldcard and enable USB communication, then scan again.".to_owned(),
        "trezor" => "Unlock the device using Groot's PIN-matrix flow, then scan again.".to_owned(),
        _ => {
            "Unlock the hardware signer and put it in its Bitcoin app, then scan again.".to_owned()
        }
    };
    api_error("hardware_unavailable", message)
}

pub(super) fn unknown_hardware_signer() -> ApiError {
    api_error(
        "unknown_signer",
        "The connected device does not match any saved signer for this wallet.",
    )
}

pub(super) fn missing_hardware_psbt(
    device_type: &str,
    code: Option<i64>,
    fallback: &str,
) -> ApiError {
    match code {
        Some(code) => {
            hardware_device_api_error(HardwareError::CommandFailed(Some(code)), device_type)
        }
        None => missing_hwi_value(None, fallback),
    }
}

pub(super) fn hardware_xpub_api_error(
    error: HardwareError,
    device_type: &str,
    derivation_path: &str,
) -> ApiError {
    if device_type.eq_ignore_ascii_case("ledger")
        && derivation_path.contains("/1'")
        && matches!(error, HardwareError::CommandFailed(Some(-7 | -13)))
    {
        return api_error(
            error.code(),
            "Ledger is in the wrong app for this test-chain wallet. Quit Ledger Live, open Bitcoin Test—not Bitcoin—then reconnect and try again.",
        );
    }
    hardware_device_api_error(error, device_type)
}

pub(super) fn create_tx_api_error(error: CreateTxError) -> ApiError {
    match error {
        CreateTxError::OutputBelowDustLimit(_) => api_error(
            "invalid_amount",
            "The recipient amount is below Bitcoin's dust limit.",
        ),
        CreateTxError::CoinSelection(_)
        | CreateTxError::NoUtxosSelected
        | CreateTxError::UnknownUtxo => api_error("insufficient_funds", error),
        error => internal(error),
    }
}
