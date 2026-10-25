use std::fs;
use std::path::{Path, PathBuf};

const BANNED_HELPER_DEFINITION_MARKERS: [&str; 3] = [
    "pub fn biomcp_cache_dir",
    "pub fn biomcp_downloads_dir",
    "pub fn cache_path",
];

const BANNED_HELPER_REFERENCE_MARKERS: [&str; 3] =
    ["biomcp_cache_dir(", "biomcp_downloads_dir(", "cache_path("];

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn read_source(path: &Path) -> String {
    fs::read_to_string(path).unwrap_or_else(|err| {
        panic!("{} should be readable: {err}", path.display());
    })
}

fn rust_sources_under(root: &Path) -> Vec<(PathBuf, String)> {
    fn visit(dir: &Path, sources: &mut Vec<(PathBuf, String)>) {
        for entry in fs::read_dir(dir).expect("src tree should be readable") {
            let entry = entry.expect("src entry should be readable");
            let path = entry.path();
            if path.is_dir() {
                visit(&path, sources);
                continue;
            }
            if path.extension().and_then(|ext| ext.to_str()) != Some("rs") {
                continue;
            }
            let source = read_source(&path);
            sources.push((path, source));
        }
    }

    let mut sources = Vec::new();
    visit(root, &mut sources);
    sources
}

#[test]
fn legacy_cache_helpers_are_removed() {
    let root = repo_root();
    let download_source = read_source(&root.join("src").join("utils").join("download.rs"));

    for marker in BANNED_HELPER_DEFINITION_MARKERS {
        assert!(
            !download_source.contains(marker),
            "unexpected legacy helper definition marker `{marker}` in src/utils/download.rs"
        );
    }

    for (path, source) in rust_sources_under(&root.join("src")) {
        for marker in BANNED_HELPER_REFERENCE_MARKERS {
            assert!(
                !source.contains(marker),
                "unexpected legacy cache helper reference `{marker}` in {}",
                path.display()
            );
        }
    }
}
