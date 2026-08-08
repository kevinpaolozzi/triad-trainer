// app.js — UI Logic, WebGL Fretboard, Quiz Engine

var refRenderer = null;
var trainRenderer = null;
var mapRenderer = null;
var quizRenderer = null;

var selectedStrings = [2, 3, 4];
var currentMode = 'learn';

// Global display settings
var labelMode = 'names'; // 'names' | 'intervals'

// Interval color keys matching fretboard.js NOTE_COLORS (R, 3, 5, 7)
var INTERVAL_COLOR_KEYS = ['root', 'third', 'fifth', 'seventh'];

var NATURAL_PCS = [0, 2, 4, 5, 7, 9, 11];
var STRING_PROMPT_LABELS = ['6th (E)', '5th (A)', '4th (D)', '3rd (G)', '2nd (B)', '1st (e)'];

function chordDisplayLabel(rootIndex, quality) {
    return spellChord(rootIndex, quality).rootName + CHORD_SUFFIX[quality];
}

// Rebuild a custom select's options in place (clone strips old listeners).
// options: [{value, label}]. Returns the new select element.
function rebuildSelect(id, options, newValue) {
    var oldSel = document.getElementById(id);
    var onChange = oldSel._onChange;

    var sel = oldSel.cloneNode(false);
    sel.dataset.value = newValue;

    var trigger = document.createElement('button');
    trigger.className = 'custom-select-trigger';
    trigger.type = 'button';
    sel.appendChild(trigger);

    var optionsWrap = document.createElement('div');
    optionsWrap.className = 'custom-select-options';
    for (var i = 0; i < options.length; i++) {
        var opt = document.createElement('div');
        opt.className = 'custom-select-option' + (options[i].value === newValue ? ' selected' : '');
        opt.dataset.value = options[i].value;
        opt.textContent = options[i].label;
        if (options[i].value === newValue) trigger.textContent = options[i].label;
        optionsWrap.appendChild(opt);
    }
    sel.appendChild(optionsWrap);
    oldSel.parentNode.replaceChild(sel, oldSel);

    sel._onChange = onChange;
    sel._initialized = false;
    initCustomSelects();
    return sel;
}

// ===================== Custom Selects =====================

function initCustomSelects() {
    var selects = document.querySelectorAll('.custom-select');

    for (var i = 0; i < selects.length; i++) {
        (function(sel) {
            if (sel._initialized) return;
            sel._initialized = true;

            var trigger = sel.querySelector('.custom-select-trigger');
            var optionsWrap = sel.querySelector('.custom-select-options');

            // Mark initial selected option
            var initVal = sel.dataset.value;
            var opts = optionsWrap.querySelectorAll('.custom-select-option');
            for (var j = 0; j < opts.length; j++) {
                if (opts[j].dataset.value === initVal) {
                    opts[j].classList.add('selected');
                }
            }

            trigger.addEventListener('click', function(e) {
                e.stopPropagation();
                // Close all other open selects
                var allSelects = document.querySelectorAll('.custom-select.open');
                for (var k = 0; k < allSelects.length; k++) {
                    if (allSelects[k] !== sel) allSelects[k].classList.remove('open');
                }
                sel.classList.toggle('open');
            });

            optionsWrap.addEventListener('click', function(e) {
                var option = e.target.closest('.custom-select-option');
                if (!option) return;
                e.stopPropagation();
                // The select lives inside a <label>: without preventDefault the
                // label forwards a synthetic click to the trigger button, which
                // re-opens the dropdown right after an option is chosen.
                e.preventDefault();

                sel.dataset.value = option.dataset.value;
                trigger.textContent = option.textContent;
                sel.classList.remove('open');

                // Update selected class
                var allOpts = optionsWrap.querySelectorAll('.custom-select-option');
                for (var k = 0; k < allOpts.length; k++) {
                    allOpts[k].classList.remove('selected');
                }
                option.classList.add('selected');

                // Fire change callback
                if (sel._onChange) sel._onChange();
            });
        })(selects[i]);
    }

    // Close all on outside click (only attach once)
    if (!initCustomSelects._docListener) {
        initCustomSelects._docListener = true;
        document.addEventListener('click', function() {
            var open = document.querySelectorAll('.custom-select.open');
            for (var i = 0; i < open.length; i++) {
                open[i].classList.remove('open');
            }
        });
    }
}

// Set a custom select's value programmatically, updating trigger + selection.
function setSelectValue(sel, value) {
    sel.dataset.value = value;
    var opts = sel.querySelectorAll('.custom-select-option');
    var trigger = sel.querySelector('.custom-select-trigger');
    for (var i = 0; i < opts.length; i++) {
        var match = opts[i].dataset.value === String(value);
        opts[i].classList.toggle('selected', match);
        if (match) trigger.textContent = opts[i].textContent;
    }
}

// Fill a select with the 12 pitch classes, labeled with both spellings.
function populatePcOptions(selectId) {
    var optionsWrap = document.querySelector('#' + selectId + ' .custom-select-options');
    for (var i = 0; i < 12; i++) {
        var opt = document.createElement('div');
        opt.className = 'custom-select-option';
        if (i === 0) opt.className += ' selected';
        opt.dataset.value = i;
        opt.textContent = pcOptionLabel(i);
        optionsWrap.appendChild(opt);
    }
}

// ===================== Global Settings =====================

function initGlobalSettings() {
    var spellingSel = document.getElementById('spelling-select');
    var labelsSel = document.getElementById('labels-select');

    spellingSel._onChange = function() {
        setSpellingPref(spellingSel.dataset.value);
        refreshAllPanels();
    };
    labelsSel._onChange = function() {
        labelMode = labelsSel.dataset.value;
        refreshAllPanels();
    };
}

function refreshAllPanels() {
    if (refRenderer) updateReference();
    if (trainRenderer) {
        // Respell without resetting position
        var idx = metronome.currentVoicingIndex;
        rebuildTrainingLabels();
        if (metronome.voicings.length > 0) {
            metronome.currentVoicingIndex = Math.min(idx, metronome.voicings.length - 1);
            showVoicing(metronome.currentVoicingIndex);
        }
    }
    if (mapRenderer) updateNoteMap();
    if (scalesRenderer) updateScales();
    if (zonesRenderer) updateZones();
    if (quizRenderer) renderQuizStats();
    if (ivRenderer) renderIvStats();
    if (progRenderer) buildProgression();
    if (nashRenderer) renderNashStats();
    if (learnRenderer) showLesson(learn.index);
    if (circleInited) {
        if (circleQuiz.active) stopCircleQuiz(); // wheel rebuild would orphan the question
        buildCircleWheel();
        selectCircleKey(circleSelectedPc);
    }
    if (progressRenderer) renderProgressDashboard();
}

// ===================== Shared Audio =====================

var audio = { ctx: null };

function ensureAudioContext() {
    if (!audio.ctx) {
        audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audio.ctx.state === 'suspended') {
        audio.ctx.resume();
    }
    return audio.ctx;
}

// Karplus-Strong plucked string synth for a single MIDI note.
function playNoteSound(midi, when) {
    var ctx = ensureAudioContext();
    var time = when !== undefined ? when : ctx.currentTime + 0.02;
    var sampleRate = ctx.sampleRate;
    var freq = 440 * Math.pow(2, (midi - 69) / 12);

    var duration = 2.5;
    var numSamples = Math.ceil(sampleRate * duration);
    var period = Math.round(sampleRate / freq);
    var audioBuffer = ctx.createBuffer(1, numSamples, sampleRate);
    var data = audioBuffer.getChannelData(0);

    // Initialize first period with noise
    for (var s = 0; s < period && s < numSamples; s++) {
        data[s] = Math.random() * 2 - 1;
    }

    // Pre-filter the noise: 3-pass moving average to warm up the excitation
    for (var pass = 0; pass < 3; pass++) {
        var prev = data[0];
        for (var s = 1; s < period; s++) {
            var tmp = data[s];
            data[s] = 0.5 * (prev + data[s]);
            prev = tmp;
        }
    }

    // Karplus-Strong with weighted average (heavier lowpass than 50/50)
    var decay = 0.996;
    var blend = 0.4; // lower = warmer, faster high-freq decay
    for (var s = period; s < numSamples; s++) {
        data[s] = decay * (blend * data[s - period] + (1 - blend) * data[s - period + 1]);
    }

    var source = ctx.createBufferSource();
    source.buffer = audioBuffer;

    // Lowpass to cut tinny highs
    var lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = Math.min(freq * 4, 5000);
    lpf.Q.value = 0.7;

    // Body resonance filters (acoustic guitar body)
    var body1 = ctx.createBiquadFilter();
    body1.type = 'peaking';
    body1.frequency.value = 100;
    body1.gain.value = 6;
    body1.Q.value = 1.2;

    var body2 = ctx.createBiquadFilter();
    body2.type = 'peaking';
    body2.frequency.value = 280;
    body2.gain.value = 4;
    body2.Q.value = 1;

    var body3 = ctx.createBiquadFilter();
    body3.type = 'peaking';
    body3.frequency.value = 500;
    body3.gain.value = 2;
    body3.Q.value = 1.5;

    // Highpass to remove rumble
    var hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 75;

    // Output gain envelope
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.22, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 2.2);

    source.connect(lpf);
    lpf.connect(body1);
    body1.connect(body2);
    body2.connect(body3);
    body3.connect(hpf);
    hpf.connect(gain);
    gain.connect(ctx.destination);

    source.start(time);
    source.stop(time + 2.5);
}

function playPositionSound(string, fret, when) {
    playNoteSound(STRING_TUNING[string] + fret, when);
}

function scheduleChordTones(voicing, time) {
    for (var i = 0; i < voicing.length; i++) {
        playPositionSound(voicing[i].string, voicing[i].fret, time + i * 0.015);
    }
}

// ===================== Reference Mode =====================

var refClickedNote = null; // { string, fret } — transient click highlight
var refClickTimer = null;

function initReferenceMode() {
    var rootSelect = document.getElementById('root-select');
    var qualitySelect = document.getElementById('quality-select');
    var inversionSelect = document.getElementById('inversion-select');

    populatePcOptions('root-select');

    // Set up string toggle buttons
    var toggleBtns = document.querySelectorAll('#string-toggles .string-toggle');
    for (var i = 0; i < toggleBtns.length; i++) {
        (function(btn) {
            btn.addEventListener('click', function() {
                var si = parseInt(btn.dataset.string);
                var idx = selectedStrings.indexOf(si);
                if (idx !== -1) {
                    selectedStrings.splice(idx, 1);
                    btn.classList.remove('active');
                } else {
                    selectedStrings.push(si);
                    btn.classList.add('active');
                }
                selectedStrings.sort(function(a, b) { return a - b; });
                updateReference();
            });
        })(toggleBtns[i]);
    }

    // Create WebGL renderer for reference fretboard
    var canvas = document.getElementById('ref-canvas');
    var overlay = document.getElementById('ref-overlay');
    refRenderer = new FretboardRenderer(canvas, overlay);

    // Click any position to hear it and see its name
    refRenderer.setInteractive(true, function(string, fret) {
        playPositionSound(string, fret);
        refClickedNote = { string: string, fret: fret };
        if (refClickTimer) clearTimeout(refClickTimer);
        refClickTimer = setTimeout(function() {
            refClickedNote = null;
            updateReference();
        }, 2000);
        updateReference();
    });

    var pentatonicSelect = document.getElementById('pentatonic-select');

    rootSelect._onChange = updateReference;
    qualitySelect._onChange = updateReference;
    inversionSelect._onChange = updateReference;
    pentatonicSelect._onChange = updateReference;

    updateReference();
}

function updateReference() {
    if (!refRenderer) return;
    var rootIndex = parseInt(document.getElementById('root-select').dataset.value);
    var quality = document.getElementById('quality-select').dataset.value;
    var inversion = parseInt(document.getElementById('inversion-select').dataset.value);

    // Update pentatonic labels with current key
    updatePentatonicLabels(rootIndex);

    if (selectedStrings.length === 0) {
        refRenderer.setActiveStrings([]);
        refRenderer.setNotes([]);
        document.getElementById('ref-note-info').innerHTML = '';
        return;
    }

    renderShowAll(rootIndex, quality, selectedStrings, inversion);
}

var OVERLAY_LABELS = {
    major: 'Major pentatonic',
    minor: 'Minor pentatonic',
    majorscale: 'Major scale',
    minorscale: 'Minor scale'
};

function updatePentatonicLabels(rootIndex) {
    var sel = document.getElementById('pentatonic-select');
    var opts = sel.querySelectorAll('.custom-select-option');
    var trigger = sel.querySelector('.custom-select-trigger');
    var currentValue = sel.dataset.value;

    for (var i = 0; i < opts.length; i++) {
        var val = opts[i].dataset.value;
        if (val === 'off') continue;
        var tonality = (val === 'minor' || val === 'minorscale') ? 'minor' : 'major';
        var label = spellTriad(rootIndex, tonality).rootName + ' ' + OVERLAY_LABELS[val];
        opts[i].textContent = label;
        if (val === currentValue) {
            trigger.textContent = label;
        }
    }
}

function renderShowAll(rootIndex, quality, stringSet, selectedInversion) {
    var triadNotes = getTriadNotes(rootIndex, quality);
    var triadSpelling = spellTriad(rootIndex, quality);
    var intervalLabels = TRIAD_INTERVAL_LABELS[quality];

    refRenderer.setActiveStrings(stringSet);

    // Get all playable voicings for the selected inversion on consecutive string groups
    var selectedKey = {};
    var voicingGroups = [];
    if (stringSet.length >= 3) {
        var inverted = invertTriad(triadNotes, selectedInversion);
        // Only use consecutive triplets from the selected strings
        var sorted = stringSet.slice().sort(function(a, b) { return a - b; });
        for (var a = 0; a < sorted.length - 2; a++) {
            if (sorted[a + 1] !== sorted[a] + 1 || sorted[a + 2] !== sorted[a] + 2) continue;
            var subset = [sorted[a], sorted[a + 1], sorted[a + 2]];
            var allPositions = findAllVoicings(inverted, subset);
            for (var v = 0; v < allPositions.length; v++) {
                voicingGroups.push(allPositions[v]);
                for (var s = 0; s < allPositions[v].length; s++) {
                    selectedKey[allPositions[v][s].string + ':' + allPositions[v][s].fret] = true;
                }
            }
        }
    }

    // Find every triad note on every fret (0-15) of the active strings
    var notes = [];
    var notePosKey = {};
    for (var i = 0; i < stringSet.length; i++) {
        var si = stringSet[i];
        var openNote = STRING_TUNING[si];
        for (var f = 0; f <= 15; f++) {
            var pc = (openNote + f) % 12;
            var triadIdx = triadNotes.indexOf(pc);
            if (triadIdx === -1) continue;

            var isSelected = selectedKey[si + ':' + f] === true;
            var label = labelMode === 'intervals'
                ? intervalLabels[triadIdx]
                : triadSpelling.map[pc];
            notes.push({
                string: si,
                fret: f,
                color: INTERVAL_COLOR_KEYS[triadIdx],
                label: label,
                glow: triadIdx === 0,
                opacity: isSelected ? 1.0 : 0.55,
                size: 22
            });
            notePosKey[si + ':' + f] = true;
        }
    }

    // Add scale/pentatonic overlay notes
    var pentatonicType = document.getElementById('pentatonic-select').dataset.value;
    var pentSpelling = null;
    if (pentatonicType !== 'off') {
        var isScaleOverlay = (pentatonicType === 'majorscale' || pentatonicType === 'minorscale');
        var overlayTonality = (pentatonicType === 'minorscale') ? 'minor' : 'major';
        var pentNotes;
        if (isScaleOverlay) {
            pentSpelling = spellScale(rootIndex, overlayTonality);
            pentNotes = getScaleNotes(rootIndex, overlayTonality);
        } else {
            pentSpelling = spellPentatonic(rootIndex, pentatonicType);
            pentNotes = getPentatonicNotes(rootIndex, pentatonicType);
        }
        for (var i = 0; i < stringSet.length; i++) {
            var si = stringSet[i];
            var openNote = STRING_TUNING[si];
            for (var f = 0; f <= 15; f++) {
                var pc = (openNote + f) % 12;
                if (pentNotes.indexOf(pc) === -1) continue;
                if (triadNotes.indexOf(pc) !== -1) continue;
                notes.push({
                    string: si,
                    fret: f,
                    color: 'pent',
                    opacity: 0.45,
                    size: 22,
                    label: pentSpelling.map[pc],
                    glow: false
                });
                notePosKey[si + ':' + f] = true;
            }
        }
    }

    // Transient clicked-note highlight (any position, even outside the chord)
    if (refClickedNote && !notePosKey[refClickedNote.string + ':' + refClickedNote.fret]) {
        var cpc = (STRING_TUNING[refClickedNote.string] + refClickedNote.fret) % 12;
        var cname = triadSpelling.map[cpc]
            || (pentSpelling && pentSpelling.map[cpc])
            || pcDisplayName(cpc);
        notes.push({
            string: refClickedNote.string,
            fret: refClickedNote.fret,
            color: 'user',
            opacity: 1.0,
            size: 22,
            label: cname,
            glow: false
        });
    }

    refRenderer.setVoicingGroups(voicingGroups);
    refRenderer.setNotes(notes);

    // Show full scale info with triad degrees highlighted, plus honest scale name
    var scaleNotes = getScaleNotes(rootIndex, quality);
    var scaleSpelling = spellScale(rootIndex, quality);
    var html = '<div class="scale-row">';
    for (var d = 0; d < scaleNotes.length; d++) {
        var pc = scaleNotes[d];
        var isTriad = triadNotes.indexOf(pc) !== -1;
        html += '<div class="scale-degree' + (isTriad ? ' triad' : '') + '">';
        html += '<span class="degree-name">' + scaleSpelling.names[d] + '</span>';
        html += '<span class="degree-num">' + (d + 1) + '</span>';
        html += '</div>';
    }
    html += '</div>';
    html += '<div class="scale-name">' + scaleSpelling.names[0] + ' ' + SCALE_DISPLAY_NAMES[quality] + '</div>';

    document.getElementById('ref-note-info').innerHTML = html;
}

// ===================== Training Mode =====================

var metronome = {
    bpm: 60,
    playing: false,
    nextBeatTime: 0,
    currentVoicingIndex: 0,
    voicings: [],
    timerId: null,
    beatsPerChord: 1,
    beatInChord: 0
};

function initTrainingPanel() {
    populatePcOptions('train-root-select');

    // Create renderer
    var canvas = document.getElementById('train-canvas');
    var overlay = document.getElementById('train-overlay');
    trainRenderer = new FretboardRenderer(canvas, overlay);

    // Wire up change callbacks
    var trainMode = document.getElementById('train-mode-select');
    var trainRoot = document.getElementById('train-root-select');
    var trainQuality = document.getElementById('train-quality-select');
    var trainVoicing = document.getElementById('train-voicing-select');
    var trainStrings = document.getElementById('train-strings-select');
    var trainInversion = document.getElementById('train-inversion-select');
    trainMode._onChange = updateTrainingVoicings;
    trainRoot._onChange = updateTrainingVoicings;
    trainQuality._onChange = updateTrainingVoicings;
    trainVoicing._onChange = function() {
        updateTrainingSelectsForVoicing();
        updateTrainingVoicings();
    };
    trainStrings._onChange = updateTrainingVoicings;
    trainInversion._onChange = updateTrainingVoicings;
    document.getElementById('train-beats-select')._onChange = function() {
        metronome.beatsPerChord = parseInt(document.getElementById('train-beats-select').dataset.value);
    };

    // Re-init custom selects to pick up the new training panel selects
    initCustomSelects();

    // BPM controls
    document.getElementById('bpm-minus').addEventListener('click', function() {
        metronome.bpm = Math.max(20, metronome.bpm - 5);
        document.getElementById('bpm-display').textContent = metronome.bpm;
    });
    document.getElementById('bpm-plus').addEventListener('click', function() {
        metronome.bpm = Math.min(240, metronome.bpm + 5);
        document.getElementById('bpm-display').textContent = metronome.bpm;
    });

    // Transport button
    document.getElementById('transport-btn').addEventListener('click', function() {
        if (metronome.playing) {
            stopMetronome();
        } else {
            startMetronome();
        }
    });

    // Voicing navigation arrows
    document.getElementById('voicing-prev').addEventListener('click', function() {
        navigateVoicing(-1);
    });
    document.getElementById('voicing-next').addEventListener('click', function() {
        navigateVoicing(1);
    });

    // Keyboard arrow navigation
    document.addEventListener('keydown', function(e) {
        if (currentMode !== 'training' || metronome.voicings.length === 0) return;
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            navigateVoicing(-1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            navigateVoicing(1);
        }
    });
}

function navigateVoicing(dir) {
    if (metronome.voicings.length === 0) return;
    var n = metronome.voicings.length;
    var idx = (metronome.currentVoicingIndex + dir + n) % n;
    metronome.currentVoicingIndex = idx;
    showVoicing(idx);
    // Ear training: hear the voicing when stepping manually with sound on
    if (!metronome.playing && document.getElementById('sound-toggle').checked) {
        scheduleChordTones(metronome.voicings[idx].voicing, ensureAudioContext().currentTime + 0.02);
    }
}

var TRIAD_QUALITY_OPTIONS = [
    { value: 'major', label: 'Major' },
    { value: 'minor', label: 'Minor' },
    { value: 'dim',   label: 'Dim' },
    { value: 'aug',   label: 'Aug' },
    { value: 'sus2',  label: 'Sus2' },
    { value: 'sus4',  label: 'Sus4' }
];
var SEVENTH_QUALITY_OPTIONS = [
    { value: 'maj7', label: 'Maj7' },
    { value: 'min7', label: 'Min7' },
    { value: 'dom7', label: 'Dom7' },
    { value: 'm7b5', label: 'Min7♭5' },
    { value: 'maj6', label: 'Maj6' },
    { value: 'min6', label: 'Min6' }
];
// Sensible quality mapping when switching between triads and sevenths
var TRIAD_TO_SEVENTH = { major: 'maj7', minor: 'min7', dim: 'm7b5', aug: 'dom7', sus2: 'maj7', sus4: 'dom7' };
var SEVENTH_TO_TRIAD = { maj7: 'major', min7: 'minor', dom7: 'major', m7b5: 'dim', maj6: 'major', min6: 'minor' };

// Labels for each voicing type's string sets
function trainingSetLabels(voicingType) {
    if (voicingType === 'drop2') return FOUR_STRING_SET_LABELS;
    if (voicingType === 'shell') return SHELL_STRING_SET_LABELS;
    if (voicingType === 'open') return OPEN_STRING_SET_LABELS;
    return STRING_SET_LABELS;
}

// Rebuild quality / strings / inversion selects when the voicing type changes.
function updateTrainingSelectsForVoicing() {
    var voicingType = document.getElementById('train-voicing-select').dataset.value;
    // Drop-2 and shells are built from 4-note chords → seventh quality list
    var isSeventh = (voicingType === 'drop2' || voicingType === 'shell');
    var qualitySel = document.getElementById('train-quality-select');
    var currentQuality = qualitySel.dataset.value;

    // Quality options
    var wasSeventh = SEVENTH_INTERVALS[currentQuality] !== undefined;
    if (isSeventh !== wasSeventh) {
        var newQuality = isSeventh ? TRIAD_TO_SEVENTH[currentQuality] : SEVENTH_TO_TRIAD[currentQuality];
        var sel = rebuildSelect('train-quality-select',
            isSeventh ? SEVENTH_QUALITY_OPTIONS : TRIAD_QUALITY_OPTIONS, newQuality);
        sel._onChange = updateTrainingVoicings;
    }

    // Strings options
    var labels = trainingSetLabels(voicingType);
    var stringOpts = [{ value: 'all', label: 'All' }];
    for (var i = 0; i < labels.length; i++) stringOpts.push({ value: String(i), label: labels[i] });
    var ssel = rebuildSelect('train-strings-select', stringOpts, 'all');
    ssel._onChange = updateTrainingVoicings;

    // Inversion options (sevenths have a 3rd inversion; shells are root-only grips)
    var invOpts = [{ value: 'all', label: 'All' }];
    var invCount = voicingType === 'shell' ? 1 : (isSeventh ? 4 : 3);
    for (var i = 0; i < invCount; i++) invOpts.push({ value: String(i), label: INVERSION_NAMES[i] });
    var isel = rebuildSelect('train-inversion-select', invOpts, 'all');
    isel._onChange = updateTrainingVoicings;
}

function filterAndSort(voicings, invFilter, stringsFilter) {
    var filtered = voicings;

    if (invFilter !== 'all') {
        var invNum = parseInt(invFilter);
        filtered = filtered.filter(function(v) { return v.inversion === invNum; });
    }

    if (stringsFilter !== 'all') {
        var si = parseInt(stringsFilter);
        filtered = filtered.filter(function(v) { return v.stringSetIndex === si; });
    }

    filtered.sort(function(a, b) {
        var aMin = Math.min(a.voicing[0].fret, a.voicing[1].fret, a.voicing[2].fret);
        var bMin = Math.min(b.voicing[0].fret, b.voicing[1].fret, b.voicing[2].fret);
        if (aMin !== bMin) return aMin - bMin;
        return b.stringSetIndex - a.stringSetIndex;
    });

    return filtered;
}

function rebuildTrainingLabels() {
    // Chord labels depend on spelling — rebuild the voicing list (cheap)
    updateTrainingVoicings._rebuilding = true;
    updateTrainingVoicings();
    updateTrainingVoicings._rebuilding = false;
}

function updateTrainingVoicings() {
    if (!trainRenderer) return;
    var rootIndex = parseInt(document.getElementById('train-root-select').dataset.value);
    var quality = document.getElementById('train-quality-select').dataset.value;
    var mode = document.getElementById('train-mode-select').dataset.value;
    var invFilter = document.getElementById('train-inversion-select').dataset.value;
    var stringsFilter = document.getElementById('train-strings-select').dataset.value;
    var voicingType = document.getElementById('train-voicing-select').dataset.value;

    var isOpen = (voicingType === 'open');
    var isSeventh = (voicingType === 'drop2' || voicingType === 'shell');
    var setLabels = trainingSetLabels(voicingType);

    function voicingsFor(root, q) {
        if (voicingType === 'shell') return getShellVoicingsForChord(root, q);
        if (voicingType === 'drop2') return getDrop2SeventhVoicingsForChord(root, q);
        if (isOpen) return getOpenVoicingsForChord(root, q);
        return getAllVoicingsForChord(root, q);
    }

    var all;

    var scaleBar = document.getElementById('train-scale-bar');

    // Scale runs work for major/minor keys; in seventh mode any diatonic quality applies
    var scaleKey = isSeventh
        ? (quality === 'maj7' ? 'major' : (quality === 'min7' ? 'minor' : null))
        : ((quality === 'major' || quality === 'minor') ? quality : null);
    var isScale = (mode === 'scale' || mode === 'scale-reverse') && scaleKey !== null;

    if (isScale) {
        // Scale Run: cycle through diatonic chords, running up the neck per chord
        var triads = isSeventh ? getScaleSevenths(rootIndex, scaleKey) : getScaleTriads(rootIndex, scaleKey);

        // Build scale bar HTML always in normal order
        var barHtml = '';
        for (var t = 0; t < triads.length; t++) {
            barHtml += '<span class="scale-chord" data-label="' + triads[t].label + '">' + triads[t].label + '</span>';
        }
        scaleBar.innerHTML = barHtml;

        // Reverse triad order for voicings if needed
        var voicingTriads = triads.slice();
        if (mode === 'scale-reverse') voicingTriads.reverse();

        all = [];
        for (var t = 0; t < voicingTriads.length; t++) {
            var triad = voicingTriads[t];
            var chordVoicings = filterAndSort(voicingsFor(triad.root, triad.quality), invFilter, stringsFilter);

            // Tag each voicing with chord info and string set label for showVoicing
            for (var vi = 0; vi < chordVoicings.length; vi++) {
                chordVoicings[vi].chordLabel = triad.label;
                chordVoicings[vi].chordRoot = triad.root;
                chordVoicings[vi].chordQuality = triad.quality;
                chordVoicings[vi].stringSetLabel = setLabels[chordVoicings[vi].stringSetIndex];
            }

            all = all.concat(chordVoicings);
        }
    } else {
        // Single Chord mode (or non-key-quality fallback)
        scaleBar.innerHTML = '';
        all = filterAndSort(voicingsFor(rootIndex, quality), invFilter, stringsFilter);

        // Tag each voicing with chord + string set label
        var singleLabel = chordDisplayLabel(rootIndex, quality);
        for (var vi = 0; vi < all.length; vi++) {
            all[vi].chordLabel = singleLabel;
            all[vi].stringSetLabel = setLabels[all[vi].stringSetIndex];
        }
    }

    metronome.voicings = all;

    if (!updateTrainingVoicings._rebuilding) {
        metronome.currentVoicingIndex = 0;
        if (metronome.playing) {
            stopMetronome();
        }
    }

    if (all.length > 0) {
        showVoicing(Math.min(metronome.currentVoicingIndex, all.length - 1));
    }
}

function showVoicing(index) {
    if (!trainRenderer || metronome.voicings.length === 0) return;

    var v = metronome.voicings[index];

    // Use per-voicing chord info if tagged (scale run mode), else use dropdowns
    var rootIndex, quality;
    if (v.chordRoot !== undefined) {
        rootIndex = v.chordRoot;
        quality = v.chordQuality;
    } else {
        rootIndex = parseInt(document.getElementById('train-root-select').dataset.value);
        quality = document.getElementById('train-quality-select').dataset.value;
    }

    var triadNotes = getChordNotes(rootIndex, quality);
    var triadSpelling = spellChord(rootIndex, quality);
    var intervalLabels = CHORD_INTERVAL_LABELS[quality];

    var nextIndex = (index + 1) % metronome.voicings.length;
    var next = metronome.voicings[nextIndex];
    trainRenderer.setActiveStrings([0, 1, 2, 3, 4, 5]);

    // Build note objects for current voicing
    var notes = [];
    var posKey = {};
    for (var i = 0; i < v.voicing.length; i++) {
        var pos = v.voicing[i];
        var pc = (STRING_TUNING[pos.string] + pos.fret) % 12;
        var triadIdx = triadNotes.indexOf(pc);
        notes.push({
            string: pos.string,
            fret: pos.fret,
            color: INTERVAL_COLOR_KEYS[triadIdx],
            label: labelMode === 'intervals' ? intervalLabels[triadIdx] : triadSpelling.map[pc],
            glow: triadIdx === 0,
            opacity: 1.0,
            size: 22
        });
        posKey[pos.string + ':' + pos.fret] = true;
    }

    // Add dimmed notes for next voicing
    var nextRootIndex, nextQuality;
    if (next.chordRoot !== undefined) {
        nextRootIndex = next.chordRoot;
        nextQuality = next.chordQuality;
    } else {
        nextRootIndex = rootIndex;
        nextQuality = quality;
    }
    var nextTriadNotes = getChordNotes(nextRootIndex, nextQuality);
    var nextSpelling = spellChord(nextRootIndex, nextQuality);
    var nextIntervalLabels = CHORD_INTERVAL_LABELS[nextQuality];

    for (var i = 0; i < next.voicing.length; i++) {
        var pos = next.voicing[i];
        if (posKey[pos.string + ':' + pos.fret]) continue; // don't stack on current notes
        var pc = (STRING_TUNING[pos.string] + pos.fret) % 12;
        var triadIdx = nextTriadNotes.indexOf(pc);
        notes.push({
            string: pos.string,
            fret: pos.fret,
            color: INTERVAL_COLOR_KEYS[triadIdx],
            label: labelMode === 'intervals' ? nextIntervalLabels[triadIdx] : nextSpelling.map[pc],
            glow: false,
            opacity: 0.2,
            size: 18
        });
    }

    trainRenderer.setVoicingGroups([v.voicing]);
    trainRenderer.setNotes(notes);

    // Update indicators
    var nowLabel = v.chordLabel
        ? v.chordLabel + ' — ' + INVERSION_NAMES[v.inversion]
        : INVERSION_NAMES[v.inversion];
    document.getElementById('voicing-now').textContent = nowLabel;
    document.getElementById('voicing-count').textContent = (index + 1) + ' / ' + metronome.voicings.length;
    var descLabel = v.stringSetLabel || STRING_SET_LABELS[v.stringSetIndex];
    document.getElementById('voicing-desc').textContent =
        descLabel + '  ' + INVERSION_NAMES[v.inversion];

    // Highlight active chord in scale bar
    var chords = document.querySelectorAll('#train-scale-bar .scale-chord');
    for (var c = 0; c < chords.length; c++) {
        chords[c].classList.toggle('active', v.chordLabel && chords[c].dataset.label === v.chordLabel);
    }
}

// ===================== Web Audio Metronome =====================

function scheduleClick(time, accent) {
    var ctx = audio.ctx;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = accent ? 1500 : 1000;
    gain.gain.setValueAtTime(accent ? 0.35 : 0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.05);
}

function schedulerTick() {
    var ctx = audio.ctx;
    var lookahead = 0.1; // schedule 100ms ahead

    while (metronome.nextBeatTime < ctx.currentTime + lookahead) {
        var isChordBeat = (metronome.beatInChord === 0);

        // Click — accented on chord-change beats when subdividing
        scheduleClick(metronome.nextBeatTime, isChordBeat && metronome.beatsPerChord > 1);

        if (isChordBeat) {
            // Schedule chord tones if sound toggle is on
            if (document.getElementById('sound-toggle').checked) {
                var v = metronome.voicings[metronome.currentVoicingIndex];
                scheduleChordTones(v.voicing, metronome.nextBeatTime);
            }

            // Schedule voicing display — setTimeout aligned to the beat
            var delay = (metronome.nextBeatTime - ctx.currentTime) * 1000;
            if (delay < 0) delay = 0;
            (function(idx) {
                setTimeout(function() {
                    if (!metronome.playing) return;
                    showVoicing(idx);
                }, delay);
            })(metronome.currentVoicingIndex);
        }

        // Advance beat counter; move to next voicing at chord boundaries
        metronome.beatInChord++;
        if (metronome.beatInChord >= metronome.beatsPerChord) {
            metronome.beatInChord = 0;
            metronome.currentVoicingIndex = (metronome.currentVoicingIndex + 1) % metronome.voicings.length;
        }

        // Schedule next beat
        var secondsPerBeat = 60.0 / metronome.bpm;
        metronome.nextBeatTime += secondsPerBeat;
    }
}

function startMetronome() {
    if (metronome.voicings.length === 0) return;

    var ctx = ensureAudioContext();
    metronome.playing = true;
    metronome.beatInChord = 0;
    metronome.nextBeatTime = ctx.currentTime + 0.05; // small offset to avoid glitches

    metronome.timerId = setInterval(schedulerTick, 25);

    var btn = document.getElementById('transport-btn');
    btn.textContent = 'Stop';
    btn.classList.add('playing');
}

function stopMetronome() {
    metronome.playing = false;
    if (metronome.timerId) {
        clearInterval(metronome.timerId);
        metronome.timerId = null;
    }

    var btn = document.getElementById('transport-btn');
    btn.textContent = 'Play';
    btn.classList.remove('playing');

    // Hold position so you can resume where you stopped
    if (metronome.voicings.length > 0) {
        metronome.currentVoicingIndex = metronome.currentVoicingIndex % metronome.voicings.length;
        showVoicing(metronome.currentVoicingIndex);
    }
}

// ===================== Note Map Mode =====================

function initNoteMapPanel() {
    populatePcOptions('notemap-note-select');

    var canvas = document.getElementById('map-canvas');
    var overlay = document.getElementById('map-overlay');
    mapRenderer = new FretboardRenderer(canvas, overlay);

    mapRenderer.setInteractive(true, function(string, fret) {
        playPositionSound(string, fret);
    });

    document.getElementById('notemap-note-select')._onChange = updateNoteMap;
    document.getElementById('notemap-octaves-select')._onChange = updateNoteMap;

    updateNoteMap();
}

function updateNoteMap() {
    if (!mapRenderer) return;
    var pc = parseInt(document.getElementById('notemap-note-select').dataset.value);
    var showOctaves = document.getElementById('notemap-octaves-select').dataset.value === 'on';

    mapRenderer.setActiveStrings([0, 1, 2, 3, 4, 5]);

    // Every position of this pitch class, frets 0-15, all strings
    var notes = [];
    var positions = [];
    for (var si = 0; si < 6; si++) {
        var openNote = STRING_TUNING[si];
        for (var f = 0; f <= 15; f++) {
            if ((openNote + f) % 12 !== pc) continue;
            // Octave number (scientific pitch notation: MIDI 60 = C4)
            var midi = openNote + f;
            var octave = Math.floor(midi / 12) - 1;
            positions.push({ string: si, fret: f, midi: midi });
            notes.push({
                string: si,
                fret: f,
                color: 'root',
                label: pcDisplayName(pc) + octave,
                glow: false,
                opacity: 1.0,
                size: 22
            });
        }
    }

    // Octave-shape connections: same pitch two strings over
    // (2 frets up crossing E→D / A→G, 3 frets up when crossing the B string)
    var groups = [];
    if (showOctaves) {
        for (var i = 0; i < positions.length; i++) {
            var p = positions[i];
            if (p.string + 2 > 5) continue;
            var diff = STRING_TUNING[p.string + 2] - STRING_TUNING[p.string];
            var f2 = p.fret + 12 - diff;
            if (f2 >= 0 && f2 <= 15) {
                groups.push([
                    { string: p.string, fret: p.fret },
                    { string: p.string + 2, fret: f2 }
                ]);
            }
        }
    }

    mapRenderer.setVoicingGroups(groups);
    mapRenderer.setNotes(notes);

    document.getElementById('notemap-title').textContent = pcOptionLabel(pc);
    document.getElementById('notemap-info').textContent =
        positions.length + ' positions in the first 15 frets — the neck repeats at fret 12';
}

// ===================== Scales Mode =====================

var scalesRenderer = null;
var scalesState = { patterns: [] };

// kind 'scale' reads SCALE_INTERVALS[key]; 'pent' the pentatonic tables.
var SCALES_CATALOG = [
    { value: 'major',         kind: 'scale', key: 'major' },
    { value: 'minor',         kind: 'scale', key: 'minor' },
    { value: 'pent-major',    kind: 'pent',  key: 'major' },
    { value: 'pent-minor',    kind: 'pent',  key: 'minor' },
    { value: 'harmonicMinor', kind: 'scale', key: 'harmonicMinor' },
    { value: 'melodicMinor',  kind: 'scale', key: 'melodicMinor' },
    { value: 'dorian',        kind: 'scale', key: 'dorian' },
    { value: 'phrygian',      kind: 'scale', key: 'phrygian' },
    { value: 'lydian',        kind: 'scale', key: 'lydian' },
    { value: 'mixolydian',    kind: 'scale', key: 'mixolydian' },
    { value: 'dim',           kind: 'scale', key: 'dim' },
    { value: 'aug',           kind: 'scale', key: 'aug' }
];

var MAJOR_DEGREE_SEMIS = [0, 2, 4, 5, 7, 9, 11];

// Degree label relative to the major scale: 1, 2, ♭3, ♯4 ...
function scaleDegreeLabel(step, semi) {
    var diff = semi - MAJOR_DEGREE_SEMIS[step];
    var mark = diff === 0 ? '' : (diff === 1 ? '♯' : diff === -1 ? '♭' : diff === 2 ? '♯♯' : '♭♭');
    return mark + (step + 1);
}

// Indices (into the scale's note list) of the tonic chord tones, for coloring.
function scalesTriadIdx(entry) {
    if (entry.kind === 'pent') return entry.key === 'major' ? [0, 2, 3] : [0, 1, 3];
    return [0, 2, 4]; // stacked thirds; also gives the aug triad for whole-tone
}

function scalesEntry() {
    var val = document.getElementById('scales-type-select').dataset.value;
    for (var i = 0; i < SCALES_CATALOG.length; i++) {
        if (SCALES_CATALOG[i].value === val) return SCALES_CATALOG[i];
    }
    return SCALES_CATALOG[0];
}

// Everything the panel needs about the current scale, in one place.
function resolveScaleData(rootPc, entry) {
    if (entry.kind === 'pent') {
        var parentIv = SCALE_INTERVALS[entry.key];
        var degs = PENTATONIC_PARENT_DEGREES[entry.key];
        return {
            intervals: PENTATONIC_INTERVALS[entry.key],
            spelling: spellPentatonic(rootPc, entry.key),
            degLabels: degs.map(function(d) { return scaleDegreeLabel(d, parentIv[d]); }),
            displayName: (entry.key === 'major' ? 'Major' : 'Minor') + ' pentatonic'
        };
    }
    var iv = SCALE_INTERVALS[entry.key];
    return {
        intervals: iv,
        spelling: spellScale(rootPc, entry.key),
        degLabels: iv.map(function(semi, d) { return scaleDegreeLabel(d, semi); }),
        displayName: SCALE_DISPLAY_NAMES[entry.key]
    };
}

// Step formula: W – W – H ... (W+H for the pentatonic minor-third gaps)
function scaleFormula(intervals) {
    var parts = [];
    for (var i = 0; i < intervals.length; i++) {
        var next = i + 1 < intervals.length ? intervals[i + 1] : intervals[0] + 12;
        var gap = next - intervals[i];
        parts.push(gap === 1 ? 'H' : gap === 2 ? 'W' : 'W+H');
    }
    return parts.join(' – ');
}

function initScalesPanel() {
    populatePcOptions('scales-root-select');

    var canvas = document.getElementById('scales-canvas');
    var overlay = document.getElementById('scales-overlay');
    scalesRenderer = new FretboardRenderer(canvas, overlay);
    scalesRenderer.setInteractive(true, function(string, fret) {
        playPositionSound(string, fret);
    });

    var rebuildAndUpdate = function() {
        rebuildScalesPositions();
        updateScales();
        retuneScalesDrone(); // follow root changes while droning
    };
    document.getElementById('scales-root-select')._onChange = rebuildAndUpdate;
    document.getElementById('scales-type-select')._onChange = rebuildAndUpdate;
    document.getElementById('scales-layout-select')._onChange = rebuildAndUpdate;
    document.getElementById('scales-position-select')._onChange = updateScales;

    document.getElementById('scales-play-up').addEventListener('click', function() { playScale(1); });
    document.getElementById('scales-play-down').addEventListener('click', function() { playScale(-1); });
    document.getElementById('scales-drone-btn').addEventListener('click', function() {
        if (scalesDrone) stopScalesDrone();
        else startScalesDrone();
    });

    rebuildScalesPositions();
    updateScales();
}

// One pattern per start degree, sorted low to high on the neck; positions
// that can't fit in 15 frets are dropped (buildNpsPattern returns null).
function rebuildScalesPositions() {
    var layout = document.getElementById('scales-layout-select').dataset.value;
    var wrap = document.getElementById('scales-position-wrap');
    if (layout === 'full') {
        scalesState.patterns = [];
        wrap.style.display = 'none';
        return;
    }
    var rootPc = parseInt(document.getElementById('scales-root-select').dataset.value);
    var data = resolveScaleData(rootPc, scalesEntry());
    var nps = layout === 'nps3' ? 3 : 2;
    var patterns = [];
    for (var d = 0; d < data.intervals.length; d++) {
        var p = buildNpsPattern(rootPc, data.intervals, nps, d);
        if (p) patterns.push(p);
    }
    patterns.sort(function(a, b) { return a.minFret - b.minFret || a.maxFret - b.maxFret; });
    scalesState.patterns = patterns;

    var options = patterns.map(function(p, i) {
        return { value: String(i), label: 'Frets ' + p.minFret + '–' + p.maxFret };
    });
    if (options.length === 0) options = [{ value: '0', label: '—' }];
    rebuildSelect('scales-position-select', options, '0');
    wrap.style.display = '';
}

function currentScalePattern() {
    if (scalesState.patterns.length === 0) return null;
    var pos = parseInt(document.getElementById('scales-position-select').dataset.value) || 0;
    return scalesState.patterns[Math.min(pos, scalesState.patterns.length - 1)];
}

function scaleNoteObj(string, fret, degIdx, data, triadIdx) {
    var pc = (STRING_TUNING[string] + fret) % 12;
    var t = triadIdx.indexOf(degIdx);
    return {
        string: string,
        fret: fret,
        color: t === -1 ? 'pent' : INTERVAL_COLOR_KEYS[t],
        label: labelMode === 'intervals' ? data.degLabels[degIdx] : data.spelling.map[pc],
        glow: degIdx === 0,
        opacity: t === -1 ? 0.8 : 1.0,
        size: 22
    };
}

function updateScales() {
    if (!scalesRenderer) return;
    var rootPc = parseInt(document.getElementById('scales-root-select').dataset.value);
    var entry = scalesEntry();
    var data = resolveScaleData(rootPc, entry);
    var layout = document.getElementById('scales-layout-select').dataset.value;
    var triadIdx = scalesTriadIdx(entry);
    var pcs = data.intervals.map(function(iv) { return (rootPc + iv) % 12; });

    scalesRenderer.setActiveStrings([0, 1, 2, 3, 4, 5]);
    scalesRenderer.setVoicingGroups([]);

    var notes = [];
    var layoutNote = '';
    var pattern = layout === 'full' ? null : currentScalePattern();
    if (pattern) {
        scalesRenderer.setFocusRegion(pattern.minFret, pattern.maxFret);
        for (var i = 0; i < pattern.positions.length; i++) {
            var p = pattern.positions[i];
            notes.push(scaleNoteObj(p.string, p.fret, p.degree, data, triadIdx));
        }
        layoutNote = (layout === 'nps3' ? '3' : '2') + ' notes per string · frets ' + pattern.minFret + '–' + pattern.maxFret;
    } else {
        scalesRenderer.setFocusRegion(null);
        for (var si = 0; si < 6; si++) {
            for (var f = 0; f <= 15; f++) {
                var idx = pcs.indexOf((STRING_TUNING[si] + f) % 12);
                if (idx === -1) continue;
                notes.push(scaleNoteObj(si, f, idx, data, triadIdx));
            }
        }
    }
    scalesRenderer.setNotes(notes);

    var html = '<div class="scale-row">';
    for (var d = 0; d < data.intervals.length; d++) {
        var isTriad = triadIdx.indexOf(d) !== -1;
        html += '<div class="scale-degree' + (isTriad ? ' triad' : '') + '">';
        html += '<span class="degree-name">' + data.spelling.names[d] + '</span>';
        html += '<span class="degree-num">' + data.degLabels[d] + '</span>';
        html += '</div>';
    }
    html += '</div>';
    html += '<div class="scale-name">' + data.spelling.names[0] + ' ' + data.displayName
        + ' · ' + scaleFormula(data.intervals)
        + (layoutNote ? ' · ' + layoutNote : '') + '</div>';
    document.getElementById('scales-note-info').innerHTML = html;
}

// ---- Root drone: a sustained tonic under the scale, so each degree's
// color (the ♮6 of Dorian, the ♭2 of Phrygian) is audible against home. ----

var scalesDrone = null; // { osc, gain }

function midiToFreq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
}

function scalesDroneMidi() {
    var rootPc = parseInt(document.getElementById('scales-root-select').dataset.value);
    return 40 + ((rootPc - 4 + 12) % 12); // E2..D♯3 — low but not muddy
}

function startScalesDrone() {
    var ctx = ensureAudioContext();
    var osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = midiToFreq(scalesDroneMidi());
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 0.7;
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.8);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    scalesDrone = { osc: osc, gain: gain };
    document.getElementById('scales-drone-btn').classList.add('playing');
}

function stopScalesDrone() {
    if (!scalesDrone) return;
    var ctx = audio.ctx;
    var g = scalesDrone.gain.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(Math.max(g.value, 0.0001), ctx.currentTime);
    g.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    scalesDrone.osc.stop(ctx.currentTime + 0.5);
    scalesDrone = null;
    var btn = document.getElementById('scales-drone-btn');
    if (btn) btn.classList.remove('playing');
}

function retuneScalesDrone() {
    if (!scalesDrone) return;
    scalesDrone.osc.frequency.setTargetAtTime(
        midiToFreq(scalesDroneMidi()), audio.ctx.currentTime, 0.05);
}

// dir: 1 = ascending, -1 = descending. Patterns play their actual fretted
// notes; full-neck view plays one octave from the root.
function playScale(dir) {
    var ctx = ensureAudioContext();
    var layout = document.getElementById('scales-layout-select').dataset.value;
    var midis = [];
    var pattern = layout === 'full' ? null : currentScalePattern();
    if (pattern) {
        for (var i = 0; i < pattern.positions.length; i++) {
            midis.push(STRING_TUNING[pattern.positions[i].string] + pattern.positions[i].fret);
        }
    } else {
        var rootPc = parseInt(document.getElementById('scales-root-select').dataset.value);
        var data = resolveScaleData(rootPc, scalesEntry());
        var rootMidi = 45 + ((rootPc - 9 + 12) % 12); // A2..G♯3
        for (var i = 0; i < data.intervals.length; i++) midis.push(rootMidi + data.intervals[i]);
        midis.push(rootMidi + 12);
    }
    if (dir < 0) midis.reverse();
    var t0 = ctx.currentTime + 0.05;
    for (var i = 0; i < midis.length; i++) playNoteSound(midis[i], t0 + i * 0.22);
}

// ===================== Chord Zones Mode =====================

var zonesRenderer = null;
var zonesState = { chords: [], selected: 0 };

var ZONE_RANGES = [
    { minFret: 0,  maxFret: 5 },
    { minFret: 5,  maxFret: 10 },
    { minFret: 10, maxFret: 15 }
];

function currentZone() {
    var i = parseInt(document.getElementById('zones-zone-select').dataset.value) || 0;
    return ZONE_RANGES[Math.min(i, ZONE_RANGES.length - 1)];
}

function initZonesPanel() {
    populatePcOptions('zones-key-select');

    var canvas = document.getElementById('zones-canvas');
    var overlay = document.getElementById('zones-overlay');
    zonesRenderer = new FretboardRenderer(canvas, overlay);
    zonesRenderer.setInteractive(true, function(string, fret) {
        playPositionSound(string, fret);
    });

    var resetAndUpdate = function() { zonesState.selected = 0; updateZones(); };
    document.getElementById('zones-key-select')._onChange = resetAndUpdate;
    document.getElementById('zones-scale-select')._onChange = resetAndUpdate;
    document.getElementById('zones-mode-select')._onChange = function() {
        zonesState.selected = 0;
        updateZonesControls();
        updateZones();
    };
    document.getElementById('zones-quality-select')._onChange = updateZones;
    document.getElementById('zones-voicing-select')._onChange = function() {
        updateZonesControls();
        updateZones();
    };
    document.getElementById('zones-zone-select')._onChange = updateZones;

    updateZones();
}

// Show Key+Tonality in diatonic mode, Quality in all-roots mode; keep the
// quality options in the right family (triads vs sevenths) for the voicing.
function updateZonesControls() {
    var all = document.getElementById('zones-mode-select').dataset.value === 'all';
    document.getElementById('zones-key-wrap').style.display = all ? 'none' : '';
    document.getElementById('zones-scale-wrap').style.display = all ? 'none' : '';
    document.getElementById('zones-quality-wrap').style.display = all ? '' : 'none';

    var voicingType = document.getElementById('zones-voicing-select').dataset.value;
    var isSeventh = voicingType === 'drop2' || voicingType === 'shell';
    var current = document.getElementById('zones-quality-select').dataset.value;
    var wasSeventh = SEVENTH_INTERVALS[current] !== undefined;
    if (isSeventh !== wasSeventh) {
        rebuildSelect('zones-quality-select',
            isSeventh ? SEVENTH_QUALITY_OPTIONS : TRIAD_QUALITY_OPTIONS,
            isSeventh ? TRIAD_TO_SEVENTH[current] : SEVENTH_TO_TRIAD[current]);
    }
}

function zoneVoicingsFor(chord, voicingType, zone) {
    var range = { minFret: zone.minFret, maxFret: zone.maxFret };
    if (voicingType === 'open') return getOpenVoicingsForChord(chord.root, chord.quality, range);
    if (voicingType === 'drop2') return getDrop2SeventhVoicingsForChord(chord.root, chord.quality, range);
    if (voicingType === 'shell') return getShellVoicingsForChord(chord.root, chord.quality, range);
    return getAllVoicingsForChord(chord.root, chord.quality, range);
}

function updateZones() {
    if (!zonesRenderer) return;
    var voicingType = document.getElementById('zones-voicing-select').dataset.value;
    var useSevenths = voicingType === 'drop2' || voicingType === 'shell';
    var allRoots = document.getElementById('zones-mode-select').dataset.value === 'all';

    var chords;
    if (allRoots) {
        // Key-agnostic reference: every root at one quality, no numerals
        var q = document.getElementById('zones-quality-select').dataset.value;
        // Keep the quality in the right family even if the selects got out of sync
        if (useSevenths && SEVENTH_INTERVALS[q] === undefined) q = TRIAD_TO_SEVENTH[q];
        if (!useSevenths && TRIAD_INTERVALS[q] === undefined) q = SEVENTH_TO_TRIAD[q];
        chords = [];
        for (var pc = 0; pc < 12; pc++) {
            chords.push({ root: pc, quality: q, label: chordDisplayLabel(pc, q), numeral: null });
        }
    } else {
        var keyPc = parseInt(document.getElementById('zones-key-select').dataset.value);
        var scale = document.getElementById('zones-scale-select').dataset.value;
        chords = useSevenths ? getScaleSevenths(keyPc, scale) : getScaleTriads(keyPc, scale);
    }
    zonesState.chords = chords;
    if (zonesState.selected >= chords.length) zonesState.selected = 0;

    var bar = document.getElementById('zones-chord-bar');
    bar.classList.toggle('zones-bar-all', allRoots);
    var barHtml = '';
    for (var d = 0; d < chords.length; d++) {
        barHtml += '<span class="scale-chord' + (d === zonesState.selected ? ' active' : '') + '" data-index="' + d + '">'
            + chords[d].label
            + (chords[d].numeral ? '<span class="zone-numeral">' + chords[d].numeral + '</span>' : '')
            + '</span>';
    }
    bar.innerHTML = barHtml;
    var chips = bar.querySelectorAll('.scale-chord');
    for (var i = 0; i < chips.length; i++) {
        (function(chip) {
            chip.addEventListener('click', function() {
                zonesState.selected = parseInt(chip.dataset.index);
                updateZones();
                playZoneChord();
            });
        })(chips[i]);
    }

    renderZoneChord();
}

function renderZoneChord() {
    var zone = currentZone();
    var voicingType = document.getElementById('zones-voicing-select').dataset.value;
    var chord = zonesState.chords[zonesState.selected];
    var grips = zoneVoicingsFor(chord, voicingType, zone);

    zonesRenderer.setActiveStrings([0, 1, 2, 3, 4, 5]);
    zonesRenderer.setFocusRegion(zone.minFret, zone.maxFret);

    var notes = [];
    var groups = [];
    var seen = {};
    for (var i = 0; i < grips.length; i++) {
        groups.push(grips[i].voicing);
        var vn = chordVoicingNotes(chord.root, chord.quality, grips[i].voicing);
        for (var j = 0; j < vn.length; j++) {
            var k = vn[j].string + ':' + vn[j].fret;
            if (seen[k]) continue;
            seen[k] = true;
            notes.push(vn[j]);
        }
    }
    zonesRenderer.setVoicingGroups(groups);
    zonesRenderer.setNotes(notes);

    var spelled = spellChord(chord.root, chord.quality);
    var text = chord.label + (chord.numeral ? ' (' + chord.numeral + ')' : '')
        + ' — ' + spelled.names.join(' · ') + ' — ';
    text += grips.length === 0
        ? 'no full grips between frets ' + zone.minFret + ' and ' + zone.maxFret + ' — try the next zone'
        : grips.length + (grips.length === 1 ? ' grip' : ' grips') + ' between frets ' + zone.minFret + ' and ' + zone.maxFret;
    document.getElementById('zones-info').innerHTML = '<div class="scale-name">' + text + '</div>';
}

function playZoneChord() {
    var chord = zonesState.chords[zonesState.selected];
    var voicingType = document.getElementById('zones-voicing-select').dataset.value;
    var grips = zoneVoicingsFor(chord, voicingType, currentZone());
    if (grips.length === 0) return;
    var ctx = ensureAudioContext();
    scheduleChordTones(grips[0].voicing, ctx.currentTime + 0.05);
}

// ===================== Note Quiz Mode =====================

var quiz = {
    target: null,        // { pc, string, fret (name mode) }
    answering: false,
    session: { right: 0, total: 0, streak: 0, best: 0 },
    countdownId: null,
    nextTimeout: null,
    lastKey: null
};

var QUIZ_STATS_STORAGE_KEY = 'triadTrainerNoteStats';

function loadQuizStats() {
    try {
        return JSON.parse(localStorage.getItem(QUIZ_STATS_STORAGE_KEY)) || {};
    } catch (e) {
        return {};
    }
}

function saveQuizStats(stats) {
    try {
        localStorage.setItem(QUIZ_STATS_STORAGE_KEY, JSON.stringify(stats));
    } catch (e) { /* private mode etc. — stats just don't persist */ }
}

function recordQuizResult(pc, string, correct) {
    var stats = loadQuizStats();
    var key = pc + '|' + string;
    if (!stats[key]) stats[key] = { r: 0, w: 0 };
    if (correct) stats[key].r++;
    else stats[key].w++;
    saveQuizStats(stats);
}

function getQuizStrings() {
    var out = [];
    var btns = document.querySelectorAll('#quiz-string-toggles .string-toggle');
    for (var i = 0; i < btns.length; i++) {
        if (btns[i].classList.contains('active')) out.push(parseInt(btns[i].dataset.string));
    }
    return out;
}

function getQuizPcs() {
    var notesMode = document.getElementById('quiz-notes-select').dataset.value;
    if (notesMode === 'naturals') return NATURAL_PCS.slice();
    var all = [];
    for (var i = 0; i < 12; i++) all.push(i);
    return all;
}

var QUIZ_LEVELS = {
    '1': { strings: [0, 1], notes: 'naturals' },
    '2': { strings: [0, 1, 2, 3], notes: 'naturals' },
    '3': { strings: [0, 1, 2, 3, 4, 5], notes: 'naturals' },
    '4': { strings: [0, 1, 2, 3, 4, 5], notes: 'all' }
};

function applyQuizLevel(level) {
    var preset = QUIZ_LEVELS[level];
    if (!preset) return;
    var btns = document.querySelectorAll('#quiz-string-toggles .string-toggle');
    for (var i = 0; i < btns.length; i++) {
        var si = parseInt(btns[i].dataset.string);
        btns[i].classList.toggle('active', preset.strings.indexOf(si) !== -1);
    }
    setSelectValue(document.getElementById('quiz-notes-select'), preset.notes);
}

function markQuizLevelCustom() {
    setSelectValue(document.getElementById('quiz-level-select'), 'custom');
}

function initQuizPanel() {
    var canvas = document.getElementById('quiz-canvas');
    var overlay = document.getElementById('quiz-overlay');
    quizRenderer = new FretboardRenderer(canvas, overlay);

    quizRenderer.setInteractive(true, function(string, fret) {
        handleQuizFretboardClick(string, fret);
    });

    document.getElementById('quiz-type-select')._onChange = newQuizQuestion;
    document.getElementById('quiz-timer-select')._onChange = newQuizQuestion;
    document.getElementById('quiz-notes-select')._onChange = function() {
        markQuizLevelCustom();
        newQuizQuestion();
    };
    document.getElementById('quiz-level-select')._onChange = function() {
        var level = document.getElementById('quiz-level-select').dataset.value;
        if (level !== 'custom') applyQuizLevel(level);
        newQuizQuestion();
    };

    var btns = document.querySelectorAll('#quiz-string-toggles .string-toggle');
    for (var i = 0; i < btns.length; i++) {
        (function(btn) {
            btn.addEventListener('click', function() {
                btn.classList.toggle('active');
                if (getQuizStrings().length === 0) {
                    btn.classList.add('active'); // never allow zero strings
                    return;
                }
                markQuizLevelCustom();
                newQuizQuestion();
            });
        })(btns[i]);
    }

    document.getElementById('quiz-reset-btn').addEventListener('click', function() {
        localStorage.removeItem(QUIZ_STATS_STORAGE_KEY);
        renderQuizStats();
    });

    renderQuizStats();
    newQuizQuestion();
}

function stopQuizTimers() {
    if (quiz.countdownId) {
        clearInterval(quiz.countdownId);
        quiz.countdownId = null;
    }
    if (quiz.nextTimeout) {
        clearTimeout(quiz.nextTimeout);
        quiz.nextTimeout = null;
    }
}

// Weighted pick: notes you miss (or haven't seen) come up more often.
function pickQuizTarget(strings, pcs) {
    var stats = loadQuizStats();
    var candidates = [];
    for (var s = 0; s < strings.length; s++) {
        for (var p = 0; p < pcs.length; p++) {
            var key = pcs[p] + '|' + strings[s];
            if (key === quiz.lastKey && (strings.length * pcs.length) > 1) continue;
            var st = stats[key];
            var errRate;
            if (!st || (st.r + st.w) < 3) {
                errRate = 0.5; // unseen / barely seen — medium priority
            } else {
                errRate = st.w / (st.r + st.w);
            }
            candidates.push({ pc: pcs[p], string: strings[s], weight: 1 + 4 * errRate });
        }
    }
    var total = 0;
    for (var i = 0; i < candidates.length; i++) total += candidates[i].weight;
    var roll = Math.random() * total;
    for (var i = 0; i < candidates.length; i++) {
        roll -= candidates[i].weight;
        if (roll <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
}

function newQuizQuestion() {
    if (!quizRenderer) return;
    stopQuizTimers();
    quiz.answering = true;

    var type = document.getElementById('quiz-type-select').dataset.value;
    var strings = getQuizStrings();
    var pcs = getQuizPcs();

    var picked = pickQuizTarget(strings, pcs);
    quiz.lastKey = picked.pc + '|' + picked.string;
    quiz.target = { pc: picked.pc, string: picked.string, type: type };

    var prompt = document.getElementById('quiz-prompt');
    prompt.classList.remove('correct', 'wrong');

    if (type === 'find') {
        prompt.textContent = 'Find ' + pcOptionLabel(picked.pc) + ' — ' + STRING_PROMPT_LABELS[picked.string] + ' string';
        quizRenderer.setActiveStrings(strings);
        quizRenderer.setVoicingGroups([]);
        quizRenderer.setNotes([]);
        buildQuizAnswerButtons(false);
    } else {
        // Name mode: pick a concrete fret for this pc on this string (0-12)
        var frets = [];
        for (var f = 0; f <= 12; f++) {
            if ((STRING_TUNING[picked.string] + f) % 12 === picked.pc) frets.push(f);
        }
        quiz.target.fret = frets[Math.floor(Math.random() * frets.length)];
        prompt.textContent = 'Name this note';
        quizRenderer.setActiveStrings([picked.string]);
        quizRenderer.setVoicingGroups([]);
        quizRenderer.setNotes([{
            string: picked.string,
            fret: quiz.target.fret,
            color: 'quiz',
            label: '?',
            glow: true,
            opacity: 1.0,
            size: 22
        }]);
        buildQuizAnswerButtons(true);
    }

    startQuizCountdown();
}

function buildQuizAnswerButtons(visible) {
    var wrap = document.getElementById('quiz-answers');
    wrap.innerHTML = '';
    if (!visible) return;

    var pcs = getQuizPcs();
    for (var i = 0; i < pcs.length; i++) {
        (function(pc) {
            var btn = document.createElement('button');
            btn.className = 'quiz-answer-btn';
            btn.dataset.pc = pc;
            btn.textContent = pcOptionLabel(pc);
            btn.addEventListener('click', function() {
                handleQuizAnswer(pc, btn);
            });
            wrap.appendChild(btn);
        })(pcs[i]);
    }
}

function startQuizCountdown() {
    var timerVal = document.getElementById('quiz-timer-select').dataset.value;
    var bar = document.getElementById('quiz-timer-bar');
    var fill = document.getElementById('quiz-timer-fill');

    if (timerVal === 'off') {
        bar.style.visibility = 'hidden';
        return;
    }

    bar.style.visibility = 'visible';
    var duration = parseInt(timerVal) * 1000;
    var start = performance.now();
    fill.style.width = '100%';

    quiz.countdownId = setInterval(function() {
        var elapsed = performance.now() - start;
        var remaining = Math.max(0, 1 - elapsed / duration);
        fill.style.width = (remaining * 100) + '%';
        if (remaining <= 0) {
            clearInterval(quiz.countdownId);
            quiz.countdownId = null;
            handleQuizTimeout();
        }
    }, 50);
}

function updateQuizScoreDisplay() {
    document.getElementById('quiz-score').textContent =
        quiz.session.right + ' / ' + quiz.session.total;
    var streakEl = document.getElementById('quiz-streak');
    streakEl.textContent = quiz.session.streak >= 3
        ? 'streak ' + quiz.session.streak + (quiz.session.best > quiz.session.streak ? ' (best ' + quiz.session.best + ')' : '')
        : (quiz.session.best >= 3 ? 'best streak ' + quiz.session.best : '');
}

function finishQuizQuestion(correct) {
    quiz.answering = false;
    stopQuizTimers();
    document.getElementById('quiz-timer-bar').style.visibility = 'hidden';

    quiz.session.total++;
    if (correct) {
        quiz.session.right++;
        quiz.session.streak++;
        if (quiz.session.streak > quiz.session.best) quiz.session.best = quiz.session.streak;
    } else {
        quiz.session.streak = 0;
    }
    recordQuizResult(quiz.target.pc, quiz.target.string, correct);
    updateQuizScoreDisplay();
    renderQuizStats();

    var prompt = document.getElementById('quiz-prompt');
    prompt.classList.add(correct ? 'correct' : 'wrong');

    quiz.nextTimeout = setTimeout(newQuizQuestion, correct ? 1200 : 2200);
}

// All frets (0-15) of `pc` on `string`
function fretsForPcOnString(pc, string) {
    var out = [];
    for (var f = 0; f <= 15; f++) {
        if ((STRING_TUNING[string] + f) % 12 === pc) out.push(f);
    }
    return out;
}

function handleQuizFretboardClick(string, fret) {
    if (!quiz.target || !quiz.answering || quiz.target.type !== 'find') return;

    playPositionSound(string, fret);

    var clickedPc = (STRING_TUNING[string] + fret) % 12;
    var correct = (string === quiz.target.string && clickedPc === quiz.target.pc);

    var notes = [];
    var targetFrets = fretsForPcOnString(quiz.target.pc, quiz.target.string);

    if (correct) {
        for (var i = 0; i < targetFrets.length; i++) {
            notes.push({
                string: quiz.target.string,
                fret: targetFrets[i],
                color: 'correct',
                label: pcDisplayName(quiz.target.pc),
                glow: targetFrets[i] === fret,
                opacity: targetFrets[i] === fret ? 1.0 : 0.55,
                size: 22
            });
        }
        document.getElementById('quiz-prompt').textContent = 'Correct — ' + pcOptionLabel(quiz.target.pc);
    } else {
        // Show what they actually hit (red, labeled) + where the answer was (green)
        notes.push({
            string: string,
            fret: fret,
            color: 'wrong',
            label: pcDisplayName(clickedPc),
            glow: false,
            opacity: 1.0,
            size: 22
        });
        for (var i = 0; i < targetFrets.length; i++) {
            notes.push({
                string: quiz.target.string,
                fret: targetFrets[i],
                color: 'correct',
                label: pcDisplayName(quiz.target.pc),
                glow: false,
                opacity: 0.8,
                size: 22
            });
        }
        document.getElementById('quiz-prompt').textContent =
            'That was ' + pcDisplayName(clickedPc) + ' — ' + pcDisplayName(quiz.target.pc) + ' is here';
    }

    quizRenderer.setNotes(notes);
    finishQuizQuestion(correct);
}

function handleQuizAnswer(pc, btn) {
    if (!quiz.target || !quiz.answering || quiz.target.type !== 'name') return;

    var correct = (pc === quiz.target.pc);
    playPositionSound(quiz.target.string, quiz.target.fret);

    // Disable all buttons, mark the clicked + correct ones
    var allBtns = document.querySelectorAll('#quiz-answers .quiz-answer-btn');
    for (var i = 0; i < allBtns.length; i++) {
        allBtns[i].disabled = true;
        var bpc = parseInt(allBtns[i].dataset.pc);
        if (bpc === quiz.target.pc) allBtns[i].classList.add('correct');
    }
    if (!correct) btn.classList.add('wrong');

    // Reveal the note on the fretboard
    quizRenderer.setNotes([{
        string: quiz.target.string,
        fret: quiz.target.fret,
        color: correct ? 'correct' : 'wrong',
        label: pcDisplayName(quiz.target.pc),
        glow: true,
        opacity: 1.0,
        size: 22
    }]);

    document.getElementById('quiz-prompt').textContent = correct
        ? 'Correct — ' + pcOptionLabel(quiz.target.pc)
        : 'It was ' + pcOptionLabel(quiz.target.pc);

    finishQuizQuestion(correct);
}

function handleQuizTimeout() {
    if (!quiz.target || !quiz.answering) return;

    var notes = [];
    if (quiz.target.type === 'find') {
        var targetFrets = fretsForPcOnString(quiz.target.pc, quiz.target.string);
        for (var i = 0; i < targetFrets.length; i++) {
            notes.push({
                string: quiz.target.string,
                fret: targetFrets[i],
                color: 'correct',
                label: pcDisplayName(quiz.target.pc),
                glow: false,
                opacity: 0.8,
                size: 22
            });
        }
    } else {
        notes.push({
            string: quiz.target.string,
            fret: quiz.target.fret,
            color: 'wrong',
            label: pcDisplayName(quiz.target.pc),
            glow: true,
            opacity: 1.0,
            size: 22
        });
        var allBtns = document.querySelectorAll('#quiz-answers .quiz-answer-btn');
        for (var i = 0; i < allBtns.length; i++) {
            allBtns[i].disabled = true;
            if (parseInt(allBtns[i].dataset.pc) === quiz.target.pc) allBtns[i].classList.add('correct');
        }
    }
    quizRenderer.setNotes(notes);
    document.getElementById('quiz-prompt').textContent =
        'Time — it was ' + pcOptionLabel(quiz.target.pc);
    finishQuizQuestion(false);
}

function renderQuizStats() {
    var wrap = document.getElementById('quiz-stats');
    if (!wrap) return;
    var stats = loadQuizStats();

    // Aggregate per pitch class across all strings
    var html = '';
    for (var pc = 0; pc < 12; pc++) {
        var r = 0, w = 0;
        for (var s = 0; s < 6; s++) {
            var st = stats[pc + '|' + s];
            if (st) { r += st.r; w += st.w; }
        }
        var total = r + w;
        var cls = '';
        var pctText = '—';
        if (total > 0) {
            var pct = Math.round((r / total) * 100);
            pctText = pct + '%';
            cls = pct >= 85 ? 'good' : (pct >= 60 ? 'mid' : 'bad');
        }
        html += '<div class="quiz-stat-cell ' + cls + '">';
        html += '<span class="stat-note">' + pcDisplayName(pc) + '</span>';
        html += '<span class="stat-pct">' + pctText + '</span>';
        html += '</div>';
    }
    wrap.innerHTML = html;
}

// ===================== Interval Trainer =====================

var ivRenderer = null;
var iv = {
    target: null,
    answering: false,
    session: { right: 0, total: 0, streak: 0, best: 0 },
    nextTimeout: null
};

var IV_STATS_STORAGE_KEY = 'triadTrainerIntervalStats';
var IV_RANGES = {
    basic: [1, 2, 3, 4],
    to5:   [1, 2, 3, 4, 5, 6, 7],
    all:   [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
};

function loadIvStats() {
    try { return JSON.parse(localStorage.getItem(IV_STATS_STORAGE_KEY)) || {}; }
    catch (e) { return {}; }
}

function recordIvResult(key, correct) {
    var stats = loadIvStats();
    if (!stats[key]) stats[key] = { r: 0, w: 0 };
    if (correct) stats[key].r++;
    else stats[key].w++;
    try { localStorage.setItem(IV_STATS_STORAGE_KEY, JSON.stringify(stats)); } catch (e) {}
}

// Generic weighted pick over [{key, ...}] using an error-rate stats object
function weightedPick(candidates, stats, avoidKey) {
    var pool = [];
    for (var i = 0; i < candidates.length; i++) {
        if (candidates[i].key === avoidKey && candidates.length > 1) continue;
        var st = stats[candidates[i].key];
        var errRate = (!st || (st.r + st.w) < 3) ? 0.5 : st.w / (st.r + st.w);
        pool.push({ item: candidates[i], weight: 1 + 4 * errRate });
    }
    var total = 0;
    for (var i = 0; i < pool.length; i++) total += pool[i].weight;
    var roll = Math.random() * total;
    for (var i = 0; i < pool.length; i++) {
        roll -= pool[i].weight;
        if (roll <= 0) return pool[i].item;
    }
    return pool[pool.length - 1].item;
}

function initIntervalsPanel() {
    var canvas = document.getElementById('iv-canvas');
    var overlay = document.getElementById('iv-overlay');
    ivRenderer = new FretboardRenderer(canvas, overlay);

    ivRenderer.setInteractive(true, function(string, fret) {
        handleIvFretboardClick(string, fret);
    });

    document.getElementById('iv-mode-select')._onChange = newIvQuestion;
    document.getElementById('iv-range-select')._onChange = newIvQuestion;
    document.getElementById('iv-chords-select')._onChange = newIvQuestion;
    document.getElementById('iv-replay-btn').addEventListener('click', playIvQuestion);
    document.getElementById('iv-reset-btn').addEventListener('click', function() {
        localStorage.removeItem(IV_STATS_STORAGE_KEY);
        renderIvStats();
    });

    renderIvStats();
    newIvQuestion();
}

function ivQualityList() {
    return document.getElementById('iv-chords-select').dataset.value === 'sevenths'
        ? ['maj7', 'min7', 'dom7', 'm7b5'] : ['major', 'minor', 'dim', 'aug'];
}

function newIvQuestion() {
    if (!ivRenderer) return;
    if (iv.nextTimeout) { clearTimeout(iv.nextTimeout); iv.nextTimeout = null; }
    iv.answering = true;

    var mode = document.getElementById('iv-mode-select').dataset.value;
    var prompt = document.getElementById('iv-prompt');
    prompt.classList.remove('correct', 'wrong');

    var stats = loadIvStats();

    if (mode === 'chord-ear') {
        var qualities = ivQualityList();
        var cands = qualities.map(function(q) { return { key: 'c|' + q, quality: q }; });
        var picked = weightedPick(cands, stats, iv.target && iv.target.key);
        var rootPc = Math.floor(Math.random() * 12);
        var pool = SEVENTH_INTERVALS[picked.quality]
            ? getDrop2SeventhVoicingsForChord(rootPc, picked.quality)
            : getAllVoicingsForChord(rootPc, picked.quality);
        var v = pool[Math.floor(Math.random() * pool.length)];
        iv.target = { mode: mode, key: picked.key, quality: picked.quality, rootPc: rootPc, voicing: v.voicing };

        prompt.textContent = 'What chord quality is this?';
        ivRenderer.setActiveStrings([0, 1, 2, 3, 4, 5]);
        ivRenderer.setVoicingGroups([]);
        ivRenderer.setNotes([]);
        buildIvAnswerButtons(qualities.map(function(q) {
            var pretty = { major: 'Major', minor: 'Minor', dim: 'Dim', aug: 'Aug',
                           maj7: 'Maj7', min7: 'Min7', dom7: 'Dom7', m7b5: 'Min7♭5' };
            return { value: q, label: pretty[q] };
        }));
    } else {
        var semis = IV_RANGES[document.getElementById('iv-range-select').dataset.value];
        var cands = semis.map(function(s) { return { key: 'i|' + s, semi: s }; });
        var picked = weightedPick(cands, stats, iv.target && iv.target.key);
        var semi = picked.semi;

        // Place a root and (for sight modes) a concrete target position
        var root = null, targetPos = null;
        for (var attempt = 0; attempt < 80 && !root; attempt++) {
            var rs = Math.floor(Math.random() * 6);
            var rf = Math.floor(Math.random() * 11); // 0-10
            var rootMidi = STRING_TUNING[rs] + rf;
            var targetMidi = rootMidi + semi;
            var positions = [];
            for (var s = 0; s < 6; s++) {
                var f = targetMidi - STRING_TUNING[s];
                if (f >= 0 && f <= 15 && !(s === rs && f === rf)) positions.push({ string: s, fret: f });
            }
            // Keep it visually sane: prefer targets within reach of the root
            positions = positions.filter(function(p) { return Math.abs(p.fret - rf) <= 7; });
            if (positions.length > 0) {
                root = { string: rs, fret: rf, midi: rootMidi };
                targetPos = positions[Math.floor(Math.random() * positions.length)];
            }
        }
        var it = intervalTypeBySemi(semi);
        iv.target = {
            mode: mode, key: picked.key, semi: semi, name: it.name, short: it.short,
            root: root, targetMidi: root.midi + semi, targetPos: targetPos
        };

        ivRenderer.setActiveStrings([0, 1, 2, 3, 4, 5]);
        ivRenderer.setVoicingGroups([]);

        var rootNote = {
            string: root.string, fret: root.fret,
            color: 'root', label: 'R', glow: true, opacity: 1.0, size: 22
        };

        if (mode === 'name-sight') {
            prompt.textContent = 'Name this interval';
            ivRenderer.setNotes([rootNote, {
                string: targetPos.string, fret: targetPos.fret,
                color: 'quiz', label: '?', glow: false, opacity: 1.0, size: 22
            }]);
            buildIvIntervalButtons(semis);
        } else if (mode === 'find-sight') {
            prompt.textContent = 'Find a ' + it.name + ' up from the root';
            ivRenderer.setNotes([rootNote]);
            buildIvAnswerButtons([]);
        } else { // name-ear
            prompt.textContent = 'Listen — name the interval';
            ivRenderer.setNotes([rootNote]);
            buildIvIntervalButtons(semis);
        }
    }

    updateIvScoreDisplay();
    playIvQuestion();
}

function playIvQuestion() {
    if (!iv.target) return;
    var t = iv.target;
    var ctx = ensureAudioContext();
    var now = ctx.currentTime + 0.05;
    if (t.mode === 'chord-ear') {
        for (var i = 0; i < t.voicing.length; i++) {
            playPositionSound(t.voicing[i].string, t.voicing[i].fret, now + i * 0.06);
        }
    } else {
        playNoteSound(t.root.midi, now);
        playNoteSound(t.targetMidi, now + 0.7);
    }
}

function buildIvIntervalButtons(semis) {
    buildIvAnswerButtons(semis.map(function(s) {
        var it = intervalTypeBySemi(s);
        return { value: String(s), label: it.name };
    }));
}

function buildIvAnswerButtons(options) {
    var wrap = document.getElementById('iv-answers');
    wrap.innerHTML = '';
    for (var i = 0; i < options.length; i++) {
        (function(opt) {
            var btn = document.createElement('button');
            btn.className = 'quiz-answer-btn';
            btn.dataset.value = opt.value;
            btn.textContent = opt.label;
            btn.addEventListener('click', function() { handleIvAnswer(opt.value, btn); });
            wrap.appendChild(btn);
        })(options[i]);
    }
}

function updateIvScoreDisplay() {
    document.getElementById('iv-score').textContent = iv.session.right + ' / ' + iv.session.total;
    var streakEl = document.getElementById('iv-streak');
    streakEl.textContent = iv.session.streak >= 3 ? 'streak ' + iv.session.streak : '';
}

function finishIvQuestion(correct) {
    iv.answering = false;
    iv.session.total++;
    if (correct) {
        iv.session.right++;
        iv.session.streak++;
        if (iv.session.streak > iv.session.best) iv.session.best = iv.session.streak;
    } else {
        iv.session.streak = 0;
    }
    recordIvResult(iv.target.key, correct);
    updateIvScoreDisplay();
    renderIvStats();
    document.getElementById('iv-prompt').classList.add(correct ? 'correct' : 'wrong');
    iv.nextTimeout = setTimeout(newIvQuestion, correct ? 1300 : 2400);
}

function handleIvAnswer(value, btn) {
    if (!iv.target || !iv.answering) return;
    var t = iv.target;
    var correct;

    if (t.mode === 'chord-ear') {
        correct = (value === t.quality);
        // Reveal the chord on the fretboard
        var chordNotes = getChordNotes(t.rootPc, t.quality);
        var spelling = spellChord(t.rootPc, t.quality);
        var notes = [];
        for (var i = 0; i < t.voicing.length; i++) {
            var pc = (STRING_TUNING[t.voicing[i].string] + t.voicing[i].fret) % 12;
            var idx = chordNotes.indexOf(pc);
            notes.push({
                string: t.voicing[i].string, fret: t.voicing[i].fret,
                color: INTERVAL_COLOR_KEYS[idx], label: spelling.map[pc],
                glow: idx === 0, opacity: 1.0, size: 22
            });
        }
        ivRenderer.setVoicingGroups([t.voicing]);
        ivRenderer.setNotes(notes);
        document.getElementById('iv-prompt').textContent = (correct ? 'Correct — ' : 'It was ') +
            spelling.rootName + CHORD_SUFFIX[t.quality];
        playIvQuestion();
    } else {
        correct = (parseInt(value) === t.semi);
        // Reveal the interval with its real label
        ivRenderer.setNotes([
            { string: t.root.string, fret: t.root.fret, color: 'root', label: 'R', glow: true, opacity: 1.0, size: 22 },
            { string: t.targetPos.string, fret: t.targetPos.fret, color: correct ? 'correct' : 'wrong',
              label: t.short, glow: false, opacity: 1.0, size: 22 }
        ]);
        document.getElementById('iv-prompt').textContent = correct
            ? 'Correct — ' + t.name
            : 'It was a ' + t.name;
        playIvQuestion();
    }

    // Mark buttons
    var allBtns = document.querySelectorAll('#iv-answers .quiz-answer-btn');
    var correctValue = t.mode === 'chord-ear' ? t.quality : String(t.semi);
    for (var i = 0; i < allBtns.length; i++) {
        allBtns[i].disabled = true;
        if (allBtns[i].dataset.value === correctValue) allBtns[i].classList.add('correct');
    }
    if (!correct) btn.classList.add('wrong');

    finishIvQuestion(correct);
}

function handleIvFretboardClick(string, fret) {
    if (!iv.target || !iv.answering || iv.target.mode !== 'find-sight') return;
    var t = iv.target;
    var clickedMidi = STRING_TUNING[string] + fret;
    var correct = (clickedMidi === t.targetMidi);

    playNoteSound(t.root.midi);
    playNoteSound(clickedMidi, ensureAudioContext().currentTime + 0.55);

    var notes = [{ string: t.root.string, fret: t.root.fret, color: 'root', label: 'R', glow: true, opacity: 1.0, size: 22 }];
    // Show every position of the target pitch (same MIDI note, all strings)
    for (var s = 0; s < 6; s++) {
        var f = t.targetMidi - STRING_TUNING[s];
        if (f >= 0 && f <= 15 && !(s === t.root.string && f === t.root.fret)) {
            notes.push({
                string: s, fret: f, color: 'correct', label: t.short,
                glow: false, opacity: (s === string && f === fret) ? 1.0 : 0.55, size: 22
            });
        }
    }
    if (!correct) {
        notes.push({ string: string, fret: fret, color: 'wrong', label: '', glow: false, opacity: 1.0, size: 22 });
    }
    ivRenderer.setNotes(notes);
    document.getElementById('iv-prompt').textContent = correct
        ? 'Correct — ' + t.name
        : 'Not quite — the ' + t.name + ' is shown in green';
    finishIvQuestion(correct);
}

function renderIvStats() {
    var wrap = document.getElementById('iv-stats');
    if (!wrap) return;
    var mode = document.getElementById('iv-mode-select').dataset.value;
    var stats = loadIvStats();
    var html = '';

    var cells = mode === 'chord-ear'
        ? ['major', 'minor', 'dim', 'aug', 'maj7', 'min7', 'dom7', 'm7b5'].map(function(q) {
            var pretty = { major: 'Maj', minor: 'Min', dim: 'Dim', aug: 'Aug',
                           maj7: 'Maj7', min7: 'Min7', dom7: 'Dom7', m7b5: 'ø7' };
            return { key: 'c|' + q, label: pretty[q] };
        })
        : IV_RANGES.all.map(function(s) {
            return { key: 'i|' + s, label: intervalTypeBySemi(s).short };
        });

    document.getElementById('iv-stats-title').textContent = mode === 'chord-ear'
        ? 'Per-quality accuracy (all time)' : 'Per-interval accuracy (all time)';

    for (var i = 0; i < cells.length; i++) {
        var st = stats[cells[i].key];
        var total = st ? st.r + st.w : 0;
        var cls = '', pctText = '—';
        if (total > 0) {
            var pct = Math.round((st.r / total) * 100);
            pctText = pct + '%';
            cls = pct >= 85 ? 'good' : (pct >= 60 ? 'mid' : 'bad');
        }
        html += '<div class="quiz-stat-cell ' + cls + '">';
        html += '<span class="stat-note">' + cells[i].label + '</span>';
        html += '<span class="stat-pct">' + pctText + '</span>';
        html += '</div>';
    }
    wrap.innerHTML = html;
}

// ===================== Progressions =====================

var progRenderer = null;
var prog = {
    chords: [],       // [{root, quality, label, numeral, voicing, stringSetIndex, inversion}]
    index: 0,
    playing: false,
    bpm: 80,
    beatInChord: 0,
    nextBeatTime: 0,
    timerId: null
};

var PROG_PRESETS = {
    major: [
        { name: 'I – IV – V – I',           degrees: [0, 3, 4, 0] },
        { name: 'I – V – vi – IV',          degrees: [0, 4, 5, 3] },
        { name: 'vi – IV – I – V (Axis)',   degrees: [5, 3, 0, 4] },
        { name: 'I – vi – IV – V (50s)',    degrees: [0, 5, 3, 4] },
        { name: 'ii – V – I',               degrees: [1, 4, 0] },
        { name: 'I – vi – ii – V',          degrees: [0, 5, 1, 4] },
        { name: 'I – iii – IV – V',         degrees: [0, 2, 3, 4] },
        { name: '12-bar blues',             degrees: [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4], blues: true }
    ],
    minor: [
        { name: 'i – VI – III – VII',  degrees: [0, 5, 2, 6] },
        { name: 'i – iv – v – i',      degrees: [0, 3, 4, 0] },
        { name: 'i – iv – VII – III',  degrees: [0, 3, 6, 2] },
        { name: 'i – VII – VI – VII',  degrees: [0, 6, 5, 6] },
        { name: 'ii° – v – i',         degrees: [1, 4, 0] }
    ]
};

function initProgressionsPanel() {
    populatePcOptions('prog-key-select');

    var canvas = document.getElementById('prog-canvas');
    var overlay = document.getElementById('prog-overlay');
    progRenderer = new FretboardRenderer(canvas, overlay);

    progRenderer.setInteractive(true, function(string, fret) {
        playPositionSound(string, fret);
    });

    document.getElementById('prog-key-select')._onChange = buildProgression;
    document.getElementById('prog-scale-select')._onChange = function() {
        rebuildProgPresetSelect();
        buildProgression();
    };
    document.getElementById('prog-select')._onChange = buildProgression;
    document.getElementById('prog-chords-select')._onChange = buildProgression;
    document.getElementById('prog-beats-select')._onChange = function() {};
    document.getElementById('prog-notation-select')._onChange = function() {
        renderProgBar();
        showProgChord(prog.index);
    };

    document.getElementById('prog-explainer-btn').addEventListener('click', function() {
        var box = document.getElementById('prog-explainer');
        var open = box.style.display !== 'none';
        box.style.display = open ? 'none' : '';
        this.textContent = open ? 'About the number system ▾' : 'About the number system ▴';
    });

    document.getElementById('prog-bpm-minus').addEventListener('click', function() {
        prog.bpm = Math.max(20, prog.bpm - 5);
        document.getElementById('prog-bpm-display').textContent = prog.bpm;
    });
    document.getElementById('prog-bpm-plus').addEventListener('click', function() {
        prog.bpm = Math.min(240, prog.bpm + 5);
        document.getElementById('prog-bpm-display').textContent = prog.bpm;
    });

    document.getElementById('prog-transport-btn').addEventListener('click', function() {
        if (prog.playing) stopProgression();
        else startProgression();
    });

    document.getElementById('prog-prev').addEventListener('click', function() { stepProgression(-1); });
    document.getElementById('prog-next').addEventListener('click', function() { stepProgression(1); });

    rebuildProgPresetSelect();
    buildProgression();
}

function rebuildProgPresetSelect() {
    var scale = document.getElementById('prog-scale-select').dataset.value;
    var presets = PROG_PRESETS[scale];
    var opts = presets.map(function(p, i) { return { value: String(i), label: p.name }; });
    var sel = rebuildSelect('prog-select', opts, '0');
    sel._onChange = buildProgression;
}

function avgFret(voicing) {
    var sum = 0;
    for (var i = 0; i < voicing.length; i++) sum += voicing[i].fret;
    return sum / voicing.length;
}

// Assign a voice-led voicing to each chord in place: open with a mid-neck
// grip, then always take the nearest voicing to the previous chord.
function voiceLeadChords(chords, useSevenths) {
    var prevVoicing = null, prevSet = null;
    for (var i = 0; i < chords.length; i++) {
        var pool = useSevenths
            ? getDrop2SeventhVoicingsForChord(chords[i].root, chords[i].quality)
            : getAllVoicingsForChord(chords[i].root, chords[i].quality);
        var best = null, bestCost = Infinity;
        for (var p = 0; p < pool.length; p++) {
            var cost;
            if (!prevVoicing) {
                cost = Math.abs(avgFret(pool[p].voicing) - 5);
            } else {
                cost = Math.abs(avgFret(pool[p].voicing) - avgFret(prevVoicing))
                     + 1.2 * Math.abs(pool[p].stringSetIndex - prevSet);
            }
            if (cost < bestCost) { bestCost = cost; best = pool[p]; }
        }
        chords[i].voicing = best.voicing;
        chords[i].stringSetIndex = best.stringSetIndex;
        chords[i].inversion = best.inversion;
        chords[i].stringSetLabel = (useSevenths ? FOUR_STRING_SET_LABELS : STRING_SET_LABELS)[best.stringSetIndex];
        prevVoicing = best.voicing;
        prevSet = best.stringSetIndex;
    }
}

// One nicely-placed voicing for a standalone chord reveal
function bestMidVoicing(root, quality, useSevenths) {
    var single = [{ root: root, quality: quality }];
    voiceLeadChords(single, useSevenths);
    return single[0];
}

// Voice-leading: pick each chord's voicing to minimize hand movement
function buildProgression() {
    if (!progRenderer) return;
    if (prog.playing) stopProgression();

    var key = parseInt(document.getElementById('prog-key-select').dataset.value);
    var scale = document.getElementById('prog-scale-select').dataset.value;
    var presetIdx = parseInt(document.getElementById('prog-select').dataset.value);
    var preset = PROG_PRESETS[scale][presetIdx];
    var useSevenths = document.getElementById('prog-chords-select').dataset.value === 'sevenths';

    var diatonic = useSevenths ? getScaleSevenths(key, scale) : getScaleTriads(key, scale);

    var chords = [];
    for (var i = 0; i < preset.degrees.length; i++) {
        var d = preset.degrees[i];
        var c = diatonic[d];
        var chord = { root: c.root, quality: c.quality, label: c.label, numeral: c.numeral, degree: d };
        // Blues: I, IV, V all become dominant 7ths (the defining non-diatonic move)
        if (preset.blues && useSevenths && (d === 0 || d === 3 || d === 4)) {
            chord.quality = 'dom7';
            chord.label = spellChord(chord.root, 'dom7').rootName + '7';
            chord.numeral = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][d] + '7';
        }
        chord.nashville = getNashvilleNumber(d, scale, chord.quality);
        chords.push(chord);
    }

    voiceLeadChords(chords, useSevenths);

    prog.chords = chords;
    prog.index = 0;

    renderProgBar();
    showProgChord(0);
}

function progNotation() {
    return document.getElementById('prog-notation-select').dataset.value;
}

function progNumeralFor(chord) {
    return progNotation() === 'roman' ? chord.numeral : chord.nashville;
}

function renderProgBar() {
    var notation = progNotation();
    var isNash = notation !== 'roman';
    var hideNames = notation === 'nash-blind';

    var barHtml = '';
    for (var i = 0; i < prog.chords.length; i++) {
        var c = prog.chords[i];
        barHtml += '<div class="prog-chip' + (isNash ? ' nash' : '') + '" data-idx="' + i + '">';
        barHtml += '<span class="prog-numeral">' + progNumeralFor(c) + '</span>';
        if (!hideNames) {
            barHtml += '<span class="prog-name">' + c.label + '</span>';
        }
        barHtml += '</div>';
    }
    document.getElementById('prog-bar').innerHTML = barHtml;
}

function showProgChord(index) {
    if (!progRenderer || prog.chords.length === 0) return;
    var c = prog.chords[index];
    var next = prog.chords[(index + 1) % prog.chords.length];

    var chordNotes = getChordNotes(c.root, c.quality);
    var spelling = spellChord(c.root, c.quality);
    var labels = CHORD_INTERVAL_LABELS[c.quality];

    progRenderer.setActiveStrings([0, 1, 2, 3, 4, 5]);

    var notes = [];
    var posKey = {};
    for (var i = 0; i < c.voicing.length; i++) {
        var pos = c.voicing[i];
        var pc = (STRING_TUNING[pos.string] + pos.fret) % 12;
        var idx = chordNotes.indexOf(pc);
        notes.push({
            string: pos.string, fret: pos.fret,
            color: INTERVAL_COLOR_KEYS[idx],
            label: labelMode === 'intervals' ? labels[idx] : spelling.map[pc],
            glow: idx === 0, opacity: 1.0, size: 22
        });
        posKey[pos.string + ':' + pos.fret] = true;
    }

    // Ghost of the next chord
    if (next !== c) {
        var nextNotes = getChordNotes(next.root, next.quality);
        var nextSpelling = spellChord(next.root, next.quality);
        for (var i = 0; i < next.voicing.length; i++) {
            var pos = next.voicing[i];
            if (posKey[pos.string + ':' + pos.fret]) continue;
            var pc = (STRING_TUNING[pos.string] + pos.fret) % 12;
            var idx = nextNotes.indexOf(pc);
            notes.push({
                string: pos.string, fret: pos.fret,
                color: INTERVAL_COLOR_KEYS[idx],
                label: labelMode === 'intervals' ? CHORD_INTERVAL_LABELS[next.quality][idx] : nextSpelling.map[pc],
                glow: false, opacity: 0.2, size: 18
            });
        }
    }

    progRenderer.setVoicingGroups([c.voicing]);
    progRenderer.setNotes(notes);

    // In blind mode the bar shows only numbers; the big label is the reveal
    document.getElementById('prog-now').textContent = c.label + ' — ' + progNumeralFor(c);
    document.getElementById('prog-count').textContent = (index + 1) + ' / ' + prog.chords.length;
    document.getElementById('prog-desc').textContent = c.stringSetLabel + '  ' + INVERSION_NAMES[c.inversion];

    var chips = document.querySelectorAll('#prog-bar .prog-chip');
    for (var i = 0; i < chips.length; i++) {
        chips[i].classList.toggle('active', parseInt(chips[i].dataset.idx) === index);
    }
}

function stepProgression(dir) {
    if (prog.chords.length === 0) return;
    var n = prog.chords.length;
    prog.index = (prog.index + dir + n) % n;
    showProgChord(prog.index);
    if (!prog.playing && document.getElementById('prog-sound-toggle').checked) {
        scheduleChordTones(prog.chords[prog.index].voicing, ensureAudioContext().currentTime + 0.02);
    }
}

function progSchedulerTick() {
    var ctx = audio.ctx;
    var lookahead = 0.1;
    var beatsPerChord = parseInt(document.getElementById('prog-beats-select').dataset.value);

    while (prog.nextBeatTime < ctx.currentTime + lookahead) {
        var isChordBeat = (prog.beatInChord === 0);
        scheduleClick(prog.nextBeatTime, isChordBeat && beatsPerChord > 1);

        if (isChordBeat) {
            if (document.getElementById('prog-sound-toggle').checked) {
                scheduleChordTones(prog.chords[prog.index].voicing, prog.nextBeatTime);
            }
            var delay = Math.max(0, (prog.nextBeatTime - ctx.currentTime) * 1000);
            (function(idx) {
                setTimeout(function() {
                    if (!prog.playing) return;
                    showProgChord(idx);
                }, delay);
            })(prog.index);
        }

        prog.beatInChord++;
        if (prog.beatInChord >= beatsPerChord) {
            prog.beatInChord = 0;
            prog.index = (prog.index + 1) % prog.chords.length;
        }

        prog.nextBeatTime += 60.0 / prog.bpm;
    }
}

function startProgression() {
    if (prog.chords.length === 0) return;
    var ctx = ensureAudioContext();
    prog.playing = true;
    prog.beatInChord = 0;
    prog.nextBeatTime = ctx.currentTime + 0.05;
    prog.timerId = setInterval(progSchedulerTick, 25);
    var btn = document.getElementById('prog-transport-btn');
    btn.textContent = 'Stop';
    btn.classList.add('playing');
}

function stopProgression() {
    prog.playing = false;
    if (prog.timerId) {
        clearInterval(prog.timerId);
        prog.timerId = null;
    }
    var btn = document.getElementById('prog-transport-btn');
    btn.textContent = 'Play';
    btn.classList.remove('playing');
    if (prog.chords.length > 0) {
        prog.index = prog.index % prog.chords.length;
        showProgChord(prog.index);
    }
}

// ===================== Nashville Training =====================

var nashRenderer = null;
var nash = {
    target: null,
    answering: false,
    session: { right: 0, total: 0, streak: 0, best: 0 },
    nextTimeout: null
};

var NASH_STATS_STORAGE_KEY = 'triadTrainerNashStats';

// Ear-training progressions (major key, degree indices). Chosen to be
// aurally distinctive from one another.
var NASH_EAR_PATTERNS = [
    { degrees: [0, 3, 4, 0] },   // 1 4 5 1
    { degrees: [0, 4, 5, 3] },   // 1 5 6- 4
    { degrees: [0, 5, 3, 4] },   // 1 6- 4 5
    { degrees: [1, 4, 0, 0] },   // 2- 5 1 1
    { degrees: [0, 3, 0, 4] },   // 1 4 1 5
    { degrees: [5, 3, 0, 4] }    // 6- 4 1 5
];

function loadNashStats() {
    try { return JSON.parse(localStorage.getItem(NASH_STATS_STORAGE_KEY)) || {}; }
    catch (e) { return {}; }
}

function recordNashResult(key, correct) {
    var stats = loadNashStats();
    if (!stats[key]) stats[key] = { r: 0, w: 0 };
    if (correct) stats[key].r++;
    else stats[key].w++;
    try { localStorage.setItem(NASH_STATS_STORAGE_KEY, JSON.stringify(stats)); } catch (e) {}
}

function nashPatternLabel(degrees, scale) {
    var diatonic = getScaleTriads(0, scale);
    var parts = [];
    for (var i = 0; i < degrees.length; i++) {
        parts.push(getNashvilleNumber(degrees[i], scale, diatonic[degrees[i]].quality));
    }
    return parts.join(' ');
}

function shuffled(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
}

function initNashPanel() {
    var canvas = document.getElementById('nash-canvas');
    var overlay = document.getElementById('nash-overlay');
    nashRenderer = new FretboardRenderer(canvas, overlay);

    nashRenderer.setInteractive(true, function(string, fret) {
        playPositionSound(string, fret);
    });

    document.getElementById('nash-mode-select')._onChange = newNashQuestion;
    document.getElementById('nash-scale-select')._onChange = newNashQuestion;
    document.getElementById('nash-chords-select')._onChange = newNashQuestion;
    document.getElementById('nash-replay-btn').addEventListener('click', playNashAudio);
    document.getElementById('nash-reset-btn').addEventListener('click', function() {
        localStorage.removeItem(NASH_STATS_STORAGE_KEY);
        renderNashStats();
    });

    renderNashStats();
    newNashQuestion();
}

function nashKeyName(keyPc, scale) {
    return spellScale(keyPc, scale).names[0] + ' ' + (scale === 'major' ? 'major' : 'minor');
}

// Show one chord's voicing on the nash fretboard, colored by chord degree
function renderNashChord(chordInfo) {
    var chordNotes = getChordNotes(chordInfo.root, chordInfo.quality);
    var spelling = spellChord(chordInfo.root, chordInfo.quality);
    var notes = [];
    for (var i = 0; i < chordInfo.voicing.length; i++) {
        var pos = chordInfo.voicing[i];
        var pc = (STRING_TUNING[pos.string] + pos.fret) % 12;
        var idx = chordNotes.indexOf(pc);
        notes.push({
            string: pos.string, fret: pos.fret,
            color: INTERVAL_COLOR_KEYS[idx], label: spelling.map[pc],
            glow: idx === 0, opacity: 1.0, size: 22
        });
    }
    nashRenderer.setActiveStrings([0, 1, 2, 3, 4, 5]);
    nashRenderer.setVoicingGroups([chordInfo.voicing]);
    nashRenderer.setNotes(notes);
}

function clearNashFretboard() {
    nashRenderer.setActiveStrings([0, 1, 2, 3, 4, 5]);
    nashRenderer.setVoicingGroups([]);
    nashRenderer.setNotes([]);
}

function newNashQuestion() {
    if (!nashRenderer) return;
    if (nash.nextTimeout) { clearTimeout(nash.nextTimeout); nash.nextTimeout = null; }
    nash.answering = true;

    var mode = document.getElementById('nash-mode-select').dataset.value;
    var scaleSetting = document.getElementById('nash-scale-select').dataset.value;
    var useSevenths = document.getElementById('nash-chords-select').dataset.value === 'sevenths';
    var scale = scaleSetting === 'both' ? (Math.random() < 0.5 ? 'major' : 'minor') : scaleSetting;
    var keyPc = Math.floor(Math.random() * 12);

    var prompt = document.getElementById('nash-prompt');
    prompt.classList.remove('correct', 'wrong');
    document.getElementById('nash-chart').innerHTML = '';

    var stats = loadNashStats();
    var diatonic = useSevenths ? getScaleSevenths(keyPc, scale) : getScaleTriads(keyPc, scale);

    if (mode === 'ear') {
        // Fixed major triads for the ear drill — the patterns are the subject
        scale = 'major';
        var cands = NASH_EAR_PATTERNS.map(function(p, i) { return { key: 'p|' + i, idx: i }; });
        var picked = weightedPick(cands, stats, nash.target && nash.target.key);
        var pattern = NASH_EAR_PATTERNS[picked.idx];
        var triads = getScaleTriads(keyPc, 'major');
        var chords = pattern.degrees.map(function(d) {
            var c = triads[d];
            return { root: c.root, quality: c.quality, label: c.label, degree: d };
        });
        voiceLeadChords(chords, false);
        nash.target = { mode: mode, key: picked.key, patternIdx: picked.idx, keyPc: keyPc, scale: scale, chords: chords };

        prompt.textContent = 'Listen — which progression is this?';
        clearNashFretboard();
        buildNashAnswerButtons(NASH_EAR_PATTERNS.map(function(p, i) {
            return { value: String(i), label: nashPatternLabel(p.degrees, 'major') };
        }));
        playNashAudio();
    } else if (mode === 'chart') {
        // Random 4-chord chart starting on the tonic, no adjacent repeats
        var degrees = [0];
        while (degrees.length < 4) {
            var d = Math.floor(Math.random() * 7);
            if (d !== degrees[degrees.length - 1]) degrees.push(d);
        }
        var chords = degrees.map(function(d) {
            var c = diatonic[d];
            return { root: c.root, quality: c.quality, label: c.label, degree: d,
                     nashville: getNashvilleNumber(d, scale, c.quality) };
        });
        voiceLeadChords(chords, useSevenths);
        nash.target = { mode: mode, keyPc: keyPc, scale: scale, chords: chords, step: 0, stepRight: 0 };

        prompt.textContent = 'Key of ' + nashKeyName(keyPc, scale) + ' — name chord 1 of 4';
        renderNashChart();
        clearNashFretboard();
        buildNashAnswerButtons(shuffled(diatonic.map(function(c, d) {
            return { value: String(d), label: c.label };
        })));
    } else {
        // n2c / c2n: one diatonic chord, weighted by degree+scale
        var cands = [];
        for (var d = 0; d < 7; d++) cands.push({ key: 'd|' + scale + '|' + d, degree: d });
        var picked = weightedPick(cands, stats, nash.target && nash.target.key);
        var c = diatonic[picked.degree];
        var numeral = getNashvilleNumber(picked.degree, scale, c.quality);
        var chordInfo = bestMidVoicing(c.root, c.quality, useSevenths);
        chordInfo.label = c.label;
        nash.target = {
            mode: mode, key: picked.key, degree: picked.degree, keyPc: keyPc, scale: scale,
            label: c.label, numeral: numeral, chordInfo: chordInfo
        };

        if (mode === 'n2c') {
            prompt.textContent = 'Key of ' + nashKeyName(keyPc, scale) + ' — which chord is ' + numeral + '?';
            clearNashFretboard();
            buildNashAnswerButtons(shuffled(diatonic.map(function(dc, d) {
                return { value: String(d), label: dc.label };
            })));
        } else {
            prompt.textContent = 'Key of ' + nashKeyName(keyPc, scale) + ' — what number is ' + c.label + '?';
            renderNashChord(chordInfo);
            playNashAudio();
            buildNashAnswerButtons(diatonic.map(function(dc, d) {
                return { value: String(d), label: getNashvilleNumber(d, scale, dc.quality) };
            }));
        }
    }

    updateNashScoreDisplay();
    renderNashStats();
}

function renderNashChart(revealUpTo) {
    var t = nash.target;
    var html = '';
    for (var i = 0; i < t.chords.length; i++) {
        var revealed = revealUpTo !== undefined ? i <= revealUpTo : i < t.step;
        html += '<div class="prog-chip nash' + (i === t.step && revealUpTo === undefined ? ' active' : '') + '">';
        html += '<span class="prog-numeral">' + t.chords[i].nashville + '</span>';
        html += '<span class="prog-name">' + (revealed ? t.chords[i].label : '?') + '</span>';
        html += '</div>';
    }
    document.getElementById('nash-chart').innerHTML = html;
}

function playNashAudio() {
    if (!nash.target) return;
    var t = nash.target;
    var ctx = ensureAudioContext();
    if (t.mode === 'ear' && t.chords) {
        for (var i = 0; i < t.chords.length; i++) {
            scheduleChordTones(t.chords[i].voicing, ctx.currentTime + 0.05 + i * 0.9);
        }
    } else if (t.chordInfo) {
        scheduleChordTones(t.chordInfo.voicing, ctx.currentTime + 0.05);
    }
}

function buildNashAnswerButtons(options) {
    var wrap = document.getElementById('nash-answers');
    wrap.innerHTML = '';
    for (var i = 0; i < options.length; i++) {
        (function(opt) {
            var btn = document.createElement('button');
            btn.className = 'quiz-answer-btn';
            btn.dataset.value = opt.value;
            btn.textContent = opt.label;
            btn.addEventListener('click', function() { handleNashAnswer(opt.value, btn); });
            wrap.appendChild(btn);
        })(options[i]);
    }
}

function updateNashScoreDisplay() {
    document.getElementById('nash-score').textContent = nash.session.right + ' / ' + nash.session.total;
    var streakEl = document.getElementById('nash-streak');
    streakEl.textContent = nash.session.streak >= 3 ? 'streak ' + nash.session.streak : '';
}

function scoreNashAnswer(correct) {
    nash.session.total++;
    if (correct) {
        nash.session.right++;
        nash.session.streak++;
        if (nash.session.streak > nash.session.best) nash.session.best = nash.session.streak;
    } else {
        nash.session.streak = 0;
    }
    updateNashScoreDisplay();
}

function markNashButtons(correctValue, clickedBtn, correct) {
    var allBtns = document.querySelectorAll('#nash-answers .quiz-answer-btn');
    for (var i = 0; i < allBtns.length; i++) {
        allBtns[i].disabled = true;
        if (allBtns[i].dataset.value === correctValue) allBtns[i].classList.add('correct');
    }
    if (!correct) clickedBtn.classList.add('wrong');
}

function handleNashAnswer(value, btn) {
    if (!nash.target || !nash.answering) return;
    var t = nash.target;
    var prompt = document.getElementById('nash-prompt');

    if (t.mode === 'chart') {
        // Per-step answering; buttons stay live between steps
        var current = t.chords[t.step];
        var correct = (parseInt(value) === current.degree);
        recordNashResult('d|' + t.scale + '|' + current.degree, correct);
        scoreNashAnswer(correct);
        renderNashChord(current);

        if (!correct) {
            btn.classList.add('wrong');
            setTimeout(function() { btn.classList.remove('wrong'); }, 600);
        }

        t.step++;
        if (t.step < t.chords.length) {
            renderNashChart();
            prompt.classList.remove('correct', 'wrong');
            prompt.classList.add(correct ? 'correct' : 'wrong');
            prompt.textContent = (correct ? '✓ ' + current.label : '✗ that was ' + current.label) +
                ' — name chord ' + (t.step + 1) + ' of 4';
        } else {
            nash.answering = false;
            renderNashChart(t.chords.length - 1);
            prompt.classList.add(correct ? 'correct' : 'wrong');
            prompt.textContent = (correct ? '✓ ' + current.label : '✗ that was ' + current.label) + ' — chart done';
            var allBtns = document.querySelectorAll('#nash-answers .quiz-answer-btn');
            for (var i = 0; i < allBtns.length; i++) allBtns[i].disabled = true;
            nash.nextTimeout = setTimeout(newNashQuestion, 2200);
        }
        renderNashStats();
        return;
    }

    nash.answering = false;
    var correct, correctValue;

    if (t.mode === 'ear') {
        correct = (parseInt(value) === t.patternIdx);
        correctValue = String(t.patternIdx);
        recordNashResult(t.key, correct);
        // Reveal: chart with names + first chord on the fretboard
        t.chords.forEach(function(c, i) {
            c.nashville = getNashvilleNumber(c.degree, 'major', c.quality);
        });
        t.step = t.chords.length;
        renderNashChart(t.chords.length - 1);
        renderNashChord(t.chords[0]);
        prompt.textContent = (correct ? 'Correct — ' : 'It was ') +
            nashPatternLabel(NASH_EAR_PATTERNS[t.patternIdx].degrees, 'major') +
            ' in ' + spellScale(t.keyPc, 'major').names[0];
    } else {
        correct = (parseInt(value) === t.degree);
        correctValue = String(t.degree);
        recordNashResult(t.key, correct);
        renderNashChord(t.chordInfo);
        if (t.mode === 'n2c') playNashAudio();
        prompt.textContent = correct
            ? 'Correct — ' + t.numeral + ' in ' + nashKeyName(t.keyPc, t.scale) + ' is ' + t.label
            : t.numeral + ' in ' + nashKeyName(t.keyPc, t.scale) + ' is ' + t.label;
    }

    markNashButtons(correctValue, btn, correct);
    scoreNashAnswer(correct);
    renderNashStats();
    prompt.classList.add(correct ? 'correct' : 'wrong');
    nash.nextTimeout = setTimeout(newNashQuestion, correct ? 1400 : 2600);
}

function renderNashStats() {
    var wrap = document.getElementById('nash-stats');
    if (!wrap) return;
    var mode = document.getElementById('nash-mode-select').dataset.value;
    var scaleSetting = document.getElementById('nash-scale-select').dataset.value;
    var stats = loadNashStats();
    var cells = [];

    if (mode === 'ear') {
        document.getElementById('nash-stats-title').textContent = 'Per-progression accuracy (all time)';
        cells = NASH_EAR_PATTERNS.map(function(p, i) {
            return { key: 'p|' + i, label: nashPatternLabel(p.degrees, 'major') };
        });
    } else {
        document.getElementById('nash-stats-title').textContent = 'Per-number accuracy (all time)';
        var scales = scaleSetting === 'both' ? ['major', 'minor'] : [scaleSetting];
        for (var s = 0; s < scales.length; s++) {
            var diatonic = getScaleTriads(0, scales[s]);
            for (var d = 0; d < 7; d++) {
                cells.push({
                    key: 'd|' + scales[s] + '|' + d,
                    label: getNashvilleNumber(d, scales[s], diatonic[d].quality)
                });
            }
        }
    }

    var html = '';
    for (var i = 0; i < cells.length; i++) {
        var st = stats[cells[i].key];
        var total = st ? st.r + st.w : 0;
        var cls = '', pctText = '—';
        if (total > 0) {
            var pct = Math.round((st.r / total) * 100);
            pctText = pct + '%';
            cls = pct >= 85 ? 'good' : (pct >= 60 ? 'mid' : 'bad');
        }
        html += '<div class="quiz-stat-cell ' + cls + '">';
        html += '<span class="stat-note">' + cells[i].label + '</span>';
        html += '<span class="stat-pct">' + pctText + '</span>';
        html += '</div>';
    }
    wrap.innerHTML = html;
}

// ===================== Shared helpers for Course / Circle / Progress =====================

// Build renderer note objects for a chord voicing (standard interval colors)
function chordVoicingNotes(root, quality, voicing, opts) {
    opts = opts || {};
    var chordNotes = getChordNotes(root, quality);
    var spelling = spellChord(root, quality);
    var labels = CHORD_INTERVAL_LABELS[quality];
    var notes = [];
    for (var i = 0; i < voicing.length; i++) {
        var pc = (STRING_TUNING[voicing[i].string] + voicing[i].fret) % 12;
        var idx = chordNotes.indexOf(pc);
        notes.push({
            string: voicing[i].string,
            fret: voicing[i].fret,
            color: INTERVAL_COLOR_KEYS[idx],
            label: labelMode === 'intervals' ? labels[idx] : spelling.map[pc],
            glow: idx === 0,
            opacity: opts.opacity !== undefined ? opts.opacity : 1.0,
            size: opts.size || 22
        });
    }
    return notes;
}

// Switch tabs programmatically (keeps tab active-classes in sync)
function switchToMode(mode) {
    var tab = document.querySelector('.mode-tab[data-mode="' + mode + '"]');
    if (tab) tab.click();
}

// Generic collapsible explainer boxes (button carries data-target)
function initExplainers() {
    var btns = document.querySelectorAll('.explainer-btn');
    for (var i = 0; i < btns.length; i++) {
        (function(btn) {
            btn.addEventListener('click', function() {
                var box = document.getElementById(btn.dataset.target);
                var open = box.style.display !== 'none';
                box.style.display = open ? 'none' : '';
                btn.textContent = open
                    ? btn.textContent.replace('▴', '▾')
                    : btn.textContent.replace('▾', '▴');
            });
        })(btns[i]);
    }
}

// ===================== Course (Learn) Panel =====================

var learnRenderer = null;
var learn = { index: 0, timers: [] };
var LEARN_DONE_KEY = 'triadTrainerLearnDone';

function loadLearnDone() {
    try { return JSON.parse(localStorage.getItem(LEARN_DONE_KEY)) || {}; }
    catch (e) { return {}; }
}

function saveLearnDone(done) {
    try { localStorage.setItem(LEARN_DONE_KEY, JSON.stringify(done)); } catch (e) {}
}

function initLearnPanel() {
    var canvas = document.getElementById('learn-canvas');
    var overlay = document.getElementById('learn-overlay');
    learnRenderer = new FretboardRenderer(canvas, overlay);
    learnRenderer.setInteractive(true, function(string, fret) {
        playPositionSound(string, fret);
    });

    document.getElementById('learn-prev').addEventListener('click', function() {
        showLesson(learn.index - 1);
    });
    document.getElementById('learn-next').addEventListener('click', function() {
        showLesson(learn.index + 1);
    });
    document.getElementById('learn-complete-btn').addEventListener('click', function() {
        var done = loadLearnDone();
        var id = LESSONS[learn.index].id;
        if (done[id]) delete done[id];
        else done[id] = true;
        saveLearnDone(done);
        renderLearnNav();
        updateLearnFooter();
    });
    document.getElementById('learn-practice-btn').addEventListener('click', function() {
        var p = LESSONS[learn.index].practice;
        if (!p) return;
        switchToMode(p.mode);
        // Apply any preset selects after the target panel has initialized
        if (p.selects) {
            for (var id in p.selects) {
                var sel = document.getElementById(id);
                if (!sel) continue;
                setSelectValue(sel, p.selects[id]);
                if (sel._onChange) sel._onChange();
            }
        }
    });

    // Open at the first incomplete lesson
    var done = loadLearnDone();
    var idx = 0;
    for (var i = 0; i < LESSONS.length; i++) {
        if (!done[LESSONS[i].id]) { idx = i; break; }
    }
    showLesson(idx);
}

function clearLearnTimers() {
    for (var i = 0; i < learn.timers.length; i++) clearTimeout(learn.timers[i]);
    learn.timers = [];
}

function renderLearnNav() {
    var wrap = document.getElementById('learn-nav');
    var done = loadLearnDone();
    var html = '<div class="learn-nav-head">Lessons</div>';
    for (var i = 0; i < LESSONS.length; i++) {
        var isDone = !!done[LESSONS[i].id];
        html += '<button class="learn-nav-item' + (i === learn.index ? ' active' : '') + (isDone ? ' done' : '') + '" data-idx="' + i + '">';
        html += '<span class="learn-nav-num">' + (i + 1) + '</span>';
        html += '<span class="learn-nav-name">' + LESSONS[i].title + '</span>';
        html += '<span class="learn-nav-check">' + (isDone ? '✓' : '') + '</span>';
        html += '</button>';
    }
    wrap.innerHTML = html;
    var items = wrap.querySelectorAll('.learn-nav-item');
    for (var i = 0; i < items.length; i++) {
        (function(btn) {
            btn.addEventListener('click', function() {
                showLesson(parseInt(btn.dataset.idx));
            });
        })(items[i]);
    }
}

function updateLearnFooter() {
    var lesson = LESSONS[learn.index];
    var done = loadLearnDone();
    var practiceBtn = document.getElementById('learn-practice-btn');
    practiceBtn.textContent = lesson.practice ? lesson.practice.label : '';
    practiceBtn.style.display = lesson.practice ? '' : 'none';

    var completeBtn = document.getElementById('learn-complete-btn');
    var isDone = !!done[lesson.id];
    completeBtn.textContent = isDone ? '✓ Completed — tap to undo' : 'Mark complete';
    completeBtn.classList.toggle('done', isDone);

    document.getElementById('learn-prev').disabled = (learn.index === 0);
    document.getElementById('learn-next').disabled = (learn.index === LESSONS.length - 1);
}

function showLesson(index) {
    if (!learnRenderer) return;
    if (index < 0 || index >= LESSONS.length) return;
    clearLearnTimers();
    learn.index = index;
    var lesson = LESSONS[index];

    document.getElementById('learn-kicker').textContent = 'Lesson ' + (index + 1) + ' of ' + LESSONS.length;
    document.getElementById('learn-title').textContent = lesson.title;
    document.getElementById('learn-subtitle').textContent = lesson.subtitle;
    document.getElementById('learn-content').innerHTML = lesson.sections.join('');

    var demosWrap = document.getElementById('learn-demos');
    demosWrap.innerHTML = '';
    for (var i = 0; i < lesson.demos.length; i++) {
        (function(demo) {
            var btn = document.createElement('button');
            btn.className = 'learn-demo-btn';
            btn.textContent = '▸ ' + demo.label;
            btn.addEventListener('click', function() { runLearnDemo(demo, btn); });
            demosWrap.appendChild(btn);
        })(lesson.demos[i]);
    }

    renderLearnNav();
    updateLearnFooter();

    // Auto-show the first demo without audio so the board is never blank
    if (lesson.demos.length > 0) {
        runLearnDemo(lesson.demos[0], demosWrap.firstChild, { silent: true });
    } else {
        learnRenderer.setVoicingGroups([]);
        learnRenderer.setNotes([]);
    }
}

// Pick a concrete voicing for a lesson demo chord
function findLearnVoicing(board) {
    var pool;
    if (board.voicing === 'open') pool = getOpenVoicingsForChord(board.root, board.quality);
    else if (board.voicing === 'drop2') pool = getDrop2SeventhVoicingsForChord(board.root, board.quality);
    else if (board.voicing === 'shell') pool = getShellVoicingsForChord(board.root, board.quality);
    else pool = getAllVoicingsForChord(board.root, board.quality);

    for (var i = 0; i < pool.length; i++) {
        if (board.set !== undefined && pool[i].stringSetIndex !== board.set) continue;
        if (board.inversion !== undefined && pool[i].inversion !== board.inversion) continue;
        return pool[i];
    }
    return pool[0] || null;
}

function learnPlaySequence(midis, gap) {
    var ctx = ensureAudioContext();
    for (var i = 0; i < midis.length; i++) {
        playNoteSound(midis[i], ctx.currentTime + 0.05 + i * gap);
    }
}

function runLearnDemo(demo, btn, opts) {
    opts = opts || {};
    clearLearnTimers();
    var silent = !!opts.silent;

    var btns = document.querySelectorAll('#learn-demos .learn-demo-btn');
    for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', btns[i] === btn);
    }

    var caption = document.getElementById('learn-caption');
    caption.innerHTML = '&nbsp;';

    var b = demo.board || {};
    learnRenderer.setFocusRegion(null); // pattern/zone demos set their own

    if (b.type === 'progression') {
        runLearnProgression(demo, silent);
        return;
    }

    var notes = [];
    var groups = [];
    var active = [0, 1, 2, 3, 4, 5];
    var playMidis = null;
    var playGap = 0.3;
    var strumVoicing = null;

    if (b.type === 'pc') {
        var positions = [];
        for (var si = 0; si < 6; si++) {
            for (var f = 0; f <= 15; f++) {
                if ((STRING_TUNING[si] + f) % 12 !== b.pc) continue;
                var midi = STRING_TUNING[si] + f;
                var octave = Math.floor(midi / 12) - 1;
                positions.push({ string: si, fret: f, midi: midi });
                notes.push({
                    string: si, fret: f, color: 'root',
                    label: pcDisplayName(b.pc) + octave,
                    glow: false, opacity: 1.0, size: 22
                });
            }
        }
        if (b.octaves) {
            for (var i = 0; i < positions.length; i++) {
                var p = positions[i];
                if (p.string + 2 > 5) continue;
                var diff = STRING_TUNING[p.string + 2] - STRING_TUNING[p.string];
                var f2 = p.fret + 12 - diff;
                if (f2 >= 0 && f2 <= 15) {
                    groups.push([{ string: p.string, fret: p.fret }, { string: p.string + 2, fret: f2 }]);
                }
            }
        }
        positions.sort(function(x, y) { return x.midi - y.midi; });
        playMidis = positions.map(function(p) { return p.midi; });
        playGap = 0.22;
        caption.textContent = 'Every ' + pcDisplayName(b.pc) + ' in the first 15 frets';
    } else if (b.type === 'chromatic') {
        var s = b.string;
        active = [s];
        var seqMidis = [];
        for (var f = 0; f <= 12; f++) {
            var pc = (STRING_TUNING[s] + f) % 12;
            var natural = NATURAL_PCS.indexOf(pc) !== -1;
            if (b.naturalsOnly && !natural) continue;
            seqMidis.push(STRING_TUNING[s] + f);
            notes.push({
                string: s, fret: f,
                color: natural ? 'root' : 'fifth',
                label: pcDisplayName(pc),
                glow: false,
                opacity: natural ? 1.0 : 0.6,
                size: 22
            });
        }
        playMidis = seqMidis;
        playGap = 0.25;
        caption.textContent = b.naturalsOnly
            ? 'Naturals only — the one-fret seams are E–F and B–C'
            : 'All twelve notes, one fret at a time';
    } else if (b.type === 'interval') {
        var it = intervalTypeBySemi(b.semi);
        var rootPos = { string: b.root[0], fret: b.root[1] };
        var tPos = { string: b.target[0], fret: b.target[1] };
        notes = [
            { string: rootPos.string, fret: rootPos.fret, color: 'root', label: 'R', glow: true, opacity: 1.0, size: 22 },
            { string: tPos.string, fret: tPos.fret, color: 'quiz', label: it.short, glow: false, opacity: 1.0, size: 22 }
        ];
        groups = [[rootPos, tPos]];
        playMidis = [STRING_TUNING[rootPos.string] + rootPos.fret, STRING_TUNING[tPos.string] + tPos.fret];
        playGap = 0.6;
        caption.textContent = it.name + ' — ' + b.semi + ' half step' + (b.semi > 1 ? 's' : '');
    } else if (b.type === 'chord') {
        var v = findLearnVoicing(b);
        if (v) {
            notes = chordVoicingNotes(b.root, b.quality, v.voicing);
            groups = [v.voicing];
            caption.textContent = chordDisplayLabel(b.root, b.quality) + ' — ' + INVERSION_NAMES[v.inversion];
            if (demo.play === 'seq') {
                playMidis = v.voicing.map(function(p) { return STRING_TUNING[p.string] + p.fret; });
                playMidis.sort(function(x, y) { return x - y; });
                playGap = 0.55;
            } else if (demo.play === 'strum') {
                strumVoicing = v.voicing;
            }
        }
    } else if (b.type === 'scale') {
        var spelling = spellScale(b.root, b.scale);
        var scalePcs = getScaleNotes(b.root, b.scale);
        for (var si = 0; si < 6; si++) {
            for (var f = 0; f <= 12; f++) {
                var pc = (STRING_TUNING[si] + f) % 12;
                if (scalePcs.indexOf(pc) === -1) continue;
                var isRoot = (pc === b.root);
                notes.push({
                    string: si, fret: f,
                    color: isRoot ? 'root' : 'pent',
                    label: spelling.map[pc],
                    glow: isRoot,
                    opacity: isRoot ? 1.0 : 0.7,
                    size: 22
                });
            }
        }
        caption.textContent = spelling.names.join(' – ');
        if (demo.play === 'seqscale' || demo.play === 'seq') {
            // One octave ascending from a low-ish root
            var rootMidi = null;
            for (var m = 45; m < 60 && rootMidi === null; m++) {
                if (m % 12 === b.root) rootMidi = m;
            }
            playMidis = scalePcs.map(function(pc, i) { return rootMidi + SCALE_INTERVALS[b.scale][i]; });
            playMidis.push(rootMidi + 12);
            playGap = 0.32;
        }
    } else if (b.type === 'pattern') {
        // Notes-per-string scale pattern with the rest of the neck dimmed
        var pentry = null;
        for (var i = 0; i < SCALES_CATALOG.length; i++) {
            if (SCALES_CATALOG[i].value === b.scale) pentry = SCALES_CATALOG[i];
        }
        var pdata = resolveScaleData(b.root, pentry);
        var pat = buildNpsPattern(b.root, pdata.intervals, b.nps, b.startDegree || 0);
        if (pat) {
            var pTriadIdx = scalesTriadIdx(pentry);
            for (var i = 0; i < pat.positions.length; i++) {
                var pp = pat.positions[i];
                notes.push(scaleNoteObj(pp.string, pp.fret, pp.degree, pdata, pTriadIdx));
            }
            learnRenderer.setFocusRegion(pat.minFret, pat.maxFret);
            playMidis = pat.positions.map(function(pp) { return STRING_TUNING[pp.string] + pp.fret; });
            playGap = 0.22;
            caption.textContent = pdata.spelling.names[0] + ' ' + pdata.displayName + ' — '
                + b.nps + ' notes per string, frets ' + pat.minFret + '–' + pat.maxFret;
        }
    } else if (b.type === 'zone') {
        // Every grip for one chord inside a fret window
        var zgrips = getAllVoicingsForChord(b.root, b.quality, { minFret: b.minFret, maxFret: b.maxFret });
        var zseen = {};
        for (var i = 0; i < zgrips.length; i++) {
            groups.push(zgrips[i].voicing);
            var zn = chordVoicingNotes(b.root, b.quality, zgrips[i].voicing);
            for (var j = 0; j < zn.length; j++) {
                var zk = zn[j].string + ':' + zn[j].fret;
                if (!zseen[zk]) { zseen[zk] = true; notes.push(zn[j]); }
            }
        }
        learnRenderer.setFocusRegion(b.minFret, b.maxFret);
        if (zgrips.length > 0 && demo.play === 'strum') strumVoicing = zgrips[0].voicing;
        caption.textContent = zgrips.length + ' ways to grab ' + chordDisplayLabel(b.root, b.quality)
            + ' between frets ' + b.minFret + ' and ' + b.maxFret;
    }

    learnRenderer.setActiveStrings(active);
    learnRenderer.setVoicingGroups(groups);
    learnRenderer.setNotes(notes);

    if (!silent) {
        if (strumVoicing) {
            scheduleChordTones(strumVoicing, ensureAudioContext().currentTime + 0.05);
        } else if (playMidis && demo.play !== 'none') {
            learnPlaySequence(playMidis, playGap);
        }
    }
}

// Animated chord-by-chord walkthrough of a progression
function runLearnProgression(demo, silent) {
    var b = demo.board;
    var diatonic = b.sevenths ? getScaleSevenths(b.key, b.scale) : getScaleTriads(b.key, b.scale);
    var chords = b.degrees.map(function(d) {
        var c = diatonic[d];
        return { root: c.root, quality: c.quality, label: c.label, numeral: c.numeral, degree: d };
    });
    voiceLeadChords(chords, !!b.sevenths);

    var caption = document.getElementById('learn-caption');
    learnRenderer.setActiveStrings([0, 1, 2, 3, 4, 5]);

    var stepMs = 1100;
    var ctx = silent ? null : ensureAudioContext();
    for (var i = 0; i < chords.length; i++) {
        (function(c, i) {
            var t = setTimeout(function() {
                learnRenderer.setVoicingGroups([c.voicing]);
                learnRenderer.setNotes(chordVoicingNotes(c.root, c.quality, c.voicing));
                caption.textContent = c.label + ' — ' + c.numeral;
            }, i * stepMs);
            learn.timers.push(t);
            if (!silent) {
                scheduleChordTones(c.voicing, ctx.currentTime + 0.05 + i * (stepMs / 1000));
            }
        })(chords[i], i);
    }
}

// ===================== Circle of Fifths Panel =====================

var circleInited = false;
var circleSelectedPc = 0;

function initCirclePanel() {
    circleInited = true;
    buildCircleWheel();
    selectCircleKey(circleSelectedPc);
    document.getElementById('circle-quiz-btn').addEventListener('click', function() {
        if (circleQuiz.active) stopCircleQuiz();
        else startCircleQuiz();
    });
}

function circleWheelLabel(entry) {
    // The enharmonic seam gets its short name on the wheel; detail shows both
    return entry.sig === 6 ? 'F♯' : entry.major;
}

function buildCircleWheel() {
    var wrap = document.getElementById('circle-wheel');
    var size = 440, cx = size / 2, cy = size / 2;
    var svg = '<svg viewBox="0 0 ' + size + ' ' + size + '" xmlns="http://www.w3.org/2000/svg">';
    for (var i = 0; i < CIRCLE_OF_FIFTHS.length; i++) {
        var entry = CIRCLE_OF_FIFTHS[i];
        var angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
        var mx = cx + Math.cos(angle) * 178;
        var my = cy + Math.sin(angle) * 178;
        var nx = cx + Math.cos(angle) * 115;
        var ny = cy + Math.sin(angle) * 115;
        svg += '<g class="ck ck-major" data-pc="' + entry.pc + '">' +
            '<circle cx="' + mx + '" cy="' + my + '" r="27"/>' +
            '<text x="' + mx + '" y="' + my + '" dy="0.35em">' + circleWheelLabel(entry) + '</text></g>';
        svg += '<g class="ck ck-minor" data-pc="' + entry.pc + '">' +
            '<circle cx="' + nx + '" cy="' + ny + '" r="20"/>' +
            '<text x="' + nx + '" y="' + ny + '" dy="0.35em">' + relativeMinorName(entry.pc) + 'm</text></g>';
    }
    svg += '</svg>';
    wrap.innerHTML = svg;

    var keys = wrap.querySelectorAll('.ck');
    for (var i = 0; i < keys.length; i++) {
        (function(g) {
            g.addEventListener('click', function() {
                if (circleQuiz.active) {
                    handleCircleWheelClick(parseInt(g.dataset.pc));
                    return;
                }
                selectCircleKey(parseInt(g.dataset.pc));
            });
        })(keys[i]);
    }
}

function selectCircleKey(pc) {
    circleSelectedPc = pc;
    var entry = null;
    for (var i = 0; i < CIRCLE_OF_FIFTHS.length; i++) {
        if (CIRCLE_OF_FIFTHS[i].pc === pc) entry = CIRCLE_OF_FIFTHS[i];
    }
    if (!entry) return;

    var keys = document.querySelectorAll('#circle-wheel .ck');
    for (var i = 0; i < keys.length; i++) {
        keys[i].classList.toggle('active', parseInt(keys[i].dataset.pc) === pc);
    }

    var majorScale = spellScale(pc, 'major');
    var triads = getScaleTriads(pc, 'major');
    var sevenths = getScaleSevenths(pc, 'major');
    var relMinor = relativeMinorName(pc);

    var html = '<div class="circle-key-name">' + entry.major + ' major</div>';
    html += '<div class="circle-key-sig">' + keySignatureLabel(entry.sig) + '</div>';

    html += '<div class="circle-detail-row"><span class="circle-detail-label">Scale</span><div class="circle-chips">';
    for (var d = 0; d < 7; d++) {
        html += '<span class="circle-chip circle-chip-static" title="' + degreeFunctionName(d, 'major') + '">' +
            '<span class="chip-sub">' + (d + 1) + '</span>' + majorScale.names[d] + '</span>';
    }
    html += '</div></div>';

    html += '<div class="circle-detail-row"><span class="circle-detail-label">Triads</span><div class="circle-chips">';
    for (var d = 0; d < 7; d++) {
        html += '<button class="circle-chip" data-root="' + triads[d].root + '" data-quality="' + triads[d].quality + '" title="' + degreeFunctionName(d, 'major') + '">' +
            '<span class="chip-sub">' + triads[d].numeral + '</span>' + triads[d].label + '</button>';
    }
    html += '</div></div>';

    html += '<div class="circle-detail-row"><span class="circle-detail-label">Sevenths</span><div class="circle-chips">';
    for (var d = 0; d < 7; d++) {
        html += '<button class="circle-chip" data-root="' + sevenths[d].root + '" data-quality="' + sevenths[d].quality + '" data-seventh="1">' +
            '<span class="chip-sub">' + sevenths[d].numeral + '</span>' + sevenths[d].label + '</button>';
    }
    html += '</div></div>';

    html += '<div class="circle-detail-row"><span class="circle-detail-label">Relative minor</span>' +
        '<div class="circle-relmin">' + relMinor + ' minor — the same seven notes centered on ' + relMinor + '</div></div>';

    html += '<div class="circle-actions">' +
        '<button class="transport-btn" id="circle-practice-prog">Progressions in ' + entry.major + '</button>' +
        '<button class="transport-btn" id="circle-practice-train">Scale run in ' + entry.major + '</button></div>';
    html += '<div class="fb-hint circle-hint">Click any chord to hear it</div>';

    document.getElementById('circle-detail').innerHTML = html;

    var chips = document.querySelectorAll('#circle-detail .circle-chip[data-root]');
    for (var i = 0; i < chips.length; i++) {
        (function(chip) {
            chip.addEventListener('click', function() {
                var info = bestMidVoicing(parseInt(chip.dataset.root), chip.dataset.quality, chip.dataset.seventh === '1');
                scheduleChordTones(info.voicing, ensureAudioContext().currentTime + 0.02);
            });
        })(chips[i]);
    }

    document.getElementById('circle-practice-prog').addEventListener('click', function() {
        switchToMode('progressions');
        setSelectValue(document.getElementById('prog-key-select'), pc);
        setSelectValue(document.getElementById('prog-scale-select'), 'major');
        buildProgression();
    });
    document.getElementById('circle-practice-train').addEventListener('click', function() {
        switchToMode('training');
        setSelectValue(document.getElementById('train-root-select'), pc);
        setSelectValue(document.getElementById('train-mode-select'), 'scale');
        updateTrainingVoicings();
    });
}

// ===================== Circle Quiz =====================
//
// Active-recall drill for the circle itself: two question types are answered
// by clicking the wheel, two by multiple choice. Same weighted-pick + stats
// pattern as the other drills; store feeds the Progress dashboard.

var KEY_STATS_STORAGE_KEY = 'triadTrainerKeyStats';
var circleQuiz = {
    active: false, answering: false, target: null,
    correct: 0, total: 0, nextTimeout: null, lastKey: null
};

function loadKeyStats() {
    try {
        return JSON.parse(localStorage.getItem(KEY_STATS_STORAGE_KEY)) || {};
    } catch (e) {
        return {};
    }
}

function recordKeyResult(key, correct) {
    var stats = loadKeyStats();
    if (!stats[key]) stats[key] = { r: 0, w: 0 };
    stats[key][correct ? 'r' : 'w']++;
    localStorage.setItem(KEY_STATS_STORAGE_KEY, JSON.stringify(stats));
}

function circleEntryForPc(pc) {
    for (var i = 0; i < CIRCLE_OF_FIFTHS.length; i++) {
        if (CIRCLE_OF_FIFTHS[i].pc === pc) return CIRCLE_OF_FIFTHS[i];
    }
    return null;
}

function sigCountLabel(sig) {
    if (sig === 0) return 'None';
    var n = Math.abs(sig);
    return n + ' ' + (sig > 0 ? 'sharp' : 'flat') + (n > 1 ? 's' : '');
}

function startCircleQuiz() {
    circleQuiz.active = true;
    circleQuiz.correct = 0;
    circleQuiz.total = 0;
    var btn = document.getElementById('circle-quiz-btn');
    btn.textContent = 'Stop quiz';
    btn.classList.add('playing');
    document.getElementById('circle-quiz-prompt').style.display = '';
    // Hide the detail card — it answers half the questions
    document.getElementById('circle-detail').style.display = 'none';
    document.querySelector('.circle-layout').classList.add('quizzing');
    updateCircleQuizScore();
    newCircleQuizQuestion();
}

function stopCircleQuiz() {
    circleQuiz.active = false;
    if (circleQuiz.nextTimeout) {
        clearTimeout(circleQuiz.nextTimeout);
        circleQuiz.nextTimeout = null;
    }
    var btn = document.getElementById('circle-quiz-btn');
    btn.textContent = 'Quiz me';
    btn.classList.remove('playing');
    var prompt = document.getElementById('circle-quiz-prompt');
    prompt.style.display = 'none';
    prompt.classList.remove('correct', 'wrong');
    document.getElementById('circle-quiz-answers').innerHTML = '';
    document.getElementById('circle-quiz-score').textContent = '';
    document.getElementById('circle-detail').style.display = '';
    document.querySelector('.circle-layout').classList.remove('quizzing');
    clearCircleWheelMarks();
    selectCircleKey(circleSelectedPc);
}

function clearCircleWheelMarks() {
    var keys = document.querySelectorAll('#circle-wheel .ck');
    for (var i = 0; i < keys.length; i++) {
        keys[i].classList.remove('active', 'ck-correct', 'ck-wrong');
    }
}

function updateCircleQuizScore() {
    document.getElementById('circle-quiz-score').textContent =
        circleQuiz.correct + ' / ' + circleQuiz.total;
}

var CIRCLE_QUIZ_TYPES = ['find', 'sig', 'rel', 'fifth'];

// Nearest signatures make the best distractors (2♯ vs 3♯, not 2♯ vs 5♭)
function circleQuizSigOptions(entry) {
    var sigs = CIRCLE_OF_FIFTHS.map(function(e) { return e.sig; });
    sigs.sort(function(a, b) { return Math.abs(a - entry.sig) - Math.abs(b - entry.sig); });
    return shuffled(sigs.slice(0, 4).map(sigCountLabel));
}

function newCircleQuizQuestion() {
    if (!circleQuiz.active) return;
    circleQuiz.answering = true;
    var prompt = document.getElementById('circle-quiz-prompt');
    prompt.classList.remove('correct', 'wrong');
    clearCircleWheelMarks();
    document.getElementById('circle-quiz-answers').innerHTML = '';

    var stats = loadKeyStats();
    var candidates = [];
    for (var i = 0; i < CIRCLE_OF_FIFTHS.length; i++) {
        for (var t = 0; t < CIRCLE_QUIZ_TYPES.length; t++) {
            candidates.push({
                key: CIRCLE_QUIZ_TYPES[t] + '|' + CIRCLE_OF_FIFTHS[i].pc,
                type: CIRCLE_QUIZ_TYPES[t],
                entry: CIRCLE_OF_FIFTHS[i]
            });
        }
    }
    var picked = weightedPick(candidates, stats, circleQuiz.lastKey);
    circleQuiz.lastKey = picked.key;
    var entry = picked.entry;

    if (picked.type === 'find') {
        circleQuiz.target = { type: 'find', key: picked.key, answerPc: entry.pc };
        // keySignatureLabel: "3 sharps: F♯ C♯ G♯" — keep only the count part
        prompt.textContent = 'Click the major key with ' + keySignatureLabel(entry.sig).split(':')[0];
    } else if (picked.type === 'fifth') {
        circleQuiz.target = { type: 'fifth', key: picked.key, answerPc: (entry.pc + 7) % 12 };
        prompt.textContent = 'Click the key a fifth up from ' + circleWheelLabel(entry);
    } else if (picked.type === 'sig') {
        var answer = sigCountLabel(entry.sig);
        circleQuiz.target = { type: 'sig', key: picked.key, answer: answer };
        prompt.textContent = 'How many sharps or flats in ' + circleWheelLabel(entry) + ' major?';
        buildCircleQuizButtons(circleQuizSigOptions(entry), answer);
    } else {
        var correct = relativeMinorName(entry.pc) + 'm';
        circleQuiz.target = { type: 'rel', key: picked.key, answer: correct };
        prompt.textContent = 'What is the relative minor of ' + circleWheelLabel(entry) + ' major?';
        var opts = [correct];
        var others = shuffled(CIRCLE_OF_FIFTHS.filter(function(e) { return e.pc !== entry.pc; }));
        for (var i = 0; i < 3; i++) opts.push(relativeMinorName(others[i].pc) + 'm');
        buildCircleQuizButtons(shuffled(opts), correct);
    }
}

function buildCircleQuizButtons(options, correctValue) {
    var wrap = document.getElementById('circle-quiz-answers');
    wrap.innerHTML = '';
    for (var i = 0; i < options.length; i++) {
        (function(value) {
            var btn = document.createElement('button');
            btn.className = 'quiz-answer-btn';
            btn.textContent = value;
            btn.addEventListener('click', function() {
                if (!circleQuiz.active || !circleQuiz.answering) return;
                circleQuiz.answering = false;
                finishCircleQuizQuestion(value === correctValue, correctValue, btn);
            });
            wrap.appendChild(btn);
        })(options[i]);
    }
}

function handleCircleWheelClick(pc) {
    if (!circleQuiz.answering) return;
    var t = circleQuiz.target;
    if (t.type !== 'find' && t.type !== 'fifth') return; // MC questions ignore the wheel
    circleQuiz.answering = false;
    var correct = pc === t.answerPc;
    var keys = document.querySelectorAll('#circle-wheel .ck');
    for (var i = 0; i < keys.length; i++) {
        var kpc = parseInt(keys[i].dataset.pc);
        if (kpc === t.answerPc) keys[i].classList.add('ck-correct');
        else if (!correct && kpc === pc) keys[i].classList.add('ck-wrong');
    }
    finishCircleQuizQuestion(correct, null, null);
}

function finishCircleQuizQuestion(correct, correctValue, clickedBtn) {
    circleQuiz.total++;
    if (correct) circleQuiz.correct++;
    recordKeyResult(circleQuiz.target.key, correct);
    updateCircleQuizScore();
    document.getElementById('circle-quiz-prompt').classList.add(correct ? 'correct' : 'wrong');
    var btns = document.querySelectorAll('#circle-quiz-answers .quiz-answer-btn');
    for (var i = 0; i < btns.length; i++) {
        btns[i].disabled = true;
        if (correctValue !== null && btns[i].textContent === correctValue) btns[i].classList.add('correct');
        else if (btns[i] === clickedBtn && !correct) btns[i].classList.add('wrong');
    }
    circleQuiz.nextTimeout = setTimeout(newCircleQuizQuestion, correct ? 1300 : 2400);
}

// ===================== Progress Panel =====================

var progressRenderer = null;

function initProgressPanel() {
    var canvas = document.getElementById('progress-canvas');
    var overlay = document.getElementById('progress-overlay');
    progressRenderer = new FretboardRenderer(canvas, overlay);
    progressRenderer.setInteractive(true, function(string, fret) {
        playPositionSound(string, fret);
    });
    renderProgressDashboard();
}

function accClass(pct) {
    return pct >= 85 ? 'acc-good' : (pct >= 60 ? 'acc-mid' : 'acc-bad');
}

function statsTotals(stats) {
    var r = 0, w = 0;
    for (var key in stats) { r += stats[key].r; w += stats[key].w; }
    var total = r + w;
    return { total: total, acc: total > 0 ? Math.round(r / total * 100) : null };
}

function weakestItems(stats, labelFn, count) {
    var items = [];
    for (var key in stats) {
        var st = stats[key];
        var total = st.r + st.w;
        if (total < 3) continue;
        items.push({ key: key, total: total, acc: st.r / total });
    }
    items.sort(function(a, b) { return a.acc - b.acc; });
    return items.slice(0, count).map(function(it) {
        return { label: labelFn(it.key), acc: Math.round(it.acc * 100), total: it.total };
    });
}

function quizStatLabel(key) {
    var parts = key.split('|');
    return pcDisplayName(parseInt(parts[0])) + ' on the ' + STRING_PROMPT_LABELS[parseInt(parts[1])] + ' string';
}

function ivStatLabel(key) {
    var parts = key.split('|');
    if (parts[0] === 'c') {
        var pretty = { major: 'Major', minor: 'Minor', dim: 'Dim', aug: 'Aug',
                       maj7: 'Maj7', min7: 'Min7', dom7: 'Dom7', m7b5: 'Min7♭5' };
        return pretty[parts[1]] + ' chords by ear';
    }
    return intervalTypeBySemi(parseInt(parts[1])).name;
}

function nashStatLabel(key) {
    var parts = key.split('|');
    if (parts[0] === 'p') {
        return nashPatternLabel(NASH_EAR_PATTERNS[parseInt(parts[1])].degrees, 'major');
    }
    var scale = parts[1];
    var d = parseInt(parts[2]);
    var diatonic = getScaleTriads(0, scale);
    return getNashvilleNumber(d, scale, diatonic[d].quality) + ' in ' + scale + ' keys';
}

function keyStatLabel(key) {
    var parts = key.split('|');
    var entry = circleEntryForPc(parseInt(parts[1]));
    var name = circleWheelLabel(entry);
    if (parts[0] === 'find') return 'Finding ' + name + ' by signature';
    if (parts[0] === 'sig') return name + ' major key signature';
    if (parts[0] === 'rel') return 'Relative minor of ' + name;
    return 'Fifth up from ' + name;
}

function renderProgressDashboard() {
    if (!progressRenderer) return;

    // Course progress bar
    var done = loadLearnDone();
    var doneCount = 0;
    for (var i = 0; i < LESSONS.length; i++) {
        if (done[LESSONS[i].id]) doneCount++;
    }
    var pct = Math.round(doneCount / LESSONS.length * 100);
    var courseHtml = '<div class="progress-course-head">' +
        '<span class="quiz-stats-title">Course progress</span>' +
        '<span class="progress-course-count">' + doneCount + ' / ' + LESSONS.length + ' lessons</span></div>' +
        '<div class="progress-course-bar"><div class="progress-course-fill" style="width:' + pct + '%"></div></div>';
    var next = null;
    for (var i = 0; i < LESSONS.length; i++) {
        if (!done[LESSONS[i].id]) { next = LESSONS[i]; break; }
    }
    if (next) {
        courseHtml += '<button class="transport-btn progress-resume-btn" id="progress-resume">' +
            (doneCount === 0 ? 'Start the course' : 'Continue: ' + next.title) + '</button>';
    }
    document.getElementById('progress-course').innerHTML = courseHtml;
    var resumeBtn = document.getElementById('progress-resume');
    if (resumeBtn) {
        resumeBtn.addEventListener('click', function() { switchToMode('learn'); });
    }

    // Drill cards
    var cards = [
        { title: 'Note Quiz', mode: 'quiz', stats: loadQuizStats(), labelFn: quizStatLabel },
        { title: 'Intervals', mode: 'intervals', stats: loadIvStats(), labelFn: ivStatLabel },
        { title: 'Nashville', mode: 'nashville', stats: loadNashStats(), labelFn: nashStatLabel },
        { title: 'Keys', mode: 'circle', stats: loadKeyStats(), labelFn: keyStatLabel }
    ];
    var html = '';
    for (var c = 0; c < cards.length; c++) {
        var totals = statsTotals(cards[c].stats);
        html += '<div class="progress-card">';
        html += '<div class="progress-card-title">' + cards[c].title + '</div>';
        if (totals.total === 0) {
            html += '<div class="progress-card-empty">No answers yet — the drill is waiting</div>';
        } else {
            html += '<div class="progress-card-stats">' +
                '<span class="progress-card-acc ' + accClass(totals.acc) + '">' + totals.acc + '%</span>' +
                '<span class="progress-card-total">' + totals.total + (totals.total === 1 ? ' answer' : ' answers') + '</span></div>';
            var weak = weakestItems(cards[c].stats, cards[c].labelFn, 3);
            if (weak.length > 0) {
                html += '<div class="progress-weak-title">Weakest right now</div>';
                for (var w = 0; w < weak.length; w++) {
                    html += '<div class="progress-weak-row"><span class="progress-weak-label">' + weak[w].label + '</span>' +
                        '<span class="' + accClass(weak[w].acc) + '">' + weak[w].acc + '%</span></div>';
                }
            }
        }
        html += '<button class="quiz-reset-btn progress-drill-btn" data-mode="' + cards[c].mode + '">Drill ' + cards[c].title + ' →</button>';
        html += '</div>';
    }
    document.getElementById('progress-cards').innerHTML = html;

    var drillBtns = document.querySelectorAll('.progress-drill-btn');
    for (var i = 0; i < drillBtns.length; i++) {
        (function(btn) {
            btn.addEventListener('click', function() { switchToMode(btn.dataset.mode); });
        })(drillBtns[i]);
    }

    renderProgressHeatmap();
}

function lerpColor(c1, c2, t) {
    return [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t];
}

function heatColor(acc) {
    var red = [0.86, 0.28, 0.28], amber = [0.85, 0.63, 0.19], green = [0.30, 0.78, 0.42];
    return acc < 0.5 ? lerpColor(red, amber, acc * 2) : lerpColor(amber, green, (acc - 0.5) * 2);
}

function renderProgressHeatmap() {
    var stats = loadQuizStats();
    progressRenderer.setActiveStrings([0, 1, 2, 3, 4, 5]);
    progressRenderer.setVoicingGroups([]);

    var notes = [];
    for (var s = 0; s < 6; s++) {
        for (var f = 0; f <= 12; f++) {
            var pc = (STRING_TUNING[s] + f) % 12;
            var st = stats[pc + '|' + s];
            var total = st ? st.r + st.w : 0;
            if (total === 0) {
                notes.push({ string: s, fret: f, color: 'dim', label: '', glow: false, opacity: 0.18, size: 11 });
            } else {
                var acc = st.r / total;
                notes.push({
                    string: s, fret: f,
                    color: heatColor(acc),
                    label: pcDisplayName(pc),
                    glow: false,
                    opacity: 0.55 + 0.45 * Math.min(total / 10, 1),
                    size: 20
                });
            }
        }
    }
    progressRenderer.setNotes(notes);
}

// ===================== Mode Switcher =====================

var PANELS = {
    learn:        { el: 'learn-panel' },
    circle:       { el: 'circle-panel' },
    training:     { el: 'training-panel' },
    reference:    { el: 'reference-panel' },
    zones:        { el: 'zones-panel' },
    scales:       { el: 'scales-panel' },
    notemap:      { el: 'notemap-panel' },
    quiz:         { el: 'quiz-panel' },
    intervals:    { el: 'intervals-panel' },
    progressions: { el: 'progressions-panel' },
    nashville:    { el: 'nash-panel' },
    progress:     { el: 'progress-panel' }
};

function activateMode(mode) {
    currentMode = mode;

    for (var key in PANELS) {
        document.getElementById(PANELS[key].el).style.display = (key === mode) ? '' : 'none';
    }

    if (mode !== 'training' && metronome.playing) stopMetronome();
    if (mode !== 'quiz') stopQuizTimers();
    if (mode !== 'progressions' && prog.playing) stopProgression();
    if (mode !== 'intervals' && iv.nextTimeout) { clearTimeout(iv.nextTimeout); iv.nextTimeout = null; }
    if (mode !== 'nashville' && nash.nextTimeout) { clearTimeout(nash.nextTimeout); nash.nextTimeout = null; }
    if (mode !== 'learn') clearLearnTimers();
    if (mode !== 'scales') stopScalesDrone();
    if (mode !== 'circle' && circleQuiz.active) stopCircleQuiz();

    // Lazy-init panels so hidden canvases are never sized at zero width
    if (mode === 'learn') {
        if (!learnRenderer) {
            initLearnPanel();
        } else {
            learnRenderer.resize();
            showLesson(learn.index);
        }
    } else if (mode === 'circle') {
        if (!circleInited) {
            initCirclePanel();
        }
    } else if (mode === 'progress') {
        if (!progressRenderer) {
            initProgressPanel();
        } else {
            progressRenderer.resize();
            renderProgressDashboard();
        }
    } else if (mode === 'training') {
        if (!trainRenderer) {
            initTrainingPanel();
            updateTrainingVoicings();
        } else {
            trainRenderer.resize();
            showVoicing(metronome.currentVoicingIndex);
        }
    } else if (mode === 'reference') {
        if (!refRenderer) {
            initReferenceMode();
        } else {
            refRenderer.resize();
            updateReference();
        }
    } else if (mode === 'notemap') {
        if (!mapRenderer) {
            initNoteMapPanel();
        } else {
            mapRenderer.resize();
            updateNoteMap();
        }
    } else if (mode === 'scales') {
        if (!scalesRenderer) {
            initScalesPanel();
        } else {
            scalesRenderer.resize();
            updateScales();
        }
    } else if (mode === 'zones') {
        if (!zonesRenderer) {
            initZonesPanel();
        } else {
            zonesRenderer.resize();
            updateZones();
        }
    } else if (mode === 'quiz') {
        if (!quizRenderer) {
            initQuizPanel();
        } else {
            quizRenderer.resize();
            newQuizQuestion();
        }
    } else if (mode === 'intervals') {
        if (!ivRenderer) {
            initIntervalsPanel();
        } else {
            ivRenderer.resize();
            newIvQuestion();
        }
    } else if (mode === 'progressions') {
        if (!progRenderer) {
            initProgressionsPanel();
        } else {
            progRenderer.resize();
            showProgChord(prog.index);
        }
    } else if (mode === 'nashville') {
        if (!nashRenderer) {
            initNashPanel();
        } else {
            nashRenderer.resize();
            newNashQuestion();
        }
    }
}

function initModeSwitcher() {
    var tabs = document.querySelectorAll('.mode-tab');
    for (var i = 0; i < tabs.length; i++) {
        (function(tab) {
            tab.addEventListener('click', function() {
                var mode = tab.dataset.mode;
                if (mode === currentMode) return;

                for (var j = 0; j < tabs.length; j++) {
                    tabs[j].classList.toggle('active', tabs[j] === tab);
                }
                activateMode(mode);
            });
        })(tabs[i]);
    }
}

// ===================== Resize Handler =====================

var resizeTimer = null;
window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
        if (refRenderer) { refRenderer.resize(); }
        if (trainRenderer) { trainRenderer.resize(); }
        if (mapRenderer) { mapRenderer.resize(); }
        if (scalesRenderer) { scalesRenderer.resize(); }
        if (zonesRenderer) { zonesRenderer.resize(); }
        if (quizRenderer) { quizRenderer.resize(); }
        if (ivRenderer) { ivRenderer.resize(); }
        if (progRenderer) { progRenderer.resize(); }
        if (nashRenderer) { nashRenderer.resize(); }
        if (learnRenderer) { learnRenderer.resize(); }
        if (progressRenderer) { progressRenderer.resize(); }
        if (currentMode === 'reference') updateReference();
        if (currentMode === 'notemap') updateNoteMap();
        if (currentMode === 'scales') updateScales();
        if (currentMode === 'zones') updateZones();
        if (currentMode === 'progressions') showProgChord(prog.index);
    }, 100);
});

// ===================== Init =====================

document.addEventListener('DOMContentLoaded', function() {
    initCustomSelects();
    initGlobalSettings();
    initModeSwitcher();
    initExplainers();
    // Course is the landing tab — init it on load; other panels init lazily
    initLearnPanel();
});
