use bdk_wallet::bitcoin::{constants::genesis_block, BlockHash, Network};

use crate::network::ChainBackend;

// This is deliberately false until ADR 0012 is superseded and every mainnet
// checklist item is evidenced. Keeping the gate in the trusted boundary makes
// a frontend/configuration mistake insufficient to open a mainnet database.
const MAINNET_ENABLED: bool = false;
pub const FIRST_MAINNET_MAX_SEND_SATS: u64 = 1_000_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReleasePolicyError {
    MainnetDisabled,
    #[allow(dead_code, reason = "used when the disabled mainnet backend is wired")]
    WrongGenesis,
    #[allow(dead_code, reason = "used when the disabled mainnet backend is wired")]
    UnsupportedBackend,
    InvalidAmount,
    AmountCapExceeded,
    BatchSpendingDisabled,
    UnsupportedWalletPolicy,
}

pub fn validate_first_mainnet_backend_endpoint(
    backend: &ChainBackend,
) -> Result<(), ReleasePolicyError> {
    let ChainBackend::LocalCore { url } = backend else {
        return Err(ReleasePolicyError::UnsupportedBackend);
    };
    let parsed = url::Url::parse(url).map_err(|_| ReleasePolicyError::UnsupportedBackend)?;
    if parsed.scheme() != "http" || backend.validate().is_err() {
        return Err(ReleasePolicyError::UnsupportedBackend);
    }
    Ok(())
}

pub fn ensure_runtime_network_enabled(network: Network) -> Result<(), ReleasePolicyError> {
    if network == Network::Bitcoin && !MAINNET_ENABLED {
        return Err(ReleasePolicyError::MainnetDisabled);
    }
    Ok(())
}

pub fn ensure_delayed_policy_creation_enabled(network: Network) -> Result<(), ReleasePolicyError> {
    if network == Network::Bitcoin {
        return Err(ReleasePolicyError::UnsupportedWalletPolicy);
    }
    Ok(())
}

pub fn ensure_recovered_wallet_policy_enabled(
    network: Network,
    is_standard: bool,
) -> Result<(), ReleasePolicyError> {
    if network == Network::Bitcoin && !is_standard {
        return Err(ReleasePolicyError::UnsupportedWalletPolicy);
    }
    Ok(())
}

#[allow(
    dead_code,
    reason = "dormant until an approved mainnet backend is wired"
)]
pub fn validate_first_mainnet_backend(
    backend: &ChainBackend,
    observed_genesis: BlockHash,
) -> Result<(), ReleasePolicyError> {
    validate_first_mainnet_backend_endpoint(backend)?;
    if observed_genesis != genesis_block(Network::Bitcoin).block_hash() {
        return Err(ReleasePolicyError::WrongGenesis);
    }
    Ok(())
}

pub fn validate_spend(
    network: Network,
    recipient_count: usize,
    total_sats: u64,
) -> Result<(), ReleasePolicyError> {
    if network != Network::Bitcoin {
        return Ok(());
    }
    if !MAINNET_ENABLED {
        return Err(ReleasePolicyError::MainnetDisabled);
    }
    validate_first_mainnet_spend(recipient_count, total_sats)
}

pub fn validate_cpfp(
    network: Network,
    recipient_count: usize,
    total_sats: u64,
    wallet_owned_output: bool,
) -> Result<(), ReleasePolicyError> {
    if network != Network::Bitcoin {
        return Ok(());
    }
    if !MAINNET_ENABLED {
        return Err(ReleasePolicyError::MainnetDisabled);
    }
    validate_first_mainnet_cpfp(recipient_count, total_sats, wallet_owned_output)
}

fn validate_first_mainnet_cpfp(
    recipient_count: usize,
    total_sats: u64,
    wallet_owned_output: bool,
) -> Result<(), ReleasePolicyError> {
    if recipient_count != 0 || total_sats != 0 || !wallet_owned_output {
        return Err(ReleasePolicyError::InvalidAmount);
    }
    Ok(())
}

fn validate_first_mainnet_spend(
    recipient_count: usize,
    total_sats: u64,
) -> Result<(), ReleasePolicyError> {
    if recipient_count != 1 {
        return Err(ReleasePolicyError::BatchSpendingDisabled);
    }
    if total_sats == 0 {
        return Err(ReleasePolicyError::InvalidAmount);
    }
    if total_sats > FIRST_MAINNET_MAX_SEND_SATS {
        return Err(ReleasePolicyError::AmountCapExceeded);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mainnet_is_blocked_while_test_networks_are_unchanged() {
        assert_eq!(
            ensure_runtime_network_enabled(Network::Bitcoin),
            Err(ReleasePolicyError::MainnetDisabled)
        );
        for network in [Network::Regtest, Network::Signet, Network::Testnet] {
            assert_eq!(ensure_runtime_network_enabled(network), Ok(()));
            assert_eq!(validate_spend(network, usize::MAX, u64::MAX), Ok(()));
        }
    }

    #[test]
    fn first_mainnet_scope_excludes_guided_delayed_policy_creation() {
        assert_eq!(
            ensure_delayed_policy_creation_enabled(Network::Bitcoin),
            Err(ReleasePolicyError::UnsupportedWalletPolicy)
        );
        assert_eq!(
            ensure_delayed_policy_creation_enabled(Network::Testnet4),
            Ok(())
        );
        assert_eq!(
            ensure_recovered_wallet_policy_enabled(Network::Bitcoin, false),
            Err(ReleasePolicyError::UnsupportedWalletPolicy)
        );
        assert_eq!(
            ensure_recovered_wallet_policy_enabled(Network::Bitcoin, true),
            Ok(())
        );
        assert_eq!(
            ensure_recovered_wallet_policy_enabled(Network::Testnet4, false),
            Ok(())
        );
    }

    #[test]
    fn candidate_backend_requires_exact_mainnet_genesis_and_local_core() {
        let local = ChainBackend::LocalCore {
            url: "http://127.0.0.1:8332".into(),
        };
        let mainnet_genesis = genesis_block(Network::Bitcoin).block_hash();
        assert_eq!(
            validate_first_mainnet_backend(&local, mainnet_genesis),
            Ok(())
        );
        assert_eq!(
            validate_first_mainnet_backend(&local, genesis_block(Network::Testnet).block_hash()),
            Err(ReleasePolicyError::WrongGenesis)
        );
        for backend in [
            ChainBackend::LocalCore {
                url: "https://remote.example:8332".into(),
            },
            ChainBackend::LocalCore {
                url: "https://localhost:8332".into(),
            },
            ChainBackend::LocalCore {
                url: "https://user:password@127.0.0.1:8332".into(),
            },
            ChainBackend::LocalCore {
                url: "not-a-url".into(),
            },
            ChainBackend::RemoteCore {
                url: "https://node.example".into(),
            },
            ChainBackend::Esplora {
                url: "https://mempool.space/api".into(),
                preset: None,
            },
        ] {
            assert_eq!(
                validate_first_mainnet_backend_endpoint(&backend),
                Err(ReleasePolicyError::UnsupportedBackend)
            );
            assert_eq!(
                validate_first_mainnet_backend(&backend, mainnet_genesis),
                Err(ReleasePolicyError::UnsupportedBackend)
            );
        }
    }

    #[test]
    fn dormant_send_policy_is_explicitly_capped_and_single_recipient() {
        // The live gate is intentionally checked first. These constants and
        // invariants remain reviewable before that gate can ever be enabled.
        assert_eq!(FIRST_MAINNET_MAX_SEND_SATS, 1_000_000);
        assert_eq!(
            validate_first_mainnet_spend(1, FIRST_MAINNET_MAX_SEND_SATS),
            Ok(())
        );
        assert_eq!(
            validate_first_mainnet_spend(2, 1),
            Err(ReleasePolicyError::BatchSpendingDisabled)
        );
        assert_eq!(
            validate_first_mainnet_spend(1, 0),
            Err(ReleasePolicyError::InvalidAmount)
        );
        assert_eq!(
            validate_first_mainnet_spend(1, FIRST_MAINNET_MAX_SEND_SATS + 1),
            Err(ReleasePolicyError::AmountCapExceeded)
        );
    }

    #[test]
    fn dormant_cpfp_policy_allows_only_a_wallet_owned_fee_child() {
        assert_eq!(validate_cpfp(Network::Regtest, 99, u64::MAX, false), Ok(()));
        assert_eq!(
            validate_cpfp(Network::Bitcoin, 0, 0, true),
            Err(ReleasePolicyError::MainnetDisabled)
        );
        assert_eq!(validate_first_mainnet_cpfp(0, 0, true), Ok(()));
        assert_eq!(
            validate_first_mainnet_cpfp(1, 0, true),
            Err(ReleasePolicyError::InvalidAmount)
        );
        assert_eq!(
            validate_first_mainnet_cpfp(0, 1, true),
            Err(ReleasePolicyError::InvalidAmount)
        );
        assert_eq!(
            validate_first_mainnet_cpfp(0, 0, false),
            Err(ReleasePolicyError::InvalidAmount)
        );
    }
}
