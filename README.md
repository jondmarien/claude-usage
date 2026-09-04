<div align="center">
    <h1>claude-usage</h1>
</div>

<p align="center">
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" /></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg" alt="Node.js Version" /></a>
</p>

<p align="center">
A CLI to track <strong>Claude / Claude Code</strong> usage and plan quota, with Auto Wakeup on macOS, Linux, and Windows.
</p>

<p align="center">
<em>Ported from <a href="https://github.com/skainguyen1412/antigravity-usage">antigravity-usage</a>. Inspired by <a href="https://github.com/ryoppippi/ccusage">ccusage</a>.</em>
</p>

## Quick Start

```bash
# Install globally (after publish) or from this repo
npm install -g claude-usage
# or
npm run build && npm link

# If you already use Claude Code, import its local login
claude-usage login

# Show usage / quota
claude-usage
```

If Claude Code has been used on this machine, `claude-usage` can also read local session logs **without a network call**:

```bash
claude-usage --method local
```

---

## How It Works

`claude-usage` uses real Claude surfaces only. It does **not** talk to Google Cloud Code or Antigravity.

1. **Local mode (offline)**  
   Reads Claude Code JSONL transcripts from:
   - `~/.config/claude/projects/`
   - `~/.claude/projects/`
   - `$CLAUDE_CONFIG_DIR/projects` (comma-separated list supported)

   This is the same family of files [ccusage](https://github.com/ryoppippi/ccusage) aggregates. Local mode reports **token usage by model**, not remaining plan quota. Session files do not store remaining %.

2. **Cloud mode (plan quota)**  
   Uses Claude Code OAuth credentials from `~/.claude/.credentials.json` (or `CLAUDE_CONFIG_DIR`) and calls:

   `GET https://api.anthropic.com/api/oauth/usage`

   That is the same undocumented endpoint Claude Code's `/usage` command uses. It returns session / weekly / scoped windows when your login is a Claude subscription OAuth token.

   **Gaps (not invented):**
   - This endpoint is **undocumented** and may change or rate-limit.
   - **API keys cannot read plan quota.** They can still wake models via the Messages API and still use local transcripts.
   - On macOS, Claude Code may store tokens in Keychain only. If `.credentials.json` is missing, run `claude setup-token` and `claude-usage login --token`.

3. **Auto mode**  
   Uses cloud quota when credentials exist; falls back to local transcripts if the API is unavailable.

---

## Authentication

`claude-usage` does **not** run Google OAuth.

```bash
# Import Claude Code's existing login (preferred)
claude auth login          # once, in Claude Code
claude-usage login         # import ~/.claude/.credentials.json

# Setup token from Claude Code (CI / Keychain-only macOS)
claude setup-token
claude-usage login --token <token>

# Anthropic API key (wakeup + local usage only — no plan bars)
claude-usage login --api-key
```

Tokens stay on disk (`chmod 600`). Refresh writes back to Claude Code's credentials file so the two stay in sync.

### Multi-account

```bash
claude-usage accounts list
claude-usage accounts add
claude-usage accounts switch <id>
claude-usage accounts remove <id>
```

---

## Features

### Auto Wakeup (macOS, Linux, and Windows)

Never waste a freshly reset Claude session window. `wakeup` sends a **tiny** prompt (`hi`, `max_tokens=1` by default) through:

1. `claude -p` if the Claude Code CLI is on `PATH` (uses your logged-in Claude Code session)
2. Otherwise the Anthropic Messages API with the imported OAuth token or API key

Default models:

- `claude-haiku-4-5` — cheapest way to start a session window
- `claude-sonnet-5` — current Sonnet; also touches the Sonnet-scoped weekly window

Opus is **not** woken by default (expensive). Pass `--model` to test it.

```bash
claude-usage wakeup config     # Interactive setup
claude-usage wakeup install    # cron (macOS/Linux) or Task Scheduler (Windows)
claude-usage wakeup status
claude-usage wakeup test
claude-usage wakeup history
```

**Platform support**

| Platform | Scheduler |
| --- | --- |
| macOS | cron |
| Linux | cron |
| Windows | Task Scheduler (`schtasks`) |

**Schedule modes:** every N hours, daily at a time, or a custom cron expression.

**Smart reset detection:** when you fetch quota and wakeup is enabled in reset mode, unused **session** windows (~100% remaining and ~5 hours until reset) or unused **weekly** windows (~7 days until reset) can trigger automatically. Claude weekly limits are **not** treated as 5-hour Antigravity resets.

```bash
claude-usage wakeup test -e you@example.com -m claude-haiku-4-5
claude-usage wakeup test --model claude-sonnet-5 --prompt "hi"
```

### Caching

Quota data is cached for **5 minutes**. Force a refresh:

```bash
claude-usage quota --refresh
```

---

## Command Reference

```bash
claude-usage                   # Auto (cloud quota if logged in, else local)
claude-usage --all             # All imported accounts
claude-usage --method local    # Transcripts only
claude-usage --method cloud    # OAuth usage API only
claude-usage --json
claude-usage --version

claude-usage login
claude-usage login --api-key
claude-usage login --token <token>
claude-usage logout
claude-usage status
claude-usage doctor
claude-usage accounts list|add|switch|remove|refresh
claude-usage wakeup config|install|uninstall|status|test|history
```

---

## Configuration

`claude-usage` config (accounts, cache, wakeup):

- **macOS**: `~/Library/Application Support/claude-usage/`
- **Linux**: `~/.config/claude-usage/`
- **Windows**: `%APPDATA%\claude-usage\`

Claude Code data (read-only except token refresh):

- **All platforms**: `~/.claude/` and `~/.config/claude/`
- **Windows**: `%USERPROFILE%\.claude\`
- Override with `CLAUDE_CONFIG_DIR`

---

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
npm run dev -- quota --method local
```

---

## License

MIT
