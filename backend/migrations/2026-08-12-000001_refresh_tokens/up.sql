-- Refresh-token rotation: access tokens are now short-lived (15 min by
-- default) and each is backed by an opaque, rotating refresh token. Only a
-- SHA-256 hash of the refresh token is stored, so a database leak cannot be
-- replayed. Tokens in the same `family_id` share a lineage: presenting a
-- revoked token (theft signature) revokes the whole family.
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    family_id UUID NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens (family_id);
