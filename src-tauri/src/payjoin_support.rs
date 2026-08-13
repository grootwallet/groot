use bdk_wallet::bitcoin::address::NetworkUnchecked;
use bdk_wallet::bitcoin::Network;
use payjoin::Uri;
use serde::Serialize;
use std::str::FromStr;

const MAX_PAYJOIN_URI_BYTES: usize = 8 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PayjoinUriInspection {
    pub address: String,
    pub amount: Option<u64>,
    pub label: Option<String>,
    pub message: Option<String>,
    pub endpoint: String,
    pub version: &'static str,
}

#[derive(Debug, thiserror::Error)]
pub enum PayjoinUriError {
    #[error("the Payjoin URI is empty or exceeds the 8 KiB input limit")]
    InvalidLength,
    #[error("the request is not a valid BIP21 URI with Payjoin V2 parameters")]
    Invalid,
    #[error("the Payjoin address is for a different Bitcoin network")]
    WrongNetwork,
    #[error("the BIP21 URI does not offer Payjoin V2; Groot never silently downgrades to V1")]
    Unsupported,
}

/// Parse the protocol request at the trusted Rust boundary. The dependency is
/// built with only PDK's `v2` feature, so a V1-only endpoint is rejected rather
/// than treated as a normal address or silently downgraded.
pub fn inspect_uri(value: &str, network: Network) -> Result<PayjoinUriInspection, PayjoinUriError> {
    let value = value.trim();
    if value.is_empty() || value.len() > MAX_PAYJOIN_URI_BYTES {
        return Err(PayjoinUriError::InvalidLength);
    }
    let uri = Uri::<NetworkUnchecked>::from_str(value).map_err(|_| PayjoinUriError::Invalid)?;
    let uri = uri
        .require_network(network)
        .map_err(|_| PayjoinUriError::WrongNetwork)?;
    let uri = uri
        .check_pj_supported()
        .map_err(|_| PayjoinUriError::Unsupported)?;
    Ok(PayjoinUriInspection {
        address: uri.address().to_string(),
        amount: uri.amount().map(|amount| amount.to_sat()),
        label: uri.label(),
        message: uri.message(),
        endpoint: uri.extras().endpoint(),
        version: "v2",
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // PDK 1.0's BIP77-inspired test vector. Expiration affects starting a
    // session, not structural URI inspection.
    const V2_URI: &str = "bitcoin:2N47mmrWXsNBvQR6k78hWJoTji57zXwNcU7?pjos=0&pj=HTTPS://PAYJO.IN/TXJCGKTKXLUUZ%23EX1WKV8CEC-OH1QYPM59NK2LXXS4890SUAXXYT25Z2VAPHP0X7YEYCJXGWAG6UG9ZU6NQ-RK1Q0DJS3VVDXWQQTLQ8022QGXSX7ML9PHZ6EDSF6AKEWQG758JPS2EV";

    #[test]
    fn accepts_only_a_structurally_valid_v2_uri_on_the_compiled_network() {
        let inspected = inspect_uri(V2_URI, Network::Testnet).unwrap();
        assert_eq!(inspected.version, "v2");
        assert_eq!(inspected.address, "2N47mmrWXsNBvQR6k78hWJoTji57zXwNcU7");
        assert!(inspected
            .endpoint
            .to_ascii_lowercase()
            .starts_with("https://payjo.in/"));
        let with_amount = V2_URI.replacen('?', "?amount=0.00050000&", 1);
        assert_eq!(
            inspect_uri(&with_amount, Network::Testnet).unwrap().amount,
            Some(50_000)
        );
    }

    #[test]
    fn rejects_plain_bip21_and_wrong_network_requests() {
        assert!(matches!(
            inspect_uri(
                "bitcoin:2N47mmrWXsNBvQR6k78hWJoTji57zXwNcU7?amount=0.001",
                Network::Testnet
            ),
            Err(PayjoinUriError::Unsupported)
        ));
        assert!(matches!(
            inspect_uri(V2_URI, Network::Bitcoin),
            Err(PayjoinUriError::WrongNetwork)
        ));
    }

    #[test]
    fn rejects_empty_oversized_and_malformed_requests_with_stable_errors() {
        let cases = [
            ("".to_owned(), PayjoinUriError::InvalidLength),
            (
                "x".repeat(MAX_PAYJOIN_URI_BYTES + 1),
                PayjoinUriError::InvalidLength,
            ),
            ("bitcoin:%".to_owned(), PayjoinUriError::Invalid),
        ];
        for (input, expected) in cases {
            let error = inspect_uri(&input, Network::Regtest).unwrap_err();
            assert_eq!(
                std::mem::discriminant(&error),
                std::mem::discriminant(&expected)
            );
            assert!(!error.to_string().is_empty());
            assert!(std::error::Error::source(&error).is_none());
        }
    }
}
