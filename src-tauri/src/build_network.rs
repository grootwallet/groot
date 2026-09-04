use bdk_wallet::bitcoin::{Network, NetworkKind};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NetworkParameters {
    pub network: Network,
    pub extended_key_network: NetworkKind,
    pub singlesig_account_path: &'static str,
    pub multisig_account_path: &'static str,
    pub hwi_chain: &'static str,
    pub address_hrp: &'static str,
}

pub const fn parameters_for(network: Network) -> NetworkParameters {
    match network {
        Network::Bitcoin => NetworkParameters {
            network,
            extended_key_network: NetworkKind::Main,
            singlesig_account_path: "m/84'/0'/0'",
            multisig_account_path: "m/48'/0'/0'/2'",
            hwi_chain: "main",
            address_hrp: "bc",
        },
        Network::Signet => test_parameters(network, "signet", "tb"),
        Network::Regtest => test_parameters(network, "regtest", "bcrt"),
        Network::Testnet => test_parameters(network, "test", "tb"),
        Network::Testnet4 => test_parameters(network, "testnet4", "tb"),
    }
}

const fn test_parameters(
    network: Network,
    hwi_chain: &'static str,
    address_hrp: &'static str,
) -> NetworkParameters {
    NetworkParameters {
        network,
        extended_key_network: NetworkKind::Test,
        singlesig_account_path: "m/84'/1'/0'",
        multisig_account_path: "m/48'/1'/0'/2'",
        hwi_chain,
        address_hrp,
    }
}

#[cfg(groot_network = "signet")]
pub const NETWORK: Network = Network::Signet;
#[cfg(groot_network = "signet")]
pub const NAME: &str = "signet";
#[cfg(groot_network = "signet")]
pub const DEFAULT_RPC_URL: &str = "http://127.0.0.1:38332";

#[cfg(groot_network = "testnet4")]
pub const NETWORK: Network = Network::Testnet4;
#[cfg(groot_network = "testnet4")]
pub const NAME: &str = "testnet4";
#[cfg(groot_network = "testnet4")]
pub const DEFAULT_RPC_URL: &str = "http://127.0.0.1:48332";

#[cfg(groot_network = "regtest")]
pub const NETWORK: Network = Network::Regtest;
#[cfg(groot_network = "regtest")]
pub const NAME: &str = "regtest";
#[cfg(groot_network = "regtest")]
pub const DEFAULT_RPC_URL: &str = "http://127.0.0.1:18443";

#[cfg(groot_network = "mainnet")]
pub const NETWORK: Network = Network::Bitcoin;
#[cfg(groot_network = "mainnet")]
pub const NAME: &str = "mainnet";
#[cfg(groot_network = "mainnet")]
pub const DEFAULT_RPC_URL: &str = "http://127.0.0.1:8332";

pub const IS_REGTEST: bool = matches!(NETWORK, Network::Regtest);
pub const PARAMETERS: NetworkParameters = parameters_for(NETWORK);
pub const SINGLESIG_ACCOUNT_PATH: &str = PARAMETERS.singlesig_account_path;
pub const MULTISIG_ACCOUNT_PATH: &str = PARAMETERS.multisig_account_path;

#[cfg(test)]
mod tests {
    use super::*;
    use bdk_wallet::bitcoin::{
        bip32::{DerivationPath, Xpriv, Xpub},
        secp256k1::Secp256k1,
        Address, CompressedPublicKey,
    };
    use std::str::FromStr;

    #[test]
    fn compiled_identity_is_consistent() {
        #[cfg(groot_network = "regtest")]
        let expected = ("regtest", "http://127.0.0.1:18443");
        #[cfg(groot_network = "signet")]
        let expected = ("signet", "http://127.0.0.1:38332");
        #[cfg(groot_network = "testnet4")]
        let expected = ("testnet4", "http://127.0.0.1:48332");
        #[cfg(groot_network = "mainnet")]
        let expected = ("mainnet", "http://127.0.0.1:8332");
        assert_eq!((NAME, DEFAULT_RPC_URL), expected);
        assert_eq!(IS_REGTEST, NETWORK == Network::Regtest);
        assert_eq!(PARAMETERS.network, NETWORK);
        #[cfg(groot_network = "mainnet")]
        let (coin, key_network) = (0, NetworkKind::Main);
        #[cfg(not(groot_network = "mainnet"))]
        let (coin, key_network) = (1, NetworkKind::Test);
        assert_eq!(PARAMETERS.extended_key_network, key_network);
        assert_eq!(SINGLESIG_ACCOUNT_PATH, format!("m/84'/{coin}'/0'"));
        assert_eq!(MULTISIG_ACCOUNT_PATH, format!("m/48'/{coin}'/0'/2'"));
    }

    #[test]
    fn dormant_mainnet_and_every_rehearsal_network_have_atomic_parameters() {
        let mainnet = parameters_for(Network::Bitcoin);
        assert_eq!(mainnet.extended_key_network, NetworkKind::Main);
        assert_eq!(mainnet.singlesig_account_path, "m/84'/0'/0'");
        assert_eq!(mainnet.multisig_account_path, "m/48'/0'/0'/2'");
        assert_eq!(mainnet.hwi_chain, "main");
        assert_eq!(mainnet.address_hrp, "bc");
        assert_parameter_keys_and_paths(mainnet, "xpub");

        for (network, hwi_chain, address_hrp) in [
            (Network::Regtest, "regtest", "bcrt"),
            (Network::Signet, "signet", "tb"),
            (Network::Testnet4, "testnet4", "tb"),
        ] {
            let parameters = parameters_for(network);
            assert_eq!(parameters.network, network);
            assert_eq!(parameters.extended_key_network, NetworkKind::Test);
            assert_eq!(parameters.singlesig_account_path, "m/84'/1'/0'");
            assert_eq!(parameters.multisig_account_path, "m/48'/1'/0'/2'");
            assert_eq!(parameters.hwi_chain, hwi_chain);
            assert_eq!(parameters.address_hrp, address_hrp);
            assert_parameter_keys_and_paths(parameters, "tpub");
        }
    }

    fn assert_parameter_keys_and_paths(parameters: NetworkParameters, xpub_prefix: &str) {
        DerivationPath::from_str(parameters.singlesig_account_path).unwrap();
        DerivationPath::from_str(parameters.multisig_account_path).unwrap();
        let master = Xpriv::new_master(parameters.extended_key_network, &[7_u8; 32]).unwrap();
        let account = Xpub::from_priv(&Secp256k1::new(), &master);
        assert!(account.to_string().starts_with(xpub_prefix));
        assert!(
            Address::p2wpkh(&CompressedPublicKey(account.public_key), parameters.network)
                .to_string()
                .starts_with(&format!("{}1", parameters.address_hrp))
        );
    }
}
