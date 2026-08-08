# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A guitar theory training web app organized as Learn → Drill → Track: a 14-lesson interactive course, an interactive circle of fifths, drill tabs (voicings, fretboard notes, intervals, progressions, Nashville numbers, scale degrees), explorer tabs (chord reference, chord zones, scales, note map), and a progress dashboard. Vanilla JS, no build step, no dependencies, no framework.

## Commands

```bash
# Run locally — use serve.py, not the stock http.server: it disables caching
# so edits always show on refresh (the stock server's heuristic caching can
# serve fresh HTML over stale JS, making new features silently misbehave)
python3 serve.py 8000              # then open http://localhost:8000

# Deploy: just push to main — GitHub Pages workflow (.github/workflows/pages.yml)
# publishes the repo root to https://kevinpaolozzi.github.io/triad-trainer/
```

There is no committed test suite. Two verification approaches that work well:

```bash
# Unit-test the theory engine: music-data.js is pure (no DOM) but uses bare
# globals with no exports — load it into a vm context:
node -e "
const vm = require('vm'), fs = require('fs');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('music-data.js', 'utf8'), ctx);
console.log(ctx.spellChord(0, 'min7').names);  // [ 'C', 'E♭', 'G', 'B♭' ]
"
# UI: drive with Playwright against the local server. App state is inspectable
# from page.evaluate() — quiz targets live in globals (quiz.target, iv.target,
# nash.target, metronome, prog), which makes deterministic quiz answers easy.
```

`node --check <file>.js` for quick syntax validation (files are ES5-style; no modules).

## Architecture

Four scripts loaded in order as globals (order matters — later files reference earlier ones):

1. **music-data.js** — pure music theory engine, zero DOM. Spelling engine (letter-walk enharmonic spelling with sharp/flat/auto preference; cost ties break toward the root nearer the center of the line of fifths, then sharps), chord/scale/pentatonic definitions (incl. sus2/sus4 and maj6/min6 — non-tertian chords need a `CHORD_STEPS` entry so letters walk correctly; `SCALE_INTERVALS` also covers harmonic/melodic minor and the modes), voicing search (closed/open/drop-2/shell; all voicing generators and `findBestVoicing` take an optional `{minFret, maxFret}` range for neck-zone constraints), notes-per-string scale patterns (`buildNpsPattern` — 3nps system / 2nps pentatonic boxes, octave-shifted to fit the neck or null), diatonic chord generation, Nashville numbers, circle-of-fifths data (`CIRCLE_OF_FIFTHS`, `keySignatureLabel`, `relativeMinorName`, `degreeFunctionName`).
2. **learn-content.js** — pure data: the `LESSONS` array for the Course tab (prose sections as HTML strings, declarative fretboard demo descriptors, practice deep-links). No DOM, no logic.
3. **fretboard.js** — `FretboardRenderer`: WebGL canvas for the board/dots plus an absolutely-positioned HTML overlay for all text labels. `setNotes()` diffs against current notes by string+fret and animates opacity; `setVoicingGroups()` draws connector lines; `setInteractive(true, cb)` maps clicks to (string, fret); `setFocusRegion(min, max)` darkens the neck outside a fret window (null clears). Colors are named keys in `NOTE_COLORS` (root/third/fifth/seventh/correct/wrong/quiz/...) — or raw `[r,g,b]` arrays (used by the Progress heatmap).
4. **app.js** — all UI. Thirteen tab panels in a grouped nav (Learn: learn/circle · Explore: reference/zones/scales/notemap · Drill: training/quiz/intervals/progressions/nashville/degrees · Track: progress), each with its own renderer instance and module-level state object. **Course (`learn`) is the landing tab** and the only panel initialized at load.

### Conventions the code depends on

- **String indexing**: 0 = low E through 5 = high e, everywhere (`STRING_TUNING` is MIDI note numbers). Display flipping happens only inside the renderer (`_displayIndex`).
- **Spelling**: never use `NOTE_NAMES`/`SHARP_NAMES` directly for display. Use `spellChord()`/`spellScale()`/`spellPentatonic()` (context-correct: C minor = C E♭ G) or `pcDisplayName()`/`pcOptionLabel()` for context-free labels. The global pref is set via `setSpellingPref()` from the Spelling dropdown.
- **Inversions are named by bass note** — including open/spread triads and drop-2 sevenths, which are *derived* from a closed shape but labeled by what's actually in the bass. Don't "fix" this back to derivation order.
- **Terminology**: 3-note spread voicings are "open (spread) triads"; "drop-2" is reserved for the 4-note seventh-chord shapes; "shells" are R-7-3 grips (root position by definition — don't add inversions to them).
- **maj6/min6 live in `SEVENTH_INTERVALS`** deliberately: that table drives all 4-note-chord logic (drop-2 shapes, inversion counts, quality-select grouping), and 6th chords need all of it.
- **Chord-symbol case matters**: never apply `text-transform: uppercase` to text containing chord labels (Cm7 would render as CM7). This bug has been fixed three times in three places.
- **Fonts**: Druk Wide (self-hosted in `Druk/`) has no ♭ ♯ ° ⁷ glyphs — those characters silently fall back mid-word. Use JetBrains Mono for any text containing accidentals or chord symbols; keep Druk for short ASCII display text.

### Recurring patterns in app.js

- **Custom selects**: `<div class="custom-select">` widgets; value lives in `dataset.value`, change handlers attach as `sel._onChange`. Rebuild options with `rebuildSelect()` (clones the node to strip listeners). The option-click handler must `preventDefault()` — the selects sit inside `<label>`s, and without it the label forwards a synthetic click to the trigger button, re-opening the dropdown.
- **Lazy panel init**: renderers are created the first time a tab is opened (`activateMode`), never at load for hidden panels — a hidden canvas has zero width and renders blank. Register new panels in `PANELS`, `activateMode`, the resize handler, and `refreshAllPanels` (which re-renders everything after a spelling/label-mode change).
- **Audio**: one shared AudioContext (`ensureAudioContext()`, created on user gesture). `playNoteSound()` is a Karplus-Strong pluck; `scheduleChordTones()` strums a voicing. Metronome-style playback uses a 25ms `setInterval` scheduler with a 100ms lookahead scheduling audio on the AudioContext clock, plus `setTimeout` aligned to each beat for the visual update.
- **Quizzes** (Note Quiz, Intervals, Nashville, Degrees, and the Circle key quiz all follow the same shape): weighted target selection via error-rate stats (`weightedPick`), stats persisted to localStorage under `triadTrainer*Stats` keys, answering flag + `nextTimeout` for auto-advance, green/red reveal on the fretboard, per-item accuracy grid.
- **Voice leading**: `voiceLeadChords()` assigns each chord in a sequence the voicing nearest the previous one (avg-fret distance + string-set-change penalty). Used by Progressions, the Nashville ear drill, and Course progression demos.
- **Course lessons**: `showLesson()` renders a `LESSONS` entry; `runLearnDemo()` interprets its declarative `board` descriptors (`pc`/`chromatic`/`interval`/`chord`/`scale`/`progression`/`pattern`/`zone`). Lesson-completion state lives in localStorage under `triadTrainerLearnDone`. Practice deep-links call `switchToMode()` (which clicks the real tab button so active states stay in sync) and then apply optional `selects` presets via `setSelectValue` + `_onChange`.
- **Progress dashboard** reads the five drill stat stores read-only (plus the per-day practice log `triadTrainerPracticeLog`, bumped by every record* function, which drives the streak line) and derives weakest items (`weakestItems`, ≥3 attempts) plus a fretboard heatmap colored by raw-RGB accuracy lerp. It must keep working when stores are empty.

## Commits

Kevin is the sole author — never add Co-Authored-By lines or generated-with footers.
