use super::{api_error, internal, ApiResult, NETWORK_NAME};
use bdk_wallet::bitcoin::Txid;
use std::str::FromStr;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

pub(crate) fn transaction_explorer_url(txid: &str) -> ApiResult<Option<String>> {
    transaction_explorer_url_for_network(NETWORK_NAME, txid)
}

fn transaction_explorer_url_for_network(network: &str, txid: &str) -> ApiResult<Option<String>> {
    let txid = Txid::from_str(txid.trim())
        .map_err(|_| api_error("invalid_transaction", "The transaction ID is invalid."))?;
    if network == "regtest" {
        return Ok(None);
    }
    let network_path = match network {
        "signet" => "signet",
        "testnet4" => "testnet4",
        _ => {
            return Err(api_error(
                "explorer_unavailable",
                "No approved transaction explorer is available for this network.",
            ))
        }
    };
    Ok(Some(format!(
        "https://mempool.space/{network_path}/tx/{txid}"
    )))
}

#[tauri::command]
pub fn transaction_explorer_open(app: AppHandle, txid: String) -> ApiResult<()> {
    let url = transaction_explorer_url(&txid)?.ok_or_else(|| {
        api_error(
            "explorer_unavailable",
            "mempool.space cannot see local Regtest transactions.",
        )
    })?;
    app.opener()
        .open_url(url, None::<String>)
        .map_err(|_| internal("The system browser could not open the approved explorer URL."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_transaction_ids_before_building_a_url() {
        assert_eq!(
            transaction_explorer_url("https://example.com")
                .unwrap_err()
                .code,
            "invalid_transaction"
        );
    }

    #[test]
    fn only_builds_exact_approved_mempool_space_routes() {
        let txid = "11".repeat(32);
        assert_eq!(
            transaction_explorer_url_for_network("testnet4", &txid).unwrap(),
            Some(format!("https://mempool.space/testnet4/tx/{txid}"))
        );
        assert_eq!(
            transaction_explorer_url_for_network("signet", &txid).unwrap(),
            Some(format!("https://mempool.space/signet/tx/{txid}"))
        );
        assert_eq!(
            transaction_explorer_url_for_network("regtest", &txid).unwrap(),
            None
        );
        assert_eq!(
            transaction_explorer_url_for_network("mainnet", &txid)
                .unwrap_err()
                .code,
            "explorer_unavailable"
        );
    }
}
