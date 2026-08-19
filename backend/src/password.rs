use argon2::password_hash::{
    rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString,
};
use argon2::Argon2;

pub fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    PasswordHash::new(hash)
        .map(|parsed| {
            Argon2::default()
                .verify_password(password.as_bytes(), &parsed)
                .is_ok()
        })
        .unwrap_or(false)
}

/// `hash_password` off the async runtime.
///
/// Argon2 is deliberately slow and memory-hard — roughly 19 MB and tens of
/// milliseconds per call. Running that inline on a tokio worker parks the
/// whole thread, so a burst of registrations or logins stalls every other
/// request the runtime is serving, database work included.
pub async fn hash_password_async(password: &str) -> Result<String, argon2::password_hash::Error> {
    let password = password.to_string();
    tokio::task::spawn_blocking(move || hash_password(&password))
        .await
        .unwrap_or(Err(argon2::password_hash::Error::Crypto))
}

/// `verify_password` off the async runtime. Same reasoning as
/// `hash_password_async`, and this one is on the login hot path.
pub async fn verify_password_async(password: &str, hash: &str) -> bool {
    let (password, hash) = (password.to_string(), hash.to_string());
    tokio::task::spawn_blocking(move || verify_password(&password, &hash))
        .await
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_and_verify_roundtrip() {
        let hash = hash_password("correct horse battery staple").unwrap();
        assert!(hash.starts_with("$argon2"));
        assert!(verify_password("correct horse battery staple", &hash));
    }

    #[test]
    fn wrong_password_is_rejected() {
        let hash = hash_password("right-password").unwrap();
        assert!(!verify_password("wrong-password", &hash));
        assert!(!verify_password("", &hash));
    }

    #[test]
    fn malformed_hash_returns_false_instead_of_panicking() {
        assert!(!verify_password("anything", ""));
        assert!(!verify_password("anything", "not-a-phc-string"));
        assert!(!verify_password("anything", "$argon2id$v=19$broken"));
    }

    #[test]
    fn each_hash_uses_a_fresh_salt() {
        let a = hash_password("same password").unwrap();
        let b = hash_password("same password").unwrap();
        assert_ne!(a, b, "identical hashes would mean a fixed salt");
        assert!(verify_password("same password", &a));
        assert!(verify_password("same password", &b));
    }
}
