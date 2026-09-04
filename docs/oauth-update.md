> Historical Google OAuth notes for antigravity-usage. `claude-usage` imports Claude Code credentials instead. See README.md.

# OAuth Credentials Update

## Changes Made

Updated `antigravity-usage` to include **built-in OAuth credentials**, making the tool work out of the box without requiring users to configure environment variables.

## Modified Files

### 1. [src/google/oauth.ts](file:///Users/chaileasevn/Desktop/Code/antigravity-usage/src/google/oauth.ts)

**Before:**
```typescript
const OAUTH_CONFIG = {
  clientId: process.env.ANTIGRAVITY_OAUTH_CLIENT_ID || '',
  clientSecret: process.env.ANTIGRAVITY_OAUTH_CLIENT_SECRET || '',
  // ...
}
```

**After:**
```typescript
const OAUTH_CONFIG = {
  clientId: process.env.ANTIGRAVITY_OAUTH_CLIENT_ID || '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com',
  clientSecret: process.env.ANTIGRAVITY_OAUTH_CLIENT_SECRET || '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',
  // ...
}
```

- Removed validation check that required credentials to be set
- Users can still override with environment variables if desired

### 2. [src/commands/doctor.ts](file:///Users/chaileasevn/Desktop/Code/antigravity-usage/src/commands/doctor.ts)

Updated diagnostics output to show:
- ✅ "Using built-in OAuth credentials" (default)
- Shows custom credentials status if environment variables are set

### 3. [README.md](file:///Users/chaileasevn/Desktop/Code/antigravity-usage/README.md)

Updated documentation to clarify:
- Tool works out of the box with built-in credentials
- Environment variables are now optional for custom credentials

## User Experience

### Before
```bash
$ antigravity-usage login
❌ Login failed: OAuth client not configured. 
   Please set ANTIGRAVITY_OAUTH_CLIENT_ID and 
   ANTIGRAVITY_OAUTH_CLIENT_SECRET environment variables.
```

### After
```bash
$ antigravity-usage login
Opening browser for Google login...
✅ Logged in successfully!
```

## Testing

All tests still passing:
- ✅ 23/23 tests passed
- ✅ Build successful
- ✅ Doctor command shows correct status
- ✅ Login flow ready to use (requires actual Google auth)
