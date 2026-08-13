use bdk_kyoto::{
    bip157::{tokio, Info, TrustedPeer, Warning},
    builder::{Builder, BuilderExt},
    ScanType, Update,
};
use bdk_wallet::{bitcoin::Network, Wallet};
use std::{fs, path::Path, sync::Arc, time::Duration};

use crate::network::ValidatedCompactFilterConfig;

const SYNC_DEADLINE: Duration = Duration::from_secs(3 * 60);
const PEER_RESPONSE_TIMEOUT: Duration = Duration::from_secs(15);
const PEER_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Clone, Copy)]
struct SyncTimeouts {
    sync: Duration,
    response: Duration,
    handshake: Duration,
}

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

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum SyncProgress {
    Connecting { connected: usize, required: usize },
    Connected,
    Scanning { percent: f32, chain_height: u32 },
    CheckingMatch,
    Degraded,
}

fn prepare_working_directory(path: &Path) -> Result<(), CompactFilterError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            return Err(CompactFilterError::Cache(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "compact-filter storage must be a real directory",
            )));
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir_all(path).map_err(CompactFilterError::Cache)?;
        }
        Err(error) => return Err(CompactFilterError::Cache(error)),
    }
    let metadata = fs::symlink_metadata(path).map_err(CompactFilterError::Cache)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(CompactFilterError::Cache(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "compact-filter storage must be a real directory",
        )));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))
            .map_err(CompactFilterError::Cache)?;
    }
    Ok(())
}

/// Fetch one verified, confirmed-only wallet update. Dropping the dedicated
/// runtime terminates the node and all of its peer tasks after the update or
/// deadline, so mobile/desktop lifecycle work stays bounded.
#[cfg(test)]
fn sync(
    wallet: &Wallet,
    network: Network,
    cache_dir: &Path,
    config: &ValidatedCompactFilterConfig,
) -> Result<Update, CompactFilterError> {
    sync_with_progress(wallet, network, cache_dir, config, |_| {})
}

pub fn sync_with_progress<F>(
    wallet: &Wallet,
    network: Network,
    cache_dir: &Path,
    config: &ValidatedCompactFilterConfig,
    on_progress: F,
) -> Result<Update, CompactFilterError>
where
    F: Fn(SyncProgress) + Send + Sync + 'static,
{
    sync_with_timeouts(
        wallet,
        network,
        cache_dir,
        config,
        SyncTimeouts {
            sync: SYNC_DEADLINE,
            response: PEER_RESPONSE_TIMEOUT,
            handshake: PEER_HANDSHAKE_TIMEOUT,
        },
        on_progress,
    )
}

fn sync_with_timeouts<F>(
    wallet: &Wallet,
    network: Network,
    cache_dir: &Path,
    config: &ValidatedCompactFilterConfig,
    timeouts: SyncTimeouts,
    on_progress: F,
) -> Result<Update, CompactFilterError>
where
    F: Fn(SyncProgress) + Send + Sync + 'static,
{
    prepare_working_directory(cache_dir)?;
    let mut builder = Builder::new(network)
        .data_dir(cache_dir)
        .required_peers(config.required_peers)
        .response_timeout(timeouts.response)
        .handshake_timeout(timeouts.handshake);
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
    let on_progress = Arc::new(on_progress);
    runtime.block_on(async move {
        let info_progress = Arc::clone(&on_progress);
        tokio::task::spawn(async move {
            while let Some(info) = info_subscriber.recv().await {
                let progress = match info {
                    Info::SuccessfulHandshake | Info::ConnectionsMet => SyncProgress::Connected,
                    Info::Progress(progress) => SyncProgress::Scanning {
                        percent: progress.percentage_complete().clamp(0.0, 100.0),
                        chain_height: progress.chain_height(),
                    },
                    Info::BlockReceived(_) => SyncProgress::CheckingMatch,
                };
                info_progress(progress);
            }
        });
        let warning_progress = Arc::clone(&on_progress);
        tokio::task::spawn(async move {
            while let Some(warning) = warning_subscriber.recv().await {
                let progress = match warning {
                    Warning::NeedConnections {
                        connected,
                        required,
                    } => SyncProgress::Connecting {
                        connected,
                        required,
                    },
                    _ => SyncProgress::Degraded,
                };
                warning_progress(progress);
            }
        });
        let _active = client.start();
        tokio::time::timeout(timeouts.sync, updates.update())
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
    use bdk_wallet::bitcoin::BlockHash;
    use bdk_wallet::bitcoin::{bip32::Xpriv, Amount};
    use bdk_wallet::rusqlite::Connection;
    use bdk_wallet::template::Bip84;
    use std::collections::HashSet;
    use std::io::{Read, Write};
    use std::net::{SocketAddr, TcpListener};
    use std::str::FromStr;
    use std::thread;

    fn test_wallet() -> Wallet {
        let master = Xpriv::new_master(Network::Regtest, &[7_u8; 32]).unwrap();
        Wallet::create(
            Bip84(master, bdk_wallet::KeychainKind::External),
            Bip84(master, bdk_wallet::KeychainKind::Internal),
        )
        .network(Network::Regtest)
        .create_wallet_no_persist()
        .unwrap()
    }

    fn manual_config(peer: SocketAddr) -> ValidatedCompactFilterConfig {
        ValidatedCompactFilterConfig {
            peers: vec![peer],
            required_peers: 1,
            discover_peers: false,
            tor_proxy: None,
        }
    }

    fn short_sync(
        wallet: &Wallet,
        cache: &Path,
        config: &ValidatedCompactFilterConfig,
    ) -> Result<Update, CompactFilterError> {
        sync_with_timeouts(
            wallet,
            Network::Regtest,
            cache,
            config,
            SyncTimeouts {
                sync: Duration::from_millis(300),
                response: Duration::from_millis(100),
                handshake: Duration::from_millis(100),
            },
            |_| {},
        )
    }

    fn temporary_path(label: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("groot-cfilter-{label}-{}", uuid::Uuid::new_v4()))
    }

    #[test]
    fn deadlines_are_finite_and_peer_timeouts_fit_inside_them() {
        assert!(!SYNC_DEADLINE.is_zero());
        assert!(PEER_RESPONSE_TIMEOUT < SYNC_DEADLINE);
        assert!(PEER_HANDSHAKE_TIMEOUT < SYNC_DEADLINE);
    }

    #[test]
    fn working_directory_is_owner_only_and_rejects_non_directories() {
        let directory = temporary_path("directory");
        prepare_working_directory(&directory).unwrap();
        assert!(directory.is_dir());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&directory).unwrap().permissions().mode() & 0o777,
                0o700
            );
        }
        fs::remove_dir(&directory).unwrap();

        let file = temporary_path("file");
        fs::write(&file, b"not a directory").unwrap();
        assert!(matches!(
            prepare_working_directory(&file),
            Err(CompactFilterError::Cache(_))
        ));
        fs::remove_file(file).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn working_directory_rejects_symlink_substitution_without_touching_target() {
        use std::os::unix::fs::symlink;

        let target = temporary_path("target");
        let link = temporary_path("link");
        fs::create_dir(&target).unwrap();
        symlink(&target, &link).unwrap();
        assert!(matches!(
            prepare_working_directory(&link),
            Err(CompactFilterError::Cache(_))
        ));
        assert_eq!(fs::read_dir(&target).unwrap().count(), 0);
        fs::remove_file(link).unwrap();
        fs::remove_dir(target).unwrap();
    }

    #[test]
    fn wrong_client_network_fails_before_wallet_or_peer_mutation() {
        let wallet = test_wallet();
        let cache = temporary_path("wrong-network");
        let config = manual_config("127.0.0.1:1".parse().unwrap());
        let checkpoint = wallet.latest_checkpoint();
        let result = sync_with_timeouts(
            &wallet,
            Network::Signet,
            &cache,
            &config,
            SyncTimeouts {
                sync: Duration::from_millis(100),
                response: Duration::from_millis(50),
                handshake: Duration::from_millis(50),
            },
            |_| {},
        );
        assert!(matches!(result, Err(CompactFilterError::Build(_))));
        assert_eq!(wallet.latest_checkpoint(), checkpoint);
        fs::remove_dir_all(cache).unwrap();
    }

    #[test]
    fn malformed_disconnect_and_stall_return_no_wallet_update() {
        enum PeerBehavior {
            Disconnect,
            Malformed,
            Stall,
        }

        for behavior in [
            PeerBehavior::Disconnect,
            PeerBehavior::Malformed,
            PeerBehavior::Stall,
        ] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let peer = listener.local_addr().unwrap();
            let server = thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                match behavior {
                    PeerBehavior::Disconnect => {}
                    PeerBehavior::Malformed => stream.write_all(b"not-bitcoin-p2p").unwrap(),
                    PeerBehavior::Stall => thread::sleep(Duration::from_millis(400)),
                }
            });
            let wallet = test_wallet();
            let checkpoint = wallet.latest_checkpoint();
            let balance = wallet.balance();
            let cache = temporary_path("hostile-peer");
            assert!(short_sync(&wallet, &cache, &manual_config(peer)).is_err());
            assert_eq!(wallet.latest_checkpoint(), checkpoint);
            assert_eq!(wallet.balance(), balance);
            server.join().unwrap();
            fs::remove_dir_all(cache).unwrap();
        }
    }

    #[test]
    fn peer_handshake_does_not_transmit_wallet_identifiers() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let peer = listener.local_addr().unwrap();
        let (sender, receiver) = std::sync::mpsc::channel();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_millis(200)))
                .unwrap();
            let mut bytes = vec![0_u8; 4096];
            let read = stream.read(&mut bytes).unwrap_or(0);
            bytes.truncate(read);
            sender.send(bytes).unwrap();
        });
        let wallet = test_wallet();
        let address = wallet
            .peek_address(bdk_wallet::KeychainKind::External, 0)
            .address
            .to_string();
        let descriptor = wallet
            .public_descriptor(bdk_wallet::KeychainKind::External)
            .to_string();
        let script = wallet
            .peek_address(bdk_wallet::KeychainKind::External, 0)
            .address
            .script_pubkey()
            .to_bytes();
        let cache = temporary_path("privacy");
        assert!(short_sync(&wallet, &cache, &manual_config(peer)).is_err());
        let bytes = receiver.recv().unwrap();
        assert!(!bytes
            .windows(address.len())
            .any(|value| value == address.as_bytes()));
        assert!(!bytes
            .windows(descriptor.len())
            .any(|value| value == descriptor.as_bytes()));
        assert!(!bytes.windows(script.len()).any(|value| value == script));
        server.join().unwrap();
        fs::remove_dir_all(cache).unwrap();
    }

    #[test]
    fn configured_tor_proxy_receives_the_peer_request_without_direct_fallback() {
        let direct_listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let direct_peer = direct_listener.local_addr().unwrap();
        direct_listener.set_nonblocking(true).unwrap();
        let proxy_listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let proxy = proxy_listener.local_addr().unwrap();
        let (sender, receiver) = std::sync::mpsc::channel();
        let proxy_server = thread::spawn(move || {
            let (mut stream, _) = proxy_listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(1)))
                .unwrap();
            let mut greeting = [0_u8; 3];
            stream.read_exact(&mut greeting).unwrap();
            assert_eq!(greeting, [5, 1, 0]);
            stream.write_all(&[5, 0]).unwrap();

            let mut request = [0_u8; 10];
            stream.read_exact(&mut request).unwrap();
            assert_eq!(&request[..4], &[5, 1, 0, 1]);
            let requested_ip =
                std::net::Ipv4Addr::new(request[4], request[5], request[6], request[7]);
            let requested_port = u16::from_be_bytes([request[8], request[9]]);
            sender.send((requested_ip, requested_port)).unwrap();
            stream.write_all(&[5, 5, 0, 1, 0, 0, 0, 0, 0, 0]).unwrap();
        });
        let config = ValidatedCompactFilterConfig {
            peers: vec![direct_peer],
            required_peers: 1,
            discover_peers: false,
            tor_proxy: Some(proxy),
        };
        let wallet = test_wallet();
        let checkpoint = wallet.latest_checkpoint();
        let balance = wallet.balance();
        let cache = temporary_path("tor-no-fallback");

        assert!(short_sync(&wallet, &cache, &config).is_err());
        assert_eq!(
            receiver.recv_timeout(Duration::from_secs(1)).unwrap(),
            ("127.0.0.1".parse().unwrap(), direct_peer.port())
        );
        assert!(matches!(
            direct_listener.accept(),
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock
        ));
        assert_eq!(wallet.latest_checkpoint(), checkpoint);
        assert_eq!(wallet.balance(), balance);
        proxy_server.join().unwrap();
        fs::remove_dir_all(cache).unwrap();
    }

    #[test]
    #[ignore = "requires a Regtest peer with blockfilterindex and peerblockfilters enabled"]
    fn funded_regtest_reorg_restart_reanchor_and_false_positive_are_consistent() {
        let peer = std::env::var("GROOT_COMPACT_FILTER_TEST_PEER")
            .expect("set GROOT_COMPACT_FILTER_TEST_PEER to numeric IP:port");
        let peer = SocketAddr::from_str(&peer).expect("valid numeric peer");
        let cache = std::env::temp_dir().join(format!(
            "groot-compact-filter-probe-{}",
            uuid::Uuid::new_v4()
        ));
        let master = Xpriv::new_master(Network::Regtest, &[7_u8; 32]).unwrap();
        let fingerprint = master.fingerprint(&Secp256k1::new());
        let database = cache.join("wallet.sqlite");
        fs::create_dir_all(&cache).unwrap();
        let mut db = Connection::open(&database).unwrap();
        let mut wallet = Wallet::create(
            Bip84(master, bdk_wallet::KeychainKind::External),
            Bip84(master, bdk_wallet::KeychainKind::Internal),
        )
        .network(Network::Regtest)
        .create_wallet(&mut db)
        .unwrap();
        assert_ne!(fingerprint.to_string(), "00000000");
        let receive = wallet
            .peek_address(bdk_wallet::KeychainKind::External, 0)
            .address;
        let rpc_url = std::env::var("GROOT_COMPACT_FILTER_TEST_RPC_URL")
            .expect("set GROOT_COMPACT_FILTER_TEST_RPC_URL for the isolated node");
        let rpc_cookie = std::env::var("GROOT_COMPACT_FILTER_TEST_COOKIE")
            .expect("set GROOT_COMPACT_FILTER_TEST_COOKIE for the isolated node");
        let wallet_name = format!("groot-cfilter-{}", uuid::Uuid::new_v4());
        let auth = Auth::CookieFile(rpc_cookie.into());
        let chain = Client::new(&rpc_url, auth.clone()).unwrap();
        let _: serde_json::Value = chain
            .call("createwallet", &[serde_json::json!(wallet_name)])
            .unwrap();
        let funding = Client::new(&format!("{rpc_url}/wallet/{wallet_name}"), auth).unwrap();
        let mining = funding
            .get_new_address(Some("compact filter fixture"), None)
            .unwrap()
            .require_network(Network::Regtest)
            .unwrap();
        funding.generate_to_address(101, &mining).unwrap();
        let funding_txid = funding
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
        let funding_block = funding.generate_to_address(1, &mining).unwrap()[0];
        let config = ValidatedCompactFilterConfig {
            peers: vec![peer],
            required_peers: 1,
            discover_peers: false,
            tor_proxy: None,
        };
        let update = sync(&wallet, Network::Regtest, &cache, &config).unwrap();
        wallet.apply_update(update).unwrap();
        wallet.persist(&mut db).unwrap();
        assert!(wallet.latest_checkpoint().height() > 0);
        assert_eq!(wallet.balance().confirmed, Amount::from_sat(50_000));
        assert!(wallet
            .get_tx(funding_txid)
            .unwrap()
            .chain_position
            .is_confirmed());

        drop(wallet);
        drop(db);
        let mut db = Connection::open(&database).unwrap();
        let mut wallet = Wallet::load()
            .check_network(Network::Regtest)
            .load_wallet(&mut db)
            .unwrap()
            .unwrap();
        assert_eq!(wallet.balance().confirmed, Amount::from_sat(50_000));

        funding.invalidate_block(&funding_block).unwrap();
        for _ in 0..2 {
            let _: serde_json::Value = funding
                .call(
                    "generateblock",
                    &[serde_json::json!(mining.to_string()), serde_json::json!([])],
                )
                .unwrap();
        }
        let update = sync(&wallet, Network::Regtest, &cache, &config).unwrap();
        wallet.apply_update(update).unwrap();
        wallet.persist(&mut db).unwrap();
        assert_eq!(wallet.balance().confirmed, Amount::ZERO);
        assert!(
            wallet.get_tx(funding_txid).is_some(),
            "reorg retains transaction history"
        );
        assert!(wallet
            .get_tx(funding_txid)
            .unwrap()
            .chain_position
            .is_unconfirmed());
        assert_eq!(
            wallet
                .transactions()
                .filter(|tx| tx.tx_node.txid == funding_txid)
                .count(),
            1
        );

        let replacement: serde_json::Value = funding
            .call(
                "generateblock",
                &[
                    serde_json::json!(mining.to_string()),
                    serde_json::json!([funding_txid.to_string()]),
                ],
            )
            .unwrap();
        let replacement_hash = BlockHash::from_str(replacement["hash"].as_str().unwrap()).unwrap();
        let update = sync(&wallet, Network::Regtest, &cache, &config).unwrap();
        wallet.apply_update(update).unwrap();
        wallet.persist(&mut db).unwrap();
        let reanchored = wallet.get_tx(funding_txid).unwrap();
        assert!(reanchored.chain_position.is_confirmed());
        assert_eq!(
            reanchored.chain_position.confirmation_height_upper_bound(),
            Some(funding.get_block_info(&replacement_hash).unwrap().height as u32)
        );
        assert_eq!(wallet.balance().confirmed, Amount::from_sat(50_000));
        assert_eq!(
            wallet
                .transactions()
                .filter(|tx| tx.tx_node.txid == funding_txid)
                .count(),
            1
        );

        let false_positive_master = Xpriv::new_master(Network::Regtest, &[9_u8; 32]).unwrap();
        let mut false_positive_wallet = Wallet::create(
            Bip84(false_positive_master, bdk_wallet::KeychainKind::External),
            Bip84(false_positive_master, bdk_wallet::KeychainKind::Internal),
        )
        .network(Network::Regtest)
        .create_wallet_no_persist()
        .unwrap();
        let false_positive_scripts = false_positive_wallet
            .reveal_addresses_to(bdk_wallet::KeychainKind::External, 25_000)
            .map(|address| address.address.script_pubkey())
            .collect::<Vec<_>>();
        let script_set = false_positive_scripts
            .iter()
            .cloned()
            .collect::<HashSet<_>>();
        let mut false_positive_block = None;
        for _ in 0..512 {
            let generated: serde_json::Value = funding
                .call(
                    "generateblock",
                    &[serde_json::json!(mining.to_string()), serde_json::json!([])],
                )
                .unwrap();
            let hash = BlockHash::from_str(generated["hash"].as_str().unwrap()).unwrap();
            let filter = funding.get_block_filter(&hash).unwrap().into_filter();
            if filter
                .match_any(
                    &hash,
                    false_positive_scripts
                        .iter()
                        .map(|script| script.as_bytes()),
                )
                .unwrap()
            {
                let block = funding.get_block(&hash).unwrap();
                assert!(block.txdata.iter().all(|transaction| transaction
                    .output
                    .iter()
                    .all(|output| !script_set.contains(&output.script_pubkey))));
                false_positive_block = Some(hash);
                break;
            }
        }
        let false_positive_block = false_positive_block
            .expect("bounded Regtest search must find a valid BIP158 false-positive match");
        let update = sync(&false_positive_wallet, Network::Regtest, &cache, &config).unwrap();
        false_positive_wallet.apply_update(update).unwrap();
        assert!(
            false_positive_wallet.latest_checkpoint().height()
                >= funding
                    .get_block_info(&false_positive_block)
                    .unwrap()
                    .height as u32
        );
        assert_eq!(false_positive_wallet.balance().total(), Amount::ZERO);
        assert_eq!(false_positive_wallet.transactions().count(), 0);

        let _: serde_json::Value = chain
            .call("unloadwallet", &[serde_json::json!(wallet_name)])
            .unwrap();
        drop(wallet);
        drop(db);
        fs::remove_dir_all(cache).unwrap();
    }
}
