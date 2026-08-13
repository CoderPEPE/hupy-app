//! Writes the ten-module curriculum of every planet into the database.
//!
//! The sequence itself is not the model's to invent — it lives in
//! [`huppy_backend::services::curriculum`]: which three high-frequency verbs
//! each planet drills, and what each of its ten modules does with them (verb 1,
//! verb 2, verb 3, mix, past, future, questions, negation, dialogue, review).
//! This binary hands that plan to the chat model and asks only for the part a
//! model is good at: the actual chunks, in the course's target language, with
//! translations.
//!
//! Usage:
//!
//! ```text
//! cargo run --release --bin seed_curriculum                    # every planet missing one
//! cargo run --release --bin seed_curriculum -- --course pt-en  # one course
//! cargo run --release --bin seed_curriculum -- --limit 3       # a taste, to check the output
//! cargo run --release --bin seed_curriculum -- --force         # rewrite what exists
//! ```
//!
//! Re-runnable: planets whose modules already carry chunks are skipped unless
//! `--force`, and a planet whose model call fails is left untouched for the
//! next run.

use huppy_backend::models::{Planet, PlanetLesson};
use huppy_backend::services::curriculum;
use huppy_backend::{config, db, repositories, services};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::Arc;

/// Chunks each module should teach. Enough to fill a conversation without
/// turning the module into a vocabulary dump.
const CHUNKS_PER_MODULE: usize = 7;

struct Args {
    course: Option<String>,
    limit: Option<usize>,
    force: bool,
    concurrency: usize,
}

fn split_course(course: &str) -> Result<(String, String), String> {
    course
        .split_once('-')
        .map(|(base, target)| (base.to_string(), target.to_string()))
        .ok_or_else(|| format!("--course wants base-target, like pt-en (got {course})"))
}

fn parse_args(argv: &[String]) -> Result<Args, String> {
    let mut args = Args {
        course: None,
        limit: None,
        force: false,
        concurrency: 6,
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
                split_course(&value(i)?)?;
                args.course = Some(value(i)?);
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
                .unwrap_or_else(|_| "seed_curriculum=info,huppy_backend=warn".into()),
        )
        .init();

    let argv: Vec<String> = std::env::args().skip(1).collect();
    let args = match parse_args(&argv) {
        Ok(a) => a,
        Err(e) => {
            eprintln!("{e}\n\nusage: seed_curriculum [--course pt-en] [--limit N] [--concurrency N] [--force]");
            std::process::exit(2);
        }
    };

    let config = config::Config::from_env().unwrap_or_else(|e| panic!("{e}"));
    let model = config.story_model.clone();
    let api_key = config.openai_api_key.clone();
    if api_key.is_empty() {
        eprintln!("OPENAI_API_KEY must be set — the chunks are written by the model");
        std::process::exit(2);
    }
    let pool = db::establish_pool(&config.database_url, args.concurrency as u32 + 2);
    let http = reqwest::Client::new();

    let planets = repositories::planets::all_ordered(&pool)
        .await
        .expect("failed to list planets");
    let authored: HashSet<_> = repositories::modules::planets_with_curriculum(&pool)
        .await
        .expect("failed to list authored planets")
        .into_iter()
        .collect();

    let course = args
        .course
        .as_deref()
        .map(|c| split_course(c).expect("validated"));
    let mut todo: Vec<Planet> = planets
        .into_iter()
        .filter(|p| args.force || !authored.contains(&p.id))
        .filter(|p| match &course {
            Some((base, target)) => &p.base_language == base && &p.language == target,
            None => true,
        })
        .collect();
    if let Some(limit) = args.limit {
        todo.truncate(limit);
    }

    let total = todo.len();
    println!(
        "{total} planets to author ({model}, {} at a time)",
        args.concurrency
    );
    if total == 0 {
        return;
    }

    let done = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let semaphore = Arc::new(tokio::sync::Semaphore::new(args.concurrency));
    let mut tasks = Vec::with_capacity(total);

    for planet in todo {
        let (pool, http, model, api_key) =
            (pool.clone(), http.clone(), model.clone(), api_key.clone());
        let (done, semaphore) = (done.clone(), semaphore.clone());
        tasks.push(tokio::spawn(async move {
            let _permit = semaphore.acquire().await.expect("semaphore closed");
            let label = format!(
                "{}-{} planet {:>2}",
                planet.base_language, planet.language, planet.number
            );
            match author_planet(&pool, &http, &api_key, &model, &planet).await {
                Ok((modules, chunks)) => {
                    let n = done.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
                    println!("[{n}/{total}] {label} — {modules} modules, {chunks} chunks");
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

/// The brief for one planet: the plan is given, the chunks are asked for.
fn prompt_for(planet: &Planet, modules: &[PlanetLesson], target: &str, base: &str) -> String {
    let slots = curriculum::focus_slots(planet.number);
    let mut out = format!(
        "You are building the curriculum for planet {} of a {target} course taught to {base} \
         speakers, at CEFR level {}.\n\n\
         The planet drills three things, in this order: 1) {}, 2) {}, 3) {}.\n\
         Give them in {target} (translate the concept — do not leave English lemmas in a \
         non-English course).\n\n\
         PLANET: {} — {}\nCommunication goal: {}\n\n",
        planet.number, planet.level, slots[0], slots[1], slots[2], planet.title, planet.subtitle,
        planet.goal,
    );
    out.push_str("THE TEN MODULES — write chunks for each, in this exact order:\n");
    for module in modules {
        let (focus, description) = curriculum::module_role(module.position, &slots);
        out.push_str(&format!(
            "{}. [{focus}] {description}\n",
            module.position
        ));
    }
    out.push_str(&format!(
        "\nRULES:\n\
- Each module gets exactly {CHUNKS_PER_MODULE} chunks.\n\
- A chunk is a COMPLETE, natural spoken sentence — never an isolated word. The learner learns \
\"I have a car\", not \"have\". That is the whole method.\n\
- Keep every chunk inside level {level} and inside this planet's three focus items. Modules 5-8 \
must reuse the SAME ideas from modules 1-4, transformed (past, future, question, negative), so the \
learner sees one structure change shape rather than meeting new content.\n\
- Vary the subject across the chunks of a module (I / you / he / she / we / they), since that is \
the first thing the tutor drills.\n\
- Everyday, spoken language a real person would use. No textbook filler.\n\
- Module 10 reviews the planet: draw its chunks from the strongest ideas of modules 1-9.\n\
\n\
Return JSON only:\n\
{{\"focus_items\": [three short {target} labels for the planet's three focus items],\n\
  \"modules\": [{{\"position\": 1, \"title\": <short {target}-course module title in {base}>, \
\"chunks\": [{{\"target\": <sentence in {target}>, \"base\": <same sentence in {base}>}}]}}]}}\n\
All ten modules, in order.",
        level = planet.level,
    ));
    out
}

/// Authors one planet and stores it. Returns (modules written, chunks written).
async fn author_planet(
    pool: &db::DbPool,
    http: &reqwest::Client,
    api_key: &str,
    model: &str,
    planet: &Planet,
) -> Result<(usize, usize), String> {
    let modules = repositories::modules::lessons_for(pool, planet.id)
        .await
        .map_err(|e| format!("{e:?}"))?;
    if modules.is_empty() {
        return Err("planet has no modules".into());
    }

    let (target_name, base_name) =
        services::realtime::language_names(&planet.base_language, &planet.language);
    let prompt = prompt_for(planet, &modules, target_name, base_name);
    let parsed = request_curriculum(http, api_key, model, &prompt).await?;

    let focus_items: Vec<String> = parsed["focus_items"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(str::trim))
                .filter(|s| !s.is_empty())
                .map(String::from)
                .collect()
        })
        .unwrap_or_default();

    // Index the model's modules by position: a model that returns them out of
    // order (or repeats one) must not shuffle the curriculum.
    let by_position: std::collections::HashMap<i64, &Value> = parsed["modules"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|m| m["position"].as_i64().map(|p| (p, m)))
                .collect()
        })
        .unwrap_or_default();

    let slots = curriculum::focus_slots(planet.number);
    let mut written = 0usize;
    let mut chunks_total = 0usize;
    for module in &modules {
        let Some(authored) = by_position.get(&i64::from(module.position)) else {
            continue;
        };
        let chunks: Vec<Value> = authored["chunks"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|c| {
                        let target = c["target"].as_str().unwrap_or("").trim();
                        let base = c["base"].as_str().unwrap_or("").trim();
                        (!target.is_empty()).then(|| json!({"target": target, "base": base}))
                    })
                    .collect()
            })
            .unwrap_or_default();
        if chunks.is_empty() {
            continue;
        }
        let (focus, description) = curriculum::module_role(module.position, &slots);
        let title = authored["title"]
            .as_str()
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .unwrap_or(&module.title)
            .to_string();
        chunks_total += chunks.len();
        repositories::modules::set_curriculum(
            pool,
            module.id,
            &title,
            &description,
            &focus,
            Value::Array(chunks),
        )
        .await
        .map_err(|e| format!("{e:?}"))?;
        written += 1;
    }

    if written < modules.len() {
        // A half-authored planet would leave the tutor with empty modules
        // mid-path, so treat it as a failure and let the next run redo it.
        return Err(format!(
            "only {written} of {} modules came back usable",
            modules.len()
        ));
    }

    repositories::modules::set_focus_verbs(pool, planet.id, json!(focus_items))
        .await
        .map_err(|e| format!("{e:?}"))?;

    Ok((written, chunks_total))
}

async fn request_curriculum(
    client: &reqwest::Client,
    api_key: &str,
    model: &str,
    prompt: &str,
) -> Result<Value, String> {
    let payload = json!({
        "model": model,
        "response_format": {"type": "json_object"},
        // Ten modules of seven translated chunks is a long document; the
        // default cap truncates it into invalid JSON.
        "max_tokens": 8000,
        "messages": [{"role": "user", "content": prompt}],
    });

    let resp = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("failed to reach OpenAI: {e}"))?;
    let status = resp.status();
    if !status.is_success() {
        let body: String = resp
            .text()
            .await
            .unwrap_or_default()
            .chars()
            .take(300)
            .collect();
        return Err(format!("curriculum generation failed ({status}): {body}"));
    }
    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("malformed OpenAI response: {e}"))?;
    let content = body["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("OpenAI response carried no curriculum")?;
    serde_json::from_str(content).map_err(|e| format!("curriculum JSON was not valid: {e}"))
}
