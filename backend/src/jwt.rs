use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const TOKEN_TTL_SECS: i64 = 30 * 24 * 3600; // 30 days

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: Uuid,
    pub exp: usize,
}

pub fn create_token(secret: &str, user_id: Uuid) -> Result<String, jsonwebtoken::errors::Error> {
    let exp = chrono::Utc::now().timestamp() + TOKEN_TTL_SECS;
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
        let token = create_token(SECRET, id).unwrap();
        let decoded = decode_token(SECRET, &token).unwrap();
        assert_eq!(decoded.sub, id);
        assert!(decoded.exp > chrono::Utc::now().timestamp() as usize);
    }

    #[test]
    fn rejects_a_tampered_signature() {
        let token = create_token(SECRET, Uuid::new_v4()).unwrap();
        let mut bytes = token.into_bytes();
        let last = bytes.last_mut().unwrap();
        *last = if *last == b'A' { b'B' } else { b'A' };
        assert!(decode_token(SECRET, &String::from_utf8(bytes).unwrap()).is_err());
    }

    #[test]
    fn rejects_a_token_signed_with_a_different_secret() {
        let token = create_token(SECRET, Uuid::new_v4()).unwrap();
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

