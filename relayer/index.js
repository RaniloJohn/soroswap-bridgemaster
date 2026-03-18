require("dotenv").config();
const app = require('./src/app');
const SorobanIndexer = require('./src/services/indexer');

const SOROBAN_RPC_URL = process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const SOROBAN_HTLC_ADDRESS = process.env.SOROBAN_HTLC_ADDRESS;

async function main() {
    console.log("Starting SoroSwap Bridge Relayer API...");
    
    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => {
      console.log(`🚀 API listening on port ${PORT}`);
    });

    if (!SOROBAN_HTLC_ADDRESS) {
        console.warn("⚠️ Missing SOROBAN_HTLC_ADDRESS in ENV. Indexer running in simulation mode without real contract.");
    }

    const indexer = new SorobanIndexer(SOROBAN_RPC_URL, SOROBAN_HTLC_ADDRESS || 'SIMULATION_ADDRESS');
    await indexer.start();
}

main().catch(console.error);
