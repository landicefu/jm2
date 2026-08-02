# Agent Guidelines

## Post-Task Workflow

After completing work on a task:

1. **Add tests** for new functionality
2. **Run tests** to ensure everything passes
   ```bash
   npm run test:run -- --reporter=dot
   ```
3. **Commit** using [Conventional Commits](#conventional-commits) format
4. **Update README.md** with any new features, commands, or changes

## Testing

Run full tests with concise output:

```bash
npm run test:run -- --reporter=dot
```

Instead of `npm run test:run` which shows verbose output.

## Conventional Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <description>

[optional body]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Example:**
```bash
git commit -m "feat(tags): add comprehensive tag management commands

- Add --tag-append and --tag-remove options to edit command
- Add jm2 tags command with list/add/rm/clear/rename/jobs subcommands
- Implement IPC handlers for tag operations"
```

## Skill Authoring Guidelines

Skills under `.claude/skills/` are committed to this repo and shared with everyone
who clones it (and may be copied to other machines), so keep them generic and portable:

- **No machine- or setup-specific content.** Don't hard-code anything tied to one
  person's environment — usernames, home directories, local absolute paths,
  personal tokens, or org-internal URLs.
- **No sensitive information** — credentials, API keys, tokens, private hostnames.
- **No real personal paths in examples.** Use placeholders such as `/path/to/project`,
  `~/…`, `<file>`, or `<package-name>` instead of real paths from your own machine.
- **Generalize project-specific details** where reasonable so the skill is reusable,
  and describe conventions rather than baking in one-off values.
- Each skill lives in `.claude/skills/<name>/SKILL.md` with YAML frontmatter whose
  `name` field matches the folder name.
