use serde::{Deserialize, Serialize};
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
                let onion = url.host_str().is_some_and(|host| host.ends_with(".onion"));
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
                && url.host_str().is_some_and(|host| host.ends_with(".onion")) =>
            {
                return Err(NetworkConfigError::InvalidProxy)
            }
            None => {}
        }
        match self.auth {
            RpcAuthMode::Cookie if self.username.is_some() => Err(NetworkConfigError::InvalidUrl),
            RpcAuthMode::UserPass
                if self
                    .username
                    .as_deref()
                    .is_none_or(|value| value.is_empty() || value.len() > 128) =>
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
        let onion = host.ends_with(".onion");
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
            username: Some("satchel".into()),
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
                url: "http://exampleexampleexampleexampleexampleexampleexampleexample.onion:8332"
                    .into()
            },
            auth: RpcAuthMode::UserPass,
            username: Some("satchel".into()),
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
                username: Some("satchel".into()),
                tor_proxy: Some("127.0.0.1:9050".into()),
            }
            .validate(),
            Err(NetworkConfigError::InsecureRemote)
        );
        for (url, proxy) in [
            (
                "http://exampleexampleexampleexampleexampleexampleexampleexample.onion:8332",
                Some("192.168.1.2:9050"),
            ),
            (
                "http://exampleexampleexampleexampleexampleexampleexampleexample.onion:8332",
                None,
            ),
        ] {
            assert_eq!(
                CoreNodeConfig {
                    backend: ChainBackend::RemoteCore { url: url.into() },
                    auth: RpcAuthMode::UserPass,
                    username: Some("satchel".into()),
                    tor_proxy: proxy.map(str::to_owned)
                }
                .validate(),
                Err(NetworkConfigError::InvalidProxy)
            );
        }
        assert_eq!(
            CoreNodeConfig {
                backend: ChainBackend::RemoteCore {
                    url:
                        "http://exampleexampleexampleexampleexampleexampleexampleexample.onion:8332"
                            .into()
                },
                auth: RpcAuthMode::UserPass,
                username: Some("satchel".into()),
                tor_proxy: Some("localhost:9050".into()),
            }
            .validate(),
            Err(NetworkConfigError::InvalidProxy)
        );
    }
}
