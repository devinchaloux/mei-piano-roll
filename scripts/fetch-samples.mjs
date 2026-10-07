// ── Fetch the MEI sample encodings for the stress test ──
//
// Downloads the MEI project's sample files (github.com/music-encoding/
// sample-encodings, Educational Community License 2.0) into fixtures/, which git
// ignores: test files are fetched, never committed (docs/decisions.md).
//
// Pinned to one commit so every run tests the same files. Only the .mei files
// of MEI 3.0, 4.0, 5.0 and 5.1 are downloaded (about 113 MB), not the PDFs or
// the older "legacy" folder; git's sparse checkout and partial clone do that
// filtering, so no extra tool is needed.
//
// Run: npm run samples   (npm run stress runs it first)

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const REPO = 'https://github.com/music-encoding/sample-encodings'
// Bump deliberately, and say why in the commit: a new commit changes what the
// stress test measures.
const COMMIT = 'f3f1baba02e32279b25dad660b82c834bac034b4'
const VERSIONS = ['MEI_3.0', 'MEI_4.0', 'MEI_5.0', 'MEI_5.1']
const DEST = join(import.meta.dirname, '..', 'fixtures', 'sample-encodings')

const git = (...args) => execFileSync('git', ['-C', DEST, ...args], { stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim()

if (existsSync(join(DEST, '.git'))) {
  let head = ''
  try { head = git('rev-parse', 'HEAD') } catch { /* an interrupted earlier fetch: carry on below */ }
  if (head === COMMIT) {
    console.log(`Samples already at ${COMMIT.slice(0, 7)}: ${DEST}`)
    process.exit(0)
  }
} else {
  mkdirSync(DEST, { recursive: true })
  git('init', '--quiet')
  git('remote', 'add', 'origin', REPO)
}

// Non-cone patterns let sparse checkout select files by name, not just folders.
git('sparse-checkout', 'set', '--no-cone', ...VERSIONS.map((v) => `/${v}/**/*.mei`))
console.log(`Fetching ${REPO} at ${COMMIT.slice(0, 7)} (MEI files only; about 113 MB)…`)
git('fetch', '--quiet', '--depth', '1', '--filter=blob:none', 'origin', COMMIT)
git('checkout', '--quiet', '--detach', 'FETCH_HEAD')
console.log(`Done: ${DEST}`)
