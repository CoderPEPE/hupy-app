//! Writes the audio story for every planet into the database, once.
//!
//! Stories used to be generated per learner, on demand, behind a "Generate"
//! button. The curriculum is identical for everyone on a course, so the story
//! is written here instead — ahead of time, for all 60 planets of all six
//! courses — and the app just plays it.
//!
//! Each story is written by the chat model from the chunks the planet's ten
//! modules actually taught, plus a sample of earlier-planet phrases for
//! cumulative review — so the learner recognises their own lessons inside it
//! rather than meeting new material. If the model call fails, the
//! deterministic template writer stands in, so no planet is left without one.
//!
//! Usage:
//!
//! ```text
//! cargo run --bin seed_stories                    # every planet missing a story
//! cargo run --bin seed_stories -- --course pt-en  # one course (base-target)
//! cargo run --bin seed_stories -- --limit 5       # a taste, to check the output
//! cargo run --bin seed_stories -- --force         # rewrite stories that exist
//! cargo run --bin seed_stories -- --concurrency 8
//! ```
//!
//! Re-runnable: planets that already have a story are skipped unless
//! `--force`, so an interrupted run continues where it stopped.

use huppy_backend::models::Planet;
use huppy_backend::{config, db, repositories, services};
use std::collections::HashSet;
use std::sync::Arc;

struct Args {
    course: Option<String>,
    planet: Option<i32>,
    limit: Option<usize>,
    force: bool,
    concurrency: usize,
}

/// "pt-en" -> ("pt", "en"): the base language the course explains in, and the
/// language it teaches.
fn split_course(course: &str) -> Result<(String, String), String> {
    course
        .split_once('-')
        .map(|(base, target)| (base.to_string(), target.to_string()))
        .ok_or_else(|| format!("--course wants base-target, like pt-en (got {course})"))
}

fn parse_args(argv: &[String]) -> Result<Args, String> {
    let mut args = Args {
        course: None,
        planet: None,
        limit: None,
        force: false,
        concurrency: 4,
    };
    let value = |i: usize| {
        argv.get(i + 1)
            .cloned()
            .ok_or_else(|| format!("{} needs a value", argv[i]))
    };
    let number = |i: usize| {
        value(i)?
            .parse::<usize>()
            .map_err(|e| format!("{}: {e}", argv[i]))
    };

    let mut i = 0;
    while i < argv.len() {
        match argv[i].as_str() {
            "--force" => {
                args.force = true;
                i += 1;
            }
            "--course" => {
                // Validated here rather than at filter time, so a typo is an
                // error instead of a run that quietly seeds nothing.
                split_course(&value(i)?)?;
                args.course = Some(value(i)?);
                i += 2;
            }
            "--planet" => {
                args.planet = Some(
                    value(i)?
                        .parse::<i32>()
                        .map_err(|e| format!("--planet: {e}"))?,
                );
                i += 2;
            }
            "--limit" => {
                args.limit = Some(number(i)?);
                i += 2;
            }
            "--concurrency" => {
                args.concurrency = number(i)?.max(1);
                i += 2;
            }
            other => return Err(format!("unknown argument {other}")),
        }
    }
    Ok(args)
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "seed_stories=info,huppy_backend=warn".into()),
        )
        .init();

    let argv: Vec<String> = std::env::args().skip(1).collect();
    let args = match parse_args(&argv) {
        Ok(a) => a,
        Err(e) => {
            eprintln!("{e}\n\nusage: seed_stories [--course pt-en] [--planet N] [--limit N] [--concurrency N] [--force]");
            std::process::exit(2);
        }
    };

    let config = config::Config::from_env().unwrap_or_else(|e| panic!("{e}"));
    let model = config.story_model.clone();
    let api_key = config.openai_api_key.clone();
    if api_key.is_empty() {
        // The template writer still produces a playable story, but this is
        // almost never what someone running the seeder wants.
        eprintln!("warning: OPENAI_API_KEY is not set — writing template stories only");
    }
    let pool = db::establish_pool(&config.database_url, args.concurrency as u32 + 2);
    let http = reqwest::Client::new();

    let planets = repositories::planets::all_ordered(&pool)
        .await
        .expect("failed to list planets");
    let seeded: HashSet<_> = repositories::story_seeds::seeded_planet_ids(&pool)
        .await
        .expect("failed to list existing stories")
        .into_iter()
        .collect();

    let course = args.course.as_deref().map(|c| split_course(c).expect("validated"));
    let mut todo: Vec<Planet> = planets
        .into_iter()
        .filter(|p| args.force || !seeded.contains(&p.id))
        .filter(|p| match &course {
            Some((base, target)) => &p.base_language == base && &p.language == target,
            None => true,
        })
        // One planet across every course — how a single planet's content gets
        // rewritten without touching the other 59.
        .filter(|p| args.planet.is_none_or(|n| p.number == n))
        .collect();
    if let Some(limit) = args.limit {
        todo.truncate(limit);
    }

    let total = todo.len();
    println!("{total} stories to write ({model}, {} at a time)", args.concurrency);
    if total == 0 {
        return;
    }

    let done = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let semaphore = Arc::new(tokio::sync::Semaphore::new(args.concurrency));
    let mut tasks = Vec::with_capacity(total);

    for planet in todo {
        let (pool, http, model, api_key) = (pool.clone(), http.clone(), model.clone(), api_key.clone());
        let (done, semaphore) = (done.clone(), semaphore.clone());
        tasks.push(tokio::spawn(async move {
            let _permit = semaphore.acquire().await.expect("semaphore closed");
            let label = format!(
                "{}-{} planet {:>2} ({})",
                planet.base_language, planet.language, planet.number, planet.title
            );
            match write_story(&pool, &http, &api_key, &model, &planet).await {
                Ok((words, secs, source)) => {
                    let n = done.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
                    println!(
                        "[{n}/{total}] {label} — {words} words, {}m{:02}s ({source})",
                        secs / 60,
                        secs % 60
                    );
                }
                Err(e) => {
                    let n = done.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
                    eprintln!("[{n}/{total}] {label} — FAILED: {e}");
                }
            }
        }));
    }

    for task in tasks {
        let _ = task.await;
    }
    println!("done");
}

/// Writes one planet's story and stores it. Returns (words, seconds, source).
async fn write_story(
    pool: &db::DbPool,
    http: &reqwest::Client,
    api_key: &str,
    model: &str,
    planet: &Planet,
) -> Result<(usize, i64, String), String> {
    // The story is built from what the learner actually worked through: the
    // ten modules' chunks, in curriculum order.
    let modules = repositories::modules::lessons_for(pool, planet.id)
        .await
        .map_err(|e| format!("{e:?}"))?;
    let studied: Vec<(String, Vec<(String, String)>)> = modules
        .iter()
        .map(|m| {
            (
                format!("Module {} — {}", m.position, m.title),
                services::curriculum::structures(&m.structures)
                    .into_iter()
                    .map(|s| (s.target, s.base))
                    .collect::<Vec<_>>(),
            )
        })
        .filter(|(_, chunks)| !chunks.is_empty())
        .collect();
    if studied.is_empty() {
        return Err("planet has no authored modules to build a story from".into());
    }
    let flat: Vec<(String, String)> = studied
        .iter()
        .flat_map(|(_, chunks)| chunks.iter().cloned())
        .collect();
    let review = repositories::planets::course_review_sample(
        pool,
        planet.number,
        services::stories::REVIEW_SENTENCES,
        &planet.base_language,
        &planet.language,
    )
    .await
    .map_err(|e| format!("{e:?}"))?;

    let (target_name, base_name) =
        services::realtime::language_names(&planet.base_language, &planet.language);
    // Seeded stories belong to the course, not to a person: no learner name,
    // so the narrator introduces themselves without one.
    let prompt =
        services::stories::story_prompt(planet, &studied, &review, "", target_name, base_name);

    let (story, source) = if api_key.is_empty() {
        // No key at all is a deliberate choice — write the deterministic
        // story so the course is still playable.
        (
            services::stories::build_story(planet, &flat, &review, ""),
            "template".to_string(),
        )
    } else {
        // With a key, a failure is transient (rate limit, timeout, bad JSON):
        // leave the planet unseeded so the next run retries it, rather than
        // silently shipping the short template story and skipping it forever.
        let story = services::stories::generate_with_ai(http, api_key, model, planet, &prompt)
            .await
            .map_err(|e| format!("{e:?}"))?;
        // A continuation that fails mid-story returns what it has rather than
        // erroring, which can leave a 3-minute story on a 15-minute planet.
        // Reject it here so the planet stays unseeded and the next run retries
        // it, instead of the short version silently becoming the final one.
        let floor = i64::from(services::stories::target_minutes(planet).0) * 60;
        if story.duration_secs < floor {
            return Err(format!(
                "story came out short: {}s, needs at least {floor}s",
                story.duration_secs
            ));
        }
        (story, model.to_string())
    };

    let words: usize = story
        .sentences
        .iter()
        .map(|u| u.split_whitespace().count())
        .sum();
    repositories::story_seeds::upsert(
        pool,
        planet.id,
        &story.title,
        &story.sentences,
        &story.translation,
        story.duration_secs,
        &source,
    )
    .await
    .map_err(|e| format!("{e:?}"))?;

    Ok((words, story.duration_secs, source))
}
