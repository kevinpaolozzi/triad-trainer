// music-data.js — Data & Computation Layer

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

// Open string MIDI notes: index 0 = string 6 (low E) through index 5 = string 1 (high E)
const STRING_TUNING = [40, 45, 50, 55, 59, 64];

// String set indices into STRING_TUNING
const STRING_SETS = [[0,1,2], [1,2,3], [2,3,4], [3,4,5]];
const STRING_SET_LABELS = ['6-5-4', '5-4-3', '4-3-2', '3-2-1'];

// Drop-2 open voicing string sets (derived from closed sets by dropping middle note an octave)
// Closed [1,2,3] (5-4-3) → Open [0,2,3] (6-4-3)
// Closed [2,3,4] (4-3-2) → Open [1,3,4] (5-3-2)
// Closed [3,4,5] (3-2-1) → Open [2,4,5] (4-2-1)
const OPEN_STRING_SETS = [[0,2,3], [1,3,4], [2,4,5]];
const OPEN_STRING_SET_LABELS = ['6-4-3', '5-3-2', '4-2-1'];

const TRIAD_INTERVALS = {
    major: [0, 4, 7],
    minor: [0, 3, 7],
    dim:   [0, 3, 6],
    aug:   [0, 4, 8]
};

const INVERSION_NAMES = ['Root position', '1st inversion', '2nd inversion'];

function getTriadNotes(rootIndex, quality) {
    const intervals = TRIAD_INTERVALS[quality];
    return intervals.map(i => (rootIndex + i) % 12);
}

function invertTriad(pitchClasses, inversion) {
    const result = [...pitchClasses];
    for (let i = 0; i < inversion; i++) {
        result.push(result.shift());
    }
    return result;
}

function findVoicing(pitchClasses, stringSet) {
    // For each string, find all frets (0-15) that produce the required pitch class
    const options = pitchClasses.map((pc, i) => {
        const openNote = STRING_TUNING[stringSet[i]];
        const frets = [];
        for (let f = 0; f <= 15; f++) {
            if ((openNote + f) % 12 === pc) {
                frets.push(f);
            }
        }
        return frets;
    });

    let bestVoicing = null;
    let bestSpan = Infinity;
    let bestMaxFret = Infinity;

    for (const f0 of options[0]) {
        for (const f1 of options[1]) {
            for (const f2 of options[2]) {
                const frets = [f0, f1, f2];
                const span = Math.max(...frets) - Math.min(...frets);
                const maxFret = Math.max(...frets);

                if (span < bestSpan || (span === bestSpan && maxFret < bestMaxFret)) {
                    bestSpan = span;
                    bestMaxFret = maxFret;
                    bestVoicing = frets;
                }
            }
        }
    }

    if (!bestVoicing) return null;

    return bestVoicing.map((fret, i) => ({
        string: stringSet[i],
        fret: fret
    }));
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

    var MAX_SPAN = 5;
    var results = [];
    var seen = {};

    for (var a = 0; a < options[0].length; a++) {
        for (var b = 0; b < options[1].length; b++) {
            for (var c = 0; c < options[2].length; c++) {
                var frets = [options[0][a], options[1][b], options[2][c]];
                var span = Math.max.apply(null, frets) - Math.min.apply(null, frets);
                if (span <= MAX_SPAN) {
                    // Deduplicate: normalize frets mod 12 to detect octave repeats
                    var key = frets.map(function(f) { return f % 12; }).join(',');
                    if (seen[key]) continue;
                    seen[key] = true;
                    results.push(frets.map(function(fret, i) {
                        return { string: stringSet[i], fret: fret };
                    }));
                }
            }
        }
    }

    return results;
}

function getAllVoicings(rootIndex, quality, inversion, stringSet) {
    const triadNotes = getTriadNotes(rootIndex, quality);
    const inverted = invertTriad(triadNotes, inversion);
    return findVoicing(inverted, stringSet);
}

function getAllVoicingsForChord(rootIndex, quality) {
    var results = [];
    for (var si = 0; si < STRING_SETS.length; si++) {
        for (var inv = 0; inv < 3; inv++) {
            var stringSet = STRING_SETS[si];
            var voicing = getAllVoicings(rootIndex, quality, inv, stringSet);
            if (voicing) {
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

function getDrop2VoicingsForChord(rootIndex, quality) {
    var results = [];
    for (var si = 0; si < OPEN_STRING_SETS.length; si++) {
        var openSet = OPEN_STRING_SETS[si];
        for (var inv = 0; inv < 3; inv++) {
            var triadNotes = getTriadNotes(rootIndex, quality);
            var inverted = invertTriad(triadNotes, inv);
            // Drop-2: middle note drops an octave, becoming the new bass
            // Reorder pitch classes: [low, mid, high] → [mid, low, high]
            var drop2PCs = [inverted[1], inverted[0], inverted[2]];
            var voicing = findVoicing(drop2PCs, openSet);
            if (voicing) {
                // Verify ascending MIDI pitch order (true drop-2 shape)
                var m0 = STRING_TUNING[voicing[0].string] + voicing[0].fret;
                var m1 = STRING_TUNING[voicing[1].string] + voicing[1].fret;
                var m2 = STRING_TUNING[voicing[2].string] + voicing[2].fret;
                if (m0 < m1 && m1 < m2) {
                    results.push({
                        voicing: voicing,
                        inversion: inv,
                        stringSetIndex: si,
                        stringSet: openSet
                    });
                }
            }
        }
    }
    return results;
}

const SCALE_INTERVALS = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    dim:   [0, 1, 3, 5, 6, 8, 10],
    aug:   [0, 2, 4, 6, 8, 10]
};

function getScaleNotes(rootIndex, quality) {
    return SCALE_INTERVALS[quality].map(function(i) {
        return (rootIndex + i) % 12;
    });
}

const PENTATONIC_INTERVALS = {
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
        var rootName = NOTE_NAMES[root];
        var label = rootName;
        var numeral = ROMAN[d];

        if (quality === 'minor') {
            label += 'm';
            numeral = numeral.toLowerCase();
        } else if (quality === 'dim') {
            label += 'dim';
            numeral = numeral.toLowerCase() + '\u00B0';
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

function getNoteInfo(rootIndex, quality) {
    const notes = getTriadNotes(rootIndex, quality);
    return {
        notes: notes,
        names: notes.map(n => NOTE_NAMES[n]),
        intervals: ['R', '3', '5']
    };
}
