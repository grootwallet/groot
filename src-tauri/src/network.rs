use bdk_wallet::bitcoin::Network;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::net::{IpAddr, SocketAddr};
use url::Url;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ChainBackend {
    LocalCore { url: String },
    RemoteCore { url: String },
    Esplora { url: String, preset: Option<String> },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RpcAuthMode {
    Cookie,
    UserPass,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreNodeConfig {
    pub backend: ChainBackend,
    pub auth: RpcAuthMode,
    pub username: Option<String>,
    #[serde(default)]
    pub tor_proxy: Option<String>,
}

/// Selects only the source used to discover confirmed wallet transactions.
/// Fee estimation and transaction broadcast remain explicit Bitcoin Core
/// services so switching discovery never creates a hidden network fallback.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WalletSyncSource {
    #[default]
    BitcoinCore,
    CompactFilters {
        peers: Vec<String>,
        required_peers: u8,
        discover_peers: bool,
        #[serde(default)]
        tor_proxy: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedCompactFilterConfig {
    pub peers: Vec<SocketAddr>,
    pub required_peers: u8,
    pub discover_peers: bool,
    pub tor_proxy: Option<SocketAddr>,
}

impl WalletSyncSource {
    pub fn validate(
        &self,
        network: Network,
    ) -> Result<Option<ValidatedCompactFilterConfig>, NetworkConfigError> {
        let Self::CompactFilters {
            peers,
            required_peers,
            discover_peers,
            tor_proxy,
        } = self
        else {
            return Ok(None);
        };
        if peers.len() > 15 || *required_peers == 0 || *required_peers > 15 {
            return Err(NetworkConfigError::InvalidPeerConfiguration);
        }
        let parsed_peers = peers
            .iter()
            .map(|peer| {
                peer.parse::<SocketAddr>()
                    .map_err(|_| NetworkConfigError::InvalidPeerConfiguration)
                    .and_then(|address| {
                        if address.port() == 0 || address.ip().is_unspecified() {
                            Err(NetworkConfigError::InvalidPeerConfiguration)
                        } else {
                            Ok(address)
                        }
                    })
            })
            .collect::<Result<Vec<_>, _>>()?;
        if parsed_peers.iter().copied().collect::<HashSet<_>>().len() != parsed_peers.len() {
            return Err(NetworkConfigError::InvalidPeerConfiguration);
        }
        if !*discover_peers && parsed_peers.len() < usize::from(*required_peers) {
            return Err(NetworkConfigError::InvalidPeerConfiguration);
        }
        if network != Network::Regtest && *required_peers < 2 {
            return Err(NetworkConfigError::InsufficientPeerDiversity);
        }
        // Whitelisted peers bypass discovery's netgroup selection. Require
        // distinct /16 IPv4 or /64 IPv6 groups in manual public-network mode
        // so repeated endpoints on one local/provider subnet cannot satisfy
        // the configured peer-diversity threshold.
        if network != Network::Regtest
            && !*discover_peers
            && parsed_peers
                .iter()
                .map(|peer| peer_netgroup(peer.ip()))
                .collect::<HashSet<_>>()
                .len()
                < usize::from(*required_peers)
        {
            return Err(NetworkConfigError::InsufficientPeerDiversity);
        }
        let parsed_proxy = tor_proxy
            .as_deref()
            .map(|proxy| {
                let proxy = proxy
                    .parse::<SocketAddr>()
                    .map_err(|_| NetworkConfigError::InvalidProxy)?;
                if !proxy.ip().is_loopback() || proxy.port() == 0 {
                    return Err(NetworkConfigError::InvalidProxy);
                }
                Ok(proxy)
            })
            .transpose()?;
        // bip157 0.6 resolves DNS seeds and hostname peers locally. Until
        // upstream supports proxy-side DNS, Tor is fail-closed with explicit
        // numeric peers and public discovery disabled.
        if parsed_proxy.is_some() && *discover_peers {
            return Err(NetworkConfigError::ProxyDnsLeak);
        }
        Ok(Some(ValidatedCompactFilterConfig {
            peers: parsed_peers,
            required_peers: *required_peers,
            discover_peers: *discover_peers,
            tor_proxy: parsed_proxy,
        }))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum PeerNetgroup {
    Ipv4(u8, u8),
    Ipv6(u16, u16, u16, u16),
}

fn peer_netgroup(ip: IpAddr) -> PeerNetgroup {
    match ip {
        IpAddr::V4(ip) => {
            let octets = ip.octets();
            PeerNetgroup::Ipv4(octets[0], octets[1])
        }
        IpAddr::V6(ip) => {
            let segments = ip.segments();
            PeerNetgroup::Ipv6(segments[0], segments[1], segments[2], segments[3])
        }
    }
}

impl CoreNodeConfig {
    pub fn validate(&self) -> Result<Url, NetworkConfigError> {
        let url = self.backend.validate()?;
        if matches!(self.backend, ChainBackend::Esplora { .. }) {
            return Err(NetworkConfigError::UnsupportedScheme);
        }
        if self.auth == RpcAuthMode::Cookie
            && !matches!(self.backend, ChainBackend::LocalCore { .. })
        {
            return Err(NetworkConfigError::InsecureRemote);
        }
        match self.tor_proxy.as_deref() {
            Some(proxy) => {
                let proxy = proxy
                    .parse::<SocketAddr>()
                    .map_err(|_| NetworkConfigError::InvalidProxy)?;
                let onion = url.host_str().is_some_and(crate::tor_rpc::is_v3_onion);
                if !matches!(self.backend, ChainBackend::RemoteCore { .. })
                    || !proxy.ip().is_loopback()
                    || proxy.port() == 0
                    || url.scheme() != "http"
                    || !onion
                {
                    return Err(NetworkConfigError::InvalidProxy);
                }
            }
            None if matches!(self.backend, ChainBackend::RemoteCore { .. })
                && url.host_str().is_some_and(crate::tor_rpc::is_v3_onion) =>
            {
                return Err(NetworkConfigError::InvalidProxy)
            }
            None => {}
        }
        match self.auth {
            RpcAuthMode::Cookie if self.username.is_some() => Err(NetworkConfigError::InvalidUrl),
            RpcAuthMode::UserPass
                if self.username.as_deref().is_none_or(|value| {
                    value.is_empty()
                        || value.len() > 128
                        || value.contains(':')
                        || value.chars().any(char::is_control)
                }) =>
            {
                Err(NetworkConfigError::InvalidUrl)
            }
            _ => Ok(url),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NetworkConfigError {
    InvalidUrl,
    InsecureRemote,
    CredentialsInUrl,
    UnsupportedScheme,
    UnknownPreset,
    InvalidProxy,
    InvalidPeerConfiguration,
    InsufficientPeerDiversity,
    ProxyDnsLeak,
}

pub const ESPLORA_PRESETS: &[(&str, &str)] = &[
    ("mempool-signet", "https://mempool.space/signet/api"),
    ("mempool-testnet4", "https://mempool.space/testnet4/api"),
];

fn is_loopback(host: &str) -> bool {
    host.eq_ignore_ascii_case("localhost")
        || host.parse::<IpAddr>().is_ok_and(|ip| ip.is_loopback())
}

impl ChainBackend {
    pub fn validate(&self) -> Result<Url, NetworkConfigError> {
        let (raw, local_only, remote, preset) = match self {
            Self::LocalCore { url } => (url, true, false, None),
            Self::RemoteCore { url } => (url, false, true, None),
            Self::Esplora { url, preset } => (url, false, true, preset.as_deref()),
        };
        let parsed = Url::parse(raw).map_err(|_| NetworkConfigError::InvalidUrl)?;
        if !parsed.username().is_empty() || parsed.password().is_some() {
            return Err(NetworkConfigError::CredentialsInUrl);
        }
        if !matches!(parsed.scheme(), "http" | "https") {
            return Err(NetworkConfigError::UnsupportedScheme);
        }
        let host = parsed.host_str().ok_or(NetworkConfigError::InvalidUrl)?;
        if local_only && !is_loopback(host) {
            return Err(NetworkConfigError::InsecureRemote);
        }
        let onion = crate::tor_rpc::is_v3_onion(host);
        if host.ends_with(".onion") && !onion {
            return Err(NetworkConfigError::InvalidProxy);
        }
        if remote && parsed.scheme() != "https" && !is_loopback(host) && !onion {
            return Err(NetworkConfigError::InsecureRemote);
        }
        if let Some(id) = preset {
            if !ESPLORA_PRESETS
                .iter()
                .any(|(known, endpoint)| *known == id && *endpoint == raw)
            {
                return Err(NetworkConfigError::UnknownPreset);
            }
        }
        Ok(parsed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const ONION: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.onion";
    #[test]
    fn accepts_local_and_pinned_public_backends() {
        assert!(ChainBackend::LocalCore {
            url: "http://127.0.0.1:18443".into()
        }
        .validate()
        .is_ok());
        assert!(ChainBackend::Esplora {
            url: ESPLORA_PRESETS[0].1.into(),
            preset: Some(ESPLORA_PRESETS[0].0.into())
        }
        .validate()
        .is_ok());
    }
    #[test]
    fn rejects_credentials_cleartext_remote_and_forged_presets() {
        assert_eq!(
            ChainBackend::LocalCore {
                url: "https://node.example:8332".into()
            }
            .validate(),
            Err(NetworkConfigError::InsecureRemote)
        );
        assert_eq!(
            CoreNodeConfig {
                backend: ChainBackend::RemoteCore {
                    url: "https://node.example".into()
                },
                auth: RpcAuthMode::UserPass,
                username: Some("bad:name".into()),
                tor_proxy: None,
            }
            .validate(),
            Err(NetworkConfigError::InvalidUrl)
        );
        assert_eq!(
            ChainBackend::RemoteCore {
                url: "http://node.example:8332".into()
            }
            .validate(),
            Err(NetworkConfigError::InsecureRemote)
        );
        assert_eq!(
            ChainBackend::RemoteCore {
                url: "https://user:pass@node.example".into()
            }
            .validate(),
            Err(NetworkConfigError::CredentialsInUrl)
        );
        assert_eq!(
            ChainBackend::Esplora {
                url: "https://evil.example".into(),
                preset: Some("mempool-signet".into())
            }
            .validate(),
            Err(NetworkConfigError::UnknownPreset)
        );
        assert_eq!(
            ChainBackend::LocalCore {
                url: "file:///tmp/node".into()
            }
            .validate(),
            Err(NetworkConfigError::UnsupportedScheme)
        );
        assert_eq!(
            ChainBackend::LocalCore {
                url: "not a url".into()
            }
            .validate(),
            Err(NetworkConfigError::InvalidUrl)
        );
    }

    #[test]
    fn core_auth_is_explicit_and_remote_cookie_auth_is_rejected() {
        assert!(CoreNodeConfig {
            backend: ChainBackend::LocalCore {
                url: "http://localhost:18443".into()
            },
            auth: RpcAuthMode::Cookie,
            username: None,
            tor_proxy: None,
        }
        .validate()
        .is_ok());
        assert!(CoreNodeConfig {
            backend: ChainBackend::RemoteCore {
                url: "https://node.example".into()
            },
            auth: RpcAuthMode::UserPass,
            username: Some("groot".into()),
            tor_proxy: None,
        }
        .validate()
        .is_ok());
        assert_eq!(
            CoreNodeConfig {
                backend: ChainBackend::RemoteCore {
                    url: "https://node.example".into()
                },
                auth: RpcAuthMode::Cookie,
                username: None,
                tor_proxy: None,
            }
            .validate(),
            Err(NetworkConfigError::InsecureRemote)
        );
    }

    #[test]
    fn tor_requires_a_loopback_socks_proxy_and_onion_http_endpoint() {
        assert!(CoreNodeConfig {
            backend: ChainBackend::RemoteCore {
                url: format!("http://{ONION}:8332")
            },
            auth: RpcAuthMode::UserPass,
            username: Some("groot".into()),
            tor_proxy: Some("127.0.0.1:9050".into()),
        }
        .validate()
        .is_ok());
        assert_eq!(
            CoreNodeConfig {
                backend: ChainBackend::RemoteCore {
                    url: "http://example.com:8332".into()
                },
                auth: RpcAuthMode::UserPass,
                username: Some("groot".into()),
                tor_proxy: Some("127.0.0.1:9050".into()),
            }
            .validate(),
            Err(NetworkConfigError::InsecureRemote)
        );
        for (url, proxy) in [
            (
                "http://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.onion:8332",
                Some("192.168.1.2:9050"),
            ),
            (
                "http://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.onion:8332",
                None,
            ),
        ] {
            assert_eq!(
                CoreNodeConfig {
                    backend: ChainBackend::RemoteCore { url: url.into() },
                    auth: RpcAuthMode::UserPass,
                    username: Some("groot".into()),
                    tor_proxy: proxy.map(str::to_owned)
                }
                .validate(),
                Err(NetworkConfigError::InvalidProxy)
            );
        }
        assert_eq!(
            CoreNodeConfig {
                backend: ChainBackend::RemoteCore {
                    url: format!("http://{ONION}:8332")
                },
                auth: RpcAuthMode::UserPass,
                username: Some("groot".into()),
                tor_proxy: Some("localhost:9050".into()),
            }
            .validate(),
            Err(NetworkConfigError::InvalidProxy)
        );
        assert_eq!(
            CoreNodeConfig {
                backend: ChainBackend::RemoteCore {
                    url: "http://short.onion:8332".into()
                },
                auth: RpcAuthMode::UserPass,
                username: Some("groot".into()),
                tor_proxy: Some("127.0.0.1:9050".into()),
            }
            .validate(),
            Err(NetworkConfigError::InvalidProxy)
        );
    }

    #[test]
    fn compact_filters_require_peer_diversity_on_public_test_networks() {
        let source = WalletSyncSource::CompactFilters {
            peers: vec!["127.0.0.1:38333".into()],
            required_peers: 1,
            discover_peers: false,
            tor_proxy: None,
        };
        assert_eq!(
            source.validate(Network::Signet),
            Err(NetworkConfigError::InsufficientPeerDiversity)
        );
        assert!(source.validate(Network::Regtest).is_ok());
    }

    #[test]
    fn compact_filter_tor_is_fail_closed_against_local_dns_discovery() {
        let source = WalletSyncSource::CompactFilters {
            peers: vec!["127.0.0.1:38333".into(), "127.0.0.2:38333".into()],
            required_peers: 2,
            discover_peers: true,
            tor_proxy: Some("127.0.0.1:9050".into()),
        };
        assert_eq!(
            source.validate(Network::Signet),
            Err(NetworkConfigError::ProxyDnsLeak)
        );
    }

    #[test]
    fn compact_filter_manual_mode_requires_enough_explicit_socket_peers() {
        let source = WalletSyncSource::CompactFilters {
            peers: vec!["node.example:38333".into()],
            required_peers: 2,
            discover_peers: false,
            tor_proxy: None,
        };
        assert_eq!(
            source.validate(Network::Signet),
            Err(NetworkConfigError::InvalidPeerConfiguration)
        );
    }

    #[test]
    fn compact_filter_manual_public_peers_require_distinct_netgroups() {
        for peers in [
            vec!["203.0.113.10:38333".into(), "203.0.113.10:38333".into()],
            vec!["203.0.113.10:38333".into(), "203.0.113.11:38333".into()],
        ] {
            let source = WalletSyncSource::CompactFilters {
                peers,
                required_peers: 2,
                discover_peers: false,
                tor_proxy: None,
            };
            assert!(source.validate(Network::Signet).is_err());
        }

        let diverse = WalletSyncSource::CompactFilters {
            peers: vec!["203.0.113.10:38333".into(), "198.51.100.11:38333".into()],
            required_peers: 2,
            discover_peers: false,
            tor_proxy: None,
        };
        assert!(diverse.validate(Network::Signet).is_ok());
    }
}
