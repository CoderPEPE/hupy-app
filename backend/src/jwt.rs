use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: Uuid,
    pub exp: usize,
}

/// Mints an access JWT valid for `ttl_secs` from now. The TTL is
/// configurable so production can run short-lived access tokens (refreshed
/// transparently by the client) without changing code.
pub fn create_token(
    secret: &str,
    user_id: Uuid,
    ttl_secs: i64,
) -> Result<String, jsonwebtoken::errors::Error> {
    let exp = chrono::Utc::now().timestamp() + ttl_secs;
    let claims = Claims {
        sub: user_id,
        exp: exp as usize,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
}

pub fn decode_token(secret: &str, token: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map(|data| data.claims)
}

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{Algorithm, EncodingKey, Header};

    const SECRET: &str = "unit-test-secret-that-is-long-enough-0123456789";

    fn claims(exp_offset_secs: i64) -> Claims {
        Claims {
            sub: Uuid::new_v4(),
            exp: (chrono::Utc::now().timestamp() + exp_offset_secs) as usize,
        }
    }

    #[test]
    fn roundtrips_a_token() {
        let id = Uuid::new_v4();
        let token = create_token(SECRET, id, 3600).unwrap();
        let decoded = decode_token(SECRET, &token).unwrap();
        assert_eq!(decoded.sub, id);
        assert!(decoded.exp > chrono::Utc::now().timestamp() as usize);
    }

    #[test]
    fn honors_the_requested_ttl() {
        let id = Uuid::new_v4();
        let token = create_token(SECRET, id, 60).unwrap();
        let decoded = decode_token(SECRET, &token).unwrap();
        let remaining = decoded.exp as i64 - chrono::Utc::now().timestamp();
        assert!(
            remaining <= 60,
            "expires at most {remaining}s in the future"
        );
    }

    #[test]
    fn rejects_a_tampered_signature() {
        let token = create_token(SECRET, Uuid::new_v4(), 3600).unwrap();
        let mut bytes = token.into_bytes();
        let last = bytes.last_mut().unwrap();
        *last = if *last == b'A' { b'B' } else { b'A' };
        assert!(decode_token(SECRET, &String::from_utf8(bytes).unwrap()).is_err());
    }

    #[test]
    fn rejects_a_token_signed_with_a_different_secret() {
        let token = create_token(SECRET, Uuid::new_v4(), 3600).unwrap();
        assert!(decode_token("a-completely-different-secret-value!", &token).is_err());
    }

    #[test]
    fn rejects_garbage_input() {
        assert!(decode_token(SECRET, "").is_err());
        assert!(decode_token(SECRET, "not-a-jwt").is_err());
        assert!(decode_token(SECRET, "a.b.c").is_err());
    }

    #[test]
    fn rejects_an_expired_token() {
        let token = jsonwebtoken::encode(
            &Header::default(),
            &claims(-120),
            &EncodingKey::from_secret(SECRET.as_bytes()),
        )
        .unwrap();
        assert!(decode_token(SECRET, &token).is_err());
    }

    #[test]
    fn only_accepts_hs256_signatures() {
        // A token signed with HS512 must be rejected by the HS256-only
        // Validation — otherwise an attacker could swap the algorithm header.
        let token = jsonwebtoken::encode(
            &Header::new(Algorithm::HS512),
            &claims(3600),
            &EncodingKey::from_secret(SECRET.as_bytes()),
        )
        .unwrap();
        assert!(decode_token(SECRET, &token).is_err());
    }
}
