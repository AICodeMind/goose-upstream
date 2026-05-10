# 星芸AI Goose2 客户端二开计划与当前进度

## 1. 背景与目标

基于 `goose-upstream/ui/goose2` 做星芸AI客户端二开。

目标是将 Goose2 定制为星芸AI自己的桌面客户端，同时尽量保持低侵入，方便持续同步官方 Goose 上游。

## 2. 用户已确认的信息

### 2.1 品牌信息

- 中文名：`星芸AI`
- 英文名：`XingYun AI`
- Logo URL：`https://cdn-ai-new-xyai-1319649835.cos.accelerate.myqcloud.com/other/ailogo.png`
- 是否保留 Goose 痕迹：不保留，任何用户可见位置都不应该出现 Goose 品牌痕迹

### 2.2 星芸 API 信息

- API 基础地址：`https://aiapi.xing-yun.cn`
- 协议：完全 OpenAI-compatible
- 使用接口：Chat Completions
- 是否支持 streaming：支持
- 模型列表接口：同 newapi / OpenAI-compatible `/v1/models`
- API Key header：`Authorization: Bearer xxx`

### 2.3 发行平台

目标支持：

- macOS
- Windows
- Linux

## 3. 选型结论

选择 `ui/goose2` 作为长期二开基线。

原因：

- Goose2 是 Tauri 2 + React 19 + Rust backend / ACP thin-client 架构；
- 具备 `distro` 资源机制；
- 已有 `providerAllowlist` 能力；
- 已有 i18n 基础；
- 更适合低侵入白标和长期跟随上游。

风险：

- Goose2 仍处在迁移和快速演进期；
- 打包链路还不够成熟；
- 上次 macOS ARM 打包 `.app` 成功，`.dmg` 失败；
- 真实使用中图片上传链路可能仍有边界问题，暂不修复，以便保持上游同步。

## 4. 二开原则

### 4.1 必须坚持

- 优先使用配置、资源、distro、i18n、declarative provider；
- 尽量不改核心 agent/provider 逻辑；
- 不为了短期问题直接 fork 大量核心代码；
- 所有修改要清晰可回溯；
- 能通过上游机制完成的，不做硬编码 hack；
- 继续保持与 Goose 官方上游同步的能力。

### 4.2 避免事项

- 不手动改 `ui/desktop/openapi.json`；
- 不把 API key 写死进源码；
- 不直接删除上游 provider 实现；
- 不大规模重写 Goose core；
- 不修图片上传等非定制目标的上游问题，除非用户明确要求。

## 5. 当前已经完成的改动

以下改动已经在当前工作区中开始落地。

### 5.1 下载 Logo

已下载用户提供的 logo 到：

```text
ui/goose2/branding/xingyun/ailogo.png
```

注意：后续还需要生成 Tauri 所需多尺寸图标。

### 5.2 新增星芸 declarative provider

已创建文件：

```text
crates/goose/src/providers/declarative/xingyun.json
```

当前内容意图：

- provider id：`xingyun`
- engine：`openai`
- display name：`星芸AI`
- base_url：`https://aiapi.xing-yun.cn/v1/chat/completions`
- api key env：`XINGYUN_API_KEY`
- streaming：`true`
- dynamic_models：`true`
- skip_canonical_filtering：`true`

当前默认模型暂用：

```text
gpt-4o
```

后续如星芸 API 有正式默认模型名，应替换这里和 distro config 中的 `GOOSE_MODEL`。

### 5.3 更新 Goose2 distro manifest

已修改：

```text
ui/goose2/distro/distro.json
```

目标内容：

```json
{
  "appVersion": "xingyun-development",
  "featureToggles": {
    "costTracking": false
  },
  "providerAllowlist": "xingyun"
}
```

含义：

- 隐藏成本追踪 UI；
- UI 层只展示星芸 provider；
- 注意上游文档说明：`providerAllowlist` 当前主要是 UI suggestion，不是后端强制访问控制。

### 5.4 写入 distro 默认配置

已修改：

```text
ui/goose2/distro/config.yaml
```

目标内容：

```yaml
GOOSE_PROVIDER: xingyun
GOOSE_MODEL: gpt-4o
```

含义：

- packaged app 启动 `goose serve` 时通过 `GOOSE_ADDITIONAL_CONFIG_FILES` 加载；
- 默认 provider 指向星芸；
- 默认模型暂用 `gpt-4o`。

### 5.5 修改 Tauri 产品名

已修改：

```text
ui/goose2/src-tauri/tauri.conf.json
```

目标改动：

- `productName`: `星芸AI`
- `identifier`: `cn.xing-yun.ai`
- window title：`星芸AI`

注意：

- `identifier` 后续正式发版前应确认 Apple/Windows/Linux 包名规范和公司域名归属；
- Windows/Linux 安装包 metadata 可能还有其他位置需要补。

### 5.6 修改 Web HTML 标题和 favicon

已修改：

```text
ui/goose2/index.html
```

目标改动：

- `<title>` 改为 `星芸AI`；
- favicon 改为 `/app-icon.png`；
- localStorage key 初步从 `goose-*` 改为 `xingyun-*`：
  - `xingyun-theme`
  - `xingyun-accent-color`
  - `xingyun-density`

注意：

- ThemeProvider 内部可能还有对应 `goose-*` key，需要继续全局搜索替换；
- 不能只改 `index.html`，否则运行后 React 侧可能仍写回旧 key。

### 5.7 开始接入中文 locale

已修改：

```text
ui/goose2/src/shared/i18n/constants.ts
```

目标改动：

- `SUPPORTED_LOCALES` 增加 `zh-CN`；
- `LOCALE_STORAGE_KEY` 从 `goose:locale` 改为 `xingyun:locale`。

已修改：

```text
ui/goose2/src/features/settings/ui/GeneralSettings.tsx
```

目标改动：

- 语言下拉增加 `zh-CN` 选项；
- 文案 key 为 `general.language.chineseSimplified`。

注意：

- 当前 i18n 逻辑还需要继续修正，否则 `zh-CN` 可能被 normalize 成 `zh`；
- 还需要创建 `ui/goose2/src/shared/i18n/locales/zh-CN/*.json`；
- 还需要给英文和西班牙文 settings 翻译补 `chineseSimplified` key。

## 6. 重要事故记录：不要再用 heredoc

上次尝试用如下形式批量生成翻译文件时卡住：

```bash
python3 - <<'PY'
...
PY
```

终端进入了：

```text
heredoc>
```

原因是执行环境/审批流没有正确结束 heredoc。

后续禁止使用 heredoc。

推荐方式：

- 使用 `apply_patch` 做小范围编辑；
- 或使用 `python3 -c '...'`；
- 或先用 `write_to_file` 创建脚本文件，再运行脚本；
- 不要再在 `run_command` 里嵌多段 heredoc。

如果终端仍停在 `heredoc>`，用户可按 `Ctrl + C` 中断。

## 7. 接下来需要继续执行的计划

### 7.1 先检查当前 git diff

新对话开始后，先运行只读检查：

```bash
git status --short
git diff -- ui/goose2/distro/distro.json ui/goose2/distro/config.yaml ui/goose2/src-tauri/tauri.conf.json ui/goose2/index.html ui/goose2/src/shared/i18n/constants.ts ui/goose2/src/features/settings/ui/GeneralSettings.tsx crates/goose/src/providers/declarative/xingyun.json
```

目的：

- 确认上面已写入内容是否完整；
- 确认 heredoc 卡住没有产生半截文件；
- 避免重复改动。

### 7.2 修正 i18n locale 解析

需要修改：

```text
ui/goose2/src/shared/i18n/i18n.ts
ui/goose2/src/shared/i18n/locale.ts
```

目标：

- 支持 `zh-CN` 作为完整 locale；
- 不要把 `zh-CN` 错误归一成 `zh`；
- `navigator.languages` 中出现 `zh-CN` / `zh-Hans-CN` 时能解析到 `zh-CN`；
- 英文和西班牙文仍保持兼容。

建议实现方向：

- 对 `SUPPORTED_LOCALES` 做大小写无关匹配；
- 先尝试完整 canonical locale；
- 再尝试 base language；
- 对中文特殊处理到 `zh-CN`。

### 7.3 创建中文翻译文件

需要创建目录：

```text
ui/goose2/src/shared/i18n/locales/zh-CN/
```

需要有与英文目录相同的 namespace JSON：

```text
agents.json
chat.json
common.json
home.json
onboarding.json
projects.json
sessions.json
settings.json
sidebar.json
skills.json
```

短期策略：

- 先复制英文 JSON 结构；
- 将所有 `Goose` / `goose` 替换为 `星芸AI`；
- 优先人工翻译核心入口：
  - common
  - onboarding
  - settings
  - chat
  - sidebar
  - sessions
- 其余 namespace 可以先保留英文但不得出现 Goose。

必须补的 key：

```json
"general": {
  "language": {
    "chineseSimplified": "简体中文"
  }
}
```

英文 settings 也要补：

```json
"chineseSimplified": "Simplified Chinese"
```

西班牙文 settings 也要补对应 key。

### 7.4 全局替换可见 Goose 文案

需要重点搜索：

```bash
rg "Goose|goose" ui/goose2/src ui/goose2/index.html ui/goose2/src-tauri ui/goose2/distro crates/goose/src/providers/declarative/xingyun.json
```

处理原则：

- 用户可见 UI 文案：替换为 `星芸AI` 或 `XingYun AI`；
- 内部协议、包名、变量名、路径名：谨慎处理，不为了无痕而破坏上游；
- localStorage key 可以改为 `xingyun-*`，但要同步 ThemeProvider；
- ACP/userAgent 中的 `goose2` 是否替换要谨慎，可能影响协议/测试，建议后续单独评估。

### 7.5 生成 Tauri 图标

源图：

```text
ui/goose2/branding/xingyun/ailogo.png
```

需要生成或替换：

```text
ui/goose2/app-icon.png
ui/goose2/src-tauri/icons/32x32.png
ui/goose2/src-tauri/icons/64x64.png
ui/goose2/src-tauri/icons/128x128.png
ui/goose2/src-tauri/icons/128x128@2x.png
ui/goose2/src-tauri/icons/icon.png
ui/goose2/src-tauri/icons/icon.icns
ui/goose2/src-tauri/icons/icon.ico
Windows StoreLogo / Square*.png 系列
```

建议优先使用 Tauri 官方 icon 命令或项目已有脚本。

需要先查：

```bash
cat ui/goose2/package.json
find ui/goose2/scripts -maxdepth 2 -type f -print
```

如果使用命令生成，注意不要 heredoc。

### 7.6 Provider 限制补强

当前已做：

- `distro.providerAllowlist = "xingyun"`
- `GOOSE_PROVIDER: xingyun`

但上游文档说明 allowlist 当前主要是 UI suggestion。

后续可选增强：

- onboarding/settings/model picker 只显示 `xingyun`；
- 隐藏 custom provider 创建入口；
- 禁止选择非 allowlist provider；
- 若用户要求强约束，再在 ACP/backend 层增加 distro policy 校验。

建议第一阶段先不做 backend 强约束，避免侵入过深。

### 7.7 验证 provider JSON

需要检查：

- `xingyun.json` 能否被 Rust 反序列化；
- `dynamic_models: true` 时 inventory/model list 是否能调用 `/v1/models`；
- `base_url` 是 `https://aiapi.xing-yun.cn/v1/chat/completions` 时，OpenAI provider 是否能 map 到 `v1/models`；
- API key 是否从 `XINGYUN_API_KEY` 读取，并作为 Bearer token 发送。

可做轻量测试：

```bash
cargo test -p goose declarative_providers
```

但注意用户规则：只有用户要求 build/test 时才跑完整 build/test。

### 7.8 打包前检查

后续正式打包前：

- `cargo fmt`
- `pnpm check`
- `pnpm test`
- `cargo build --release`
- sidecar 命名：macOS ARM 需要 `goose-aarch64-apple-darwin`
- `pnpm tauri build`
- macOS `.dmg` 失败问题需单独处理
- Windows/Linux 需要分别验证图标、安装包 metadata、签名/权限

## 8. 当前建议的新对话启动提示词

可以在新对话中直接粘贴：

```text
请读取根目录 XINGYUN_GOOSE2_CUSTOMIZATION_PLAN.md，继续执行星芸AI goose2 客户端二开。注意：不要使用 heredoc；先检查 git diff，确认已完成改动；然后继续修正 i18n 的 zh-CN 支持、创建中文翻译文件、生成 Tauri 图标、清理可见 Goose 文案，并保持低侵入、方便同步上游。
```

## 9. 当前任务状态

已完成：

- 明确基线选择：`ui/goose2`；
- 明确星芸品牌/API/发行平台要求；
- 下载 logo；
- 新增星芸 provider JSON；
- 写入 distro provider allowlist；
- 写入 distro 默认 provider/model；
- 初步替换 Tauri/HTML 产品名；
- 初步加入 `zh-CN` 语言入口。

未完成：

- 修正 i18n `zh-CN` normalize/load 逻辑；
- 创建完整 `zh-CN` 翻译 JSON；
- 全量清理用户可见 Goose 文案；
- 生成所有平台图标；
- 检查 ThemeProvider/localStorage key；
- 补 provider 限制 UI；
- 构建/测试/打包验证；
- 处理 macOS `.dmg` 打包失败；
- Windows/Linux 打包验证。
