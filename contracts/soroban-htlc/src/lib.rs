#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, BytesN, Env,
};

/// Keys for persistent storage of each HTLC swap.
#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    /// A single swap identified by its hash_lock (SHA-256 of the preimage).
    Swap(BytesN<32>),
}

/// Status of a swap.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[contracttype]
pub enum SwapStatus {
    /// Funds locked, awaiting claim.
    Active = 0,
    /// Successfully claimed with correct preimage.
    Claimed = 1,
    /// Refunded after timeout.
    Refunded = 2,
}

/// A single HTLC swap record.
#[derive(Clone)]
#[contracttype]
pub struct Swap {
    /// The party that locked the funds.
    pub sender: Address,
    /// The party that can claim with the preimage.
    pub receiver: Address,
    /// Token contract address.
    pub token: Address,
    /// Amount locked.
    pub amount: i128,
    /// SHA-256 hash of the secret preimage.
    pub hash_lock: BytesN<32>,
    /// Ledger sequence number after which the sender can refund.
    pub time_lock: u32,
    /// Current status of the swap.
    pub status: SwapStatus,
}

#[contract]
pub struct SoroswapHtlc;

#[contractimpl]
impl SoroswapHtlc {
    /// Lock tokens into an HTLC.
    ///
    /// * `sender` - Address locking the tokens (must authorize).
    /// * `receiver` - Address permitted to claim with the preimage.
    /// * `token` - Token contract address.
    /// * `amount` - Amount to lock (must be > 0).
    /// * `hash_lock` - SHA-256 of the secret preimage.
    /// * `time_lock` - Ledger sequence number for the refund deadline.
    pub fn deposit(
        env: Env,
        sender: Address,
        receiver: Address,
        token: Address,
        amount: i128,
        hash_lock: BytesN<32>,
        time_lock: u32,
    ) {
        // --- Validation ---
        sender.require_auth();

        if amount <= 0 {
            panic!("amount must be positive");
        }

        let current_ledger = env.ledger().sequence();
        if time_lock <= current_ledger {
            panic!("time_lock must be in the future");
        }

        // Prevent duplicate locks with the same hash_lock
        let key = DataKey::Swap(hash_lock.clone());
        if env.storage().persistent().has(&key) {
            panic!("swap already exists for this hash_lock");
        }

        // --- Transfer tokens to this contract ---
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&sender, &env.current_contract_address(), &amount);

        // --- Store the swap ---
        let swap = Swap {
            sender,
            receiver,
            token,
            amount,
            hash_lock: hash_lock.clone(),
            time_lock,
            status: SwapStatus::Active,
        };
        env.storage().persistent().set(&key, &swap);
    }

    /// Claim locked tokens by revealing the preimage.
    ///
    /// * `preimage` - The secret whose SHA-256 matches `hash_lock`.
    pub fn claim(env: Env, preimage: BytesN<32>) {
        // Hash the preimage to derive the lock
        let hash_lock = env.crypto().sha256(&preimage.into());
        let hash_lock_bytes: BytesN<32> = BytesN::from_array(&env, &hash_lock.to_array());

        let key = DataKey::Swap(hash_lock_bytes.clone());
        let mut swap: Swap = env
            .storage()
            .persistent()
            .get(&key)
            .expect("swap not found");

        if swap.status != SwapStatus::Active {
            panic!("swap is not active");
        }

        // Only the designated receiver can claim
        swap.receiver.require_auth();

        // --- Transfer tokens to receiver ---
        let token_client = token::Client::new(&env, &swap.token);
        token_client.transfer(
            &env.current_contract_address(),
            &swap.receiver,
            &swap.amount,
        );

        // --- Mark as claimed ---
        swap.status = SwapStatus::Claimed;
        env.storage().persistent().set(&key, &swap);
    }

    /// Refund locked tokens to the sender after the time_lock has expired.
    ///
    /// * `hash_lock` - The hash_lock identifying the swap.
    pub fn refund(env: Env, hash_lock: BytesN<32>) {
        let key = DataKey::Swap(hash_lock.clone());
        let mut swap: Swap = env
            .storage()
            .persistent()
            .get(&key)
            .expect("swap not found");

        if swap.status != SwapStatus::Active {
            panic!("swap is not active");
        }

        let current_ledger = env.ledger().sequence();
        if current_ledger <= swap.time_lock {
            panic!("time_lock has not expired");
        }

        // Only the original sender can refund
        swap.sender.require_auth();

        // --- Transfer tokens back to sender ---
        let token_client = token::Client::new(&env, &swap.token);
        token_client.transfer(
            &env.current_contract_address(),
            &swap.sender,
            &swap.amount,
        );

        // --- Mark as refunded ---
        swap.status = SwapStatus::Refunded;
        env.storage().persistent().set(&key, &swap);
    }

    /// Query a swap by its hash_lock. Returns None if not found.
    pub fn get_swap(env: Env, hash_lock: BytesN<32>) -> Option<Swap> {
        let key = DataKey::Swap(hash_lock);
        env.storage().persistent().get(&key)
    }
}

#[cfg(test)]
mod test;
