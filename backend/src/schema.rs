// @generated automatically by Diesel CLI.

diesel::table! {
    badges (id) {
        id -> Uuid,
        #[max_length = 64]
        code -> Varchar,
        #[max_length = 255]
        title -> Varchar,
        #[max_length = 512]
        description -> Varchar,
        #[max_length = 32]
        icon -> Varchar,
    }
}

diesel::table! {
    card_reviews (id) {
        id -> Uuid,
        flashcard_id -> Uuid,
        #[max_length = 16]
        rating -> Varchar,
        reviewed_at -> Timestamptz,
    }
}

diesel::table! {
    conversations (id) {
        id -> Uuid,
        user_id -> Uuid,
        planet_id -> Nullable<Uuid>,
        #[max_length = 255]
        title -> Varchar,
        created_at -> Timestamptz,
        updated_at -> Timestamptz,
    }
}

diesel::table! {
    corrections (id) {
        id -> Uuid,
        user_id -> Uuid,
        conversation_id -> Nullable<Uuid>,
        said -> Text,
        corrected -> Text,
        explanation -> Text,
        #[max_length = 512]
        pt -> Varchar,
        #[max_length = 255]
        mistake_part -> Varchar,
        #[max_length = 128]
        subject -> Varchar,
        #[max_length = 128]
        verb -> Varchar,
        #[max_length = 512]
        complement -> Varchar,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    flashcards (id) {
        id -> Uuid,
        user_id -> Uuid,
        planet_id -> Nullable<Uuid>,
        correction_id -> Nullable<Uuid>,
        #[max_length = 512]
        en -> Varchar,
        #[max_length = 512]
        pt -> Varchar,
        explanation -> Text,
        #[max_length = 128]
        subject -> Varchar,
        #[max_length = 128]
        verb -> Varchar,
        #[max_length = 512]
        complement -> Varchar,
        #[max_length = 32]
        source -> Varchar,
        interval_days -> Int4,
        ease -> Float8,
        repetitions -> Int4,
        next_review_at -> Timestamptz,
        created_at -> Timestamptz,
        verified_live -> Bool,
    }
}

diesel::table! {
    lesson_steps (id) {
        id -> Uuid,
        planet_id -> Uuid,
        position -> Int4,
        kind -> Text,
        tutor_text -> Text,
        expected_text -> Nullable<Text>,
        mastery_gain -> Nullable<Float8>,
        correction_said -> Nullable<Text>,
        correction_corrected -> Nullable<Text>,
        correction_explanation -> Nullable<Text>,
        correction_pt -> Nullable<Text>,
        correction_mistake_part -> Nullable<Text>,
        correction_subject -> Nullable<Text>,
        correction_verb -> Nullable<Text>,
        correction_complement -> Nullable<Text>,
    }
}

diesel::table! {
    messages (id) {
        id -> Uuid,
        conversation_id -> Uuid,
        #[max_length = 16]
        role -> Varchar,
        #[max_length = 32]
        kind -> Varchar,
        text -> Text,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    planet_lessons (id) {
        id -> Uuid,
        planet_id -> Uuid,
        position -> Int4,
        kind -> Text,
        title -> Text,
        description -> Text,
    }
}

diesel::table! {
    planet_sentences (id) {
        id -> Uuid,
        planet_id -> Uuid,
        position -> Int4,
        #[max_length = 512]
        en -> Varchar,
        #[max_length = 512]
        pt -> Varchar,
        #[max_length = 128]
        subject -> Varchar,
        #[max_length = 128]
        verb -> Varchar,
        #[max_length = 512]
        complement -> Varchar,
    }
}

diesel::table! {
    planets (id) {
        id -> Uuid,
        number -> Int4,
        #[max_length = 255]
        title -> Varchar,
        #[max_length = 255]
        subtitle -> Varchar,
        #[max_length = 16]
        color -> Varchar,
        topics -> Jsonb,
        unlock_mastery -> Float8,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    tts_audio (cache_key) {
        #[max_length = 64]
        cache_key -> Varchar,
        text -> Text,
        #[max_length = 64]
        voice -> Varchar,
        #[max_length = 64]
        model -> Varchar,
        speed -> Float8,
        audio -> Bytea,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    user_badges (user_id, badge_id) {
        user_id -> Uuid,
        badge_id -> Uuid,
        earned_at -> Timestamptz,
    }
}

diesel::table! {
    user_planet_progress (user_id, planet_id) {
        user_id -> Uuid,
        planet_id -> Uuid,
        sentences -> Float8,
        pronunciation -> Float8,
        conversation -> Float8,
        listening -> Float8,
        flashcards -> Float8,
        review -> Float8,
        mastery -> Float8,
    }
}

diesel::table! {
    user_sentence_progress (user_id, sentence_id) {
        user_id -> Uuid,
        sentence_id -> Uuid,
        mastered -> Bool,
    }
}

diesel::table! {
    user_stats (user_id) {
        user_id -> Uuid,
        xp -> Int4,
        streak_days -> Int4,
        longest_streak -> Int4,
        last_active_date -> Nullable<Date>,
        updated_at -> Timestamptz,
    }
}

diesel::table! {
    users (id) {
        id -> Uuid,
        #[max_length = 255]
        email -> Varchar,
        #[max_length = 255]
        password_hash -> Varchar,
        created_at -> Timestamptz,
    }
}

diesel::joinable!(card_reviews -> flashcards (flashcard_id));
diesel::joinable!(conversations -> planets (planet_id));
diesel::joinable!(conversations -> users (user_id));
diesel::joinable!(corrections -> conversations (conversation_id));
diesel::joinable!(corrections -> users (user_id));
diesel::joinable!(flashcards -> corrections (correction_id));
diesel::joinable!(flashcards -> planets (planet_id));
diesel::joinable!(flashcards -> users (user_id));
diesel::joinable!(lesson_steps -> planets (planet_id));
diesel::joinable!(messages -> conversations (conversation_id));
diesel::joinable!(planet_lessons -> planets (planet_id));
diesel::joinable!(planet_sentences -> planets (planet_id));
diesel::joinable!(user_badges -> badges (badge_id));
diesel::joinable!(user_badges -> users (user_id));
diesel::joinable!(user_planet_progress -> planets (planet_id));
diesel::joinable!(user_planet_progress -> users (user_id));
diesel::joinable!(user_sentence_progress -> planet_sentences (sentence_id));
diesel::joinable!(user_sentence_progress -> users (user_id));
diesel::joinable!(user_stats -> users (user_id));

diesel::allow_tables_to_appear_in_same_query!(
    badges,
    card_reviews,
    conversations,
    corrections,
    flashcards,
    lesson_steps,
    messages,
    planet_lessons,
    planet_sentences,
    planets,
    tts_audio,
    user_badges,
    user_planet_progress,
    user_sentence_progress,
    user_stats,
    users,
);
