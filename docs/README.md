# Docs

Every markdown file in the project lives here, except the root `README.md`.

## Index

| Doc | What it covers |
|---|---|
| [architecture.md](architecture.md) | Pipeline, classifier benchmark, who owns what, safeguards |
| [branching.md](branching.md) | How we use `dev-<developer>`, `dev` and `main` |
| [api.md](api.md) | Backend: run locally, endpoints, deploy |
| [web.md](web.md) | PWA front end |
| [data.md](data.md) | Case schema, synthetic data, validation |
| [models.md](models.md) | Classifier experiments and results |
| [privacy-and-redaction.md](privacy-and-redaction.md) | How personal details are kept private |

## Adding a doc

- Put it directly in `docs/`.
- Name it in lowercase with hyphens: `case-schema.md`, not `caseschema.md` or `CaseSchema.md`.
- Add a line for it in the index above.
- Before writing a new doc, check whether an existing one already covers the topic, and extend that instead.
