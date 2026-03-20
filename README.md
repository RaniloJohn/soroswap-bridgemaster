# SoroSwap Bridge

> Cross-chain matched swaps on Soroban: trustless, atomic, peer-to-peer.

A Soroban smart contract system enabling **atomic cross-chain token swaps** between two parties using Hashed Time-Lock Contracts (HTLCs). No custodial bridge. No liquidity pool. No counterparty risk.

## Project Structure

```
soroswap-bridge/
├── contracts/
│   └── soroban-htlc/    # Soroban HTLC smart contract (Rust)
├── evm/                 # EVM HTLC smart contract (Solidity/Hardhat)
├── relayer/             # Off-chain relayer (Node.js)
├── client/              # Frontend UI (React)
└── README.md
```

## Getting Started

### Prerequisites
- Rust 1.89+ with `wasm32-unknown-unknown` target
- Stellar CLI 25.x
- Node.js 22.x / npm 10.x
- VS Build Tools 2022 (Windows)

## Deployed Contract (Testnet)

| Field | Value |
| :--- | :--- |
| **Network** | Stellar Testnet |
| **Contract ID** | `CDNGJSUYHQRJYHGLMFFB0G6VLISVEA2FFNKKLFU3DPT7LB6R3SSZXGZ` |
| **Explorer** | [View on Stellar Expert](https://stellar.expert/explorer/testnet/contract/CDNGJSUYHQRJYHGLMFFB0G6VLISVEA2FFNKKLFU3DPT7LB6R3SSZXGZ) |
| **Stellar Lab** | [View on Stellar Lab](https://lab.stellar.org/r/testnet/contract/CDNGJSUYHQRJYHGLMFFB0G6VLISVEA2FFNKKLFU3DPT7LB6R3SSZXGZ) |

### Deployment Steps
1.  **Build**: `cargo build --target wasm32-unknown-unknown --release`
2.  **Optimize**: `stellar contract optimize --wasm "../../target/wasm32-unknown-unknown/release/soroban_htlc.wasm" --wasm-out "../../target/wasm32-unknown-unknown/release/soroban_htlc_optimized.wasm"`
3.  **Deploy**: `stellar contract deploy --wasm "../../target/wasm32-unknown-unknown/release/soroban_htlc_optimized.wasm" --source alice --network testnet`
