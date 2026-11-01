# Working with branches

## Branches

| Branch | Who uses it | What it holds |
|---|---|---|
| `main` | Nobody pushes directly | Stable releases only |
| `dev` | Nobody pushes directly | Finished features, combined and tested together |
| `dev-<developer>` | One developer each, e.g. `dev-george`, `dev-violet` | Your work in progress |

## Day to day

1. Work on your own branch, `dev-<your-name>`.
2. Before you start, and before you open a PR, bring in the latest `dev`:

   ```bash
   git fetch origin
   git merge origin/dev
   ```

3. When a feature is done, push your branch and open a PR into `dev`.
4. A teammate reviews it, then it is merged.

## Releasing to main

`dev` is merged into `main` through a PR when either:

- `dev` is stable, or
- a substantial set of features is ready (usually once per sprint).

## Rules

- Never push directly to `main` or `dev`. Always go through a PR.
- Keep each PR to one feature, and put the task ID in the title (e.g. "T07 evidence checklists").
- Follow the folder structure in the [root README](../README.md).
