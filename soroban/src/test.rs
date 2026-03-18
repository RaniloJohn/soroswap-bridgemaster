#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{testutils::{Address as _, Ledger}, Address, BytesN, Env};

#[test]
fn test_htlc_deposit_and_claim() {
    let env = Env::default();
    let contract_id = env.register_contract(None, SoroswapHtlc);
    let client = SoroswapHtlcClient::new(&env, &contract_id);

    let depositor = Address::generate(&env);
    let expected_token = Address::generate(&env);
    let expected_receiver = Address::generate(&env);
    
    // Hash of exactly 32 zero bytes as preimage
    let preimage_data = [0u8; 32];
    let preimage = BytesN::from_array(&env, &preimage_data);
    let hash_lock = env.crypto().sha256(&preimage);

    let timeout = 1000;
    let expected_amount = 100;

    env.mock_all_auths();

    client.deposit(
        &depositor,
        &hash_lock,
        &timeout,
        &expected_token,
        &expected_amount,
        &expected_receiver,
    );

    let swap = client.get_swap(&hash_lock).unwrap();
    assert_eq!(swap.depositor, depositor);
    assert_eq!(swap.timeout, timeout);
    
    client.claim(&preimage);

    assert!(client.get_swap(&hash_lock).is_none());
}

#[test]
#[should_panic(expected = "timeout not reached")]
fn test_htlc_refund_before_timeout() {
    let env = Env::default();
    let contract_id = env.register_contract(None, SoroswapHtlc);
    let client = SoroswapHtlcClient::new(&env, &contract_id);

    let depositor = Address::generate(&env);
    let expected_token = Address::generate(&env);
    let expected_receiver = Address::generate(&env);
    
    let preimage = BytesN::from_array(&env, &[1u8; 32]);
    let hash_lock = env.crypto().sha256(&preimage);

    env.mock_all_auths();

    client.deposit(
        &depositor,
        &hash_lock,
        &1000,
        &expected_token,
        &100,
        &expected_receiver,
    );
    
    env.ledger().set_timestamp(500); // Before timeout
    client.refund(&hash_lock);
}

#[test]
fn test_htlc_refund_after_timeout() {
    let env = Env::default();
    let contract_id = env.register_contract(None, SoroswapHtlc);
    let client = SoroswapHtlcClient::new(&env, &contract_id);

    let depositor = Address::generate(&env);
    let expected_token = Address::generate(&env);
    let expected_receiver = Address::generate(&env);
    
    let preimage = BytesN::from_array(&env, &[1u8; 32]);
    let hash_lock = env.crypto().sha256(&preimage);

    env.mock_all_auths();

    client.deposit(
        &depositor,
        &hash_lock,
        &1000,
        &expected_token,
        &100,
        &expected_receiver,
    );
    
    env.ledger().set_timestamp(1500); // After timeout
    client.refund(&hash_lock);
    
    assert!(client.get_swap(&hash_lock).is_none());
}
