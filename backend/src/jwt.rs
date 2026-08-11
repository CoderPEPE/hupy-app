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
