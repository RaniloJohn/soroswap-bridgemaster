#![cfg(test)]
extern crate std;

use crate::{SoroswapHtlc, SoroswapHtlcClient, SwapStatus};
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    token, Address, BytesN, Env,
};

/// Helper: create a test environment with a token contract and funded accounts.
fn setup_test() -> (Env, SoroswapHtlcClient<'static>, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, SoroswapHtlc);
    let client = SoroswapHtlcClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let sender = Address::generate(&env);
    let receiver = Address::generate(&env);

    // Deploy a test token using the admin-controlled SAC
    let token_addr = env.register_stellar_asset_contract(admin.clone());
    let token_admin_client = token::StellarAssetClient::new(&env, &token_addr);

    // Mint 10,000 tokens to sender
    token_admin_client.mint(&sender, &10_000_i128);

    // SAFETY: We leak the Env to get 'static lifetime for the client.
    // This is safe in tests because the Env lives for the duration of each test.
    let leaked_env: &'static Env = unsafe { &*(&env as *const Env) };
    let static_client = SoroswapHtlcClient::new(leaked_env, &contract_id);

    (env, static_client, token_addr, sender, receiver)
}

fn make_preimage(env: &Env) -> BytesN<32> {
    BytesN::from_array(
        env,
        &[
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
            24, 25, 26, 27, 28, 29, 30, 31, 32,
        ],
    )
}

fn hash_preimage(env: &Env, preimage: &BytesN<32>) -> BytesN<32> {
    let hash = env.crypto().sha256(&preimage.clone().into());
    BytesN::from_array(env, &hash.to_array())
}

fn make_ledger_info(seq: u32) -> LedgerInfo {
    LedgerInfo {
        timestamp: 0,
        protocol_version: 22,
        sequence_number: seq,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 10_000,
        min_persistent_entry_ttl: 10_000,
        max_entry_ttl: 100_000,
    }
}

#[test]
fn test_deposit_and_claim() {
    let (env, client, token_addr, sender, receiver) = setup_test();

    let preimage = make_preimage(&env);
    let hash_lock = hash_preimage(&env, &preimage);

    env.ledger().set(make_ledger_info(100));

    // Deposit 1,000 tokens
    client.deposit(
        &sender,
        &receiver,
        &token_addr,
        &1_000_i128,
        &hash_lock,
        &200_u32,
    );

    // Verify swap exists and is active
    let swap = client.get_swap(&hash_lock).unwrap();
    assert_eq!(swap.amount, 1_000);
    assert_eq!(swap.status, SwapStatus::Active);

    // Claim with correct preimage
    client.claim(&preimage);

    let swap_after = client.get_swap(&hash_lock).unwrap();
    assert_eq!(swap_after.status, SwapStatus::Claimed);
}

#[test]
fn test_refund_after_timeout() {
    let (env, client, token_addr, sender, receiver) = setup_test();

    let preimage = make_preimage(&env);
    let hash_lock = hash_preimage(&env, &preimage);

    env.ledger().set(make_ledger_info(100));

    client.deposit(
        &sender,
        &receiver,
        &token_addr,
        &500_i128,
        &hash_lock,
        &150_u32,
    );

    // Advance past the time_lock
    env.ledger().set(make_ledger_info(200));

    client.refund(&hash_lock);

    let swap_after = client.get_swap(&hash_lock).unwrap();
    assert_eq!(swap_after.status, SwapStatus::Refunded);
}

#[test]
#[should_panic(expected = "swap already exists")]
fn test_duplicate_deposit_rejected() {
    let (env, client, token_addr, sender, receiver) = setup_test();

    let preimage = make_preimage(&env);
    let hash_lock = hash_preimage(&env, &preimage);

    env.ledger().set(make_ledger_info(100));

    client.deposit(&sender, &receiver, &token_addr, &100_i128, &hash_lock, &200_u32);
    // Second deposit with same hash_lock should panic
    client.deposit(&sender, &receiver, &token_addr, &100_i128, &hash_lock, &200_u32);
}

#[test]
#[should_panic(expected = "time_lock has not expired")]
fn test_early_refund_rejected() {
    let (env, client, token_addr, sender, receiver) = setup_test();

    let preimage = make_preimage(&env);
    let hash_lock = hash_preimage(&env, &preimage);

    env.ledger().set(make_ledger_info(100));

    client.deposit(&sender, &receiver, &token_addr, &100_i128, &hash_lock, &200_u32);
    // Trying to refund before time_lock should panic
    client.refund(&hash_lock);
}
