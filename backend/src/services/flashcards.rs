//! Spaced-repetition scheduling (SM-2 style).

/// The result of applying a review rating to a card's scheduling state.
#[derive(Debug, Clone, Copy)]
pub struct Schedule {
    pub interval_days: i32,
    pub ease: f64,
    pub repetitions: i32,
}

/// Computes the next `Schedule` for a review rating.
///
/// First-review intervals match the app's constants (hard=1, medium=3,
/// easy=7). Later reviews: easy/medium grow the interval with an SM-2-style
/// ease factor, while "hard" items are brought back sooner (difficult content
/// must appear more frequently). Unknown ratings return the inputs unchanged.
pub fn schedule(rating: &str, interval_days: i32, ease: f64, repetitions: i32) -> Schedule {
    let (interval, new_ease) = match rating {
        "hard" => (
            if interval_days == 0 {
                1
            } else {
                (((interval_days as f64) * 0.5).round() as i32).max(1)
            },
            ease - 0.15,
        ),
        "medium" => (
            if interval_days == 0 {
                3
            } else {
                ((interval_days as f64) * ease).round() as i32
            },
            ease,
        ),
        "easy" => (
            if interval_days == 0 {
                7
            } else {
                ((interval_days as f64) * ease * 1.3).round() as i32
            },
            ease + 0.15,
        ),
        _ => {
            return Schedule {
                interval_days,
                ease,
                repetitions,
            }
        }
    };
    Schedule {
        interval_days: interval.clamp(1, 90),
        ease: new_ease.clamp(1.3, 3.0),
        repetitions: repetitions + 1,
    }
}

#[cfg(test)]
mod tests {
    use super::schedule;

    #[test]
    fn first_review_intervals_match_app_constants() {
        assert_eq!(schedule("hard", 0, 2.5, 0).interval_days, 1);
        assert_eq!(schedule("medium", 0, 2.5, 0).interval_days, 3);
        assert_eq!(schedule("easy", 0, 2.5, 0).interval_days, 7);
    }

    #[test]
    fn easy_grows_interval_and_ease() {
        let s = schedule("easy", 7, 2.5, 1);
        assert_eq!(s.interval_days, 23); // 7 * 2.5 * 1.3 = 22.75 -> 23
        assert!((s.ease - 2.65).abs() < 1e-9);
        assert_eq!(s.repetitions, 2);
    }

    #[test]
    fn hard_shrinks_interval() {
        let s = schedule("hard", 7, 2.5, 2);
        assert_eq!(s.interval_days, 4); // 7 * 0.5 = 3.5 -> 4
        assert!((s.ease - 2.35).abs() < 1e-9);
    }

    #[test]
    fn intervals_and_ease_are_clamped() {
        assert!(schedule("easy", 200, 2.5, 3).interval_days <= 90);
        assert!(schedule("hard", 1, 1.0, 5).ease >= 1.3);
        assert!(schedule("easy", 1, 3.0, 5).ease <= 3.0);
    }
}
