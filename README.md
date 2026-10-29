# Sauti ya Dere

A project to help drivers who are facing account suspensions develop appeal reports as a way of recourse.

## Project structure

Everyone uses this structure, on every branch.

```
sauti-ya-dere/
├── README.md      this file, the only markdown outside docs/
├── .env.example   template for local secrets (copy to .env, never commit .env)
├── docs/          all documentation
├── data/          datasets, schema, knowledge base, and the scripts that make or check them
├── web/           PWA front end (Vite + React), deployed to Cloudflare Pages
├── api/           FastAPI backend, deployed to Google Cloud Run
└── models/        classifier experiments
```

| Folder | What goes in it | What does not |
|---|---|---|
| `docs/` | Every `.md` file except this one. See [docs/README.md](docs/README.md) | |
| `data/` | Data files, the case schema, checklists and policies, and scripts that generate or validate data | Application code. Real driver data is never committed |
| `web/` | Front end code, its config and tests | Markdown files |
| `api/` | Backend code, its config, Dockerfile and tests | Markdown files |
| `models/` | Training and evaluation code for the classifiers | Model weights (gitignored), markdown files |

Adding a new top-level folder needs team agreement first.

## How we work

- Each developer works on their own branch, `dev-<name>`, and PRs finished features into `dev`.
- `dev` is merged into `main` when it is stable, usually once per sprint.
- Full details: [docs/branching.md](docs/branching.md).

## Getting started

| To work on | Read |
|---|---|
| Backend | [docs/api.md](docs/api.md) |
| Front end | [docs/web.md](docs/web.md) |
| Data | [docs/data.md](docs/data.md) |
| Models | [docs/models.md](docs/models.md) |
| Privacy rules (everyone) | [docs/privacy-and-redaction.md](docs/privacy-and-redaction.md) |
