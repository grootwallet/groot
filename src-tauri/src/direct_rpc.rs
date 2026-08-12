use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use jsonrpc::{client::Transport, Error as JsonRpcError, Request, Response};
use serde::{de::DeserializeOwned, Serialize};
use std::{fmt, io::Read, time::Duration};
use thiserror::Error;
use zeroize::Zeroizing;

const MAX_HTTP_HEADER_BYTES: usize = 64 * 1024;
const MAX_HTTP_STATUS_BYTES: usize = 8 * 1024;
const MAX_RPC_BODY_BYTES: usize = 16 * 1024 * 1024;

#[derive(Debug, Error)]
enum DirectRpcError {
    #[error("the Bitcoin Core RPC request is too large")]
    RequestTooLarge,
    #[error("the Bitcoin Core RPC response is too large")]
    ResponseTooLarge,
    #[error("the Bitcoin Core RPC endpoint rejected the request")]
    HttpRejected,
    #[error("the Bitcoin Core RPC transport failed")]
    TransportFailed,
}

pub struct DirectRpcTransport {
    endpoint: String,
    authorization: Option<Zeroizing<String>>,
    timeout_seconds: u64,
}

impl DirectRpcTransport {
    pub fn new(
        endpoint: &str,
        username: Option<&str>,
        password: Option<&str>,
        timeout: Duration,
    ) -> Self {
        let authorization = username.map(|username| {
            let mut credentials = Zeroizing::new(String::with_capacity(
                username.len() + password.map_or(1, |value| value.len() + 1),
            ));
            credentials.push_str(username);
            credentials.push(':');
            credentials.push_str(password.unwrap_or_default());
            Zeroizing::new(BASE64.encode(credentials.as_bytes()))
        });
        Self {
            endpoint: endpoint.to_owned(),
            authorization,
            timeout_seconds: timeout.as_secs(),
        }
    }

    fn request<R: DeserializeOwned>(&self, value: &impl Serialize) -> Result<R, JsonRpcError> {
        let body = serde_json::to_vec(value)?;
        if body.len() > MAX_RPC_BODY_BYTES {
            return Err(transport_error(DirectRpcError::RequestTooLarge));
        }
        let mut request = minreq::post(&self.endpoint)
            .with_timeout(self.timeout_seconds)
            .with_follow_redirects(false)
            .with_max_headers_size(MAX_HTTP_HEADER_BYTES)
            .with_max_status_line_length(MAX_HTTP_STATUS_BYTES)
            .with_header("Content-Type", "application/json")
            .with_body(body);
        if let Some(authorization) = self.authorization.as_deref() {
            let header = Zeroizing::new(format!("Basic {authorization}"));
            request = request.with_header("Authorization", header.as_str());
        }
        let mut response = request
            .send_lazy()
            .map_err(|_| transport_error(DirectRpcError::TransportFailed))?;
        if response.status_code != 200 {
            return Err(transport_error(DirectRpcError::HttpRejected));
        }
        let mut encoded = Vec::new();
        std::io::Read::take(&mut response, (MAX_RPC_BODY_BYTES + 1) as u64)
            .read_to_end(&mut encoded)
            .map_err(|_| transport_error(DirectRpcError::TransportFailed))?;
        if encoded.len() > MAX_RPC_BODY_BYTES {
            return Err(transport_error(DirectRpcError::ResponseTooLarge));
        }
        serde_json::from_slice(&encoded).map_err(JsonRpcError::Json)
    }
}

impl Transport for DirectRpcTransport {
    fn send_request(&self, request: Request) -> Result<Response, JsonRpcError> {
        self.request(&request)
    }

    fn send_batch(&self, requests: &[Request]) -> Result<Vec<Response>, JsonRpcError> {
        self.request(&requests)
    }

    fn fmt_target(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str("direct Bitcoin Core endpoint")
    }
}

fn transport_error(error: DirectRpcError) -> JsonRpcError {
    JsonRpcError::Transport(Box::new(error))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::mpsc,
        thread,
    };

    fn rpc_request() -> Request<'static> {
        Request {
            method: "getblockchaininfo",
            params: None,
            id: serde_json::json!(1),
            jsonrpc: Some("2.0"),
        }
    }

    #[test]
    fn refuses_redirects_before_credentials_can_reach_another_origin() {
        let destination = TcpListener::bind("127.0.0.1:0").unwrap();
        destination.set_nonblocking(true).unwrap();
        let destination_address = destination.local_addr().unwrap();
        let redirector = TcpListener::bind("127.0.0.1:0").unwrap();
        let redirector_address = redirector.local_addr().unwrap();
        let (sender, receiver) = mpsc::channel();
        thread::spawn(move || {
            let (mut stream, _) = redirector.accept().unwrap();
            let mut request = [0_u8; 4096];
            let read = stream.read(&mut request).unwrap();
            sender.send(request[..read].to_vec()).unwrap();
            let response = format!(
                "HTTP/1.1 302 Found\r\nLocation: http://{destination_address}/stolen\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            );
            stream.write_all(response.as_bytes()).unwrap();
        });
        let transport = DirectRpcTransport::new(
            &format!("http://{redirector_address}"),
            Some("groot"),
            Some("secret"),
            Duration::from_secs(1),
        );
        assert!(transport.send_request(rpc_request()).is_err());
        let request = String::from_utf8(receiver.recv().unwrap()).unwrap();
        assert!(request.contains(&format!(
            "Authorization: Basic {}",
            BASE64.encode("groot:secret")
        )));
        thread::sleep(Duration::from_millis(20));
        assert!(destination.accept().is_err());
    }
}
