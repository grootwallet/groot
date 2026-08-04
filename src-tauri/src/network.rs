use serde::{Deserialize, Serialize};
use std::net::IpAddr;
use url::Url;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ChainBackend {
    LocalCore { url: String },
    RemoteCore { url: String },
    Esplora { url: String, preset: Option<String> },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NetworkConfigError {
    InvalidUrl,
    InsecureRemote,
    CredentialsInUrl,
    UnsupportedScheme,
    UnknownPreset,
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
        if remote && parsed.scheme() != "https" && !is_loopback(host) {
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
}
