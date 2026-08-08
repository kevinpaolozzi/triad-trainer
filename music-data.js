// music-data.js — Data & Computation Layer

var SHARP_NAMES = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
var FLAT_NAMES  = ['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];

// Kept for backwards compatibility; prefer the spelling engine below.
var NOTE_NAMES = SHARP_NAMES;

// Open string MIDI notes: index 0 = string 6 (low E) through index 5 = string 1 (high E)
var STRING_TUNING = [40, 45, 50, 55, 59, 64];

// String set indices into STRING_TUNING
var STRING_SETS = [[0,1,2], [1,2,3], [2,3,4], [3,4,5]];
var STRING_SET_LABELS = ['6-5-4', '5-4-3', '4-3-2', '3-2-1'];

// Open (spread) triad string sets, derived from closed sets by dropping the
// middle voice an octave. (Often loosely called "drop" voicings; the standard
// term drop-2 applies to four-note chords, so we call these open triads.)
// Closed [1,2,3] (5-4-3) → Open [0,2,3] (6-4-3)
// Closed [2,3,4] (4-3-2) → Open [1,3,4] (5-3-2)
// Closed [3,4,5] (3-2-1) → Open [2,4,5] (4-2-1)
var OPEN_STRING_SETS = [[0,2,3], [1,3,4], [2,4,5]];
var OPEN_STRING_SET_LABELS = ['6-4-3', '5-3-2', '4-2-1'];

// Four consecutive strings, for drop-2 seventh chords
var FOUR_STRING_SETS = [[0,1,2,3], [1,2,3,4], [2,3,4,5]];
var FOUR_STRING_SET_LABELS = ['6-5-4-3', '5-4-3-2', '4-3-2-1'];

var TRIAD_INTERVALS = {
    major: [0, 4, 7],
    minor: [0, 3, 7],
    dim:   [0, 3, 6],
    aug:   [0, 4, 8],
    sus2:  [0, 2, 7],
    sus4:  [0, 5, 7]
};

// Four-note chords. maj6/min6 are 6th chords, not sevenths, but they live here
// because this table drives all "4-note chord" logic (drop-2 shapes, inversion
// counts, quality-select grouping).
var SEVENTH_INTERVALS = {
    maj7: [0, 4, 7, 11],
    min7: [0, 3, 7, 10],
    dom7: [0, 4, 7, 10],
    m7b5: [0, 3, 6, 10],
    maj6: [0, 4, 7, 9],
    min6: [0, 3, 7, 9]
};

// Unified lookup: any chord quality → intervals
var CHORD_INTERVALS = {};
(function() {
    for (var k in TRIAD_INTERVALS) CHORD_INTERVALS[k] = TRIAD_INTERVALS[k];
    for (var k in SEVENTH_INTERVALS) CHORD_INTERVALS[k] = SEVENTH_INTERVALS[k];
})();

var TRIAD_INTERVAL_LABELS = {
    major: ['R', '3', '5'],
    minor: ['R', '♭3', '5'],
    dim:   ['R', '♭3', '♭5'],
    aug:   ['R', '3', '♯5'],
    sus2:  ['R', '2', '5'],
    sus4:  ['R', '4', '5']
};

var CHORD_INTERVAL_LABELS = {
    major: TRIAD_INTERVAL_LABELS.major,
    minor: TRIAD_INTERVAL_LABELS.minor,
    dim:   TRIAD_INTERVAL_LABELS.dim,
    aug:   TRIAD_INTERVAL_LABELS.aug,
    sus2:  TRIAD_INTERVAL_LABELS.sus2,
    sus4:  TRIAD_INTERVAL_LABELS.sus4,
    maj7:  ['R', '3', '5', '7'],
    min7:  ['R', '♭3', '5', '♭7'],
    dom7:  ['R', '3', '5', '♭7'],
    m7b5:  ['R', '♭3', '♭5', '♭7'],
    maj6:  ['R', '3', '5', '6'],
    min6:  ['R', '♭3', '5', '6']
};

var CHORD_SUFFIX = {
    major: '', minor: 'm', dim: '°', aug: '+',
    sus2: 'sus2', sus4: 'sus4',
    maj7: 'maj7', min7: 'm7', dom7: '7', m7b5: 'm7♭5',
    maj6: '6', min6: 'm6'
};

// Letter steps from the root letter for each chord degree. Default is stacked
// thirds ([0,2,4] / [0,2,4,6]); anything built differently needs an override
// so the spelling engine walks the right letters (Csus2 = C D G, not C E♭♭ G).
var CHORD_STEPS = {
    sus2: [0, 1, 4],
    sus4: [0, 3, 4],
    maj6: [0, 2, 4, 5],
    min6: [0, 2, 4, 5]
};

var INVERSION_NAMES = ['Root position', '1st inversion', '2nd inversion', '3rd inversion'];

// Interval vocabulary (ascending, in semitones)
var INTERVAL_TYPES = [
    { semi: 1,  short: 'm2', name: 'Minor 2nd' },
    { semi: 2,  short: 'M2', name: 'Major 2nd' },
    { semi: 3,  short: 'm3', name: 'Minor 3rd' },
    { semi: 4,  short: 'M3', name: 'Major 3rd' },
    { semi: 5,  short: 'P4', name: 'Perfect 4th' },
    { semi: 6,  short: 'TT', name: 'Tritone' },
    { semi: 7,  short: 'P5', name: 'Perfect 5th' },
    { semi: 8,  short: 'm6', name: 'Minor 6th' },
    { semi: 9,  short: 'M6', name: 'Major 6th' },
    { semi: 10, short: 'm7', name: 'Minor 7th' },
    { semi: 11, short: 'M7', name: 'Major 7th' },
    { semi: 12, short: 'P8', name: 'Octave' }
];

function intervalTypeBySemi(semi) {
    for (var i = 0; i < INTERVAL_TYPES.length; i++) {
        if (INTERVAL_TYPES[i].semi === semi) return INTERVAL_TYPES[i];
    }
    return null;
}

// ===================== Enharmonic Spelling Engine =====================
//
// Spells chords and scales with correct letter names (C minor = C E♭ G,
// not C D♯ G). Each chord/scale degree gets its own letter; the accidental
// is whatever makes that letter land on the right pitch class.

var LETTERS = ['C','D','E','F','G','A','B'];
var LETTER_PCS = [0, 2, 4, 5, 7, 9, 11];
// Line-of-fifths position of each natural letter (F=-1, C=0, G=1, ...);
// each sharp adds +7, each flat -7. Distance from 0 ≈ how exotic the key is.
var LETTER_LOF = [0, 2, 4, -1, 1, 3, 5];

// 'auto' picks the spelling with fewest accidentals; 'sharp'/'flat' force
// the root spelling (still falling back if it would create double accidentals).
var spellingPref = 'auto';

function setSpellingPref(pref) {
    spellingPref = pref;
}

function accidentalMark(offset) {
    if (offset === 0) return '';
    if (offset === 1) return '♯';
    if (offset === 2) return '♯♯';
    if (offset === -1) return '♭';
    if (offset === -2) return '♭♭';
    return null; // beyond double accidentals — not a usable spelling
}

// Spell pitch class `pc` using letter index `li`. Returns {name, cost} or null.
function spellWithLetter(li, pc) {
    var diff = (pc - LETTER_PCS[li] + 12) % 12;
    if (diff > 6) diff -= 12;
    var mark = accidentalMark(diff);
    if (mark === null) return null;
    // Doubles cost 4 so 'auto' strongly avoids them; singles cost 1.
    return { name: LETTERS[li] + mark, letterIndex: li, cost: diff === 0 ? 0 : (Math.abs(diff) === 1 ? 1 : 4) };
}

// Candidate letter indices that can spell `pc` with at most a single accidental.
function rootLetterCandidates(pc) {
    var out = [];
    for (var li = 0; li < 7; li++) {
        var diff = (pc - LETTER_PCS[li] + 12) % 12;
        if (diff > 6) diff -= 12;
        if (Math.abs(diff) <= 1) out.push({ letterIndex: li, offset: diff });
    }
    return out;
}

// Spell a sequence of intervals above a root, one letter per degree step.
// intervals: semitones from root. steps: letter steps from the root letter
// (triad = [0,2,4], 7-note scale = [0..6]).
function spellSequenceFrom(rootPc, rootLetterIndex, intervals, steps) {
    var notes = [];
    var totalCost = 0;
    for (var i = 0; i < intervals.length; i++) {
        var pc = (rootPc + intervals[i]) % 12;
        var li = (rootLetterIndex + steps[i]) % 7;
        var s = spellWithLetter(li, pc);
        if (!s) return null;
        notes.push({ pc: pc, name: s.name });
        totalCost += s.cost;
    }
    return { notes: notes, cost: totalCost };
}

// Choose the best root letter for a set of intervals, honoring spellingPref.
function spellIntervals(rootPc, intervals, steps) {
    var candidates = rootLetterCandidates(rootPc);
    var spelled = [];
    for (var i = 0; i < candidates.length; i++) {
        var seq = spellSequenceFrom(rootPc, candidates[i].letterIndex, intervals, steps);
        if (seq) spelled.push({
            offset: candidates[i].offset,
            lof: LETTER_LOF[candidates[i].letterIndex] + 7 * candidates[i].offset,
            seq: seq
        });
    }
    if (spelled.length === 0) return null;

    // Sort by total accidental cost; break ties by preferring the root whose
    // major key is closer to the center of the line of fifths (E♭sus4, not
    // D♯sus4 — E♭ is a real key), then by sharps (guitar convention: F♯ > G♭).
    spelled.sort(function(a, b) {
        if (a.seq.cost !== b.seq.cost) return a.seq.cost - b.seq.cost;
        if (Math.abs(a.lof) !== Math.abs(b.lof)) return Math.abs(a.lof) - Math.abs(b.lof);
        return b.offset - a.offset;
    });

    if (spellingPref !== 'auto') {
        var want = spellingPref === 'sharp' ? 1 : -1;
        for (var j = 0; j < spelled.length; j++) {
            // Only honor the forced spelling if it avoids double accidentals
            // (D♯ major = D♯ F𝄪 A♯ — nobody wants that; auto gives E♭).
            if ((spelled[j].offset === want || spelled[j].offset === 0) && spelled[j].seq.cost < 4) {
                return spelled[j].seq;
            }
        }
    }
    return spelled[0].seq;
}

function defaultSteps(count) {
    var steps = [];
    for (var i = 0; i < count; i++) steps.push(i);
    return steps;
}

// Spell any chord (triad or seventh). Returns { names, rootName, map: {pc: name} }.
function spellChord(rootPc, quality) {
    var intervals = CHORD_INTERVALS[quality];
    var steps = CHORD_STEPS[quality] || (intervals.length === 4 ? [0, 2, 4, 6] : [0, 2, 4]);
    var seq = spellIntervals(rootPc, intervals, steps);
    var names = seq.notes.map(function(n) { return n.name; });
    var map = {};
    for (var i = 0; i < seq.notes.length; i++) map[seq.notes[i].pc] = seq.notes[i].name;
    return { names: names, rootName: names[0], map: map };
}

// Back-compat alias
function spellTriad(rootPc, quality) {
    return spellChord(rootPc, quality);
}

// Spell a scale. Returns { names: [...], map: {pc: name} }.
function spellScale(rootPc, scaleType) {
    var intervals = SCALE_INTERVALS[scaleType];
    var seq = spellIntervals(rootPc, intervals, defaultSteps(intervals.length));
    var names = seq.notes.map(function(n) { return n.name; });
    var map = {};
    for (var i = 0; i < seq.notes.length; i++) map[seq.notes[i].pc] = seq.notes[i].name;
    return { names: names, map: map };
}

// Pentatonics are subsets of the major / natural minor scale — reuse that spelling.
var PENTATONIC_PARENT_DEGREES = {
    major: [0, 1, 2, 4, 5],   // 1 2 3 5 6 of major
    minor: [0, 2, 3, 4, 6]    // 1 ♭3 4 5 ♭7 of natural minor
};

function spellPentatonic(rootPc, pentType) {
    var parent = spellScale(rootPc, pentType);
    var degrees = PENTATONIC_PARENT_DEGREES[pentType];
    var names = [];
    var map = {};
    for (var i = 0; i < degrees.length; i++) {
        var name = parent.names[degrees[i]];
        var pc = (rootPc + SCALE_INTERVALS[pentType][degrees[i]]) % 12;
        names.push(name);
        map[pc] = name;
    }
    return { names: names, map: map };
}

// Best standalone name for a pitch class (no chord context) — used for
// chromatic labels, quiz prompts, etc. Honors spellingPref; 'auto' → sharps.
function pcDisplayName(pc) {
    return spellingPref === 'flat' ? FLAT_NAMES[pc] : SHARP_NAMES[pc];
}

// Both spellings for UI option labels: "C♯ / D♭", or just "C" for naturals.
function pcOptionLabel(pc) {
    if (SHARP_NAMES[pc] === FLAT_NAMES[pc]) return SHARP_NAMES[pc];
    return SHARP_NAMES[pc] + ' / ' + FLAT_NAMES[pc];
}

// ===================== Triads & Voicings =====================

function getTriadNotes(rootIndex, quality) {
    var intervals = TRIAD_INTERVALS[quality];
    return intervals.map(function(i) { return (rootIndex + i) % 12; });
}

function getChordNotes(rootIndex, quality) {
    return CHORD_INTERVALS[quality].map(function(i) { return (rootIndex + i) % 12; });
}

function invertTriad(pitchClasses, inversion) {
    var result = pitchClasses.slice();
    for (var i = 0; i < inversion; i++) {
        result.push(result.shift());
    }
    return result;
}

// Search all fret combinations (0-15) putting pitchClasses[i] on stringSet[i],
// minimizing span, then max fret. Works for any chord size.
// opts.requireAscending: only accept voicings whose MIDI pitches strictly rise
// from low string to high (true spread/drop shapes).
// opts.minFret/maxFret: constrain the search to a fret window (neck zones).
function findBestVoicing(pitchClasses, stringSet, opts) {
    opts = opts || {};
    var loFret = opts.minFret || 0;
    var hiFret = opts.maxFret !== undefined ? opts.maxFret : 15;
    var options = pitchClasses.map(function(pc, i) {
        var openNote = STRING_TUNING[stringSet[i]];
        var frets = [];
        for (var f = loFret; f <= hiFret; f++) {
            if ((openNote + f) % 12 === pc) {
                frets.push(f);
            }
        }
        return frets;
    });

    var bestVoicing = null;
    var bestSpan = Infinity;
    var bestMaxFret = Infinity;
    var combo = [];

    function consider() {
        if (opts.requireAscending) {
            for (var i = 1; i < combo.length; i++) {
                var prev = STRING_TUNING[stringSet[i - 1]] + combo[i - 1];
                var cur = STRING_TUNING[stringSet[i]] + combo[i];
                if (cur <= prev) return;
            }
        }
        var span = Math.max.apply(null, combo) - Math.min.apply(null, combo);
        var maxFret = Math.max.apply(null, combo);
        if (span < bestSpan || (span === bestSpan && maxFret < bestMaxFret)) {
            bestSpan = span;
            bestMaxFret = maxFret;
            bestVoicing = combo.slice();
        }
    }

    function rec(i) {
        if (i === options.length) { consider(); return; }
        for (var k = 0; k < options[i].length; k++) {
            combo.push(options[i][k]);
            rec(i + 1);
            combo.pop();
        }
    }
    rec(0);

    if (!bestVoicing) return null;
    if (opts.maxSpan !== undefined && bestSpan > opts.maxSpan) return null;

    return bestVoicing.map(function(fret, i) {
        return { string: stringSet[i], fret: fret };
    });
}

function findAllVoicings(pitchClasses, stringSet) {
    var options = pitchClasses.map(function(pc, i) {
        var openNote = STRING_TUNING[stringSet[i]];
        var frets = [];
        for (var f = 0; f <= 15; f++) {
            if ((openNote + f) % 12 === pc) frets.push(f);
        }
        return frets;
    });

    // 4-fret span is the realistic playable limit for triads.
    // Shapes repeating above the 12th fret are kept intentionally — seeing
    // the neck repeat at fret 12 is part of learning it.
    var MAX_SPAN = 4;
    var results = [];

    for (var a = 0; a < options[0].length; a++) {
        for (var b = 0; b < options[1].length; b++) {
            for (var c = 0; c < options[2].length; c++) {
                var frets = [options[0][a], options[1][b], options[2][c]];
                var span = Math.max.apply(null, frets) - Math.min.apply(null, frets);
                if (span <= MAX_SPAN) {
                    results.push(frets.map(function(fret, i) {
                        return { string: stringSet[i], fret: fret };
                    }));
                }
            }
        }
    }

    return results;
}

// range (optional): {minFret, maxFret} restricts all searches to a neck zone.
function getAllVoicingsForChord(rootIndex, quality, range) {
    range = range || {};
    var results = [];
    var seen = {};
    for (var si = 0; si < STRING_SETS.length; si++) {
        for (var inv = 0; inv < 3; inv++) {
            var stringSet = STRING_SETS[si];
            var triadNotes = getTriadNotes(rootIndex, quality);
            var inverted = invertTriad(triadNotes, inv);
            var voicing = findBestVoicing(inverted, stringSet, { minFret: range.minFret, maxFret: range.maxFret });
            if (voicing) {
                // Augmented triads are symmetric — different inversions can land
                // on the identical shape. Dedupe by string set + exact frets.
                var key = si + '|' + voicing.map(function(p) { return p.fret; }).join(',');
                if (seen[key]) continue;
                seen[key] = true;
                results.push({
                    voicing: voicing,
                    inversion: inv,
                    stringSetIndex: si,
                    stringSet: stringSet
                });
            }
        }
    }
    return results;
}

function getOpenVoicingsForChord(rootIndex, quality, range) {
    range = range || {};
    var results = [];
    var seen = {};
    var triadNotes = getTriadNotes(rootIndex, quality); // [R, 3, 5]

    for (var si = 0; si < OPEN_STRING_SETS.length; si++) {
        var openSet = OPEN_STRING_SETS[si];
        for (var inv = 0; inv < 3; inv++) {
            var inverted = invertTriad(triadNotes, inv);
            // Open (spread) triad: the middle voice of the closed shape drops
            // an octave and becomes the new bass.
            // Reorder pitch classes: [low, mid, high] → [mid, low, high]
            var spreadPCs = [inverted[1], inverted[0], inverted[2]];
            var voicing = findBestVoicing(spreadPCs, openSet, { requireAscending: true, minFret: range.minFret, maxFret: range.maxFret });
            if (voicing) {
                // Inversions are named by the bass note, not by the closed
                // shape they were derived from: bass = root → root position,
                // bass = 3rd → 1st inversion, bass = 5th → 2nd inversion.
                var bassInversion = triadNotes.indexOf(spreadPCs[0]);
                var key = si + '|' + voicing.map(function(p) { return p.fret; }).join(',');
                if (seen[key]) continue;
                seen[key] = true;
                results.push({
                    voicing: voicing,
                    inversion: bassInversion,
                    stringSetIndex: si,
                    stringSet: openSet
                });
            }
        }
    }
    return results;
}

// Drop-2 seventh chords: take a close-position seventh chord and drop the
// second voice from the top an octave. Close [a,b,c,d] (ascending) becomes
// [c,a,b,d] — the classic playable 7th-chord shapes on 4 adjacent strings.
// This is where the term "drop-2" actually belongs (4-note chords).
function getDrop2SeventhVoicingsForChord(rootIndex, quality, range) {
    range = range || {};
    var results = [];
    var seen = {};
    var chordNotes = getChordNotes(rootIndex, quality); // [R, 3, 5, 7]

    for (var si = 0; si < FOUR_STRING_SETS.length; si++) {
        var set = FOUR_STRING_SETS[si];
        for (var inv = 0; inv < 4; inv++) {
            var close = invertTriad(chordNotes, inv); // rotation works for any size
            var drop2 = [close[2], close[0], close[1], close[3]];
            var voicing = findBestVoicing(drop2, set, { requireAscending: true, maxSpan: 5, minFret: range.minFret, maxFret: range.maxFret });
            if (voicing) {
                // Inversion named by bass note: R/3/5/7 in the bass
                var bassInversion = chordNotes.indexOf(drop2[0]);
                var key = si + '|' + voicing.map(function(p) { return p.fret; }).join(',');
                if (seen[key]) continue;
                seen[key] = true;
                results.push({
                    voicing: voicing,
                    inversion: bassInversion,
                    stringSetIndex: si,
                    stringSet: set
                });
            }
        }
    }
    return results;
}

// Shell voicings: root + 3rd + 7th (the 5th is omitted — it adds nothing to
// the quality). The two classic jazz grips: root on the 6th string with 7th
// and 3rd on strings 4-3, or root on the 5th string with 7th and 3rd on 3-2.
// Root position by definition — shells are named grips, not an inversion set.
var SHELL_STRING_SETS = [[0, 2, 3], [1, 3, 4]];
var SHELL_STRING_SET_LABELS = ['6-4-3', '5-3-2'];

function getShellVoicingsForChord(rootIndex, quality, range) {
    range = range || {};
    var intervals = CHORD_INTERVALS[quality];
    if (!intervals || intervals.length < 4) return [];
    // Voices low to high: R, 7th, 3rd
    var pcs = [
        rootIndex % 12,
        (rootIndex + intervals[3]) % 12,
        (rootIndex + intervals[1]) % 12
    ];
    var results = [];
    for (var si = 0; si < SHELL_STRING_SETS.length; si++) {
        var voicing = findBestVoicing(pcs, SHELL_STRING_SETS[si], { requireAscending: true, maxSpan: 4, minFret: range.minFret, maxFret: range.maxFret });
        if (voicing) {
            results.push({
                voicing: voicing,
                inversion: 0,
                stringSetIndex: si,
                stringSet: SHELL_STRING_SETS[si]
            });
        }
    }
    return results;
}

// ===================== Scales =====================

var SCALE_INTERVALS = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    dim:   [0, 1, 3, 5, 6, 8, 10],   // Locrian mode
    aug:   [0, 2, 4, 6, 8, 10],      // whole-tone scale
    harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
    melodicMinor:  [0, 2, 3, 5, 7, 9, 11],  // ascending form (jazz minor)
    dorian:     [0, 2, 3, 5, 7, 9, 10],
    phrygian:   [0, 1, 3, 5, 7, 8, 10],
    lydian:     [0, 2, 4, 6, 7, 9, 11],
    mixolydian: [0, 2, 4, 5, 7, 9, 10]
};

// Honest display names — the "dim scale" here is Locrian, "aug" is whole-tone.
var SCALE_DISPLAY_NAMES = {
    major: 'Major scale',
    minor: 'Natural minor scale',
    dim:   'Locrian mode',
    aug:   'Whole-tone scale',
    harmonicMinor: 'Harmonic minor scale',
    melodicMinor:  'Melodic minor scale',
    dorian:     'Dorian mode',
    phrygian:   'Phrygian mode',
    lydian:     'Lydian mode',
    mixolydian: 'Mixolydian mode'
};

function getScaleNotes(rootIndex, quality) {
    return SCALE_INTERVALS[quality].map(function(i) {
        return (rootIndex + i) % 12;
    });
}

var PENTATONIC_INTERVALS = {
    major: [0, 2, 4, 7, 9],
    minor: [0, 3, 5, 7, 10]
};

function getPentatonicNotes(rootIndex, pentatonicType) {
    return PENTATONIC_INTERVALS[pentatonicType].map(function(i) {
        return (rootIndex + i) % 12;
    });
}

function getScaleTriads(rootIndex, scaleQuality) {
    var scaleIntervals = SCALE_INTERVALS[scaleQuality];
    if (!scaleIntervals || scaleIntervals.length !== 7) return null;

    var ROMAN = ['I','II','III','IV','V','VI','VII'];
    var spelledScale = spellScale(rootIndex, scaleQuality);
    var triads = [];

    for (var d = 0; d < 7; d++) {
        var i1 = scaleIntervals[d];
        var i3 = scaleIntervals[(d + 2) % 7];
        var i5 = scaleIntervals[(d + 4) % 7];

        // Semitones from this degree's root to its 3rd and 5th (mod 12)
        var sem3 = (i3 - i1 + 12) % 12;
        var sem5 = (i5 - i1 + 12) % 12;

        var quality;
        if (sem3 === 4 && sem5 === 7) quality = 'major';
        else if (sem3 === 3 && sem5 === 7) quality = 'minor';
        else if (sem3 === 3 && sem5 === 6) quality = 'dim';
        else if (sem3 === 4 && sem5 === 8) quality = 'aug';
        else quality = 'major';

        var root = (rootIndex + i1) % 12;
        var rootName = spelledScale.names[d];
        var label = rootName;
        var numeral = ROMAN[d];

        if (quality === 'minor') {
            label += 'm';
            numeral = numeral.toLowerCase();
        } else if (quality === 'dim') {
            label += '°';
            numeral = numeral.toLowerCase() + '°';
        } else if (quality === 'aug') {
            label += '+';
            numeral += '+';
        }

        triads.push({
            degree: d,
            root: root,
            rootName: rootName,
            quality: quality,
            label: label,
            numeral: numeral
        });
    }

    return triads;
}

// ===================== Notes-per-string patterns =====================

// Lay a scale across all six strings with a fixed number of notes per string
// (3nps is the standard modern system for 7-note scales; 2nps gives the
// classic pentatonic boxes). startDegree picks which scale degree the pattern
// begins on (low E string). The pattern is shifted by whole octaves to fit
// frets 0-15; returns null if no octave placement fits.
// Returns { positions: [{string, fret, pc, degree}], minFret, maxFret }.
function buildNpsPattern(rootPc, intervals, notesPerString, startDegree) {
    var n = intervals.length;
    var startPc = (rootPc + intervals[startDegree]) % 12;
    // Lowest occurrence of the start pc at or above the open low E
    var midi = STRING_TUNING[0] + ((startPc - STRING_TUNING[0] % 12) + 12) % 12;
    var deg = startDegree;
    var positions = [];
    for (var s = 0; s < 6; s++) {
        for (var k = 0; k < notesPerString; k++) {
            positions.push({ string: s, fret: midi - STRING_TUNING[s], pc: midi % 12, degree: deg });
            var next = (deg + 1) % n;
            midi += (intervals[next] - intervals[deg] + 12) % 12;
            deg = next;
        }
    }
    var minFret = Infinity, maxFret = -Infinity;
    for (var i = 0; i < positions.length; i++) {
        if (positions[i].fret < minFret) minFret = positions[i].fret;
        if (positions[i].fret > maxFret) maxFret = positions[i].fret;
    }
    var shift = 0;
    while (minFret + shift < 0) shift += 12;
    while (maxFret + shift > 15 && minFret + shift - 12 >= 0) shift -= 12;
    if (minFret + shift < 0 || maxFret + shift > 15) return null;
    for (var i = 0; i < positions.length; i++) positions[i].fret += shift;
    return { positions: positions, minFret: minFret + shift, maxFret: maxFret + shift, startDegree: startDegree };
}

// ===================== Circle of Fifths =====================

// Clockwise from C. sig: positive = sharps, negative = flats. F♯/G♭ is the
// enharmonic seam (6 sharps = 6 flats). Major key names are fixed spellings
// (concert-key convention), not subject to the spelling pref.
var CIRCLE_OF_FIFTHS = [
    { pc: 0,  major: 'C',        sig: 0 },
    { pc: 7,  major: 'G',        sig: 1 },
    { pc: 2,  major: 'D',        sig: 2 },
    { pc: 9,  major: 'A',        sig: 3 },
    { pc: 4,  major: 'E',        sig: 4 },
    { pc: 11, major: 'B',        sig: 5 },
    { pc: 6,  major: 'F♯ / G♭',  sig: 6 },
    { pc: 1,  major: 'D♭',       sig: -5 },
    { pc: 8,  major: 'A♭',       sig: -4 },
    { pc: 3,  major: 'E♭',       sig: -3 },
    { pc: 10, major: 'B♭',       sig: -2 },
    { pc: 5,  major: 'F',        sig: -1 }
];

// Accidentals appear in a fixed order as keys add them
var SHARP_ORDER = ['F♯', 'C♯', 'G♯', 'D♯', 'A♯', 'E♯', 'B♯'];
var FLAT_ORDER  = ['B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'C♭', 'F♭'];

function keySignatureLabel(sig) {
    if (sig === 0) return 'no sharps or flats';
    var n = Math.abs(sig);
    var list = (sig > 0 ? SHARP_ORDER : FLAT_ORDER).slice(0, n).join(' ');
    return n + (sig > 0 ? ' sharp' : ' flat') + (n > 1 ? 's' : '') + ': ' + list;
}

// Relative minor of a major key, spelled from that key's own scale (degree 6)
function relativeMinorName(majorPc) {
    return spellScale(majorPc, 'major').names[5];
}

// Classical degree-function names. The 7th differs by scale: a half step
// below the tonic it's the leading tone; a whole step below, the subtonic.
function degreeFunctionName(degree, scaleType) {
    var names = ['Tonic', 'Supertonic', 'Mediant', 'Subdominant', 'Dominant', 'Submediant', 'Leading tone'];
    if (degree === 6 && SCALE_INTERVALS[scaleType][6] === 10) return 'Subtonic';
    return names[degree];
}

// Nashville numbers: chords as scale-degree numbers, always relative to the
// MAJOR scale of the key center. Minor chords get '-', diminished '°'.
// In minor keys the lowered degrees are written with flats (♭3, ♭6, ♭7) —
// standard Nashville practice. Seventh extensions use superscript ⁷.
function getNashvilleNumber(degree, scaleType, quality) {
    var flat = SCALE_INTERVALS[scaleType][degree] < SCALE_INTERVALS.major[degree] ? '♭' : '';
    var num = degree + 1;
    var suffix = '';
    if (quality === 'minor') suffix = '-';
    else if (quality === 'dim') suffix = '°';
    else if (quality === 'aug') suffix = '+';
    else if (quality === 'min7') suffix = '-⁷';
    else if (quality === 'dom7') suffix = '⁷';
    else if (quality === 'maj7') suffix = 'Δ⁷';
    else if (quality === 'm7b5') suffix = 'ø⁷';
    return flat + num + suffix;
}

// Diatonic seventh chords of a 7-note scale (major / natural minor).
function getScaleSevenths(rootIndex, scaleQuality) {
    var scaleIntervals = SCALE_INTERVALS[scaleQuality];
    if (!scaleIntervals || scaleIntervals.length !== 7) return null;

    var ROMAN = ['I','II','III','IV','V','VI','VII'];
    var spelledScale = spellScale(rootIndex, scaleQuality);
    var chords = [];

    for (var d = 0; d < 7; d++) {
        var i1 = scaleIntervals[d];
        var sem3 = (scaleIntervals[(d + 2) % 7] - i1 + 12) % 12;
        var sem5 = (scaleIntervals[(d + 4) % 7] - i1 + 12) % 12;
        var sem7 = (scaleIntervals[(d + 6) % 7] - i1 + 12) % 12;

        var quality;
        if (sem3 === 4 && sem5 === 7 && sem7 === 11) quality = 'maj7';
        else if (sem3 === 3 && sem5 === 7 && sem7 === 10) quality = 'min7';
        else if (sem3 === 4 && sem5 === 7 && sem7 === 10) quality = 'dom7';
        else if (sem3 === 3 && sem5 === 6 && sem7 === 10) quality = 'm7b5';
        else quality = 'maj7';

        var root = (rootIndex + i1) % 12;
        var rootName = spelledScale.names[d];
        var numeral;
        if (quality === 'maj7') numeral = ROMAN[d] + 'maj7';
        else if (quality === 'min7') numeral = ROMAN[d].toLowerCase() + '7';
        else if (quality === 'dom7') numeral = ROMAN[d] + '7';
        else numeral = ROMAN[d].toLowerCase() + 'ø7';

        chords.push({
            degree: d,
            root: root,
            rootName: rootName,
            quality: quality,
            label: rootName + CHORD_SUFFIX[quality],
            numeral: numeral
        });
    }

    return chords;
}
