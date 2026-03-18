#![no_std]

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env, Symbol};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Swap(BytesN<32>),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SwapState {
    pub depositor: Address,
    pub expected_token: Address,
    pub expected_amount: i128,
    pub expected_receiver: Address,     // the party that gets the funds if preimage is revealed
    pub timeout: u64,
    pub amount: i128,
}

#[contract]
pub struct SoroswapHtlc;

#[contractimpl]
impl SoroswapHtlc {
    // Note: Instead of actually transferring real SC tokens in this basic version,
    // we use a simple HTLC logic that tracks state for demonstration.
    // In a production HTLC, this would call `token::Client::new().transfer()`.
    
    pub fn deposit(
        env: Env,
        depositor: Address,
        hash_lock: BytesN<32>,
        timeout: u64,
        expected_token: Address,
        expected_amount: i128,
        expected_receiver: Address,
    ) {
        depositor.require_auth();

        let key = DataKey::Swap(hash_lock.clone());
        if env.storage().persistent().has(&key) {
            panic!("hash_lock already exists");
        }

        let swap = SwapState {
            depositor: depositor.clone(),
            expected_token,
            expected_amount,
            expected_receiver,
            timeout,
            amount: expected_amount, // for simplicity, assuming 1:1 local lock
        };

        env.storage().persistent().set(&key, &swap);
        
        env.events().publish(
            (symbol_short!("deposit"), hash_lock),
            depositor
        );
    }

    pub fn claim(env: Env, preimage: BytesN<32>) {
        let hash_lock = env.crypto().sha256(&preimage);
        let key = DataKey::Swap(hash_lock.clone());
        
        let swap: SwapState = env.storage().persistent().get(&key).unwrap();

        // Release happens here (in a real contract, transfer to expected_receiver)
        env.storage().persistent().remove(&key);

        env.events().publish(
            (symbol_short!("claim"), hash_lock),
            preimage
        );
    }

    pub fn refund(env: Env, hash_lock: BytesN<32>) {
        let key = DataKey::Swap(hash_lock.clone());
        let swap: SwapState = env.storage().persistent().get(&key).unwrap();

        if env.ledger().timestamp() < swap.timeout {
            panic!("timeout not reached");
        }

        // Refund happens here (transfer back to depositor)
        env.storage().persistent().remove(&key);

        env.events().publish(
            (symbol_short!("refund"), hash_lock),
            swap.depositor
        );
    }
    
    // Test helper to verify swap state
    pub fn get_swap(env: Env, hash_lock: BytesN<32>) -> Option<SwapState> {
        let key = DataKey::Swap(hash_lock);
        env.storage().persistent().get(&key)
    }
}
