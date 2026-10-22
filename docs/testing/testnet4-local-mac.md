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

In desktop Groot, select Testnet4, open network settings and connect your own Bitcoin Core node at `http://127.0.0.1:48332`. The current Testnet4 app supports protected RPC username/password authentication; automatic cookie discovery is limited to Regtest. Prefer an existing dedicated Core RPC credential. Never paste credentials into a URL, logs or public configuration. Open the internal Groot app through the provided Testnet4 launcher to retain its isolated wallet profiles.

For the local RC7 rehearsal, the running node's cookie credentials were entered directly into Groot's protected authentication fields and saved encrypted for this wallet. Cookie contents were not printed or included in proof. Core rotates these credentials when it restarts, so this rehearsal connection must then be reconnected; this is not automatic Testnet4 cookie-file support.

A pruned node cannot scan from genesis. Use a birthday known to precede this wallet's possible payments and later than the retained prune height, or use an archival node. A profile creation date alone does not establish the birthday of a restored wallet. Never move the birthday forward merely to suppress a pruning error.

Stop only Testnet4:

```sh
bitcoin-cli -testnet4 stop
```

The iPhone cannot reach the Mac's `127.0.0.1`. Phone wallet sync needs a separately configured trusted remote Core endpoint over the app's supported TLS/Tor route. QR pairing/signature exchange works offline. Do not expose Core RPC directly to the internet or disable transport checks.

Observed 2026-10-19: Mainnet was running and Testnet4 was stopped. Starting the command above opened local RPC successfully; Testnet4 connected to peers, discovered headers and began downloading blocks. This is local node evidence, not completed mobile sync or funded hardware certification.
