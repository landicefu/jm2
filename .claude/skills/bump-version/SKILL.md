---
name: bump-version
description: Checklist for bumping the jm2 version, committing, tagging, and publishing a release
---

# Bump Version (Release Checklist)

Follow this procedure to cut a new jm2 release. It bumps the version, commits
the work in the project's release convention (a `fix`/`feat` commit for the
code changes, then a separate `chore(release)` commit for the bump), tags it,
pushes, and publishes to npm.

## Prerequisites

- Working tree changes are reviewed and the intended fixes/features are ready to release.
- Tests pass: `npm run test:run`
- You are on the `main` branch (all release tags live on `main`).
- npm publish access to the `jm2` package.

## Versioning Convention

- Version lives in `package.json` and `package-lock.json` (keep both in sync — `npm version` does this).
- Tags are named `vX.Y.Z` (e.g. `v0.1.17`) and point at the `chore(release): bump version to X.Y.Z` commit.
- Use SemVer: `patch` for fixes, `minor` for backwards-compatible features, `major` for breaking changes.

## Checklist

1. **Verify the tree is clean of unrelated changes and tests pass.**
   ```bash
   git status --short
   npm run test:run
   ```

2. **Commit the code changes first** (the actual fix/feature), separate from the version bump.
   Use Conventional Commits and end the message with the co-author trailer.
   ```bash
   git add <changed source files>
   git commit -m "fix(scope): short description

   Longer explanation of what and why.

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

3. **Bump the version** without letting npm create its own tag/commit (we control those).
   ```bash
   npm version patch --no-git-tag-version   # or: minor / major
   ```
   This updates `package.json` and `package-lock.json` and prints the new `vX.Y.Z`.

4. **Commit the bump** as a dedicated release commit.
   ```bash
   git add package.json package-lock.json
   git commit -m "chore(release): bump version to X.Y.Z

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

5. **Tag the release commit.**
   ```bash
   git tag vX.Y.Z
   ```

6. **Push the branch and the tag.**
   ```bash
   git push
   git push origin vX.Y.Z
   ```

7. **Publish to npm.**
   ```bash
   npm publish
   ```

8. **Verify.**
   ```bash
   git log --oneline -3
   git show --stat --oneline vX.Y.Z | head -5
   npm view jm2 version
   ```

## Notes

- **One release = one bump.** If a fix lands *after* a tag is created, it is NOT
  in that release. Cut a fresh version/tag for it rather than moving the tag.
- If multiple unrelated changes are in the working tree, split them into
  separate commits; only include the ones you intend to ship in this release.
- The tag must point at the `chore(release)` commit, not the fix commit, to
  match existing history (`git log --oneline v0.1.15` etc.).

## Common Mistakes to Avoid

❌ **Wrong**: `npm version patch` (creates its own git tag/commit that may not match convention).
✅ **Correct**: `npm version patch --no-git-tag-version`, then commit and tag manually.

❌ **Wrong**: Editing only `package.json` by hand (leaves `package-lock.json` out of sync).
✅ **Correct**: Use `npm version` so both files update together.

❌ **Wrong**: Tagging the fix commit or a later commit.
✅ **Correct**: Tag the `chore(release): bump version to X.Y.Z` commit.

## Troubleshooting

- **`npm version` fails with "Git working directory not clean"**: it only errors
  when creating a tag; with `--no-git-tag-version` it edits files regardless.
  Otherwise commit or stash unrelated changes first.
- **Pushed the tag to the wrong commit**: delete locally and remotely, then re-tag.
  ```bash
  git tag -d vX.Y.Z
  git push origin :refs/tags/vX.Y.Z
  git tag vX.Y.Z <correct-commit>
  git push origin vX.Y.Z
  ```
- **`npm publish` rejected (version exists)**: the version was already published;
  bump again to a new patch and re-run the checklist.
