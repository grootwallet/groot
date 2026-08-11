use tauri::Manager as _;

pub mod airgap;
mod auth;
pub mod bsms;
pub mod external_signer;
mod hardware;
mod multisig;
mod native_backup;
pub mod network;
mod notifications;
mod process_lock;
pub mod proposal;
pub mod recovery;
pub mod registry;
mod secure_store;
mod session;
pub mod ur_transport;
mod wallet;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let lock = process_lock::ProcessLock::acquire_for_app(app.handle())?;
            app.manage(lock);
            Ok(())
        })
        .manage(wallet::AppState::default())
        .invoke_handler(tauri::generate_handler![
            wallet::wallet_exists,
            wallet::ur_encode_psbt,
            wallet::ur_decode_psbt,
            wallet::wallet_lock,
            wallet::wallet_profiles,
            wallet::wallet_rename,
            wallet::wallet_inactivity_timeout_save,
            wallet::wallet_select,
            wallet::wallet_generate_mnemonic,
            wallet::wallet_cancel_onboarding,
            wallet::wallet_create,
            wallet::wallet_verify_backup,
            wallet::wallet_recover,
            wallet::wallet_unlock,
            wallet::wallet_snapshot,
            wallet::wallet_sync,
            wallet::wallet_notifications,
            wallet::wallet_notifications_ack,
            wallet::address_create,
            wallet::address_discard,
            wallet::coin_set_frozen,
            wallet::multisig_coin_set_frozen,
            wallet::fees_estimate,
            wallet::node_config,
            wallet::node_config_save,
            wallet::node_connection_test,
            wallet::recovery_scan_settings,
            wallet::recovery_scan_settings_save,
            wallet::wallet_full_rescan,
            wallet::hardware_list,
            wallet::hardware_prompt_pin,
            wallet::hardware_send_pin,
            wallet::hardware_check_cosigner,
            wallet::hardware_import_cosigner,
            wallet::external_signer_parse_import,
            wallet::hardware_import_external_signer,
            wallet::external_signer_create,
            wallet::external_signer_wallet,
            wallet::external_signer_rename,
            wallet::external_signer_export_descriptor,
            wallet::external_signer_proposals,
            wallet::external_signer_proposal_import,
            wallet::hardware_sign_external,
            wallet::external_signer_proposal_broadcast,
            wallet::external_signer_proposal_cancel,
            wallet::hardware_verify_multisig_address,
            wallet::hardware_verify_external_address,
            wallet::multisig_preview,
            wallet::recovery_policy_analyze,
            wallet::multisig_create,
            wallet::multisig_recovery_create,
            wallet::multisig_wallet,
            wallet::multisig_export,
            wallet::multisig_export_bsms,
            wallet::public_backup_save,
            wallet::public_backup_print,
            wallet::psbt_file_save,
            wallet::psbt_file_reveal,
            wallet::multisig_bsms_inspect,
            wallet::multisig_recover_bsms,
            wallet::multisig_recovery_drill,
            wallet::multisig_recover,
            wallet::multisig_delete,
            wallet::multisig_snapshot,
            wallet::multisig_sync,
            wallet::multisig_address_create,
            wallet::multisig_address_discard,
            wallet::multisig_tx_prepare,
            wallet::multisig_proposals,
            wallet::multisig_proposal_import,
            wallet::hardware_sign_multisig,
            wallet::multisig_proposal_broadcast,
            wallet::multisig_proposal_cancel,
            wallet::tx_prepare,
            wallet::tx_acceleration_prepare,
            wallet::multisig_acceleration_prepare,
            wallet::tx_sign_and_broadcast,
            wallet::wallet_delete,
            wallet::wallet_reset_regtest,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Groot");
}
