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
