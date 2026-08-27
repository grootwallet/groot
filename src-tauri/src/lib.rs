use tauri::Manager as _;

pub mod airgap;
mod auth;
pub mod bsms;
mod build_network;
mod compact_filters;
pub mod coordination;
pub mod coordination_transport;
mod direct_rpc;
pub mod external_signer;
mod hardware;
mod label_provenance;
mod multisig;
mod native_backup;
pub mod network;
mod notifications;
mod payjoin_support;
mod privacy_selection;
mod process_lock;
pub mod proposal;
pub mod recovery;
pub mod registry;
mod release_policy;
mod secure_store;
mod session;
mod tor_rpc;
pub mod ur_transport;
mod wallet;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimePlatformDto {
    platform: &'static str,
    mobile: bool,
    network: &'static str,
    version: &'static str,
    commit: &'static str,
}

#[tauri::command]
fn runtime_platform() -> RuntimePlatformDto {
    #[cfg(target_os = "ios")]
    let platform = "ios";
    #[cfg(target_os = "android")]
    let platform = "android";
    #[cfg(target_os = "macos")]
    let platform = "macos";
    #[cfg(target_os = "windows")]
    let platform = "windows";
    #[cfg(target_os = "linux")]
    let platform = "linux";
    RuntimePlatformDto {
        platform,
        mobile: cfg!(mobile),
        network: build_network::NAME,
        version: env!("CARGO_PKG_VERSION"),
        commit: env!("GROOT_BUILD_COMMIT"),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let lock = process_lock::ProcessLock::acquire_for_app(app.handle())?;
            app.manage(lock);
            Ok(())
        })
        .manage(wallet::AppState::default())
        .invoke_handler(tauri::generate_handler![
            runtime_platform,
            wallet::profile_commands::wallet_exists,
            wallet::ur_encode_psbt,
            wallet::ur_decode_psbt,
            wallet::profile_commands::wallet_lock,
            wallet::profile_commands::wallet_lock_all,
            wallet::profile_commands::wallet_profiles,
            wallet::profile_commands::wallet_session,
            wallet::profile_commands::wallet_profile_compatibility,
            wallet::profile_commands::wallet_rename,
            wallet::profile_commands::wallet_inactivity_timeout_save,
            wallet::profile_commands::wallet_select,
            wallet::profile_commands::wallet_generate_mnemonic,
            wallet::profile_commands::wallet_cancel_onboarding,
            wallet::profile_commands::wallet_create,
            wallet::profile_commands::wallet_verify_backup,
            wallet::profile_commands::wallet_reveal_and_verify_backup,
            wallet::profile_commands::wallet_recover,
            wallet::profile_commands::wallet_unlock,
            wallet::payment_draft_commands::payment_draft,
            wallet::payment_draft_commands::payment_draft_save,
            wallet::payment_draft_commands::payment_draft_clear,
            wallet::profile_commands::wallet_snapshot,
            wallet::profile_commands::wallet_sync,
            wallet::profile_commands::wallet_sync_cancel,
            wallet::profile_commands::wallet_sync_status,
            wallet::profile_commands::wallet_notifications,
            wallet::profile_commands::wallet_notifications_ack,
            wallet::profile_commands::address_create,
            wallet::profile_commands::address_discard,
            wallet::profile_commands::coin_set_frozen,
            wallet::profile_commands::multisig_coin_set_frozen,
            wallet::profile_commands::fees_estimate,
            wallet::profile_commands::node_config,
            wallet::profile_commands::node_config_save,
            wallet::profile_commands::network_setup_sources,
            wallet::profile_commands::network_setup_adopt,
            wallet::profile_commands::node_connection_test,
            wallet::profile_commands::wallet_sync_source,
            wallet::profile_commands::wallet_sync_source_save,
            wallet::payjoin_uri_inspect,
            wallet::profile_commands::recovery_scan_settings,
            wallet::profile_commands::recovery_scan_settings_save,
            wallet::profile_commands::recovery_scan_status,
            wallet::profile_commands::wallet_full_rescan,
            wallet::profile_commands::wallet_full_rescan_cancel,
            wallet::hardware_commands::hardware_list,
            wallet::hardware_commands::hardware_cancel_operations,
            wallet::hardware_commands::hardware_list_for_device_types,
            wallet::hardware_commands::hardware_find_saved_device,
            wallet::hardware_commands::hardware_prompt_pin,
            wallet::hardware_commands::hardware_send_pin,
            wallet::hardware_commands::hardware_check_cosigner,
            wallet::hardware_commands::hardware_check_external_signer,
            wallet::hardware_commands::hardware_health_checks,
            wallet::hardware_commands::hardware_import_cosigner,
            wallet::hardware_commands::external_signer_parse_import,
            wallet::hardware_commands::hardware_import_external_signer,
            wallet::hardware_commands::external_signer_create,
            wallet::hardware_commands::external_signer_wallet,
            wallet::hardware_commands::external_signer_rename,
            wallet::hardware_commands::external_signer_export_descriptor,
            wallet::hardware_commands::external_signer_proposals,
            wallet::hardware_commands::external_signer_proposal_import,
            wallet::hardware_commands::external_signer_proposal_discard_signature,
            wallet::hardware_commands::hardware_sign_external,
            wallet::hardware_commands::external_signer_proposal_broadcast,
            wallet::hardware_commands::external_signer_proposal_cancel,
            wallet::hardware_commands::hardware_verify_multisig_address,
            wallet::hardware_commands::hardware_verify_multisig_policy,
            wallet::hardware_commands::hardware_verify_multisig_draft_policy,
            wallet::hardware_commands::hardware_verify_external_address,
            wallet::hardware_commands::multisig_signer_policy_verifications,
            wallet::multisig_acknowledge_coldcard_policy,
            wallet::hardware_commands::multisig_policy_verification_address,
            wallet::hardware_commands::multisig_draft_policy_verification_address,
            wallet::multisig_setup_commands::multisig_preview,
            wallet::coordination_commands::coordination_pairing_invitation,
            wallet::coordination_commands::coordination_pairing_cancel,
            wallet::coordination_commands::coordination_decode_invitation,
            wallet::coordination_commands::coordination_mobile_accept,
            wallet::coordination_commands::coordination_pending_mobile_pairings,
            wallet::coordination_commands::coordination_mobile_resume,
            wallet::coordination_commands::coordination_mobile_await_final,
            wallet::coordination_commands::coordination_desktop_accept,
            wallet::coordination_commands::coordination_desktop_finalize,
            wallet::coordination_commands::coordination_mobile_complete,
            wallet::coordination_commands::coordination_mobile_recovery_record,
            wallet::coordination_commands::coordination_mobile_recovery_inspect,
            wallet::coordination_commands::coordination_mobile_recover,
            wallet::coordination_commands::coordination_mobile_psbt_review,
            wallet::coordination_commands::coordination_mobile_sign_psbt,
            wallet::coordination_commands::coordination_status,
            wallet::coordination_commands::coordination_watch_only_encode,
            wallet::coordination_commands::coordination_watch_only_decode,
            wallet::multisig_setup_commands::multisig_setup_draft,
            wallet::multisig_setup_commands::multisig_setup_draft_save,
            wallet::multisig_setup_commands::multisig_setup_draft_discard,
            wallet::multisig_setup_commands::recovery_policy_analyze,
            wallet::multisig_proposal_commands::multisig_create,
            wallet::multisig_proposal_commands::multisig_recovery_create,
            wallet::multisig_setup_commands::multisig_wallet,
            wallet::multisig_setup_commands::multisig_signer_rename,
            wallet::multisig_setup_commands::multisig_export,
            wallet::multisig_setup_commands::multisig_export_bsms,
            wallet::public_backup_save,
            wallet::public_backup_pdf_prepare,
            wallet::public_backup_pdf_save,
            wallet::psbt_file_save,
            wallet::psbt_file_reveal,
            wallet::multisig_setup_commands::multisig_bsms_inspect,
            wallet::multisig_setup_commands::multisig_recover_bsms,
            wallet::multisig_setup_commands::multisig_recovery_drill,
            wallet::multisig_setup_commands::multisig_recovery_drill_status,
            wallet::multisig_setup_commands::multisig_recover,
            wallet::multisig_setup_commands::multisig_delete,
            wallet::multisig_setup_commands::multisig_snapshot,
            wallet::multisig_setup_commands::multisig_sync,
            wallet::multisig_setup_commands::multisig_address_create,
            wallet::multisig_setup_commands::multisig_address_claim_observed,
            wallet::multisig_setup_commands::multisig_address_discard,
            wallet::multisig_proposal_commands::multisig_tx_prepare,
            wallet::multisig_proposal_commands::multisig_policy_renewal_prepare,
            wallet::multisig_proposal_commands::multisig_delayed_spend_prepare,
            wallet::multisig_proposal_commands::multisig_tx_max_spend,
            wallet::multisig_coin_selection_preview,
            wallet::multisig_proposal_commands::multisig_proposals,
            wallet::multisig_proposal_commands::multisig_proposal_import,
            wallet::multisig_proposal_commands::multisig_proposal_discard_signature,
            wallet::multisig_proposal_commands::hardware_sign_multisig,
            wallet::multisig_proposal_commands::multisig_proposal_broadcast,
            wallet::multisig_proposal_commands::multisig_proposal_cancel,
            wallet::transaction_commands::tx_prepare,
            wallet::transaction_commands::tx_proposals,
            wallet::transaction_commands::tx_proposal_cancel,
            wallet::transaction_commands::tx_max_spend,
            wallet::coin_selection_preview,
            wallet::transaction_commands::tx_acceleration_prepare,
            wallet::transaction_commands::multisig_acceleration_prepare,
            wallet::transaction_commands::rbf_acceleration_quote,
            wallet::explorer_commands::transaction_explorer_open,
            wallet::label_interchange::bip329_labels_export,
            wallet::label_interchange::bip329_labels_import,
            wallet::transaction_commands::tx_sign_and_broadcast,
            wallet::wallet_delete,
            wallet::wallet_reset_regtest,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Groot");
}

#[cfg(test)]
mod runtime_tests {
    use super::*;

    #[test]
    fn runtime_identity_uses_the_compiled_package_and_network() {
        let identity = runtime_platform();
        assert_eq!(identity.network, build_network::NAME);
        assert_eq!(identity.version, env!("CARGO_PKG_VERSION"));
        assert!(!identity.commit.is_empty());
        assert_ne!(identity.network, "mainnet");
    }
}
