# CLAUDE.md

Instructions for Claude Code in this repository. They apply to anyone working
on mei-piano-roll with Claude; the maintainer's own session instructions load
from a private file through the import at the end.

**Current state (2026-10-07):** the repo holds a README, a LICENSE and the
docs in `docs/`. There is no code, no stack and no `package.json` yet. Decide
before building: `docs/decisions.md` lists what is open.

---

## What this project is

**mei-piano-roll** is a piano roll player for MEI (Music Encoding Initiative)
files. It loads an MEI document, shows its notes as a piano roll, and plays
them.

The core design bets:
- **MEI is the source of truth.** The roll is derived from the encoding; the
  tool never rewrites the user's file.
- **Say what the roll leaves out.** MEI encodes more than pitch and time:
  editorial marks, alternate readings, ornaments. When the roll drops or
  resolves something, that choice is documented, never silent.
- **One renderer, whatever reads the file.** However a file is parsed, the
  parser hands the renderer the same note data, so drawing and playback are
  written once.

Read `docs/decisions.md` before changing anything architectural: it is
binding, and its table lists what is still open.

**Musical and encoding questions are the maintainer's call.** How a tie, grace
note, ornament or `<choice>` appears on the roll is a music-scholarship
decision. Raise it with the options and a recommendation; don't settle it in
code.

---

## Architecture in brief

Not built yet. The planned shape, until a decision says otherwise:

- A browser app in TypeScript. The stack is open (`docs/decisions.md`).
- MEI parsing and note extraction live in their own module, with no UI, and
  are unit-tested.
- Components only draw and play what the parser returns.

---

## Working in this repo

**Write everything as if the repo were public, and treat a push as a
publication.** Anything pushed to any branch can be read and can't be taken
back: a deleted branch stays reachable through pull-request refs, forks and
clones.

1. **Work on a branch and open a pull request into `main`.** Never push to
   `main`.
2. **Ask before adding a dependency.** A dependency is a decision. Record it
   in `docs/decisions.md` with its reason.
3. **If you didn't create a file and its origin and licence aren't clear, don't
   commit it.** This covers MEI files above all: scores and encodings carry their own
   copyright. No MEI files are committed; the stress test fetches them
   (`docs/fixtures.md`).
4. **No secrets, tokens or personal email addresses** in any commit.
5. **Ask before anything destructive:** deleting files, `git reset`, anything
   that touches an outside service.

### Checks

None exist yet. When the stack is chosen, add these scripts to `package.json`,
add a CI workflow that runs them on every push and pull request, and replace
this paragraph with the real commands:

```bash
npm run lint && npm run test:run && npm run build
```

### Commit messages

Conventional Commits: `<type>(<scope>): <summary>`, then an optional body saying
why. Types: `feat`, `fix`, `refactor`, `docs`, `chore`. Scope is the area
(`parser`, `roll`, `playback`, `docs` …). Write them for a stranger reading the
history.

---

## Code style

- **Match existing patterns**; don't introduce new ones without asking.
- **Legibility over cleverness.**
- **No `any`** (once TypeScript is in): use `unknown` and narrow.
- **Comments explain why, not what.** Good: `// MEI durations are fractions of
  a whole note; convert to beats before scheduling`. Bad: `// get duration`.
- **Section dividers** in longer files: `// ── Section name ──`.

---

## Docs are part of the change

A doc that describes something the code no longer does is worse than no doc.
Docs land in the same commit as the change that invalidates them:

- every design decision gets an entry in `docs/decisions.md` with its reason;
- a behaviour change updates the README's "Status" section;
- a new source of test files updates `docs/fixtures.md`.

Before committing, grep for what the change invalidates:

```bash
grep -rn "<the identifier>" docs/ README.md CLAUDE.md
```

A historical record stays; a live instruction that is now wrong gets rewritten.

---

## Maintainer instructions

These load from the maintainer's private notes, checked out beside this repo.
In a cloud environment that holds only this repo the import below loads empty.

@../research/piano-roll/maintainer.md
