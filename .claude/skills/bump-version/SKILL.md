---
name: bump-version
description: Checklist for bumping an npm package version, then committing, tagging, and publishing the release
---

# Bump Version (Release Checklist)

Cut a new release of an npm package: bump the version, commit the code and the
version bump as separate commits, tag the release, push, and publish to npm.

## Prerequisites

- Working tree changes are reviewed and the intended fixes/features are ready to release.
- The test suite passes.
- You are on the main branch (release tags live on the main branch).
- npm publish access to the package.

## Versioning convention

- The version lives in `package.json` and `package-lock.json` — keep them in sync (`npm version` does this for you).
- Tags are named `vX.Y.Z` (e.g. `v1.4.0`) and point at the `chore(release): bump version to X.Y.Z` commit.
- Use SemVer: `patch` for fixes, `minor` for backwards-compatible features, `major` for breaking changes.

## Checklist

1. **Verify the tree is clean of unrelated changes and tests pass.**
   ```bash
   git status --short
   npm test        # or the project's test command
   ```

2. **Commit the code changes first** (the actual fix/feature), separate from the version bump.
   Use your commit-message convention (e.g. Conventional Commits), and append your
   project's commit trailer if it has one.
   ```bash
   git add <changed source files>
   git commit -m "fix(scope): short description"
   ```

3. **Bump the version** without letting npm create its own tag/commit (you control those).
   ```bash
   npm version patch --no-git-tag-version   # or: minor / major
   ```
   This updates `package.json` and `package-lock.json` and prints the new `vX.Y.Z`.

4. **Commit the bump** as a dedicated release commit.
   ```bash
   git add package.json package-lock.json
   git commit -m "chore(release): bump version to X.Y.Z"
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
   npm view <package-name> version
   ```

## Notes

- **One release = one bump.** If a fix lands *after* a tag is created, it is NOT in
  that release. Cut a fresh version/tag for it rather than moving the tag.
- If multiple unrelated changes are in the working tree, split them into separate
  commits; only include the ones you intend to ship in this release.
- The tag must point at the `chore(release)` commit, not the fix commit, to match the
  release history (check with `git log --oneline <previous-tag>`).

## Common mistakes to avoid

❌ **Wrong**: `npm version patch` (creates its own git tag/commit that may not match the convention).
✅ **Correct**: `npm version patch --no-git-tag-version`, then commit and tag manually.

❌ **Wrong**: Editing only `package.json` by hand (leaves `package-lock.json` out of sync).
✅ **Correct**: Use `npm version` so both files update together.

❌ **Wrong**: Tagging the fix commit or a later commit.
✅ **Correct**: Tag the `chore(release): bump version to X.Y.Z` commit.

## Troubleshooting

- **`npm version` fails with "Git working directory not clean"**: it only errors when
  creating a tag; with `--no-git-tag-version` it edits files regardless. Otherwise
  commit or stash unrelated changes first.
- **Pushed the tag to the wrong commit**: delete locally and remotely, then re-tag.
  ```bash
  git tag -d vX.Y.Z
  git push origin :refs/tags/vX.Y.Z
  git tag vX.Y.Z <correct-commit>
  git push origin vX.Y.Z
  ```
- **`npm publish` rejected (version exists)**: the version was already published;
  bump again to a new patch and re-run the checklist.
