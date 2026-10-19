# Local Testnet4 on macOS

Mainnet and Testnet4 are separate Bitcoin Core processes and data directories. Groot does not start Testnet4 via its Mainnet managed-node service.

Start the existing local Testnet4 node:

```sh
bitcoind -testnet4 -daemon -server=1 -rpcport=48332 -port=48333 -rpcbind=127.0.0.1 -rpcallowip=127.0.0.1
```

Check progress:

```sh
bitcoin-cli -testnet4 getblockchaininfo
bitcoin-cli -testnet4 getconnectioncount
```

Wait for `initialblockdownload` to become `false` before relying on wallet sync. On this Mac, the existing configuration prunes chain data to roughly 10 GB. Testnet4 has a separate `testnet4` subdirectory under `~/Library/Application Support/Bitcoin`. The running Mainnet node uses RPC 8332 and remains separate.

In desktop Groot, select Testnet4, open network settings and connect your own Bitcoin Core node at `http://127.0.0.1:48332`, using its cookie at `~/Library/Application Support/Bitcoin/testnet4/.cookie`. Select the file; never paste or share its contents. Open the internal Groot app through the provided Testnet4 launcher to retain its isolated wallet profiles.

Stop only Testnet4:

```sh
bitcoin-cli -testnet4 stop
```

The iPhone cannot reach the Mac's `127.0.0.1`. Phone wallet sync needs a separately configured trusted remote Core endpoint over the app's supported TLS/Tor route. QR pairing/signature exchange works offline. Do not expose Core RPC directly to the internet or disable transport checks.

Observed 2026-10-19: Mainnet was running and Testnet4 was stopped. Starting the command above opened local RPC successfully; Testnet4 connected to peers, discovered headers and began downloading blocks. This is local node evidence, not completed mobile sync or funded hardware certification.
