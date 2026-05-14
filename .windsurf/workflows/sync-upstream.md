---
description: Selectively sync official block/goose upstream changes into CodeMindX
---

# Sync official upstream changes

Use this workflow when selectively bringing changes from `block/goose` into `codeminx-main` while preserving CodeMindX customizations.

## 1. Check local state

```bash
git switch codeminx-main
git status --short
git log --oneline --decorate -5
```

Do not start a sync with unrelated uncommitted changes. Commit or stash them first.

## 2. Configure network proxy when needed

```bash
export https_proxy=http://127.0.0.1:7890
export http_proxy=http://127.0.0.1:7890
export all_proxy=socks5://127.0.0.1:7890
```

## 3. Ensure official upstream is available

```bash
git remote add upstream https://github.com/block/goose.git 2>/dev/null || true
git fetch upstream main
```

If using a one-off fetch instead of a remote:

```bash
git fetch https://github.com/block/goose.git main:refs/remotes/upstream/main
```

## 4. Review divergence

```bash
git merge-base codeminx-main upstream/main
git rev-list --left-right --count codeminx-main...upstream/main
git log --oneline --decorate --left-right codeminx-main...upstream/main --max-count=80
```

Review likely relevant areas:

```bash
git log --oneline codeminx-main..upstream/main -- \
  crates/goose/src/providers \
  crates/goose/src/acp \
  crates/goose-server \
  crates/goose-sdk \
  ui/sdk \
  ui/goose2
```

## 5. Create an integration branch

```bash
git switch codeminx-main
git switch -c sync/upstream-YYYY-MM-DD
```

Prefer cherry-picking targeted commits over a full merge unless the goal is a broad upstream rebase.

## 6. Pick low-risk changes first

Suggested order:

1. Core/provider bug fixes.
2. ACP/server fixes.
3. SDK/OpenAPI changes.
4. Goose2 UI changes.
5. Dependency or release infrastructure changes.

Examples of usually safer changes:

```bash
git cherry-pick <provider-fix-commit>
git cherry-pick <acp-fix-commit>
```

Resolve conflicts manually and keep CodeMindX behavior intact.

## 7. Protect CodeMindX customizations

Review these files carefully during conflicts or upstream diffs:

```text
ui/goose2/src-tauri/tauri.conf.json
ui/goose2/src-tauri/tauri.dev.conf.json
ui/goose2/src-tauri/Info.plist
ui/goose2/src-tauri/icons/**
ui/goose2/distro/**
ui/goose2/branding/**
ui/goose2/src-tauri/src/services/acp/goose_serve.rs
ui/goose2/src-tauri/src/lib.rs
ui/goose2/src-tauri/src/commands/model_setup.rs
ui/goose2/src/features/onboarding/**
crates/goose/src/providers/declarative/xingyun.json
crates/goose/src/providers/api_client.rs
crates/goose/src/providers/openai.rs
crates/goose/src/providers/openai_compatible.rs
crates/goose/src/providers/utils.rs
crates/goose/src/providers/formats/openai.rs
```

Do not let upstream branding, onboarding defaults, sidecar lifecycle behavior, or XingYun provider setup overwrite CodeMindX-specific behavior unintentionally.

## 8. Validate

Always run formatting after Rust edits:

```bash
source ./bin/activate-hermit
cargo fmt
```

For provider/core changes, run at least:

```bash
source ./bin/activate-hermit
cargo check -p goose
```

For server/API changes, also run:

```bash
source ./bin/activate-hermit
just generate-openapi
```

For Goose2 UI changes, run from `ui/goose2`:

```bash
source ../../bin/activate-hermit
pnpm test
```

If building a local debug app, ensure the sidecar binary in `/Applications/CodeMindX.app/Contents/MacOS/goose` is replaced with the intended debug binary, because `tauri.conf.json` may point `externalBin` at a release binary.

## 9. Merge back

After validation, merge the integration branch back into `codeminx-main`:

```bash
git switch codeminx-main
git merge --no-ff sync/upstream-YYYY-MM-DD
```

Use signed-off commits:

```bash
git commit -s
```
