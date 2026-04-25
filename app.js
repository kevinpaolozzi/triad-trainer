// app.js — UI Logic, WebGL Fretboard, Quiz Engine

var refRenderer = null;
var selectedStrings = [2, 3, 4];

// Interval color keys matching fretboard.js NOTE_COLORS
var INTERVAL_COLOR_KEYS = ['root', 'third', 'fifth'];

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

// ===================== Reference Mode =====================

function initReferenceMode() {
    var rootSelect = document.getElementById('root-select');
    var qualitySelect = document.getElementById('quality-select');
    var inversionSelect = document.getElementById('inversion-select');

    // Populate root-select options
    var rootOptions = rootSelect.querySelector('.custom-select-options');
    for (var i = 0; i < NOTE_NAMES.length; i++) {
        var opt = document.createElement('div');
        opt.className = 'custom-select-option';
        if (i === 0) opt.className += ' selected';
        opt.dataset.value = i;
        opt.textContent = NOTE_NAMES[i];
        rootOptions.appendChild(opt);
    }

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

    var pentatonicSelect = document.getElementById('pentatonic-select');

    rootSelect._onChange = updateReference;
    qualitySelect._onChange = updateReference;
    inversionSelect._onChange = updateReference;
    pentatonicSelect._onChange = updateReference;

    updateReference();
}

function updateReference() {
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

function updatePentatonicLabels(rootIndex) {
    var rootName = NOTE_NAMES[rootIndex];
    var sel = document.getElementById('pentatonic-select');
    var opts = sel.querySelectorAll('.custom-select-option');
    var trigger = sel.querySelector('.custom-select-trigger');
    var currentValue = sel.dataset.value;

    for (var i = 0; i < opts.length; i++) {
        var val = opts[i].dataset.value;
        if (val === 'off') continue;
        var label = rootName + ' ' + val.charAt(0).toUpperCase() + val.slice(1);
        opts[i].textContent = label;
        if (val === currentValue) {
            trigger.textContent = label;
        }
    }
}

function renderShowAll(rootIndex, quality, stringSet, selectedInversion) {
    var triadNotes = getTriadNotes(rootIndex, quality);

    refRenderer.setActiveStrings(stringSet);

    // Get all playable voicings for the selected inversion on consecutive string groups
    var selectedKey = {};
    var voicingGroups = [];
    if (stringSet.length >= 3) {
        var triadPCs = getTriadNotes(rootIndex, quality);
        var inverted = invertTriad(triadPCs, selectedInversion);
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
    for (var i = 0; i < stringSet.length; i++) {
        var si = stringSet[i];
        var openNote = STRING_TUNING[si];
        for (var f = 0; f <= 15; f++) {
            var pc = (openNote + f) % 12;
            var triadIdx = triadNotes.indexOf(pc);
            if (triadIdx === -1) continue;

            var isSelected = selectedKey[si + ':' + f] === true;
            notes.push({
                string: si,
                fret: f,
                color: INTERVAL_COLOR_KEYS[triadIdx],
                label: NOTE_NAMES[pc],
                glow: triadIdx === 0,
                opacity: isSelected ? 1.0 : 0.55,
                size: 22
            });
        }
    }

    // Add pentatonic overlay notes
    var pentatonicType = document.getElementById('pentatonic-select').dataset.value;
    if (pentatonicType !== 'off') {
        var pentNotes = getPentatonicNotes(rootIndex, pentatonicType);
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
                    label: NOTE_NAMES[pc],
                    glow: false
                });
            }
        }
    }

    refRenderer.setVoicingGroups(voicingGroups);
    refRenderer.setNotes(notes);

    // Show full scale info with triad degrees highlighted
    var scaleNotes = getScaleNotes(rootIndex, quality);
    var scaleLength = scaleNotes.length;
    var html = '<div class="scale-row">';
    for (var d = 0; d < scaleLength; d++) {
        var pc = scaleNotes[d];
        var isTriad = triadNotes.indexOf(pc) !== -1;
        html += '<div class="scale-degree' + (isTriad ? ' triad' : '') + '">';
        html += '<span class="degree-name">' + NOTE_NAMES[pc] + '</span>';
        html += '<span class="degree-num">' + (d + 1) + '</span>';
        html += '</div>';
    }
    html += '</div>';

    document.getElementById('ref-note-info').innerHTML = html;
}

// ===================== Training Mode =====================

var trainRenderer = null;
var currentMode = 'training';
var metronome = {
    bpm: 60,
    playing: false,
    audioCtx: null,
    nextBeatTime: 0,
    currentVoicingIndex: 0,
    voicings: [],
    timerId: null
};

function initModeSwitcher() {
    var tabs = document.querySelectorAll('.mode-tab');
    for (var i = 0; i < tabs.length; i++) {
        (function(tab) {
            tab.addEventListener('click', function() {
                var mode = tab.dataset.mode;
                if (mode === currentMode) return;
                currentMode = mode;

                for (var j = 0; j < tabs.length; j++) {
                    tabs[j].classList.toggle('active', tabs[j] === tab);
                }

                document.getElementById('reference-panel').style.display = mode === 'reference' ? '' : 'none';
                document.getElementById('training-panel').style.display = mode === 'training' ? '' : 'none';

                if (mode === 'training') {
                    if (!trainRenderer) {
                        initTrainingPanel();
                    } else {
                        trainRenderer.resize();
                    }
                    updateTrainingVoicings();
                } else {
                    stopMetronome();
                    if (refRenderer) {
                        refRenderer.resize();
                        updateReference();
                    }
                }
            });
        })(tabs[i]);
    }
}

function initTrainingPanel() {
    // Populate root select options
    var rootOptions = document.querySelector('#train-root-select .custom-select-options');
    for (var i = 0; i < NOTE_NAMES.length; i++) {
        var opt = document.createElement('div');
        opt.className = 'custom-select-option';
        if (i === 0) opt.className += ' selected';
        opt.dataset.value = i;
        opt.textContent = NOTE_NAMES[i];
        rootOptions.appendChild(opt);
    }

    // Create renderer
    var canvas = document.getElementById('train-canvas');
    var overlay = document.getElementById('train-overlay');
    trainRenderer = new FretboardRenderer(canvas, overlay);

    // Wire up change callbacks
    var trainMode = document.getElementById('train-mode-select');
    var trainRoot = document.getElementById('train-root-select');
    var trainQuality = document.getElementById('train-quality-select');
    var trainStrings = document.getElementById('train-strings-select');
    var trainInversion = document.getElementById('train-inversion-select');
    trainMode._onChange = function() {
        updateTrainingVoicings();
    };
    trainRoot._onChange = function() {
        updateTrainingVoicings();
    };
    trainQuality._onChange = function() {
        updateTrainingVoicings();
    };
    trainStrings._onChange = function() {
        updateTrainingVoicings();
    };
    trainInversion._onChange = function() {
        updateTrainingVoicings();
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

function updateTrainingVoicings() {
    var rootIndex = parseInt(document.getElementById('train-root-select').dataset.value);
    var quality = document.getElementById('train-quality-select').dataset.value;
    var mode = document.getElementById('train-mode-select').dataset.value;
    var invFilter = document.getElementById('train-inversion-select').dataset.value;
    var stringsFilter = document.getElementById('train-strings-select').dataset.value;

    var all;

    var scaleBar = document.getElementById('train-scale-bar');

    var isScale = (mode === 'scale' || mode === 'scale-reverse') && (quality === 'major' || quality === 'minor');

    if (isScale) {
        // Scale Run: cycle through diatonic triads, running up the neck per chord
        var triads = getScaleTriads(rootIndex, quality);

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
            var chordVoicings = filterAndSort(
                getAllVoicingsForChord(triad.root, triad.quality),
                invFilter, stringsFilter
            );

            // Tag each voicing with chord info for showVoicing
            for (var vi = 0; vi < chordVoicings.length; vi++) {
                chordVoicings[vi].chordLabel = triad.label;
                chordVoicings[vi].chordRoot = triad.root;
                chordVoicings[vi].chordQuality = triad.quality;
            }

            all = all.concat(chordVoicings);
        }
    } else {
        // Single Chord mode (or dim/aug fallback)
        scaleBar.innerHTML = '';
        all = filterAndSort(
            getAllVoicingsForChord(rootIndex, quality),
            invFilter, stringsFilter
        );
    }

    metronome.voicings = all;
    metronome.currentVoicingIndex = 0;

    if (metronome.playing) {
        stopMetronome();
    }

    if (all.length > 0) {
        showVoicing(0);
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

    var triadNotes = getTriadNotes(rootIndex, quality);

    var nextIndex = (index + 1) % metronome.voicings.length;
    var next = metronome.voicings[nextIndex];
    trainRenderer.setActiveStrings([0, 1, 2, 3, 4, 5]);

    // Build note objects for current voicing
    var notes = [];
    for (var i = 0; i < v.voicing.length; i++) {
        var pos = v.voicing[i];
        var pc = (STRING_TUNING[pos.string] + pos.fret) % 12;
        var triadIdx = triadNotes.indexOf(pc);
        notes.push({
            string: pos.string,
            fret: pos.fret,
            color: INTERVAL_COLOR_KEYS[triadIdx],
            label: NOTE_NAMES[pc],
            glow: triadIdx === 0,
            opacity: 1.0,
            size: 22
        });
    }

    // Add dimmed notes for next voicing
    var nextRootIndex, nextQuality;
    if (next.chordRoot !== undefined) {
        nextRootIndex = next.chordRoot;
        nextQuality = next.chordQuality;
    } else {
        nextRootIndex = parseInt(document.getElementById('train-root-select').dataset.value);
        nextQuality = document.getElementById('train-quality-select').dataset.value;
    }
    var nextTriadNotes = getTriadNotes(nextRootIndex, nextQuality);

    for (var i = 0; i < next.voicing.length; i++) {
        var pos = next.voicing[i];
        var pc = (STRING_TUNING[pos.string] + pos.fret) % 12;
        var triadIdx = nextTriadNotes.indexOf(pc);
        notes.push({
            string: pos.string,
            fret: pos.fret,
            color: INTERVAL_COLOR_KEYS[triadIdx],
            label: NOTE_NAMES[pc],
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
    document.getElementById('voicing-desc').textContent =
        STRING_SET_LABELS[v.stringSetIndex] + '  ' + INVERSION_NAMES[v.inversion];

    // Highlight active chord in scale bar
    var chords = document.querySelectorAll('#train-scale-bar .scale-chord');
    for (var c = 0; c < chords.length; c++) {
        chords[c].classList.toggle('active', v.chordLabel && chords[c].dataset.label === v.chordLabel);
    }
}

// ===================== Web Audio Metronome =====================

function ensureAudioContext() {
    if (!metronome.audioCtx) {
        metronome.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (metronome.audioCtx.state === 'suspended') {
        metronome.audioCtx.resume();
    }
    return metronome.audioCtx;
}

function scheduleClick(time) {
    var ctx = metronome.audioCtx;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.05);
}

function scheduleChordTones(voicing, time) {
    var ctx = metronome.audioCtx;
    var sampleRate = ctx.sampleRate;

    for (var i = 0; i < voicing.length; i++) {
        var pos = voicing[i];
        var midi = STRING_TUNING[pos.string] + pos.fret;
        var freq = 440 * Math.pow(2, (midi - 69) / 12);
        var stagger = i * 0.015;
        var noteTime = time + stagger;

        // Offline Karplus-Strong synthesis
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
        gain.gain.setValueAtTime(0.22, noteTime);
        gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 2.2);

        // Signal chain: source → lpf → body1 → body2 → body3 → hpf → gain → out
        source.connect(lpf);
        lpf.connect(body1);
        body1.connect(body2);
        body2.connect(body3);
        body3.connect(hpf);
        hpf.connect(gain);
        gain.connect(ctx.destination);

        source.start(noteTime);
        source.stop(noteTime + 2.5);
    }
}

function schedulerTick() {
    var ctx = metronome.audioCtx;
    var lookahead = 0.1; // schedule 100ms ahead

    while (metronome.nextBeatTime < ctx.currentTime + lookahead) {
        // Schedule the click sound
        scheduleClick(metronome.nextBeatTime);

        // Schedule chord tones if sound toggle is on
        if (document.getElementById('sound-toggle').checked) {
            var v = metronome.voicings[metronome.currentVoicingIndex];
            scheduleChordTones(v.voicing, metronome.nextBeatTime);
        }

        // Schedule voicing advance — use setTimeout aligned to the beat
        var delay = (metronome.nextBeatTime - ctx.currentTime) * 1000;
        if (delay < 0) delay = 0;
        (function(idx) {
            setTimeout(function() {
                if (!metronome.playing) return;
                showVoicing(idx);
            }, delay);
        })(metronome.currentVoicingIndex);

        // Advance to next voicing (wrap around)
        metronome.currentVoicingIndex = (metronome.currentVoicingIndex + 1) % metronome.voicings.length;

        // Schedule next beat
        var secondsPerBeat = 60.0 / metronome.bpm;
        metronome.nextBeatTime += secondsPerBeat;
    }
}

function startMetronome() {
    if (metronome.voicings.length === 0) return;

    var ctx = ensureAudioContext();
    metronome.playing = true;
    metronome.currentVoicingIndex = 0;
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

    // Reset to first voicing
    metronome.currentVoicingIndex = 0;
    if (metronome.voicings.length > 0) {
        showVoicing(0);
    }
}

// ===================== Resize Handler =====================

var resizeTimer = null;
window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
        if (refRenderer) refRenderer.resize();
        if (trainRenderer) trainRenderer.resize();
        updateReference();
    }, 100);
});

// ===================== Init =====================

document.addEventListener('DOMContentLoaded', function() {
    initReferenceMode();
    initCustomSelects();
    initModeSwitcher();
    // Training is the default tab — init it on load
    initTrainingPanel();
    updateTrainingVoicings();
});
