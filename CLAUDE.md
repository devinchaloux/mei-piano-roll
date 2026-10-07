# CLAUDE.md

Instructions for Claude Code in this repository.

**Current state (2026-10-07):** the repo holds only a README, a LICENSE and a
`.gitignore`. No code, no stack and no `package.json` exist yet. The first
session's job is to settle the open decisions in `docs/decisions.md` and build
the first working slice. Until then, don't invent tooling that isn't there.

---

## What this project is

**mei-piano-roll** is a piano roll player for MEI (Music Encoding Initiative)
files: it loads an MEI document, shows its notes as a piano roll, and (if the
decision log says so) plays them.

The core design bets:
- **MEI is the source of truth.** The roll is derived from the encoding; the
  tool never rewrites the user's file.
- **Say what the roll leaves out.** MEI encodes more than pitch and time
  (editorial marks, alternate readings, ornaments). When the roll drops or
  resolves something, that choice is documented, not silent.

Read `docs/decisions.md` before changing anything architectural.

**Musical and encoding questions are the maintainer's call.** How a tie, grace
note, ornament or `<choice>` should appear on the roll is a music-scholarship
decision. Raise it with the options and a recommendation; don't settle it in
code.

---

## Working in this repo

**Treat every push as a publication.** The repo may be public, so anything
pushed to any branch can't be taken back.

1. **Work on a branch and open a pull request into `main`.** Never push to
   `main`; the maintainer merges.
2. **Ask before adding a dependency.** A dependency is a decision. Record it in
   `docs/decisions.md` with its reason.
3. **If you didn't create a file and its origin and licence aren't clear, don't
   commit it.** This covers sample MEI files above all: scores have copyright
   too. Fixtures need a stated source and licence in `docs/fixtures.md`.
4. **No secrets, tokens or personal email addresses** in any commit.
5. **Ask before anything destructive:** deleting files, `git reset`, anything
   that touches an outside service.

### Checks

No checks exist yet. When the stack is chosen, add the scripts below to
`package.json` (names match the maintainer's other projects), add a CI
workflow that runs them, and replace this paragraph with the real commands:

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
- **TypeScript, if that is the chosen stack.** No `any`: use `unknown` and
  narrow.
- **Comments explain why, not what.** Good: `// MEI durations are in
  fractions of a whole note; convert before scheduling`. Bad: `// get duration`.
- **Pure logic apart from UI.** MEI parsing and note extraction live in their
  own module and are unit-tested; components only draw.
- **Section dividers** in longer files: `// ── Section name ──`.

---

## Working with the maintainer

The maintainer is a music scholar and solo developer who reads code
comfortably but doesn't write much of it. So:

- **Explain your reasoning in plain English** before and after substantive
  changes: why the approach works, not what the diff shows.
- **Don't guess.** When something is ambiguous, say what you found, offer a
  best guess framed as a guess, and wait.
- **Summaries:** bottom line first (what happened, whether anything blocks),
  then a numbered list of next actions with rough time costs, then detail under
  its own heading.

---

## Docs are part of the change

A doc that describes something the code no longer does is worse than no doc.
Docs land in the same commit as the change that invalidates them:

- a design decision gets an entry in `docs/decisions.md` with its reason;
- a behaviour change updates the README's "Status" section;
- a new fixture updates `docs/fixtures.md`.

Before committing, grep for what the change invalidates:

```bash
grep -rn "<the identifier>" docs/ README.md CLAUDE.md
```

A historical record stays; a live instruction that is now wrong gets rewritten.
