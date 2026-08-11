use bdk_wallet::bitcoin::Network;

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

pub const IS_REGTEST: bool = matches!(NETWORK, Network::Regtest);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compiled_identity_is_consistent_and_never_mainnet() {
        assert_ne!(NETWORK, Network::Bitcoin);
        let expected = match NETWORK {
            Network::Regtest => ("regtest", "http://127.0.0.1:18443"),
            Network::Signet => ("signet", "http://127.0.0.1:38332"),
            Network::Testnet4 => ("testnet4", "http://127.0.0.1:48332"),
            Network::Bitcoin | Network::Testnet => panic!("unsupported compiled network"),
        };
        assert_eq!((NAME, DEFAULT_RPC_URL), expected);
        assert_eq!(IS_REGTEST, NETWORK == Network::Regtest);
    }
}
