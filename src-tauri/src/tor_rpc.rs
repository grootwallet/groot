use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use jsonrpc::{client::Transport, Error as JsonRpcError, Request, Response};
use serde::{de::DeserializeOwned, Serialize};
use std::{
    fmt,
    io::{Read, Write},
    net::{Shutdown, SocketAddr, TcpStream},
    time::{Duration, Instant},
};
use thiserror::Error;
use url::Url;
use zeroize::Zeroizing;

const MAX_HTTP_HEADER_BYTES: usize = 64 * 1024;
const MAX_RPC_BODY_BYTES: usize = 16 * 1024 * 1024;

#[derive(Debug, Error)]
enum TorRpcError {
    #[error("the Tor RPC endpoint is invalid")]
    InvalidEndpoint,
    #[error("the Tor SOCKS5 proxy is unavailable")]
    ProxyUnavailable,
    #[error("the Tor SOCKS5 handshake failed")]
    ProxyHandshake,
    #[error("the Tor SOCKS5 proxy rejected the onion connection")]
    ProxyRejected,
    #[error("the Tor RPC request timed out")]
    TimedOut,
    #[error("the Tor RPC response is malformed")]
    MalformedResponse,
    #[error("the Tor RPC response exceeded the size limit")]
    ResponseTooLarge,
    #[error("the Tor RPC request exceeded the size limit")]
    RequestTooLarge,
    #[error("the Tor RPC endpoint rejected the request")]
    HttpRejected,
}

pub struct TorRpcTransport {
    onion_host: String,
    onion_port: u16,
    request_path: String,
    proxy: SocketAddr,
    authorization: Zeroizing<String>,
    timeout: Duration,
}

impl TorRpcTransport {
    pub fn new(
        endpoint: &Url,
        username: &str,
        password: &str,
        proxy: SocketAddr,
        timeout: Duration,
    ) -> Result<Self, JsonRpcError> {
        let onion_host = endpoint
            .host_str()
            .filter(|host| is_v3_onion(host))
            .ok_or_else(|| transport_error(TorRpcError::InvalidEndpoint))?;
        if endpoint.scheme() != "http" || !proxy.ip().is_loopback() || proxy.port() == 0 {
            return Err(transport_error(TorRpcError::InvalidEndpoint));
        }
        let onion_port = endpoint
            .port_or_known_default()
            .ok_or_else(|| transport_error(TorRpcError::InvalidEndpoint))?;
        let mut request_path = endpoint.path().to_owned();
        if request_path.is_empty() {
            request_path.push('/');
        }
        if let Some(query) = endpoint.query() {
            request_path.push('?');
            request_path.push_str(query);
        }
        let mut credentials =
            Zeroizing::new(String::with_capacity(username.len() + password.len() + 1));
        credentials.push_str(username);
        credentials.push(':');
        credentials.push_str(password);
        let authorization = Zeroizing::new(BASE64.encode(credentials.as_bytes()));
        Ok(Self {
            onion_host: onion_host.to_owned(),
            onion_port,
            request_path,
            proxy,
            authorization,
            timeout,
        })
    }

    fn request<R: DeserializeOwned>(&self, value: &impl Serialize) -> Result<R, JsonRpcError> {
        let body = serde_json::to_vec(value)?;
        if body.len() > MAX_RPC_BODY_BYTES {
            return Err(transport_error(TorRpcError::RequestTooLarge));
        }
        // One monotonic budget covers every network phase. A socket timeout
        // alone restarts after each successful partial read or write.
        let deadline = Instant::now()
            .checked_add(self.timeout)
            .ok_or_else(|| transport_error(TorRpcError::TimedOut))?;
        let mut stream = self.connect(deadline)?;
        let request = Zeroizing::new(format!(
            "POST {} HTTP/1.1\r\nHost: {}:{}\r\nAuthorization: Basic {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            self.request_path,
            self.onion_host,
            self.onion_port,
            self.authorization.as_str(),
            body.len()
        ));
        write_all(&mut stream, request.as_bytes(), deadline)?;
        write_all(&mut stream, &body, deadline)?;
        stream.shutdown(Shutdown::Write).map_err(map_stream_error)?;
        let encoded = read_http_response(&mut stream, deadline)?;
        let body = parse_http_response(&encoded)?;
        remaining(deadline)?;
        serde_json::from_slice(body).map_err(JsonRpcError::Json)
    }

    fn connect(&self, deadline: Instant) -> Result<TcpStream, JsonRpcError> {
        let mut stream =
            TcpStream::connect_timeout(&self.proxy, remaining(deadline)?).map_err(|error| {
                match error.kind() {
                    std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock => {
                        transport_error(TorRpcError::TimedOut)
                    }
                    _ => transport_error(TorRpcError::ProxyUnavailable),
                }
            })?;
        write_all(&mut stream, &[5, 1, 0], deadline)?;
        let mut greeting = [0_u8; 2];
        read_exact(&mut stream, &mut greeting, deadline)?;
        if greeting != [5, 0] {
            return Err(transport_error(TorRpcError::ProxyHandshake));
        }
        let host = self.onion_host.as_bytes();
        let host_len =
            u8::try_from(host.len()).map_err(|_| transport_error(TorRpcError::InvalidEndpoint))?;
        let mut connect = Vec::with_capacity(host.len() + 7);
        connect.extend_from_slice(&[5, 1, 0, 3, host_len]);
        connect.extend_from_slice(host);
        connect.extend_from_slice(&self.onion_port.to_be_bytes());
        write_all(&mut stream, &connect, deadline)?;
        let mut reply = [0_u8; 4];
        read_exact(&mut stream, &mut reply, deadline)?;
        if reply[0] != 5 || reply[2] != 0 {
            return Err(transport_error(TorRpcError::ProxyHandshake));
        }
        if reply[1] != 0 {
            return Err(transport_error(TorRpcError::ProxyRejected));
        }
        let address_len = match reply[3] {
            1 => 4,
            3 => {
                let mut length = [0_u8; 1];
                read_exact(&mut stream, &mut length, deadline)?;
                usize::from(length[0])
            }
            4 => 16,
            _ => return Err(transport_error(TorRpcError::ProxyHandshake)),
        };
        let mut bound_address_and_port = vec![0_u8; address_len + 2];
        read_exact(&mut stream, &mut bound_address_and_port, deadline)?;
        Ok(stream)
    }
}

impl Transport for TorRpcTransport {
    fn send_request(&self, request: Request) -> Result<Response, JsonRpcError> {
        self.request(&request)
    }

    fn send_batch(&self, requests: &[Request]) -> Result<Vec<Response>, JsonRpcError> {
        self.request(&requests)
    }

    fn fmt_target(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str("Tor Bitcoin Core endpoint")
    }
}

pub fn is_v3_onion(host: &str) -> bool {
    let Some(label) = host.strip_suffix(".onion") else {
        return false;
    };
    label.len() == 56
        && label
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || (b'2'..=b'7').contains(&byte))
}

fn parse_http_response(encoded: &[u8]) -> Result<&[u8], JsonRpcError> {
    let header_end = encoded
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|index| index + 4)
        .ok_or_else(|| transport_error(TorRpcError::MalformedResponse))?;
    let expected = parse_http_header(&encoded[..header_end])?;
    let body = &encoded[header_end..];
    if body.len() != expected {
        return Err(transport_error(TorRpcError::MalformedResponse));
    }
    Ok(body)
}

fn parse_http_header(encoded: &[u8]) -> Result<usize, JsonRpcError> {
    if encoded.len() > MAX_HTTP_HEADER_BYTES {
        return Err(transport_error(TorRpcError::ResponseTooLarge));
    }
    let header = std::str::from_utf8(encoded)
        .map_err(|_| transport_error(TorRpcError::MalformedResponse))?;
    let mut lines = header.split("\r\n");
    let mut status_line = lines
        .next()
        .ok_or_else(|| transport_error(TorRpcError::MalformedResponse))?
        .split_whitespace();
    let protocol = status_line
        .next()
        .ok_or_else(|| transport_error(TorRpcError::MalformedResponse))?;
    let status = status_line
        .next()
        .and_then(|status| status.parse::<u16>().ok())
        .ok_or_else(|| transport_error(TorRpcError::MalformedResponse))?;
    if !matches!(protocol, "HTTP/1.0" | "HTTP/1.1") {
        return Err(transport_error(TorRpcError::MalformedResponse));
    }
    if status != 200 {
        return Err(transport_error(TorRpcError::HttpRejected));
    }
    let mut content_length = None;
    for line in lines {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        if name.eq_ignore_ascii_case("transfer-encoding") {
            return Err(transport_error(TorRpcError::MalformedResponse));
        }
        if name.eq_ignore_ascii_case("content-length") {
            if content_length.is_some() {
                return Err(transport_error(TorRpcError::MalformedResponse));
            }
            content_length = value.trim().parse::<usize>().ok();
            if content_length.is_none() {
                return Err(transport_error(TorRpcError::MalformedResponse));
            }
        }
    }
    let expected = content_length.ok_or_else(|| transport_error(TorRpcError::MalformedResponse))?;
    if expected > MAX_RPC_BODY_BYTES {
        return Err(transport_error(TorRpcError::ResponseTooLarge));
    }
    Ok(expected)
}

fn remaining(deadline: Instant) -> Result<Duration, JsonRpcError> {
    deadline
        .checked_duration_since(Instant::now())
        .filter(|duration| !duration.is_zero())
        .ok_or_else(|| transport_error(TorRpcError::TimedOut))
}

fn write_all(
    stream: &mut TcpStream,
    mut bytes: &[u8],
    deadline: Instant,
) -> Result<(), JsonRpcError> {
    while !bytes.is_empty() {
        stream
            .set_write_timeout(Some(remaining(deadline)?))
            .map_err(map_stream_error)?;
        match stream.write(bytes) {
            Ok(0) => return Err(transport_error(TorRpcError::ProxyHandshake)),
            Ok(written) => bytes = &bytes[written..],
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(map_stream_error(error)),
        }
    }
    remaining(deadline).map(|_| ())
}

fn read_some(
    stream: &mut TcpStream,
    bytes: &mut [u8],
    deadline: Instant,
) -> Result<usize, JsonRpcError> {
    loop {
        stream
            .set_read_timeout(Some(remaining(deadline)?))
            .map_err(map_stream_error)?;
        match stream.read(bytes) {
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
            result => {
                let read = result.map_err(map_stream_error)?;
                remaining(deadline)?;
                return Ok(read);
            }
        }
    }
}

fn read_exact(
    stream: &mut TcpStream,
    mut bytes: &mut [u8],
    deadline: Instant,
) -> Result<(), JsonRpcError> {
    while !bytes.is_empty() {
        let read = read_some(stream, bytes, deadline)?;
        if read == 0 {
            return Err(transport_error(TorRpcError::ProxyHandshake));
        }
        bytes = &mut bytes[read..];
    }
    Ok(())
}

fn read_http_response(stream: &mut TcpStream, deadline: Instant) -> Result<Vec<u8>, JsonRpcError> {
    let mut encoded = Vec::new();
    let mut expected_total = None;
    let mut chunk = [0; 8192];
    loop {
        let available = expected_total.unwrap_or(MAX_HTTP_HEADER_BYTES + 1) - encoded.len();
        if available == 0 {
            return Ok(encoded);
        }
        let limit = chunk.len().min(available);
        let read = read_some(stream, &mut chunk[..limit], deadline)?;
        if read == 0 {
            return Err(transport_error(TorRpcError::MalformedResponse));
        }
        encoded.extend_from_slice(&chunk[..read]);
        if expected_total.is_none() {
            if let Some(end) = encoded.windows(4).position(|bytes| bytes == b"\r\n\r\n") {
                let header_end = end + 4;
                let total = header_end + parse_http_header(&encoded[..header_end])?;
                if encoded.len() > total {
                    return Err(transport_error(TorRpcError::MalformedResponse));
                }
                expected_total = Some(total);
            } else if encoded.len() > MAX_HTTP_HEADER_BYTES {
                return Err(transport_error(TorRpcError::ResponseTooLarge));
            }
        }
    }
}

fn map_stream_error(error: std::io::Error) -> JsonRpcError {
    if matches!(
        error.kind(),
        std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock
    ) {
        transport_error(TorRpcError::TimedOut)
    } else {
        transport_error(TorRpcError::ProxyHandshake)
    }
}

fn transport_error(error: TorRpcError) -> JsonRpcError {
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

    const ONION: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.onion";

    fn endpoint() -> Url {
        Url::parse(&format!("http://{ONION}:8332/wallet/groot")).unwrap()
    }

    fn serve_proxy(
        response: Option<Vec<u8>>,
        reply_code: u8,
    ) -> (SocketAddr, mpsc::Receiver<(String, u16, Vec<u8>)>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let (sender, receiver) = mpsc::channel();
        thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut greeting = [0_u8; 3];
            stream.read_exact(&mut greeting).unwrap();
            assert_eq!(greeting, [5, 1, 0]);
            stream.write_all(&[5, 0]).unwrap();
            let mut connect = [0_u8; 5];
            stream.read_exact(&mut connect).unwrap();
            assert_eq!(&connect[..4], &[5, 1, 0, 3]);
            let mut domain = vec![0_u8; usize::from(connect[4])];
            stream.read_exact(&mut domain).unwrap();
            let mut port = [0_u8; 2];
            stream.read_exact(&mut port).unwrap();
            stream
                .write_all(&[5, reply_code, 0, 1, 127, 0, 0, 1, 0, 0])
                .unwrap();
            if reply_code != 0 {
                sender
                    .send((
                        String::from_utf8(domain).unwrap(),
                        u16::from_be_bytes(port),
                        vec![],
                    ))
                    .unwrap();
                return;
            }
            if let Some(response) = response {
                let request = read_http_request(&mut stream);
                sender
                    .send((
                        String::from_utf8(domain).unwrap(),
                        u16::from_be_bytes(port),
                        request,
                    ))
                    .unwrap();
                stream.write_all(&response).unwrap();
            } else {
                thread::sleep(Duration::from_millis(250));
            }
        });
        (address, receiver)
    }

    fn read_http_request(stream: &mut TcpStream) -> Vec<u8> {
        let mut request = Vec::new();
        let mut byte = [0_u8; 1];
        while !request.ends_with(b"\r\n\r\n") {
            stream.read_exact(&mut byte).unwrap();
            request.push(byte[0]);
        }
        let header = String::from_utf8(request.clone()).unwrap();
        let content_length = header
            .lines()
            .find_map(|line| {
                line.split_once(':').and_then(|(name, value)| {
                    name.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse::<usize>().unwrap())
                })
            })
            .unwrap();
        let header_length = request.len();
        request.resize(header_length + content_length, 0);
        stream.read_exact(&mut request[header_length..]).unwrap();
        request
    }

    fn rpc_response(body: &str) -> Vec<u8> {
        format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )
        .into_bytes()
    }

    fn request() -> Request<'static> {
        Request {
            method: "getblockchaininfo",
            params: None,
            id: serde_json::json!(1),
            jsonrpc: Some("2.0"),
        }
    }

    // All peers are disposable loopback sockets. Each byte arrives sooner than
    // the socket timeout, but the whole exchange exceeds the request budget.
    fn slow_proxy(stage: &'static str) -> (SocketAddr, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let worker = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut greeting = [0; 3];
            stream.read_exact(&mut greeting).unwrap();
            for byte in [5, 0] {
                if stage == "socks" {
                    thread::sleep(Duration::from_millis(90));
                }
                if stream.write_all(&[byte]).is_err() {
                    return;
                }
            }
            let mut connect = [0; 5];
            if stream.read_exact(&mut connect).is_err() {
                return;
            }
            let mut destination = vec![0; usize::from(connect[4]) + 2];
            stream.read_exact(&mut destination).unwrap();
            if stream.write_all(&[5, 0, 0, 1, 127, 0, 0, 1, 0, 0]).is_err() {
                return;
            }
            read_http_request(&mut stream);
            let body = r#"{"result":true,"error":null,"id":1,"jsonrpc":"2.0"}"#;
            let response = rpc_response(body);
            let header_end = response
                .windows(4)
                .position(|bytes| bytes == b"\r\n\r\n")
                .unwrap()
                + 4;
            for (index, byte) in response.into_iter().enumerate() {
                if (stage == "headers" && index < header_end)
                    || (stage == "body" && index >= header_end)
                {
                    thread::sleep(Duration::from_millis(25));
                }
                if stream.write_all(&[byte]).is_err() {
                    return;
                }
            }
            if stage == "keep-open" {
                thread::sleep(Duration::from_millis(400));
            }
        });
        (address, worker)
    }

    #[test]
    fn one_deadline_bounds_slow_socks_headers_and_body() {
        for stage in ["socks", "headers", "body"] {
            let (proxy, worker) = slow_proxy(stage);
            let transport = TorRpcTransport::new(
                &endpoint(),
                "groot",
                "secret",
                proxy,
                Duration::from_millis(150),
            )
            .unwrap();
            let started = std::time::Instant::now();
            let error = transport.send_request(request()).unwrap_err();
            assert!(error.to_string().contains("timed out"), "{stage}: {error}");
            assert!(started.elapsed() < Duration::from_millis(700), "{stage}");
            worker.join().unwrap();
        }
    }

    #[test]
    fn complete_content_length_does_not_wait_for_peer_close() {
        let (proxy, worker) = slow_proxy("keep-open");
        let transport = TorRpcTransport::new(
            &endpoint(),
            "groot",
            "secret",
            proxy,
            Duration::from_millis(150),
        )
        .unwrap();
        assert_eq!(
            transport.send_request(request()).unwrap().id,
            serde_json::json!(1)
        );
        worker.join().unwrap();
    }

    #[test]
    fn expired_deadline_prevents_both_reads_and_writes() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let mut stream = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
        let (mut peer, _) = listener.accept().unwrap();
        peer.set_nonblocking(true).unwrap();
        let deadline = Instant::now() - Duration::from_millis(1);
        assert!(write_all(&mut stream, b"request", deadline)
            .unwrap_err()
            .to_string()
            .contains("timed out"));
        assert!(read_exact(&mut stream, &mut [0], deadline)
            .unwrap_err()
            .to_string()
            .contains("timed out"));
        assert_eq!(
            peer.read(&mut [0]).unwrap_err().kind(),
            std::io::ErrorKind::WouldBlock
        );
    }

    #[test]
    fn batch_requests_share_the_same_bounded_transport() {
        let body = r#"[{"result":true,"error":null,"id":1,"jsonrpc":"2.0"}]"#;
        let (proxy, observed) = serve_proxy(Some(rpc_response(body)), 0);
        let transport = TorRpcTransport::new(
            &endpoint(),
            "groot",
            "secret",
            proxy,
            Duration::from_secs(1),
        )
        .unwrap();
        assert_eq!(
            transport.send_batch(&[request()]).unwrap()[0].id,
            serde_json::json!(1)
        );
        let (_, _, request) = observed.recv().unwrap();
        assert!(request
            .windows(b"[{\"method\"".len())
            .any(|bytes| bytes == b"[{\"method\""));
    }

    #[test]
    fn sends_the_onion_hostname_to_socks_without_local_resolution() {
        let body = r#"{"result":{"chain":"regtest"},"error":null,"id":1,"jsonrpc":"2.0"}"#;
        let (proxy, observed) = serve_proxy(Some(rpc_response(body)), 0);
        let transport = TorRpcTransport::new(
            &endpoint(),
            "groot",
            "secret",
            proxy,
            Duration::from_secs(1),
        )
        .unwrap();
        let response = transport.send_request(request()).unwrap();
        assert_eq!(response.id, serde_json::json!(1));
        let (domain, port, encoded_request) = observed.recv().unwrap();
        assert_eq!(domain, ONION);
        assert_eq!(port, 8332);
        let encoded_request = String::from_utf8(encoded_request).unwrap();
        assert!(encoded_request.starts_with("POST /wallet/groot HTTP/1.1\r\n"));
        assert!(encoded_request.contains(&format!("Host: {ONION}:8332\r\n")));
        assert!(encoded_request.contains(&format!(
            "Authorization: Basic {}\r\n",
            BASE64.encode("groot:secret")
        )));
    }

    #[test]
    fn proxy_rejection_and_stall_fail_without_a_direct_fallback() {
        let (proxy, observed) = serve_proxy(None, 4);
        let rejected = TorRpcTransport::new(
            &endpoint(),
            "groot",
            "secret",
            proxy,
            Duration::from_millis(100),
        )
        .unwrap()
        .send_request(request())
        .unwrap_err();
        assert!(rejected.to_string().contains("proxy rejected"));
        assert_eq!(observed.recv().unwrap().0, ONION);

        let (proxy, _) = serve_proxy(None, 0);
        let timed_out = TorRpcTransport::new(
            &endpoint(),
            "groot",
            "secret",
            proxy,
            Duration::from_millis(50),
        )
        .unwrap()
        .send_request(request())
        .unwrap_err();
        assert!(timed_out.to_string().contains("timed out"));
    }

    #[test]
    fn rejects_non_v3_onions_and_unbounded_or_ambiguous_http() {
        assert!(!is_v3_onion("example.onion"));
        assert!(!is_v3_onion(
            "11111111111111111111111111111111111111111111111111111111.onion"
        ));
        assert!(is_v3_onion(ONION));
        assert!(
            parse_http_response(b"HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n")
                .unwrap_err()
                .to_string()
                .contains("rejected")
        );
        assert!(parse_http_response(
            b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n"
        )
        .is_err());
        assert!(parse_http_response(
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nContent-Length: 2\r\n\r\n{}"
        )
        .is_err());
        for response in [
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{".as_slice(),
            b"HTTP/1.1 200 OK\r\nContent-Length: 1\r\n\r\n{}".as_slice(),
            b"HTTP/1.1 200 OK\r\nContent-Length: -1\r\n\r\n".as_slice(),
            b"HTTP/1.1 200 OK\r\n\r\n{}".as_slice(),
        ] {
            assert!(parse_http_response(response).is_err());
        }
        assert!(parse_http_response(
            format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\n\r\n",
                MAX_RPC_BODY_BYTES + 1
            )
            .as_bytes()
        )
        .unwrap_err()
        .to_string()
        .contains("size limit"));
        assert!(parse_http_header(&vec![b'x'; MAX_HTTP_HEADER_BYTES + 1])
            .unwrap_err()
            .to_string()
            .contains("size limit"));
    }
}
