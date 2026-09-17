use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use bdk_bitcoind_rpc::bitcoincore_rpc::Error as CoreRpcError;
use jsonrpc::{client::Transport, Error as JsonRpcError, Request, Response};
use serde::{de::DeserializeOwned, Serialize};
use std::{
    fmt,
    io::{Read, Write},
    net::{TcpStream, ToSocketAddrs},
    time::Duration,
};
use thiserror::Error;
use url::{Host, Url};
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
    HttpRejected(u16),
    #[error("the Bitcoin Core RPC transport failed")]
    TransportFailed,
    #[error("the Bitcoin Core RPC response is malformed")]
    MalformedResponse,
    #[error("the local Bitcoin Core RPC endpoint is invalid")]
    InvalidLoopbackEndpoint,
}

pub struct DirectRpcTransport {
    endpoint: String,
    authorization: Option<Zeroizing<String>>,
    timeout: Duration,
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
            timeout,
        }
    }

    fn request<R: DeserializeOwned>(&self, value: &impl Serialize) -> Result<R, JsonRpcError> {
        let body = serde_json::to_vec(value)?;
        if body.len() > MAX_RPC_BODY_BYTES {
            return Err(transport_error(DirectRpcError::RequestTooLarge));
        }
        let endpoint = Url::parse(&self.endpoint)
            .map_err(|_| transport_error(DirectRpcError::TransportFailed))?;
        if endpoint.scheme() == "http" {
            return self.request_loopback(&endpoint, &body);
        }
        self.request_https(&body)
    }

    fn request_https<R: DeserializeOwned>(&self, body: &[u8]) -> Result<R, JsonRpcError> {
        let mut request = minreq::post(&self.endpoint)
            .with_timeout(self.timeout.as_secs())
            .with_follow_redirects(false)
            .with_max_headers_size(MAX_HTTP_HEADER_BYTES)
            .with_max_status_line_length(MAX_HTTP_STATUS_BYTES)
            .with_header("Content-Type", "application/json")
            .with_body(body.to_vec());
        if let Some(authorization) = self.authorization.as_deref() {
            let header = Zeroizing::new(format!("Basic {authorization}"));
            request = request.with_header("Authorization", header.as_str());
        }
        let mut response = request
            .send_lazy()
            .map_err(|_| transport_error(DirectRpcError::TransportFailed))?;
        if response.status_code != 200 {
            return Err(transport_error(DirectRpcError::HttpRejected(
                u16::try_from(response.status_code).unwrap_or(0),
            )));
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

    fn request_loopback<R: DeserializeOwned>(
        &self,
        endpoint: &Url,
        body: &[u8],
    ) -> Result<R, JsonRpcError> {
        let (mut stream, host_header, request_path) = self.connect_loopback(endpoint)?;
        let mut request = Zeroizing::new(format!(
            "POST {request_path} HTTP/1.1\r\nHost: {host_header}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n",
            body.len()
        ));
        if let Some(authorization) = self.authorization.as_deref() {
            request.push_str("Authorization: Basic ");
            request.push_str(authorization);
            request.push_str("\r\n");
        }
        request.push_str("\r\n");
        let mut encoded_request = Zeroizing::new(Vec::with_capacity(request.len() + body.len()));
        encoded_request.extend_from_slice(request.as_bytes());
        encoded_request.extend_from_slice(body);
        stream
            .write_all(encoded_request.as_slice())
            .map_err(|_| transport_error(DirectRpcError::TransportFailed))?;

        let encoded = read_loopback_response(&mut stream)?;
        let response_body = parse_loopback_response(&encoded)?;
        serde_json::from_slice(response_body).map_err(JsonRpcError::Json)
    }

    fn connect_loopback(
        &self,
        endpoint: &Url,
    ) -> Result<(TcpStream, String, String), JsonRpcError> {
        if endpoint.scheme() != "http"
            || !endpoint.username().is_empty()
            || endpoint.password().is_some()
        {
            return Err(transport_error(DirectRpcError::InvalidLoopbackEndpoint));
        }
        let host = endpoint
            .host_str()
            .ok_or_else(|| transport_error(DirectRpcError::InvalidLoopbackEndpoint))?;
        let host_is_loopback = match endpoint.host() {
            Some(Host::Ipv4(address)) => address.is_loopback(),
            Some(Host::Ipv6(address)) => address.is_loopback(),
            Some(Host::Domain(domain)) => domain.eq_ignore_ascii_case("localhost"),
            None => false,
        };
        if !host_is_loopback {
            return Err(transport_error(DirectRpcError::InvalidLoopbackEndpoint));
        }
        let port = endpoint
            .port_or_known_default()
            .ok_or_else(|| transport_error(DirectRpcError::InvalidLoopbackEndpoint))?;
        let mut addresses = (host, port)
            .to_socket_addrs()
            .map_err(|_| transport_error(DirectRpcError::InvalidLoopbackEndpoint))?
            .filter(|address| address.ip().is_loopback())
            .collect::<Vec<_>>();
        addresses.sort_by_key(|address| !address.is_ipv4());
        let mut stream = None;
        for address in addresses {
            if let Ok(candidate) = TcpStream::connect_timeout(&address, self.timeout) {
                stream = Some(candidate);
                break;
            }
        }
        let stream = stream.ok_or_else(|| transport_error(DirectRpcError::TransportFailed))?;
        stream
            .set_read_timeout(Some(self.timeout))
            .and_then(|()| stream.set_write_timeout(Some(self.timeout)))
            .map_err(|_| transport_error(DirectRpcError::TransportFailed))?;

        let host_value = match endpoint.host() {
            Some(Host::Ipv6(address)) => format!("[{address}]"),
            Some(Host::Ipv4(address)) => address.to_string(),
            Some(Host::Domain(domain)) => domain.to_owned(),
            None => return Err(transport_error(DirectRpcError::InvalidLoopbackEndpoint)),
        };
        let host_header = format!("{host_value}:{port}");
        let mut request_path = endpoint.path().to_owned();
        if request_path.is_empty() {
            request_path.push('/');
        }
        if let Some(query) = endpoint.query() {
            request_path.push('?');
            request_path.push_str(query);
        }
        Ok((stream, host_header, request_path))
    }
}

fn read_loopback_response(stream: &mut TcpStream) -> Result<Vec<u8>, JsonRpcError> {
    let mut encoded = Vec::new();
    let header_end = loop {
        if let Some(header_end) = encoded
            .windows(4)
            .position(|window| window == b"\r\n\r\n")
            .map(|index| index + 4)
        {
            break header_end;
        }
        if encoded.len() >= MAX_HTTP_HEADER_BYTES {
            return Err(transport_error(DirectRpcError::ResponseTooLarge));
        }
        let remaining = MAX_HTTP_HEADER_BYTES - encoded.len();
        let mut chunk = [0_u8; 8 * 1024];
        let read_limit = remaining.min(chunk.len());
        let read = stream
            .read(&mut chunk[..read_limit])
            .map_err(|_| transport_error(DirectRpcError::TransportFailed))?;
        if read == 0 {
            return Err(transport_error(DirectRpcError::MalformedResponse));
        }
        encoded.extend_from_slice(&chunk[..read]);
    };

    let expected = parse_loopback_header(&encoded[..header_end])?;
    let response_end = header_end
        .checked_add(expected)
        .ok_or_else(|| transport_error(DirectRpcError::ResponseTooLarge))?;
    if encoded.len() > response_end {
        return Err(transport_error(DirectRpcError::MalformedResponse));
    }
    encoded.reserve(response_end - encoded.len());
    while encoded.len() < response_end {
        let mut chunk = [0_u8; 8 * 1024];
        let remaining = response_end - encoded.len();
        let read_limit = remaining.min(chunk.len());
        let read = stream
            .read(&mut chunk[..read_limit])
            .map_err(|_| transport_error(DirectRpcError::TransportFailed))?;
        if read == 0 {
            return Err(transport_error(DirectRpcError::MalformedResponse));
        }
        encoded.extend_from_slice(&chunk[..read]);
    }
    Ok(encoded)
}

fn parse_loopback_header(encoded: &[u8]) -> Result<usize, JsonRpcError> {
    let header_end = encoded
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|index| index + 4)
        .ok_or_else(|| transport_error(DirectRpcError::MalformedResponse))?;
    if header_end > MAX_HTTP_HEADER_BYTES {
        return Err(transport_error(DirectRpcError::ResponseTooLarge));
    }
    let header = std::str::from_utf8(&encoded[..header_end])
        .map_err(|_| transport_error(DirectRpcError::MalformedResponse))?;
    let mut lines = header.split("\r\n");
    let mut status_line = lines
        .next()
        .ok_or_else(|| transport_error(DirectRpcError::MalformedResponse))?
        .split_whitespace();
    let protocol = status_line
        .next()
        .ok_or_else(|| transport_error(DirectRpcError::MalformedResponse))?;
    let status = status_line
        .next()
        .and_then(|status| status.parse::<u16>().ok())
        .ok_or_else(|| transport_error(DirectRpcError::MalformedResponse))?;
    if !matches!(protocol, "HTTP/1.0" | "HTTP/1.1") {
        return Err(transport_error(DirectRpcError::MalformedResponse));
    }
    if status != 200 {
        return Err(transport_error(DirectRpcError::HttpRejected(status)));
    }
    let mut content_length = None;
    for line in lines {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        if name.eq_ignore_ascii_case("transfer-encoding") {
            return Err(transport_error(DirectRpcError::MalformedResponse));
        }
        if name.eq_ignore_ascii_case("content-length") {
            if content_length.is_some() {
                return Err(transport_error(DirectRpcError::MalformedResponse));
            }
            content_length = value.trim().parse::<usize>().ok();
            if content_length.is_none() {
                return Err(transport_error(DirectRpcError::MalformedResponse));
            }
        }
    }
    let expected =
        content_length.ok_or_else(|| transport_error(DirectRpcError::MalformedResponse))?;
    if expected > MAX_RPC_BODY_BYTES {
        return Err(transport_error(DirectRpcError::ResponseTooLarge));
    }
    Ok(expected)
}

fn parse_loopback_response(encoded: &[u8]) -> Result<&[u8], JsonRpcError> {
    let header_end = encoded
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|index| index + 4)
        .ok_or_else(|| transport_error(DirectRpcError::MalformedResponse))?;
    let expected = parse_loopback_header(&encoded[..header_end])?;
    let body = &encoded[header_end..];
    if body.len() != expected {
        return Err(transport_error(DirectRpcError::MalformedResponse));
    }
    Ok(body)
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

pub(crate) fn rejected_http_status(error: &CoreRpcError) -> Option<u16> {
    let CoreRpcError::JsonRpc(JsonRpcError::Transport(source)) = error else {
        return None;
    };
    match source.downcast_ref::<DirectRpcError>()? {
        DirectRpcError::HttpRejected(status) => Some(*status),
        _ => None,
    }
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

    fn read_http_request(stream: &mut std::net::TcpStream) -> Vec<u8> {
        stream
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        let mut request = Vec::new();
        loop {
            let mut chunk = [0_u8; 4096];
            let read = stream.read(&mut chunk).unwrap();
            request.extend_from_slice(&chunk[..read]);
            let Some(header_end) = request
                .windows(4)
                .position(|window| window == b"\r\n\r\n")
                .map(|index| index + 4)
            else {
                continue;
            };
            let header = std::str::from_utf8(&request[..header_end]).unwrap();
            let content_length = header
                .split("\r\n")
                .find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    name.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse::<usize>().unwrap())
                })
                .unwrap();
            if request.len() >= header_end + content_length {
                return request;
            }
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

    #[test]
    fn loopback_transport_handles_repeated_requests_without_timeout_workers() {
        const REQUESTS: usize = 256;
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            for _ in 0..REQUESTS {
                let (mut stream, _) = listener.accept().unwrap();
                let request = read_http_request(&mut stream);
                assert!(request
                    .windows(b"Connection: close".len())
                    .any(|window| window == b"Connection: close"));
                let body =
                    br#"{"jsonrpc":"2.0","result":{"chain":"testnet4"},"error":null,"id":1}"#;
                let header = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                stream.write_all(header.as_bytes()).unwrap();
                stream.write_all(body).unwrap();
            }
        });
        let transport = DirectRpcTransport::new(
            &format!("http://{address}"),
            Some("groot"),
            Some("secret"),
            Duration::from_secs(1),
        );
        for _ in 0..REQUESTS {
            let response = transport.send_request(rpc_request()).unwrap();
            let result: serde_json::Value =
                serde_json::from_str(response.result.unwrap().get()).unwrap();
            assert_eq!(result["chain"], "testnet4");
        }
        server.join().unwrap();
    }

    #[test]
    fn loopback_transport_finishes_without_waiting_for_the_server_to_close() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let (release_sender, release_receiver) = mpsc::channel();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            read_http_request(&mut stream);
            let body = br#"{"jsonrpc":"2.0","result":{"chain":"testnet4"},"error":null,"id":1}"#;
            let header = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n",
                body.len()
            );
            stream.write_all(header.as_bytes()).unwrap();
            stream.write_all(body).unwrap();
            release_receiver
                .recv_timeout(Duration::from_secs(2))
                .unwrap();
        });
        let transport = DirectRpcTransport::new(
            &format!("http://{address}"),
            Some("groot"),
            Some("secret"),
            Duration::from_secs(1),
        );
        let response = transport.send_request(rpc_request()).unwrap();
        let result: serde_json::Value =
            serde_json::from_str(response.result.unwrap().get()).unwrap();
        assert_eq!(result["chain"], "testnet4");
        release_sender.send(()).unwrap();
        server.join().unwrap();
    }

    #[test]
    fn exposes_only_the_rejected_http_status_for_error_translation() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            read_http_request(&mut stream);
            stream
                .write_all(
                    b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                )
                .unwrap();
        });
        let transport = DirectRpcTransport::new(
            &format!("http://{address}"),
            Some("groot"),
            Some("secret"),
            Duration::from_secs(1),
        );
        let error = transport.send_request(rpc_request()).unwrap_err();
        let error = CoreRpcError::JsonRpc(error);
        assert_eq!(rejected_http_status(&error), Some(403));
        server.join().unwrap();
    }

    #[test]
    fn plaintext_transport_rejects_non_loopback_hosts() {
        let transport = DirectRpcTransport::new(
            "http://192.0.2.1:8332",
            Some("groot"),
            Some("secret"),
            Duration::from_millis(20),
        );
        assert!(transport.send_request(rpc_request()).is_err());
    }

    #[test]
    #[ignore = "requires an explicitly supplied disposable local Bitcoin Core cookie"]
    fn live_loopback_core_uses_the_bounded_socket_transport() {
        let endpoint = std::env::var("GROOT_LIVE_RPC_URL").unwrap();
        let cookie_path = std::env::var("GROOT_LIVE_RPC_COOKIE").unwrap();
        let cookie = Zeroizing::new(std::fs::read_to_string(cookie_path).unwrap());
        let (username, password) = cookie.trim().split_once(':').unwrap();
        let transport = DirectRpcTransport::new(
            &endpoint,
            Some(username),
            Some(password),
            Duration::from_secs(2),
        );
        let response = transport.send_request(rpc_request()).unwrap();
        assert!(response.error.is_none());
        let result: serde_json::Value =
            serde_json::from_str(response.result.unwrap().get()).unwrap();
        assert_eq!(result["chain"], "testnet4");
    }
}
