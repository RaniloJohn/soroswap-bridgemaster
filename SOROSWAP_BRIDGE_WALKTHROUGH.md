# Soroswap Bridge - Atomic Swap Walkthrough

This document serves as a detailed walkthrough of the Soroswap Bridge Cross-Chain Atomic Swap mechanism built during this development phase. It details the architecture, the specific technologies employed, the 5-step state machine of the swap, and how wallet integrations are handled natively on the frontend.

## Architecture & Technologies
The Soroswap Bridge aims to securely connect EVM networks (like Sepolia/Ethereum) with Soroban (Stellar's smart contract platform) without relying on trusted intermediaries. It achieves this using **Hashed Timelock Contracts (HTLCs)**.

### Tech Stack
* **Frontend Framework**: React 18, Vite
* **Styling**: Tailwind CSS, Framer Motion (for fluid, animated state transitions)
* **EVM Integration**: `wagmi` (v2), `viem` (for native injected wallet connection like MetaMask, and contract writes)
* **Soroban Integration**: `@stellar/freighter-api` (for native Freighter extension connection), `@stellar/stellar-sdk` (for XDR construction and Soroban contract calls)

---

## The 5-Step Atomic Swap Mechanism

The main application resides in `client/src/App.jsx` and transitions through a precisely defined state machine.

### Stage 1: Input & Intent Creation
* Users input the amount of ETH they wish to swap and the amount of XLM they expect to receive.
* Before any on-chain transaction occurs, an **Atomic Swap Preimage** (a cryptographically secure random password) is generated natively in the browser using `window.crypto.subtle.digest`.
* This generates a `preimage` (plain text) and a `hashlock` (SHA-256 hashed version). 
* The user connects their **EVM Wallet** and **Freighter Wallet**. Only the `hashlock` is ever broadcasted publicly; the `preimage` remains safely in the browser's memory.

### Stage 2: Locking on EVM
* The UI transitions to the "Locking" state and triggers a transaction using `wagmi`'s `useWriteContract`.
* The wallet prompts the user to submit an on-chain transaction to the EVM HTLC smart contract address.
* The contract call is `lock(hashlock, timelock, receiver)`, depositing the user's funds into the EVM smart contract, locked securely by the generated hash. 
* The UI waits for real on-chain confirmation via `useWaitForTransactionReceipt`.

### Stage 3: Depositing on Soroban
* Once EVM confirms the lock, the UI progresses to step 3. 
* The app leverages the `@stellar/stellar-sdk` to instantiate a `TransactionBuilder` and constructs a `deposit` contract call targeting the Soroban HTLC contract. 
* It uses native Stellar types (`nativeToScVal`) to format the arguments properly. 
* The generated `XDR` string is sent to the Freighter wallet via `@stellar/freighter-api` (`signTransaction`), prompting the user via popup to sign and authorize the Soroban deposit.

### Stage 4: Claiming (The Relayer Phase)
* Note: In a fully complete scenario, this stage heavily involves the Relayer. 
* Once both sides are locked, the user submits a transaction on Soroban revealing the original `preimage` to claim their XLM. 
* As soon as this `preimage` hits the public ledger, the Soroswap Relayer immediately spots it. 
* The Relayer then submits this exact same `preimage` to the EVM HTLC contract, thus claiming the locked ETH.

### Stage 5: Swap Complete
* Both chains have finalized their respective unlocks. 
* The UI alerts the user that funds have successfully crossed boundaries.
* A "View on Explorer" button provides users with the Stellar.expert and Etherscan links to directly view the cryptographic proofs of their HTLC unlock events.

---

## Wallet Integration & Graceful Fallbacks
A significant portion of development was dedicated to robust wallet connections:

1. **Native EVM**: Uses `WagmiProvider` and `QueryClientProvider` correctly instantiated in `main.jsx` to parse any injected EIP-1193 provider (MetaMask). 
2. **Native Freighter**: Replaced abstraction wrappers with direct API hits (`isConnected`, `requestAccess`, `getPublicKey` from `@stellar/freighter-api`) to guarantee the popup activates properly upon user click without silent failures.
3. **Smart Fallback**: If the user is testing the UI on a browser without the respective extensions installed, the application intelligently recognizes the failure context and overrides it with a mock "TEST" address. It alerts the developer that it is proceeding strictly to demonstrate the UI flow, falling back to simulated timers so testing is never hard-blocked by missing plugins.
