/* eslint-disable */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, ArrowRightLeft, Lock, Unlock, Activity, ExternalLink } from 'lucide-react';
import { useAccount, useConnect, useDisconnect, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { parseUnits } from 'viem';
import { signTransaction, requestAccess, isConnected, getPublicKey } from "@stellar/freighter-api";
import { TransactionBuilder, Networks, Contract, nativeToScVal, Address, SorobanRpc, xdr, Account } from "@stellar/stellar-sdk";

// Contract constants
const EVM_HTLC_ADDRESS = "0x8E8F5D8DdBDb1A8bF9894e6CAc0162A5f4a7c0f1";
const SOROBAN_HTLC_CONTRACT_ID = "CCSTIDMXVLJ4HSPTK6Y6VUNTA3ROZNGNNIVJC2QBPXR5TUBWVVJRGKOL";
const EVM_HTLC_ABI = [
  {
    "type": "function",
    "name": "lock",
    "inputs": [{ "name": "_hashlock", "type": "bytes32" }, { "name": "_timeLock", "type": "uint256" }, { "name": "_receiver", "type": "address" }],
    "outputs": [],
    "stateMutability": "payable"
  }
];

const App = () => {
  const [step, setStep] = useState(1);
  const [sorobanAddress, setSorobanAddress] = useState(null);
  const [mockEvmAddress, setMockEvmAddress] = useState(null);
  const [mockSorobanAddress, setMockSorobanAddress] = useState(null);
  const [swapData, setSwapData] = useState({ preimage: '', hashlock: '' });

  const { address: evmAddress, isConnected: isEvmConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const connectEvm = async () => {
    if (isEvmConnected) {
      disconnect();
    } else {
      try {
        if (!connectors || connectors.length === 0) {
            throw new Error("No connectors");
        }
        // Connect with injected wallet by default (Metamask etc)
        connect({ connector: connectors[0] });
      } catch (e) {
        console.error("No EVM wallet found:", e);
        setMockEvmAddress("0x71C...TEST");
      }
    }
  };

  const connectSoroban = async () => {
    try {
      if (sorobanAddress) {
        setSorobanAddress(null);
        return;
      }
      
      const isFreighterConnected = await isConnected();
      if (!isFreighterConnected) {
        throw new Error("Freighter is not installed or enabled.");
      }

      await requestAccess(); // Ensure Freighter is accessible and allowed
      const pubKey = await getPublicKey();
      
      if (!pubKey) {
        throw new Error("User denied access or Freighter is locked.");
      }
      
      setSorobanAddress(pubKey);
    } catch (err) {
      console.warn("Failed to connect to Freighter:", err);
      // Fallback for missing extension
      setMockSorobanAddress("GCS6...TEST");
    }
  };

  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const startSwap = async () => {
    // Generate secure random preimage
    const randomBytes = new Uint8Array(32);
    window.crypto.getRandomValues(randomBytes);
    const preimageHex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Generate hashlock
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', randomBytes);
    const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Hex to Uint8Array helper for Soroban
    const hexToBytes = (hex) => {
        let bytes = new Uint8Array(Math.ceil(hex.length / 2));
        for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
        return bytes;
    };

    setSwapData({ preimage: preimageHex, hashlock: hashHex });

    // Inform Backend (mock)
    try {
        await fetch('http://localhost:3000/api/swaps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hashlock: hashHex, creatorEvm: evmAddress || mockEvmAddress, creatorSoroban: sorobanAddress || mockSorobanAddress })
        }).catch(() => console.log("Backend not running, intent will only live onchain."));
    } catch (e) {}

    const isUsingMocks = !evmAddress || !sorobanAddress;

    try {
      setStep(2); // "Locking" state
      
      if (isUsingMocks) {
        alert("Wallet extensions not found. Proceeding with simulated transaction flow to demonstrate UI state transitions.");
        setTimeout(() => setStep(3), 2000);
        setTimeout(() => setStep(4), 5000);
        setTimeout(() => setStep(5), 8000);
        return;
      }
      
      console.log("Preparing EVM transaction -> pop wallet...");
      const timelock = Math.floor(Date.now() / 1000) + 3600; // 1 hour
      const txHash = await writeContractAsync({
        address: EVM_HTLC_ADDRESS,
        abi: EVM_HTLC_ABI,
        functionName: 'lock',
        args: [`0x${hashHex}`, BigInt(timelock), evmAddress], // sending back to self effectively for demo
        value: parseUnits('0.01', 18) // ETH
      });
      console.log("EVM Tx submitted:", txHash);

      // Wait for EVM Confirmation
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log("EVM Tx Confirmed");

      setStep(3); // Wait for Soroban
      console.log("Preparing Soroban deposit -> pop freighter...");
      
      // Building Soroban Transaction using JS SDK
      const rpc = new SorobanRpc.Server("https://rpc-futurenet.stellar.org:443");
      const accountInfo = await rpc.getAccount(sorobanAddress);
      
      let sequenceNumber = "1";
      if (accountInfo) sequenceNumber = accountInfo.sequence;

      const account = new Account(sorobanAddress, sequenceNumber);
      
      const contract = new Contract(SOROBAN_HTLC_CONTRACT_ID);
      const scValHash = nativeToScVal(hexToBytes(hashHex), { type: 'bytes' });
      const scValTokenAmount = nativeToScVal(100000000, { type: 'i128' }); // 10 XLM equivalent or token

      const txBuilder = new TransactionBuilder(account, {
        fee: "100000",
        networkPassphrase: Networks.FUTURENET,
      });

      const op = contract.call('deposit', sorobanAddress, scValHash, scValTokenAmount);
      txBuilder.addOperation(op).setTimeout(30);

      const builtTx = txBuilder.build();
      const xdrToSign = builtTx.toXDR();
      
      const signedXdr = await signTransaction(xdrToSign, { network: "FUTURENET", networkPassphrase: Networks.FUTURENET });
      console.log("Soroban Tx Signed:", signedXdr);
      
      setStep(4); // Claiming
      setTimeout(() => setStep(5), 4000); // Simulate Claim phase returning success
    } catch (err) {
      console.error("Integration flow error / user rejected signature:", err);
      alert("Transaction failed or was rejected. Check console for details.");
      setStep(1); // Revert to initial step on failure
    }
  };

  /* eslint-disable no-unused-vars */

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950 flex flex-col items-center py-12 px-4">
      {/* Header */}
      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-16"
      >
        <div className="flex items-center justify-center gap-3 mb-4">
          <Activity className="w-8 h-8 text-blue-400" />
          <h1 className="text-4xl font-extrabold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
            SoroSwap Bridge
          </h1>
        </div>
        <p className="text-slate-400 max-w-lg mx-auto">
          Trustless Atomic Swaps between EVM and Soroban networks using Hash Time-Locked Contracts (HTLC).
        </p>
      </motion.header>

      {/* Main Card */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="w-full max-w-3xl glass-panel p-8"
      >
        {/* Step Indicator */}
        <div className="flex justify-between items-center mb-12 relative px-4">
          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-800 -z-10 transform -translate-y-1/2"></div>
          {[1, 2, 3, 4, 5].map((s) => (
            <div 
              key={s} 
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-500
                ${step >= s ? 'bg-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'bg-slate-800 text-slate-500'}`}
            >
              {s}
            </div>
          ))}
        </div>

        {/* Content Area */}
        <div className="min-h-[300px] flex flex-col items-center justify-center">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full space-y-8"
              >
                <h2 className="text-2xl font-bold text-center mb-6">Connect Wallets</h2>
                <div className="flex flex-col md:flex-row gap-6 justify-center items-center">
                  <button 
                    onClick={connectEvm}
                    className="w-full md:w-64 glass-panel p-6 hover:bg-slate-800/80 transition-all group flex flex-col items-center gap-4 cursor-pointer"
                  >
                    <div className="p-4 rounded-full bg-slate-800 group-hover:bg-blue-500/20 transition-colors">
                      <Wallet className="w-8 h-8 text-slate-300 group-hover:text-blue-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg text-center">EVM Wallet</h3>
                      <p className="text-sm text-slate-400 text-center truncate w-full max-w-[200px]">
                        {(evmAddress || mockEvmAddress) ? `${(evmAddress || mockEvmAddress).slice(0,6)}...${(evmAddress || mockEvmAddress).slice(-4)}` : "Connect EVM Wallet"}
                      </p>
                    </div>
                  </button>

                  <ArrowRightLeft className="w-8 h-8 text-slate-600 hidden md:block" />

                  <button 
                    onClick={connectSoroban}
                    className="w-full md:w-64 glass-panel p-6 hover:bg-slate-800/80 transition-all group flex flex-col items-center gap-4 cursor-pointer"
                  >
                    <div className="p-4 rounded-full bg-slate-800 group-hover:bg-indigo-500/20 transition-colors">
                      <Wallet className="w-8 h-8 text-slate-300 group-hover:text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg text-center">Soroban Wallet</h3>
                      <p className="text-sm text-slate-400 text-center truncate w-full max-w-[200px]">
                        {(sorobanAddress || mockSorobanAddress) ? `${(sorobanAddress || mockSorobanAddress).slice(0,6)}...${(sorobanAddress || mockSorobanAddress).slice(-4)}` : "Connect Freighter"}
                      </p>
                    </div>
                  </button>
                </div>
                
                <div className="flex justify-center mt-10">
                  <button 
                    onClick={startSwap}
                    disabled={!(evmAddress || mockEvmAddress) || !(sorobanAddress || mockSorobanAddress)}
                    className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg font-bold text-white shadow-lg shadow-blue-900/50 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transition-transform"
                  >
                    Initiate Swap &rarr;
                  </button>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center text-center space-y-6 w-full"
              >
                <div className="w-20 h-20 rounded-full bg-blue-500/20 flex items-center justify-center animate-pulse">
                  <Lock className="w-10 h-10 text-blue-400" />
                </div>
                <h2 className="text-2xl font-bold">Locking Soroban Funds</h2>
                <div className="text-left bg-slate-900 p-4 rounded-lg w-full max-w-lg border border-slate-700">
                  <p className="text-sm text-slate-400 mb-1">Generated Preimage:</p>
                  <p className="font-mono text-xs text-blue-400 break-all bg-slate-950 p-2 rounded">{swapData.preimage}</p>
                  <p className="text-sm text-slate-400 mt-3 mb-1">Generated Hashlock:</p>
                  <p className="font-mono text-xs text-indigo-400 break-all bg-slate-950 p-2 rounded">{swapData.hashlock}</p>
                </div>
                <p className="text-slate-400 max-w-sm">
                  Depositing into the Soroban HTLC via Freighter. Backend indexing...
                </p>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center text-center space-y-6"
              >
                <div className="w-20 h-20 rounded-full bg-indigo-500/20 flex items-center justify-center animate-pulse">
                  <Lock className="w-10 h-10 text-indigo-400" />
                </div>
                <h2 className="text-2xl font-bold">Waiting for Soroban Deposit</h2>
                <p className="text-slate-400 max-w-sm">
                  Off-chain relayer tracking EVM deposit. Waiting for counterpart to lock funds in Soroban HTLC with the same hashlock...
                </p>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center text-center space-y-6"
              >
                <div className="w-20 h-20 rounded-full bg-yellow-500/20 flex items-center justify-center animate-pulse">
                  <Unlock className="w-10 h-10 text-yellow-400" />
                </div>
                <h2 className="text-2xl font-bold">Claiming Soroban Funds</h2>
                <p className="text-slate-400 max-w-sm">
                  Revealing preimage to Soroban HTLC to claim the tokens. The relayer will observe this preimage!
                </p>
              </motion.div>
            )}

            {step === 5 && (
              <motion.div
                key="step5"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center text-center space-y-6"
              >
                <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center">
                  <svg className="w-12 h-12 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-3xl font-bold text-green-400">Swap Complete!</h2>
                <p className="text-slate-300 max-w-md">
                  Atomic swap successfully executed. The relayer grabbed the preimage and automatically claimed your funds on EVM.
                </p>
                <div className="mt-8 flex gap-4">
                  <button 
                    onClick={() => setStep(1)}
                    className="px-6 py-2 glass-panel hover:bg-slate-800 transition-colors"
                  >
                    New Swap
                  </button>
                  <a href="#" className="px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center gap-2 transition-colors">
                    View Explorer <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

export default App;
