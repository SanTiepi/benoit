# Contributing to Benoît

Welcome, and thank you for considering contributing to Benoît! Whether you're fixing a typo, improving an error message, or proposing new syntax — every contribution matters.

## Getting started

1. Fork and clone the repo
2. Run the tests to make sure everything works:

```bash
node --test tests/*.test.mjs
```

That's it. No install step, no build step.

## Project structure

Benoît's transpiler lives in a **single file**: `src/transpile.mjs` (~500 lines). If you want to understand how the language works, that's the place to look. The whole pipeline — parsing, transforming, and emitting JavaScript — happens there.

## Zero dependencies

This is a deliberate design choice. Benoît has **zero npm dependencies** and we intend to keep it that way. Please do not add external packages in your pull requests.

## How to contribute

Here are some great ways to get involved:

- **New syntax features** — Have an idea for a Benoît keyword or construct? Open an issue to discuss it first, then submit a PR.
- **Better error messages** — When transpilation fails, the errors could be much more helpful. This is a great area for first-time contributors.
- **VSCode extension** — Syntax highlighting and snippets for `.ben` files would make the developer experience much better.
- **More examples** — Add programs to the `examples/` folder. Classic algorithms, small projects, anything that shows off the language.

## Submitting a pull request

1. Create a branch from `main`
2. Make your changes
3. Make sure all tests pass: `node --test tests/*.test.mjs`
4. Add tests for any new syntax or behavior
5. Open a pull request with a clear description of what you changed and why

## First time contributing to open source?

No worries at all. Check out the issues labeled **"good first issue"** — they're specifically picked to be approachable. If you get stuck, open a discussion or comment on the issue. We're happy to help.

## Code of conduct

Be kind, be respectful. We're all here to build something fun together.
