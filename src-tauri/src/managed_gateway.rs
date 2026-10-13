use crate::network::{ChainBackend, CoreNodeConfig, RpcAuthMode};
use serde::Deserialize;
use std::io::Read as _;
use thiserror::Error;
use zeroize::Zeroizing;

const MANAGED_GATEWAY_URL: &str = "https://bitcoin-rpc.usegroot.com/";
const MAX_ENROLLMENT_RESPONSE_BYTES: usize = 4 * 1024;

#[derive(Debug, Error)]
pub(crate) enum ManagedGatewayError {
    #[error("the managed gateway enrollment request failed")]
    Transport,
    #[error("the managed gateway enrollment response was rejected")]
    Rejected,
    #[error("the managed gateway enrollment response was malformed")]
    Malformed,
}

pub(crate) struct ManagedGatewayCredential {
    pub(crate) config: CoreNodeConfig,
    pub(crate) password: Zeroizing<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EnrollmentResponse {
    version: u8,
    username: String,
    password: String,
}

pub(crate) fn enroll() -> Result<ManagedGatewayCredential, ManagedGatewayError> {
    enroll_at(MANAGED_GATEWAY_URL)
}

pub(crate) fn is_managed_config(config: &CoreNodeConfig) -> bool {
    matches!(
        &config.backend,
        ChainBackend::RemoteCore { url } if url == MANAGED_GATEWAY_URL
    ) && config.auth == RpcAuthMode::UserPass
        && config.tor_proxy.is_none()
        && config.username.as_deref().is_some_and(|username| {
            username.len() == 30
                && username.starts_with("groot-")
                && username[6..]
                    .bytes()
                    .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        })
}

fn enroll_at(base_url: &str) -> Result<ManagedGatewayCredential, ManagedGatewayError> {
    let endpoint = format!("{}/enroll", base_url.trim_end_matches('/'));
    let mut response = minreq::post(&endpoint)
        .with_timeout(10)
        .with_follow_redirects(false)
        .with_max_headers_size(16 * 1024)
        .with_max_status_line_length(8 * 1024)
        .with_header("Content-Type", "application/json")
        .with_body(br#"{"version":1}"#.to_vec())
        .send_lazy()
        .map_err(|_| ManagedGatewayError::Transport)?;
    if response.status_code != 201 {
        return Err(ManagedGatewayError::Rejected);
    }
    let mut encoded = Vec::new();
    std::io::Read::take(&mut response, (MAX_ENROLLMENT_RESPONSE_BYTES + 1) as u64)
        .read_to_end(&mut encoded)
        .map_err(|_| ManagedGatewayError::Transport)?;
    if encoded.len() > MAX_ENROLLMENT_RESPONSE_BYTES {
        return Err(ManagedGatewayError::Malformed);
    }
    let mut enrollment: EnrollmentResponse =
        serde_json::from_slice(&encoded).map_err(|_| ManagedGatewayError::Malformed)?;
    if enrollment.version != 1
        || enrollment.username.len() != 30
        || !enrollment.username.starts_with("groot-")
        || !enrollment.username[6..]
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        || !(40..=64).contains(&enrollment.password.len())
        || !enrollment.password.is_ascii()
    {
        return Err(ManagedGatewayError::Malformed);
    }
    let password = Zeroizing::new(std::mem::take(&mut enrollment.password));
    Ok(ManagedGatewayCredential {
        config: CoreNodeConfig {
            backend: ChainBackend::RemoteCore {
                url: MANAGED_GATEWAY_URL.to_owned(),
            },
            auth: RpcAuthMode::UserPass,
            username: Some(enrollment.username),
            tor_proxy: None,
        },
        password,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
    };

    fn endpoint_with_response(status: u16, body: &'static [u8]) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0_u8; 2048];
            let read = stream.read(&mut request).unwrap();
            let request = String::from_utf8_lossy(&request[..read]);
            assert!(request.starts_with("POST /enroll HTTP/1.1"));
            assert!(request.contains("Content-Type: application/json"));
            let response = format!(
                "HTTP/1.1 {status} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            stream.write_all(response.as_bytes()).unwrap();
            stream.write_all(body).unwrap();
        });
        format!("http://{address}")
    }

    #[test]
    fn enrollment_accepts_only_the_bounded_exact_contract() {
        let endpoint = endpoint_with_response(
            201,
            br#"{"version":1,"username":"groot-0123456789abcdef01234567","password":"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO"}"#,
        );
        let credential = enroll_at(&endpoint).unwrap();
        assert_eq!(
            credential.config.username.as_deref(),
            Some("groot-0123456789abcdef01234567")
        );
        assert_eq!(
            credential.password.as_str(),
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO"
        );
        assert!(matches!(
            credential.config.backend,
            ChainBackend::RemoteCore { ref url } if url == MANAGED_GATEWAY_URL
        ));
        assert!(is_managed_config(&credential.config));
    }

    #[test]
    fn managed_identity_requires_the_fixed_endpoint_and_generated_principal_shape() {
        let managed = CoreNodeConfig {
            backend: ChainBackend::RemoteCore {
                url: MANAGED_GATEWAY_URL.to_owned(),
            },
            auth: RpcAuthMode::UserPass,
            username: Some("groot-0123456789abcdef01234567".to_owned()),
            tor_proxy: None,
        };
        assert!(is_managed_config(&managed));

        let mut custom = managed.clone();
        custom.username = Some("alice".to_owned());
        assert!(!is_managed_config(&custom));
        custom.username = managed.username;
        custom.backend = ChainBackend::RemoteCore {
            url: "https://node.example.com:8332".to_owned(),
        };
        assert!(!is_managed_config(&custom));
    }

    #[test]
    fn enrollment_rejects_http_errors_and_malformed_credentials() {
        let rejected = endpoint_with_response(429, br#"{"error":"rate_limited"}"#);
        assert!(matches!(
            enroll_at(&rejected),
            Err(ManagedGatewayError::Rejected)
        ));
        let malformed = endpoint_with_response(
            201,
            br#"{"version":1,"username":"shared","password":"not-a-valid-shared-password"}"#,
        );
        assert!(matches!(
            enroll_at(&malformed),
            Err(ManagedGatewayError::Malformed)
        ));
    }
}
