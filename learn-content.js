// learn-content.js — Course curriculum content (pure data, no DOM)
//
// Each lesson: prose sections (HTML strings), interactive fretboard demos,
// and a practice deep-link into the matching drill panel.
//
// Demo board types (interpreted by renderLearnBoard in app.js):
//   { type: 'pc', pc, octaves }                    — every position of a pitch class
//   { type: 'positions', notes: [...], groups }    — explicit note objects
//   { type: 'interval', root: [s,f], target: [s,f], semi }
//   { type: 'chord', root, quality, voicing, set, inversion }
//   { type: 'scale', root, scale }
//   { type: 'progression', key, scale, degrees, sevenths } — animated walkthrough
// play: 'seq' | 'strum' | 'none' (progressions always animate + play)

var LESSONS = [

// ===================== 1. Meet the Fretboard =====================
{
    id: 'fretboard',
    title: 'Meet the Fretboard',
    subtitle: 'Six strings, twelve frets — then it all repeats',
    sections: [
        '<p>The guitar looks chaotic next to a piano: the same note lives in five different places, and nothing is laid out in a straight line. The way out of the chaos is to learn a few <strong>shapes</strong> that repeat everywhere. This whole course is built on that idea.</p>',
        '<p>Two facts organize everything. First: one fret = one <strong>half step</strong>, the smallest distance in Western music. Second: at the <strong>12th fret</strong> every string arrives back at its open note, one octave higher — the whole neck repeats from there. Learn frets 0–11 and you know the entire guitar.</p>',
        '<p>The fastest shortcut is the <strong>octave shape</strong>: the same note two strings over, two frets up (or three frets up when you cross onto the B string — the tuning bends there, and every shape you ever learn will bend with it). Find one E and octave shapes hand you all the others.</p>'
    ],
    demos: [
        { label: 'Every E on the neck', board: { type: 'pc', pc: 4, octaves: false }, play: 'seq' },
        { label: 'Octave shapes connect them', board: { type: 'pc', pc: 4, octaves: true }, play: 'none' },
        { label: 'Same idea from C', board: { type: 'pc', pc: 0, octaves: true }, play: 'seq' }
    ],
    practice: { mode: 'notemap', label: 'Explore any note in the Note Map' }
},

// ===================== 2. The Musical Alphabet =====================
{
    id: 'alphabet',
    title: 'The Musical Alphabet',
    subtitle: 'Twelve notes, seven letters, two odd gaps',
    sections: [
        '<p>Music uses seven letter names, <span class="mono">A</span> through <span class="mono">G</span>, but there are <strong>twelve</strong> notes in an octave. The five extras live between the letters and get named with accidentals: <span class="mono">C♯</span> is a half step above C, and the very same pitch can be written <span class="mono">D♭</span> — a half step below D. Which name is "right" depends on context; you\'ll see the app pick intelligently.</p>',
        '<p>The catch everyone trips on: <strong>not every letter pair has a note between it</strong>. <span class="mono">E→F</span> and <span class="mono">B→C</span> are already half steps — no sharp in the gap. Walk up one string and you can see it: the naturals sit two frets apart except at those two seams, where they sit one fret apart.</p>',
        '<p>Don\'t try to memorize the whole neck at once. Anchor the naturals on the two lowest strings first — chord roots live there, and the octave shapes from lesson 1 unlock the rest of the board from those anchors.</p>'
    ],
    demos: [
        { label: 'Chromatic walk up the A string', board: { type: 'chromatic', string: 1 }, play: 'seq' },
        { label: 'Just the naturals — spot the two seams', board: { type: 'chromatic', string: 1, naturalsOnly: true }, play: 'seq' },
        { label: 'Naturals on the low E string', board: { type: 'chromatic', string: 0, naturalsOnly: true }, play: 'seq' }
    ],
    practice: { mode: 'quiz', label: 'Drill it: Note Quiz, level 1', selects: { 'quiz-level-select': '1' } }
},

// ===================== 3. Intervals =====================
{
    id: 'intervals',
    title: 'Intervals: Distance Is Everything',
    subtitle: 'The unit every chord and scale is measured in',
    sections: [
        '<p>An <strong>interval</strong> is the distance between two notes, counted in half steps. This is the single most useful concept in music theory, because chords and scales are nothing but stacks of intervals — learn to see and hear distances and you\'ve learned the grammar behind every shape in this app.</p>',
        '<p>The names come from counting letter names, not half steps: A up to C spans three letters (A, B, C) so it\'s a "third." Then quality sharpens the count: a <strong>minor 3rd</strong> is 3 half steps, a <strong>major 3rd</strong> is 4. That one-fret difference is literally the difference between a sad chord and a happy one — it\'s the highest-leverage half step on the instrument.</p>',
        '<p>On the fretboard every interval is a <strong>shape</strong>. A perfect 5th is one string over, two frets up. A major 3rd is one string over, one fret <em>back</em>. Once these shapes are in your hands you can build any chord anywhere without naming a single note first.</p>'
    ],
    demos: [
        { label: 'Major 3rd from A — bright', board: { type: 'interval', root: [0, 5], target: [1, 4], semi: 4 } },
        { label: 'Minor 3rd from A — dark', board: { type: 'interval', root: [0, 5], target: [1, 3], semi: 3 } },
        { label: 'Perfect 5th — solid, neutral', board: { type: 'interval', root: [0, 5], target: [1, 7], semi: 7 } },
        { label: 'Octave — same note, higher', board: { type: 'interval', root: [0, 5], target: [2, 7], semi: 12 } }
    ],
    practice: { mode: 'intervals', label: 'Drill it: Interval trainer' }
},

// ===================== 4. Building Triads =====================
{
    id: 'triads',
    title: 'Building Triads',
    subtitle: 'Stack two thirds, get a chord',
    sections: [
        '<p>A <strong>triad</strong> is three notes: a <strong>root</strong>, a <strong>third</strong>, and a <strong>fifth</strong> — built by stacking two thirds on top of each other. It\'s the smallest complete chord, and it\'s the skeleton inside almost every chord you\'ve ever played. That big open C chord? Just C–E–G with some notes doubled.</p>',
        '<p>The recipe for <strong>C major</strong>: start at C, go up a major 3rd (4 half steps) to E, then a minor 3rd (3 half steps) to G. Major third on the bottom = major chord. Flip the stack — minor 3rd first, then major 3rd — and you get <strong>C minor</strong>: C–E♭–G. One note moves one fret; the whole mood changes.</p>',
        '<p>In this app, triad notes are always color-coded: <strong>orange root</strong>, light-grey third, mid-grey fifth. Train your eyes on the colors — knowing <em>which chord tone you\'re on</em> matters more than knowing its letter name.</p>'
    ],
    demos: [
        { label: 'C major, one third at a time', board: { type: 'chord', root: 0, quality: 'major', voicing: 'closed', set: 1, inversion: 0 }, play: 'seq' },
        { label: 'Now as one strum', board: { type: 'chord', root: 0, quality: 'major', voicing: 'closed', set: 1, inversion: 0 }, play: 'strum' },
        { label: 'Lower the third: C minor', board: { type: 'chord', root: 0, quality: 'minor', voicing: 'closed', set: 1, inversion: 0 }, play: 'strum' }
    ],
    practice: { mode: 'training', label: 'Drill it: triads in Training' }
},

// ===================== 5. The Chord Quality Palette =====================
{
    id: 'qualities',
    title: 'The Chord Quality Palette',
    subtitle: 'Four triads plus two suspensions',
    sections: [
        '<p>Two thirds, each major or minor, give four triad qualities — the entire emotional palette of basic harmony:</p>',
        '<ul>' +
        '<li><strong>Major</strong> (M3 + m3) — bright, settled, home.</li>' +
        '<li><strong>Minor</strong> (m3 + M3) — dark, serious, inward.</li>' +
        '<li><strong>Diminished</strong> (m3 + m3) — tense, unstable, wants to move <em>now</em>.</li>' +
        '<li><strong>Augmented</strong> (M3 + M3) — dreamlike, floating, unresolved.</li>' +
        '</ul>',
        '<p>There\'s also a family that <em>removes</em> the third instead of choosing one: <strong>suspended</strong> chords replace it with the 2nd (<span class="mono">sus2</span>) or the 4th (<span class="mono">sus4</span>). With no third, they\'re neither major nor minor — open, ringing, unresolved. You\'ve heard sus4→major resolution a thousand times; it\'s the sound of tension politely letting go.</p>',
        '<p>Play the demos back to back and put a word to each sound yourself. Your own labels stick better than anyone else\'s.</p>'
    ],
    demos: [
        { label: 'C major', board: { type: 'chord', root: 0, quality: 'major', voicing: 'closed', set: 1, inversion: 0 }, play: 'strum' },
        { label: 'C minor', board: { type: 'chord', root: 0, quality: 'minor', voicing: 'closed', set: 1, inversion: 0 }, play: 'strum' },
        { label: 'C diminished', board: { type: 'chord', root: 0, quality: 'dim', voicing: 'closed', set: 1, inversion: 0 }, play: 'strum' },
        { label: 'C augmented', board: { type: 'chord', root: 0, quality: 'aug', voicing: 'closed', set: 1, inversion: 0 }, play: 'strum' },
        { label: 'Csus4', board: { type: 'chord', root: 0, quality: 'sus4', voicing: 'closed', set: 1, inversion: 0 }, play: 'strum' },
        { label: 'Csus2', board: { type: 'chord', root: 0, quality: 'sus2', voicing: 'closed', set: 1, inversion: 0 }, play: 'strum' }
    ],
    practice: { mode: 'intervals', label: 'Drill it: chord quality by ear', selects: { 'iv-mode-select': 'chord-ear' } }
},

// ===================== 6. Inversions =====================
{
    id: 'inversions',
    title: 'Inversions: Same Notes, New Bass',
    subtitle: 'Three grips for every triad',
    sections: [
        '<p>C–E–G is C major no matter how you stack it. Put the <strong>E</strong> on the bottom and it\'s <strong>1st inversion</strong>; put the <strong>G</strong> down there and it\'s <strong>2nd inversion</strong>. Same chord, different <strong>bass note</strong> — written as slash chords: <span class="mono">C/E</span>, <span class="mono">C/G</span>. The inversion is always named by what\'s actually in the bass.</p>',
        '<p>Why bother? Because inversions are what let you <strong>stay put</strong>. If every chord you play is in root position, your hand leaps around the neck and the music sounds like it too. With three inversions per string set, the next chord is almost always within a fret or two of where you are. This is the foundation of voice leading (lesson 12).</p>',
        '<p>Watch the orange root as you step through the demos: it climbs from the bottom voice to the middle to the top, while the grip stays in one neighborhood of the neck.</p>'
    ],
    demos: [
        { label: 'C major — root position', board: { type: 'chord', root: 0, quality: 'major', voicing: 'closed', set: 3, inversion: 0 }, play: 'strum' },
        { label: '1st inversion — 3rd in the bass (C/E)', board: { type: 'chord', root: 0, quality: 'major', voicing: 'closed', set: 3, inversion: 1 }, play: 'strum' },
        { label: '2nd inversion — 5th in the bass (C/G)', board: { type: 'chord', root: 0, quality: 'major', voicing: 'closed', set: 3, inversion: 2 }, play: 'strum' }
    ],
    practice: { mode: 'training', label: 'Drill it: cycle inversions in Training' }
},

// ===================== 7. String Sets =====================
{
    id: 'stringsets',
    title: 'String Sets: Four Neighborhoods',
    subtitle: 'The same chord lives on every group of three strings',
    sections: [
        '<p>Any triad can be played on any three adjacent strings: <span class="mono">6-5-4</span>, <span class="mono">5-4-3</span>, <span class="mono">4-3-2</span>, or <span class="mono">3-2-1</span>. Four string sets × three inversions = <strong>twelve grips for one chord</strong>, covering the whole neck. That\'s the complete map this app\'s Training tab drills.</p>',
        '<p>The shapes are <em>almost</em> the same from set to set — but the B string is tuned a major 3rd above the G string (every other pair is a 4th), so any shape that touches the B or high E string gets stretched by one fret. Don\'t fight it; just learn the top two sets as their own shapes. It\'s the same bend you saw in the octave shapes.</p>',
        '<p>Lower sets sound thick and muddy-ish — great for riffs and power. Upper sets ring clear — great for chord melody and fills. Knowing all four means choosing your sound, not defaulting to the one grip you know.</p>'
    ],
    demos: [
        { label: 'C major on 6-5-4', board: { type: 'chord', root: 0, quality: 'major', voicing: 'closed', set: 0, inversion: 0 }, play: 'strum' },
        { label: 'C major on 5-4-3', board: { type: 'chord', root: 0, quality: 'major', voicing: 'closed', set: 1, inversion: 0 }, play: 'strum' },
        { label: 'C major on 4-3-2', board: { type: 'chord', root: 0, quality: 'major', voicing: 'closed', set: 2, inversion: 0 }, play: 'strum' },
        { label: 'C major on 3-2-1', board: { type: 'chord', root: 0, quality: 'major', voicing: 'closed', set: 3, inversion: 0 }, play: 'strum' }
    ],
    practice: { mode: 'training', label: 'Drill it: one string set at a time' }
},

// ===================== 8. Spread Triads =====================
{
    id: 'spread',
    title: 'Open (Spread) Triads',
    subtitle: 'Drop the middle voice, open up the sound',
    sections: [
        '<p>Take any closed triad and <strong>drop its middle note down an octave</strong>. The three notes now span more than an octave, with air between the voices — this is an <strong>open</strong> or <strong>spread</strong> triad. Same three pitches, completely different character: wide, clear, almost piano-like. They\'re all over modern worship, indie, and jazz playing.</p>',
        '<p>Because the middle voice fell to the bottom, spread triads skip a string — they live on sets like <span class="mono">6-4-3</span>, <span class="mono">5-3-2</span>, and <span class="mono">4-2-1</span>. And note the naming: an inversion is still named by its <strong>bass note</strong>, not by the closed shape it was derived from. Bass = root → root position, bass = 3rd → 1st inversion, always.</p>',
        '<p>Compare the demos: the closed grip is compact and blended; the spread version of the same chord sounds twice as big. When a part needs to shimmer, this is the move.</p>'
    ],
    demos: [
        { label: 'C major, closed', board: { type: 'chord', root: 0, quality: 'major', voicing: 'closed', set: 2, inversion: 0 }, play: 'strum' },
        { label: 'C major, spread', board: { type: 'chord', root: 0, quality: 'major', voicing: 'open', set: 1, inversion: 0 }, play: 'strum' },
        { label: 'Spread C, 1st inversion', board: { type: 'chord', root: 0, quality: 'major', voicing: 'open', set: 1, inversion: 1 }, play: 'strum' },
        { label: 'Spread A minor', board: { type: 'chord', root: 9, quality: 'minor', voicing: 'open', set: 1, inversion: 0 }, play: 'strum' }
    ],
    practice: { mode: 'training', label: 'Drill it: spread triads in Training', selects: { 'train-voicing-select': 'open' } }
},

// ===================== 9. Seventh Chords, Drop-2 & Shells =====================
{
    id: 'sevenths',
    title: 'Seventh Chords, Drop-2 & Shells',
    subtitle: 'Add one more third and the colors multiply',
    sections: [
        '<p>Stack a third on top of a triad and you get a <strong>seventh chord</strong> — four notes, and suddenly harmony has flavor beyond happy/sad. The four core qualities: <span class="mono">maj7</span> (dreamy, settled), <span class="mono">7</span> (dominant — bluesy, pulling home), <span class="mono">m7</span> (mellow, rolling), and <span class="mono">m7♭5</span> (anxious, pre-resolution). Their cousins the <strong>6th chords</strong> (<span class="mono">6</span>, <span class="mono">m6</span>) swap the 7th for a 6th — vintage, soft landings.</p>',
        '<p>Four stacked notes are awkward under guitar fingers, so guitarists rearrange them. <strong>Drop-2</strong>: take the 2nd voice from the top of the stack and drop it an octave. The result lands perfectly on four adjacent strings — these are <em>the</em> standard seventh-chord grips, and the term drop-2 properly belongs to these 4-note shapes.</p>',
        '<p>Even leaner: the <strong>shell voicing</strong> — just root, 3rd, and 7th. The 5th is dead weight (it doesn\'t affect quality), so jazz players simply omit it. Two grips — root on the 6th string or root on the 5th — will carry you through an entire jazz standard. If you learn only one thing from this lesson, learn shells.</p>'
    ],
    demos: [
        { label: 'Cmaj7 — drop-2', board: { type: 'chord', root: 0, quality: 'maj7', voicing: 'drop2', set: 1, inversion: 0 }, play: 'strum' },
        { label: 'C7 — drop-2', board: { type: 'chord', root: 0, quality: 'dom7', voicing: 'drop2', set: 1, inversion: 0 }, play: 'strum' },
        { label: 'Cm7 — drop-2', board: { type: 'chord', root: 0, quality: 'min7', voicing: 'drop2', set: 1, inversion: 0 }, play: 'strum' },
        { label: 'C6 — the vintage landing', board: { type: 'chord', root: 0, quality: 'maj6', voicing: 'drop2', set: 1, inversion: 0 }, play: 'strum' },
        { label: 'C7 shell — root, 3rd, 7th only', board: { type: 'chord', root: 0, quality: 'dom7', voicing: 'shell', set: 0, inversion: 0 }, play: 'strum' },
        { label: 'Cm7 shell', board: { type: 'chord', root: 0, quality: 'min7', voicing: 'shell', set: 0, inversion: 0 }, play: 'strum' }
    ],
    practice: { mode: 'training', label: 'Drill it: drop-2 and shells in Training', selects: { 'train-voicing-select': 'drop2' } }
},

// ===================== 10. Keys & the Diatonic Family =====================
{
    id: 'keys',
    title: 'Keys & the Diatonic Family',
    subtitle: 'Seven notes, seven chords, one home',
    sections: [
        '<p>A <strong>key</strong> is a set of seven notes (a major or minor scale) plus a gravitational center — the tonic, where things feel at rest. Build a triad on <em>each</em> scale degree using only scale notes, and you get the key\'s <strong>diatonic chords</strong>: the seven chords that "belong." Nearly every song you know is built mostly from one key\'s family.</p>',
        '<p>Here\'s the beautiful part: the pattern of qualities is <strong>the same in every major key</strong> — <span class="mono">I ii iii IV V vi vii°</span>: major, minor, minor, major, major, minor, diminished. Each degree even has a job title: the <strong>tonic</strong> is home, the <strong>dominant</strong> (V) creates the pull back home, the <strong>subdominant</strong> (IV) moves you away. Harmony is these three forces taking turns.</p>',
        '<p>Every major key hides a <strong>relative minor</strong> inside it — the scale starting from degree 6 uses the exact same notes (A minor lives inside C major). Same family of chords, different center of gravity. That\'s why they share a slot on the circle of fifths, coming up next.</p>'
    ],
    demos: [
        { label: 'The C major scale', board: { type: 'scale', root: 0, scale: 'major' }, play: 'none' },
        { label: 'Meet the family: chords of C major', board: { type: 'progression', key: 0, scale: 'major', degrees: [0, 1, 2, 3, 4, 5, 6] } },
        { label: 'A minor — same notes, new home', board: { type: 'progression', key: 9, scale: 'minor', degrees: [0, 1, 2, 3, 4, 5, 6] } }
    ],
    practice: { mode: 'training', label: 'Drill it: Scale Run in Training', selects: { 'train-mode-select': 'scale' } }
},

// ===================== 11. The Circle of Fifths =====================
{
    id: 'circle',
    title: 'The Circle of Fifths',
    subtitle: 'The map of every key',
    sections: [
        '<p>Arrange the twelve keys so each step clockwise is a perfect 5th up — C, G, D, A, E… — and something remarkable happens: <strong>neighboring keys share six of their seven notes</strong>. Move one step around the circle and exactly one note changes. That\'s why the circle is the map of harmony: nearby keys sound related, far-apart keys sound foreign.</p>',
        '<p>It\'s also a key-signature calculator. Each clockwise step adds one sharp (G has 1, D has 2…); each counter-clockwise step adds one flat (F has 1, B♭ has 2…). And the sharps arrive in a fixed order — <span class="mono">F♯ C♯ G♯ D♯ A♯ E♯ B♯</span> — so a signature is never a random pile of accidentals.</p>',
        '<p>Watch the demo: going from C major to G major, only one note moves — F becomes F♯. One step, one note. Twelve steps take you all the way around and home.</p>'
    ],
    demos: [
        { label: 'C major scale — no sharps', board: { type: 'scale', root: 0, scale: 'major' }, play: 'seqscale' },
        { label: 'G major — one note changes (F→F♯)', board: { type: 'scale', root: 7, scale: 'major' }, play: 'seqscale' },
        { label: 'D major — one more (C→C♯)', board: { type: 'scale', root: 2, scale: 'major' }, play: 'seqscale' }
    ],
    practice: { mode: 'circle', label: 'Explore the interactive Circle of Fifths' }
},

// ===================== 12. Progressions & Voice Leading =====================
{
    id: 'progressions',
    title: 'Progressions & Voice Leading',
    subtitle: 'Chords in motion, hands at rest',
    sections: [
        '<p>A <strong>progression</strong> is a loop of diatonic chords, and a handful of loops power most popular music: <span class="mono">I–IV–V</span> (blues, rock &amp; roll), <span class="mono">I–V–vi–IV</span> (roughly every radio hit of the last 30 years), <span class="mono">ii–V–I</span> (jazz\'s favorite sentence). They work because of the jobs from lesson 10 — away from home, build tension, come home.</p>',
        '<p><strong>Voice leading</strong> is the craft of connecting them: move each voice as little as possible between chords. Good voice leading is why a progression sounds like one flowing piece of music rather than a series of position jumps — and on guitar it\'s a practical gift, because the nearest inversion is always within a couple of frets.</p>',
        '<p>In the demos, watch the connector lines: between chords, most notes barely move, and some don\'t move at all (shared tones). This is exactly what the Progressions tab drills — it always picks the minimal-movement voicing for you, so your hands learn the economy directly.</p>'
    ],
    demos: [
        { label: 'I–IV–V–I in C', board: { type: 'progression', key: 0, scale: 'major', degrees: [0, 3, 4, 0] } },
        { label: 'I–V–vi–IV — the pop loop', board: { type: 'progression', key: 0, scale: 'major', degrees: [0, 4, 5, 3] } },
        { label: 'ii–V–I with sevenths — jazz', board: { type: 'progression', key: 0, scale: 'major', degrees: [1, 4, 0], sevenths: true } }
    ],
    practice: { mode: 'progressions', label: 'Drill it: the Progressions tab' }
},

// ===================== 13. Nashville Numbers =====================
{
    id: 'nashville',
    title: 'Nashville Numbers',
    subtitle: 'Think in numbers, play in any key',
    sections: [
        '<p>Once you think of chords as scale degrees, chord <em>names</em> become almost irrelevant — and that\'s the point of the <strong>Nashville number system</strong>. A chart written <span class="mono">1&nbsp;5&nbsp;6-&nbsp;4</span> is playable in any key instantly: in C that\'s C–G–Am–F; in E it\'s E–B–C♯m–A. Session players in Nashville read entire sessions this way, and the singer can change key between takes without a single chart being rewritten.</p>',
        '<p>The notation in sixty seconds: plain number = major (<span class="mono">4</span>), dash = minor (<span class="mono">6-</span>), <span class="mono">°</span> = diminished, superscripts add sevenths (<span class="mono">5⁷</span>, <span class="mono">2-⁷</span>). In minor keys the naturally lowered degrees are written with flats: <span class="mono">1- ♭6 ♭3 ♭7</span>. The full write-up lives under "About the number system" in the Progressions tab.</p>',
        '<p>The real prize isn\'t reading charts — it\'s <strong>hearing in numbers</strong>. When "oh, that\'s a 1–5–6-–4" happens in your ear before your brain catches up, you can learn songs on the fly and transpose without thinking. The Nashville tab\'s ear drills train exactly that reflex.</p>'
    ],
    demos: [
        { label: '1 5 6- 4 in C', board: { type: 'progression', key: 0, scale: 'major', degrees: [0, 4, 5, 3] } },
        { label: 'The same numbers in G', board: { type: 'progression', key: 7, scale: 'major', degrees: [0, 4, 5, 3] } },
        { label: 'And in E — same song, third key', board: { type: 'progression', key: 4, scale: 'major', degrees: [0, 4, 5, 3] } }
    ],
    practice: { mode: 'nashville', label: 'Drill it: the Nashville tab' }
}

];
