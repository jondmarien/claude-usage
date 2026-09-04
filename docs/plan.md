> Historical plan for the original antigravity-usage / Google Cloud Code CLI. The product is now `claude-usage` (Claude Code transcripts + Claude OAuth usage). See README.md.

## Full development plan (TypeScript CLI `antigravity-usage`, cross‑platform, publish to npm, Google OAuth)

### Goal
Build a cross-platform CLI (antigravity-usage) that fetches Antigravity model quota via Google Cloud Code API.

### Target behavior
- Default: `antigravity-usage quota` uses **GOOGLE** method (requires login).
- If not logged in, prompt user to run `antigravity-usage login`.
- Future: add **LOCAL** method as an optional fallback when Antigravity is running.

---

# Phase 0 — Project foundation (Day 1)

## 0.1 Scaffold
- Create repo `antigravity-usage`
- Node.js: **>= 20**
- TypeScript: latest stable
- Build tool: **tsup**
- Run tool: **tsx** (dev only)

### Install deps
Runtime deps:
- `commander` (CLI)
- `undici` (optional; Node fetch is fine, but undici gives control)
- `open` (to open browser for OAuth)

Dev deps:
- `typescript`, `tsup`, `tsx`
- `eslint` + config (optional)
- `vitest` (optional)

## 0.2 Package for `npm i -g antigravity-usage`
In `package.json`:
- `"name": "antigravity-usage"`
- `"bin": { "antigravity-usage": "dist/index.js" }`
- build outputs JS with a shebang.

## 0.3 Proposed folder structure
```
src/
  index.ts                   # CLI entry
  commands/
    quota.ts
    login.ts
    logout.ts
    status.ts
    doctor.ts                # diagnostics (google auth status)
  core/
    errors.ts
    logger.ts
    env.ts                   # platform paths, homedir config dir
    json.ts                  # safe JSON parse
    mask.ts                  # mask tokens
  quota/
    types.ts                 # QuotaSnapshot, ModelQuotaInfo, etc.
    format.ts                # table + json output
    service.ts               # fetchQuota(method)
  google/
    oauth.ts                 # OAuth flow
    storage.ts               # token storage (keytar or file)
    cloudcode.ts             # Cloud Code API client
    parser.ts                # parse API responses
    token-manager.ts         # handle refresh logic
```

Deliverable: `antigravity-usage --help` works, commands stubbed.

---

# Phase 1 — Google OAuth and token storage (Days 2–3)

Goal: `antigravity-usage login` and `antigravity-usage logout` work, tokens stored securely.

## 1.1 Token storage
Choose and implement secure token storage:

### Option 1: keytar (recommended)
- Use `@microsoft/keytar` or `keytar-v3` (community fork)
- Pros: OS-level secure storage (Keychain/Credential Manager)
- Cons: Native dependency, requires build tools
- Document prerequisites:
  - macOS: Xcode Command Line Tools
  - Windows: Visual Studio Build Tools
  - Linux: `libsecret-1-dev`

### Option 2: Encrypted file fallback
- Store in user config dir with encryption
- Use `crypto` module with a machine-specific key
- Warn users about security implications

### Implementation
Create `src/google/storage.ts`:
- `saveTokens(accessToken, refreshToken, expiresAt, email?)`
- `loadTokens(): { accessToken, refreshToken, expiresAt, email? } | null`
- `deleteTokens()`
- `hasTokens(): boolean`

Config dir paths:
- Windows: `%APPDATA%/antigravity-usage`
- macOS: `~/Library/Application Support/antigravity-usage`
- Linux: `~/.config/antigravity-usage`

Deliverable: Token storage works on all 3 platforms.

## 1.2 OAuth client setup
Before coding, **register your own OAuth client**:
1. Go to Google Cloud Console
2. Create new OAuth 2.0 Client ID (Desktop app type)
3. Add authorized redirect URI: `http://127.0.0.1:*/callback`
4. Note the client ID and secret
5. Store in environment variables or config (not in git!)

**Do not reuse extension's OAuth client** - terms of service risk.

## 1.3 OAuth flow implementation
Create `src/google/oauth.ts`:

### Flow (local callback method):
1. Start local HTTP server on random available port
2. Generate auth URL with:
   - `scope`: Cloud Code API scopes (TBD - research from extension)
   - `redirect_uri`: `http://127.0.0.1:<port>/callback`
   - `access_type`: `offline` (to get refresh token)
   - `prompt`: `consent` (force refresh token)
3. Open browser (use `open` package or OS-specific commands)
4. Wait for callback with `code`
5. Exchange code for tokens
6. Save tokens via storage module
7. Shutdown server
8. Show success message with user email

### Error handling:
- Browser doesn't open → print URL for manual opening
- Timeout (2 mins) → cancel flow
- Code exchange fails → show error

### Additional features:
- `--no-browser` flag to just print URL
- `--port <port>` to specify callback port

Deliverable: `antigravity-usage login` completes OAuth flow.

## 1.4 Token manager with auto-refresh
Create `src/google/token-manager.ts`:

```typescript
class TokenManager {
  async getValidAccessToken(): Promise<string> {
    // 1. Load tokens
    // 2. Check expiry (with 5-min buffer)
    // 3. If expired, refresh
    // 4. Return valid token
  }
  
  async refreshToken(): Promise<void> {
    // POST to OAuth token endpoint
    // Update stored tokens
  }
  
  isLoggedIn(): boolean {
    return hasTokens()
  }
}
```

Deliverable: Token refresh works automatically.

## 1.5 Logout and status commands
Create `src/commands/logout.ts`:
- Delete tokens
- Show confirmation

Create `src/commands/status.ts`:
- Show if logged in
- Show user email
- Show token expiry
- Mask tokens (first 6 + last 4 characters)

Deliverable: `antigravity-usage logout` and `antigravity-usage status` work.

---

# Phase 2 — Google Cloud Code API client (Days 4–6)

Goal: `antigravity-usage quota` fetches quota from Google Cloud Code API.

## 2.1 Research API endpoints
From the extension code, identify:
- Base URL: `https://cloudcode-pa.googleapis.com`
- Required endpoints (likely):
  - `/v1internal:loadCodeAssist` - gets plan info
  - `/v1internal:fetchAvailableModels` - gets model quotas
- Request headers needed:
  - `Authorization: Bearer <token>`
  - Others? (research from extension)
- Request/response format

**Action**: Examine extension's `GoogleCloudCodeClient` implementation.

## 2.2 Implement Cloud Code API client
Create `src/google/cloudcode.ts`:

```typescript
class CloudCodeClient {
  constructor(private tokenManager: TokenManager) {}
  
  async loadCodeAssist(): Promise<CodeAssistResponse> {
    const token = await this.tokenManager.getValidAccessToken()
    // Make API call
  }
  
  async fetchAvailableModels(): Promise<ModelsResponse> {
    const token = await this.tokenManager.getValidAccessToken()
    // Make API call
  }
}
```

### Error handling:
- 401/403 → auth error, prompt re-login
- 429 → rate limited, show retry time
- 5xx → server error, suggest retry
- Network errors → offline?

Deliverable: Can call Cloud Code API endpoints.

## 2.3 Parse quota data
Create `src/google/parser.ts`:

Port the parsing logic from extension to extract:
- Prompt credits (available, monthly, used %)
- Model quotas:
  - Model ID and label
  - Remaining percentage
  - Reset time
  - Time until reset

Define stable types in `src/quota/types.ts`:
```typescript
interface QuotaSnapshot {
  timestamp: string
  method: 'google' | 'local'
  promptCredits?: PromptCreditsInfo
  models: ModelQuotaInfo[]
}

interface ModelQuotaInfo {
  label: string
  modelId: string
  remainingPercentage?: number
  isExhausted: boolean
  resetTime?: string
  timeUntilResetMs?: number
}

interface PromptCreditsInfo {
  available: number
  monthly: number
  usedPercentage: number
  remainingPercentage: number
}
```

Deliverable: Parse API responses into `QuotaSnapshot`.

## 2.4 Implement quota command
Update `src/commands/quota.ts`:

```typescript
async function quotaCommand(options) {
  const tokenManager = new TokenManager()
  
  if (!tokenManager.isLoggedIn()) {
    console.error('Not logged in. Run: antigravity-usage login')
    process.exit(1)
  }
  
  const client = new CloudCodeClient(tokenManager)
  const snapshot = await fetchQuotaFromGoogle(client)
  
  if (options.json) {
    console.log(JSON.stringify(snapshot, null, 2))
  } else {
    printQuotaTable(snapshot)
  }
}
```

Deliverable: `antigravity-usage quota` works end-to-end.

## 2.5 Output formatting
Create `src/quota/format.ts`:

### Table format (default):
```
Antigravity Quota Status (via Google)
Retrieved: 2026-01-14 11:00:00

Prompt Credits: 450/500 (90% remaining)

Models:
┌─────────────────────┬───────────┬─────────────────────┐
│ Model               │ Remaining │ Resets In           │
├─────────────────────┼───────────┼─────────────────────┤
│ Gemini 2.0 Flash    │ 85%       │ 14h 30m             │
│ Gemini 1.5 Pro      │ 92%       │ 14h 30m             │
│ Claude 3.5 Sonnet   │ EXHAUSTED │ 14h 30m             │
└─────────────────────┴───────────┴─────────────────────┘
```

Use a library like `cli-table3` or build simple ASCII table.

### JSON format (`--json`):
Output raw `QuotaSnapshot` object.

Deliverable: Beautiful terminal output.

---

# Phase 3 — Quality, tests, and release (Days 7–9)

Goal: Production-ready CLI published to npm.

## 3.1 Error handling and diagnostics
Create `src/core/errors.ts`:

```typescript
class NotLoggedInError extends Error { }
class AuthenticationError extends Error { }
class NetworkError extends Error { }
class RateLimitError extends Error { }
class APIError extends Error { }
```

Update `src/commands/doctor.ts`:
- Check if logged in
- Check token validity
- Test API connectivity
- Show config paths
- Show version info

Deliverable: `antigravity-usage doctor` helps debug issues.

## 3.2 Logging and debug mode
Add `--debug` flag (global):
- Log all API requests/responses (with token masking)
- Log token refresh operations
- Log parsing steps

Use structured logging:
```
[google] refreshing access token...
[google] calling /v1internal:fetchAvailableModels
[google] received 3 models
[parser] extracted quota for model: gemini-2.0-flash
```

Deliverable: Debug mode aids troubleshooting.

## 3.3 Tests
Add unit tests with `vitest`:

### Test files:
- `test/google/parser.test.ts` - parsing API responses
- `test/google/storage.test.ts` - token storage (mock fs/keytar)
- `test/google/token-manager.test.ts` - token refresh logic
- `test/quota/format.test.ts` - table formatting
- `test/core/mask.test.ts` - token masking

### Fixtures:
Create `test/fixtures/` with sample API responses.

### CI:
GitHub Actions workflow:
```yaml
- Test on Node 20, 22
- Run on all 3 OS (windows, mac, ubuntu)
- Lint with eslint
- Type-check with tsc
```

Deliverable: Automated tests pass on all platforms.

## 3.4 Documentation
Create comprehensive `README.md`:

### Sections:
1. **Installation**: `npm i -g antigravity-usage`
2. **Quick Start**: 
   ```bash
   antigravity-usage login
   antigravity-usage quota
   ```
3. **Commands**:
   - `antigravity-usage login [--no-browser] [--port <port>]`
   - `antigravity-usage logout`
   - `antigravity-usage quota [--json]`
   - `antigravity-usage status`
   - `antigravity-usage doctor`
4. **OAuth Setup**: How to get your own client ID (optional for users, but document it)
5. **Troubleshooting**: Common issues
6. **Security**: How tokens are stored
7. **Development**: Build from source

Add `CONTRIBUTING.md` and `LICENSE`.

Deliverable: Clear documentation.

## 3.5 Release checklist
- [ ] Version in `package.json`
- [ ] Changelog (use conventional commits)
- [ ] CI passing
- [ ] README complete
- [ ] LICENSE file
- [ ] npm pack and test locally
- [ ] Publish to npm: `npm publish`
- [ ] GitHub release with binaries (optional)
- [ ] Announce (optional)

Deliverable: Published to npm!

---

# Concrete deliverables checklist (in order)
1) `antigravity-usage --help` works (scaffold done)
2) `antigravity-usage login` completes OAuth flow
3) `antigravity-usage logout` and `antigravity-usage status` work
4) Token storage works on all 3 platforms
5) `antigravity-usage quota` fetches from Google Cloud Code API
6) Output formatting (table + `--json`)
7) `antigravity-usage doctor` diagnostics
8) Error handling and debug mode
9) Tests + CI
10) Publish npm package

---

# Future enhancements (Phase 4+)

## LOCAL method (optional)
Add ability to fetch quota from local Antigravity language server when running:

### Benefits:
- Works offline
- No OAuth required
- Faster response

### Challenges:
- Requires Antigravity to be running
- Platform-specific process detection
- More complex error scenarios

### Implementation overview:
1. Detect Antigravity language server process (PID, command args)
2. Parse `--csrf_token` and `--extension_server_port`
3. List listening ports for the PID
4. Probe ports to find Connect API port
5. Call `GetUserStatus` endpoint (HTTPS with self-signed cert fallback to HTTP)
6. Parse response into same `QuotaSnapshot` format

This can be added later if there's demand.

---

# Implementation notes

## OAuth flow choice
Use **local browser callback** flow (recommended):
- Best UX on desktop
- Simple implementation
- Falls back to printing URL if browser fails

Alternative (future): **device code flow** for headless/SSH environments.

## Token storage choice
Priority order:
1. Try `keytar` (or compatible fork)
2. Fall back to encrypted file if keytar unavailable
3. Document security trade-offs clearly

## API research needed
Before Phase 2, examine extension code to identify:
- Exact API endpoints and request format
- Required OAuth scopes
- Response parsing logic
- Error handling patterns
