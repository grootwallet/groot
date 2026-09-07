//! Shared wire fixtures for the real registry serializer and frontend consumers.
//! All identifiers are synthetic; these tests never open a wallet or write storage.

use groot_lib::registry::{
    RegistryError, WalletKind, WalletProfile, WalletRegistry, INACTIVITY_TIMEOUT_CHOICES,
};
use serde_json::{json, Value};
use uuid::Uuid;

fn fixture() -> Value {
    serde_json::from_str(include_str!(
        "../../src/lib/wallet/fixtures/registry-contract.json"
    ))
    .unwrap()
}

#[test]
fn registry_serialization_matches_the_frontend_wire_fixture() {
    let fixture = fixture();
    assert_eq!(
        serde_json::to_value(WalletRegistry::default()).unwrap(),
        fixture["emptyRegistry"]
    );
    let wallets = [
        (WalletKind::SingleKey, "Software fixture", false),
        (WalletKind::Multisig, "Multisig fixture", true),
        (WalletKind::WatchOnly, "Hardware fixture", true),
    ]
    .into_iter()
    .enumerate()
    .map(|(index, (kind, name, backup_verified))| WalletProfile {
        id: Uuid::from_u128(index as u128 + 1),
        name: name.to_owned(),
        network: "signet".to_owned(),
        kind,
        descriptor_checksum: "00000000".to_owned(),
        created_at: 1_700_000_000 + index as u64,
        backup_verified,
    })
    .collect();
    let registry = WalletRegistry {
        selected_wallet_id: Some(Uuid::from_u128(1)),
        wallets,
        ..Default::default()
    };
    registry.validate().unwrap();
    assert_eq!(serde_json::to_value(registry).unwrap(), fixture["registry"]);
}

#[test]
fn timeout_fixture_matches_native_validation_and_default() {
    let fixture = fixture();
    assert_eq!(json!(INACTIVITY_TIMEOUT_CHOICES), fixture["timeoutChoices"]);
    let mut registry = WalletRegistry::default();
    for minutes in 0..=61 {
        registry.inactivity_timeout_minutes = minutes;
        let accepted = fixture["timeoutChoices"]
            .as_array()
            .unwrap()
            .contains(&json!(minutes));
        assert_eq!(
            registry.validate(),
            if accepted {
                Ok(())
            } else {
                Err(RegistryError::InvalidInactivityTimeout)
            },
            "timeout {minutes}"
        );
    }
}
