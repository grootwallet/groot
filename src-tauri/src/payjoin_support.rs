use bdk_wallet::bitcoin::address::NetworkUnchecked;
use bdk_wallet::bitcoin::Network;
use payjoin::Uri;
use serde::Serialize;
use std::str::FromStr;

use crate::build_network::network;

const MAX_PAYJOIN_URI_BYTES: usize = 8 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentRequestInspection {
    pub address: String,
    pub amount_sats: Option<String>,
    pub label: Option<String>,
    pub message: Option<String>,
    pub payjoin: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum PaymentRequestError {
    #[error("the payment request is empty or exceeds the 8 KiB input limit")]
    InvalidLength,
    #[error("the QR code is not a valid Bitcoin address or BIP21 payment URI")]
    Invalid,
    #[error("the payment request address is for a different Bitcoin network")]
    WrongNetwork,
}

#[derive(Debug, Serialize)]
pub struct PaymentRequestApiError {
    code: &'static str,
    message: String,
}

#[tauri::command]
pub fn payment_request_inspect(
    value: String,
) -> Result<PaymentRequestInspection, PaymentRequestApiError> {
    inspect_payment_request(&value, network()).map_err(|error| PaymentRequestApiError {
        code: "invalid_payment_request",
        message: error.to_string(),
    })
}

/// Parse either a plain Bitcoin address or a BIP21 payment URI. Address and
/// network validation stay in Rust; amounts cross IPC as decimal satoshi
/// strings so an untrusted URI can never lose integer precision in JavaScript.
pub fn inspect_payment_request(
    value: &str,
    network: Network,
) -> Result<PaymentRequestInspection, PaymentRequestError> {
    let value = value.trim();
    if value.is_empty() || value.len() > MAX_PAYJOIN_URI_BYTES {
        return Err(PaymentRequestError::InvalidLength);
    }

    let has_scheme = value
        .get(..8)
        .is_some_and(|scheme| scheme.eq_ignore_ascii_case("bitcoin:"));
    if !has_scheme {
        let address = bdk_wallet::bitcoin::Address::<NetworkUnchecked>::from_str(value)
            .map_err(|_| PaymentRequestError::Invalid)?
            .require_network(network)
            .map_err(|_| PaymentRequestError::WrongNetwork)?;
        return Ok(PaymentRequestInspection {
            address: address.to_string(),
            amount_sats: None,
            label: None,
            message: None,
            payjoin: false,
        });
    }

    // URI schemes are case-insensitive. Normalize only the scheme; never alter
    // the case-sensitive address or percent-encoded parameter payload.
    let normalized;
    let value = if value.starts_with("bitcoin:") {
        value
    } else {
        normalized = format!("bitcoin:{}", &value[8..]);
        &normalized
    };
    let uri = Uri::<NetworkUnchecked>::from_str(value).map_err(|_| PaymentRequestError::Invalid)?;
    let uri = uri
        .require_network(network)
        .map_err(|_| PaymentRequestError::WrongNetwork)?;
    Ok(PaymentRequestInspection {
        address: uri.address().to_string(),
        amount_sats: uri.amount().map(|amount| amount.to_sat().to_string()),
        label: uri.label(),
        message: uri.message(),
        payjoin: uri.extras().pj_is_supported(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use bdk_wallet::bitcoin::key::Secp256k1;
    use bdk_wallet::bitcoin::secp256k1::PublicKey;
    use bdk_wallet::bitcoin::{Address, CompressedPublicKey};

    // PDK 1.0's BIP77-inspired test vector. Expiration affects starting a
    // session, not structural URI inspection.
    const V2_URI: &str = "bitcoin:2N47mmrWXsNBvQR6k78hWJoTji57zXwNcU7?pjos=0&pj=HTTPS://PAYJO.IN/TXJCGKTKXLUUZ%23EX1WKV8CEC-OH1QYPM59NK2LXXS4890SUAXXYT25Z2VAPHP0X7YEYCJXGWAG6UG9ZU6NQ-RK1Q0DJS3VVDXWQQTLQ8022QGXSX7ML9PHZ6EDSF6AKEWQG758JPS2EV";

    fn mainnet_addresses() -> Vec<String> {
        let secp = Secp256k1::new();
        let public_key = PublicKey::from_str(
            "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
        )
        .unwrap();
        let compressed = CompressedPublicKey(public_key);
        let (x_only, _) = public_key.x_only_public_key();
        vec![
            Address::p2pkh(compressed, Network::Bitcoin).to_string(),
            Address::p2shwpkh(&compressed, Network::Bitcoin).to_string(),
            Address::p2wpkh(&compressed, Network::Bitcoin).to_string(),
            Address::p2tr(&secp, x_only, None, Network::Bitcoin).to_string(),
        ]
    }

    #[test]
    fn payment_requests_accept_every_standard_address_family() {
        for address in mainnet_addresses() {
            let inspected = inspect_payment_request(&address, Network::Bitcoin).unwrap();
            assert_eq!(inspected.address, address);
            assert_eq!(inspected.amount_sats, None);
            assert!(!inspected.payjoin);
        }
        assert_eq!(
            inspect_payment_request(
                "bc1qrur4qp60xej8v5st3e58xh6vnaqsfh0mf8w6kj",
                Network::Bitcoin
            )
            .unwrap()
            .address,
            "bc1qrur4qp60xej8v5st3e58xh6vnaqsfh0mf8w6kj"
        );
    }

    #[test]
    fn payment_uri_decodes_amount_and_text_without_precision_loss() {
        let address = &mainnet_addresses()[2];
        let inspected = inspect_payment_request(
            &format!("BITCOIN:{address}?amount=0.00050000&label=Alice%20Shop&message=Order%20104"),
            Network::Bitcoin,
        )
        .unwrap();
        assert_eq!(inspected.address, *address);
        assert_eq!(inspected.amount_sats.as_deref(), Some("50000"));
        assert_eq!(inspected.label.as_deref(), Some("Alice Shop"));
        assert_eq!(inspected.message.as_deref(), Some("Order 104"));
        assert!(!inspected.payjoin);
    }

    #[test]
    fn payment_requests_reject_wrong_network_and_unknown_required_parameters() {
        let address = &mainnet_addresses()[2];
        assert!(matches!(
            inspect_payment_request(address, Network::Regtest),
            Err(PaymentRequestError::WrongNetwork)
        ));
        assert!(matches!(
            inspect_payment_request(
                &format!("bitcoin:{address}?req-unsupported=1"),
                Network::Bitcoin
            ),
            Err(PaymentRequestError::Invalid)
        ));
    }

    #[test]
    fn payment_requests_identify_payjoin_without_starting_or_downgrading_it() {
        let inspected = inspect_payment_request(V2_URI, Network::Testnet).unwrap();
        assert!(inspected.payjoin);
        assert_eq!(inspected.amount_sats, None);
    }

    #[test]
    fn payment_request_command_maps_parser_errors_to_the_stable_api_contract() {
        let error = payment_request_inspect(String::new()).unwrap_err();
        assert_eq!(error.code, "invalid_payment_request");
        assert_eq!(
            error.message,
            PaymentRequestError::InvalidLength.to_string()
        );
    }
}
