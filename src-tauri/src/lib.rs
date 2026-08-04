pub mod airgap;
mod auth;
mod hardware;
mod multisig;
mod native_backup;
pub mod network;
mod notifications;
pub mod proposal;
pub mod recovery;
pub mod registry;
mod secure_store;
mod wallet;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(wallet::AppState::default())
        .invoke_handler(tauri::generate_handler![
            wallet::wallet_exists,
            wallet::wallet_lock,
            wallet::wallet_profiles,
            wallet::wallet_select,
            wallet::wallet_generate_mnemonic,
            wallet::wallet_cancel_onboarding,
            wallet::wallet_create,
            wallet::wallet_recover,
            wallet::wallet_unlock,
            wallet::wallet_snapshot,
            wallet::wallet_sync,
            wallet::wallet_notifications,
            wallet::wallet_notifications_ack,
            wallet::address_create,
            wallet::address_discard,
            wallet::coin_set_frozen,
            wallet::fees_estimate,
            wallet::hardware_list,
            wallet::hardware_check_cosigner,
            wallet::hardware_import_cosigner,
            wallet::hardware_verify_multisig_address,
            wallet::multisig_preview,
            wallet::recovery_policy_analyze,
            wallet::multisig_create,
            wallet::multisig_recovery_create,
            wallet::multisig_wallet,
            wallet::multisig_export,
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
            wallet::tx_sign_and_broadcast,
            wallet::wallet_delete,
            wallet::wallet_reset_regtest,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Satchel");
}
