use bdk_kyoto::{
    bip157::{tokio, TrustedPeer},
    builder::{Builder, BuilderExt},
    ScanType, Update,
};
use bdk_wallet::{bitcoin::Network, Wallet};
use std::{path::Path, time::Duration};

use crate::network::ValidatedCompactFilterConfig;

const SYNC_DEADLINE: Duration = Duration::from_secs(3 * 60);
const PEER_RESPONSE_TIMEOUT: Duration = Duration::from_secs(15);
const PEER_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, thiserror::Error)]
pub enum CompactFilterError {
    #[error("the compact-filter cache could not be prepared: {0}")]
    Cache(std::io::Error),
    #[error("the compact-filter client could not be built: {0}")]
    Build(#[from] bdk_kyoto::builder::BuilderError),
    #[error("the compact-filter runtime could not be started: {0}")]
    Runtime(std::io::Error),
    #[error("the compact-filter node stopped before reaching the network tip: {0}")]
    Stopped(#[from] bdk_kyoto::UpdateError),
    #[error("compact-filter sync did not reach the network tip before the bounded deadline")]
    TimedOut,
}

/// Fetch one verified, confirmed-only wallet update. Dropping the dedicated
/// runtime terminates the node and all of its peer tasks after the update or
/// deadline, so mobile/desktop lifecycle work stays bounded.
pub fn sync(
    wallet: &Wallet,
    network: Network,
    cache_dir: &Path,
    config: &ValidatedCompactFilterConfig,
) -> Result<Update, CompactFilterError> {
    std::fs::create_dir_all(cache_dir).map_err(CompactFilterError::Cache)?;
    let mut builder = Builder::new(network)
        .data_dir(cache_dir)
        .required_peers(config.required_peers)
        .response_timeout(PEER_RESPONSE_TIMEOUT)
        .handshake_timeout(PEER_HANDSHAKE_TIMEOUT);
    for peer in &config.peers {
        builder = builder.add_peer(TrustedPeer::from_socket_addr(*peer));
    }
    if !config.discover_peers {
        builder = builder.whitelist_only();
    }
    if let Some(proxy) = config.tor_proxy {
        builder = builder.socks5_proxy(proxy);
    }
    let client = builder.build_with_wallet(wallet, ScanType::Sync)?;
    let (client, logging, mut updates) = client.subscribe();
    let mut info_subscriber = logging.info_subscriber;
    let mut warning_subscriber = logging.warning_subscriber;
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(CompactFilterError::Runtime)?;
    runtime.block_on(async move {
        tokio::task::spawn(async move { while info_subscriber.recv().await.is_some() {} });
        tokio::task::spawn(async move { while warning_subscriber.recv().await.is_some() {} });
        let _active = client.start();
        tokio::time::timeout(SYNC_DEADLINE, updates.update())
            .await
            .map_err(|_| CompactFilterError::TimedOut)?
            .map_err(CompactFilterError::Stopped)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use bdk_bitcoind_rpc::bitcoincore_rpc::{Auth, Client, RpcApi};
    use bdk_wallet::bitcoin::secp256k1::Secp256k1;
    use bdk_wallet::bitcoin::{bip32::Xpriv, Amount};
    use bdk_wallet::template::Bip84;
    use std::net::SocketAddr;
    use std::str::FromStr;

    #[test]
    fn deadlines_are_finite_and_peer_timeouts_fit_inside_them() {
        assert!(!SYNC_DEADLINE.is_zero());
        assert!(PEER_RESPONSE_TIMEOUT < SYNC_DEADLINE);
        assert!(PEER_HANDSHAKE_TIMEOUT < SYNC_DEADLINE);
    }

    #[test]
    #[ignore = "requires a Regtest peer with blockfilterindex and peerblockfilters enabled"]
    fn reaches_a_verified_regtest_tip_and_applies_a_funded_match() {
        let peer = std::env::var("GROOT_COMPACT_FILTER_TEST_PEER")
            .expect("set GROOT_COMPACT_FILTER_TEST_PEER to numeric IP:port");
        let peer = SocketAddr::from_str(&peer).expect("valid numeric peer");
        let cache = std::env::temp_dir().join(format!(
            "groot-compact-filter-probe-{}",
            uuid::Uuid::new_v4()
        ));
        let master = Xpriv::new_master(Network::Regtest, &[7_u8; 32]).unwrap();
        let fingerprint = master.fingerprint(&Secp256k1::new());
        let mut wallet = Wallet::create(
            Bip84(master, bdk_wallet::KeychainKind::External),
            Bip84(master, bdk_wallet::KeychainKind::Internal),
        )
        .network(Network::Regtest)
        .create_wallet_no_persist()
        .unwrap();
        assert_ne!(fingerprint.to_string(), "00000000");
        let receive = wallet
            .peek_address(bdk_wallet::KeychainKind::External, 0)
            .address;
        let rpc_url = std::env::var("GROOT_COMPACT_FILTER_TEST_RPC_URL")
            .expect("set GROOT_COMPACT_FILTER_TEST_RPC_URL for the isolated node");
        let rpc_user = std::env::var("GROOT_COMPACT_FILTER_TEST_RPC_USER")
            .expect("set GROOT_COMPACT_FILTER_TEST_RPC_USER");
        let rpc_password = std::env::var("GROOT_COMPACT_FILTER_TEST_RPC_PASSWORD")
            .expect("set GROOT_COMPACT_FILTER_TEST_RPC_PASSWORD");
        let wallet_name = format!("groot-cfilter-{}", uuid::Uuid::new_v4());
        let chain = Client::new(
            &rpc_url,
            Auth::UserPass(rpc_user.clone(), rpc_password.clone()),
        )
        .unwrap();
        let _: serde_json::Value = chain
            .call("createwallet", &[serde_json::json!(wallet_name)])
            .unwrap();
        let funding = Client::new(
            &format!("{rpc_url}/wallet/{wallet_name}"),
            Auth::UserPass(rpc_user, rpc_password),
        )
        .unwrap();
        let mining = funding
            .get_new_address(Some("compact filter fixture"), None)
            .unwrap()
            .require_network(Network::Regtest)
            .unwrap();
        funding.generate_to_address(101, &mining).unwrap();
        funding
            .send_to_address(
                &receive,
                Amount::from_sat(50_000),
                None,
                None,
                None,
                None,
                None,
                None,
            )
            .unwrap();
        funding.generate_to_address(1, &mining).unwrap();
        let config = ValidatedCompactFilterConfig {
            peers: vec![peer],
            required_peers: 1,
            discover_peers: false,
            tor_proxy: None,
        };
        let update = sync(&wallet, Network::Regtest, &cache, &config).unwrap();
        wallet.apply_update(update).unwrap();
        assert!(wallet.latest_checkpoint().height() > 0);
        assert_eq!(wallet.balance().confirmed, Amount::from_sat(50_000));
        let _: serde_json::Value = chain
            .call("unloadwallet", &[serde_json::json!(wallet_name)])
            .unwrap();
        std::fs::remove_dir_all(cache).unwrap();
    }
}
