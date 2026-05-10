use crate::config::paths::Paths;
use include_dir::{include_dir, Dir, File};
use std::path::{Path, PathBuf};
use tracing::warn;

static BUILTIN_SKILLS_DIR: Dir = include_dir!("$CARGO_MANIFEST_DIR/src/skills/builtins");

pub struct BuiltinSkill {
    pub content: &'static str,
    pub path: PathBuf,
    pub supporting_files: Vec<String>,
}

fn collect_files<'a>(dir: &'a Dir<'a>, files: &mut Vec<&'a File<'a>>) {
    files.extend(dir.files());
    for child in dir.dirs() {
        collect_files(child, files);
    }
}

fn builtin_files() -> Vec<&'static File<'static>> {
    let mut files = Vec::new();
    collect_files(&BUILTIN_SKILLS_DIR, &mut files);
    files
}

fn materialize_skill_dir(source_dir: &Path) -> Option<(PathBuf, Vec<String>)> {
    let target_dir = Paths::in_data_dir("builtin-skills").join(source_dir);
    let mut supporting_files = Vec::new();

    for file in builtin_files()
        .into_iter()
        .filter(|file| file.path().starts_with(source_dir))
    {
        let Ok(relative_path) = file.path().strip_prefix(source_dir) else {
            continue;
        };
        let target_path = target_dir.join(relative_path);
        if let Some(parent) = target_path.parent() {
            if let Err(error) = std::fs::create_dir_all(parent) {
                warn!("Failed to create builtin skill directory: {}", error);
                return None;
            }
        }
        match std::fs::read(&target_path) {
            Ok(existing) if existing == file.contents() => {}
            _ => {
                if let Err(error) = std::fs::write(&target_path, file.contents()) {
                    warn!("Failed to write builtin skill file: {}", error);
                    return None;
                }
            }
        }
        if relative_path != Path::new("SKILL.md") {
            supporting_files.push(target_path.to_string_lossy().into_owned());
        }
    }

    Some((target_dir, supporting_files))
}

pub fn get_all() -> Vec<BuiltinSkill> {
    let mut skills = Vec::new();

    for file in builtin_files().into_iter().filter(|file| {
        file.path()
            .file_name()
            .is_some_and(|name| name == "SKILL.md")
    }) {
        let Some(content) = file.contents_utf8() else {
            continue;
        };
        let Some(source_dir) = file.path().parent() else {
            continue;
        };
        let Some((path, supporting_files)) = materialize_skill_dir(source_dir) else {
            continue;
        };
        skills.push(BuiltinSkill {
            content,
            path,
            supporting_files,
        });
    }

    skills.extend(
        BUILTIN_SKILLS_DIR
            .files()
            .filter(|file| file.path().components().count() == 1)
            .filter(|file| file.path().extension().is_some_and(|ext| ext == "md"))
            .filter_map(|file| {
                Some(BuiltinSkill {
                    content: file.contents_utf8()?,
                    path: PathBuf::new(),
                    supporting_files: Vec::new(),
                })
            }),
    );

    skills
}
