use crate::schema::users;
use chrono::{DateTime, Utc};
use diesel::{Insertable, Queryable, Selectable};
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Queryable, Selectable, Serialize)]
#[diesel(table_name = users)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub password_hash: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Insertable)]
#[diesel(table_name = users)]
pub struct NewUser {
    pub id: Uuid,
    pub email: String,
    pub password_hash: String,
}

#[derive(Debug, Serialize)]
pub struct UserResponse {
    pub id: Uuid,
    pub email: String,
    pub created_at: DateTime<Utc>,
}

impl From<User> for UserResponse {
    fn from(u: User) -> Self {
        Self {
            id: u.id,
            email: u.email,
            created_at: u.created_at,
        }
    }
}
