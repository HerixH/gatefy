#![no_std]
//! Gate Protocol — soulbound attendance proof (Soroban).
//! Minter (server) records one proof per (event_id, attendee). Non-transferable ledger entry.

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    NextId,
    /// (event_id, attendee) → token id
    Claimed(String, Address),
    /// token id → Proof
    Proof(u64),
}

#[contracttype]
#[derive(Clone)]
pub struct Proof {
    pub id: u64,
    pub event_id: String,
    pub attendee: Address,
    pub minted_at: u64,
}

#[contract]
pub struct AttendanceProof;

#[contractimpl]
impl AttendanceProof {
    /// One-time init. `admin` is the server minter key (G…).
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NextId, &0u64);
    }

    /// Mint an attendance proof for `attendee` at `event_id`. Admin-only. Idempotent: returns existing id.
    pub fn mint(env: Env, attendee: Address, event_id: String) -> u64 {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic!("not initialized"));
        admin.require_auth();

        if event_id.len() == 0 || event_id.len() > 64 {
            panic!("bad event_id");
        }

        let claim_key = DataKey::Claimed(event_id.clone(), attendee.clone());
        if let Some(existing) = env.storage().persistent().get::<_, u64>(&claim_key) {
            return existing;
        }

        let mut next: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(0);
        next += 1;
        env.storage().instance().set(&DataKey::NextId, &next);

        let proof = Proof {
            id: next,
            event_id: event_id.clone(),
            attendee: attendee.clone(),
            minted_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&claim_key, &next);
        env.storage().persistent().set(&DataKey::Proof(next), &proof);

        env.events().publish(
            (symbol_short!("minted"), event_id, attendee),
            next,
        );

        next
    }

    pub fn has_claimed(env: Env, attendee: Address, event_id: String) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Claimed(event_id, attendee))
    }

    pub fn get_proof(env: Env, token_id: u64) -> Option<Proof> {
        env.storage().persistent().get(&DataKey::Proof(token_id))
    }

    pub fn admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic!("not initialized"))
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn mint_once() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(AttendanceProof, ());
        let client = AttendanceProofClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let attendee = Address::generate(&env);
        client.initialize(&admin);
        let event = String::from_str(&env, "EVT1");
        let a = client.mint(&attendee, &event);
        let b = client.mint(&attendee, &event);
        assert_eq!(a, b);
        assert!(client.has_claimed(&attendee, &event));
    }
}
