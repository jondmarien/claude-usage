# Release Process

To update `claude-usage` on npm, follow these steps:

## 1. Commit Your Changes
Ensure all your code changes are committed to git.
```bash
git add .
git commit -m "feat: your changes"
```

## 2. Update Version
Use `npm version` to bump the version number. This will update `package.json` and creates a git tag.

**For bug fixes (0.1.0 -> 0.1.1):**
```bash
npm version patch
```

**For new features (0.1.0 -> 0.2.0):**
```bash
npm version minor
```

**For breaking changes (0.1.0 -> 1.0.0):**
```bash
npm version major
```

## 3. Publish
Run the publish command. This handles the build (via `prepublishOnly`) and uploads to npm.
```bash
npm publish
```

---
**Note:** checks are run automatically before publishing. If the build fails, the publish will be cancelled.
