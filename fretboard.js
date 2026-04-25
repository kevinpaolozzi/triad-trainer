// fretboard.js — WebGL Animated Fretboard Renderer

var FRET_COUNT = 15;
var STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'e'];
var TOTAL_STRINGS = 6;
var FRET_DOT_POSITIONS = [3, 5, 7, 9, 12, 15];

// Interval colors (R, G, B)
var NOTE_COLORS = {
    root:  [0.93, 0.55, 0.15],  // #ed8c26 orange
    third: [0.70, 0.70, 0.70],  // #b3b3b3 light grey
    fifth: [0.50, 0.50, 0.50],  // #808080 mid grey
    user:  [0.85, 0.63, 0.19],  // #d8a030
    pent:  [0.85, 0.63, 0.19],  // gold/amber for pentatonic
    dim:   [0.35, 0.35, 0.35]   // dimmed
};

// ===================== Shader Sources =====================

var VERT_SRC = [
    'attribute vec2 a_position;',
    'attribute vec2 a_uv;',
    'uniform vec2 u_resolution;',
    'varying vec2 v_uv;',
    'void main() {',
    '    vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;',
    '    clip.y = -clip.y;',
    '    gl_Position = vec4(clip, 0.0, 1.0);',
    '    v_uv = a_uv;',
    '}'
].join('\n');

var FRAG_SRC = [
    'precision mediump float;',
    'varying vec2 v_uv;',
    'uniform float u_mode;',      // 0 = rect, 1 = SDF circle
    'uniform vec4 u_color;',
    'uniform float u_glow;',       // glow intensity (0-1)
    'uniform float u_radius;',     // for SDF: radius in UV space
    'uniform float u_stroke;',     // stroke width in UV space (0 = filled)
    'void main() {',
    '    if (u_mode < 0.5) {',
    '        gl_FragColor = u_color;',
    '    } else {',
    '        vec2 center = vec2(0.5, 0.5);',
    '        float dist = length(v_uv - center);',
    '        float r = u_radius;',
    '        float edge = smoothstep(r, r - 0.02, dist);',
    '        if (u_stroke > 0.0) {',
    '            float inner = smoothstep(r - u_stroke - 0.02, r - u_stroke, dist);',
    '            edge = edge * inner;',
    '        }',
    '        float glowDist = smoothstep(r + 0.25, r, dist);',
    '        vec3 col = u_color.rgb;',
    '        float coreAlpha = edge * u_color.a;',
    '        float glowAlpha = glowDist * u_glow * 0.35 * u_color.a;',
    '        float finalAlpha = max(coreAlpha, glowAlpha);',
    '        gl_FragColor = vec4(col, finalAlpha);',
    '    }',
    '}'
].join('\n');

// ===================== FretboardRenderer =====================

function FretboardRenderer(canvas, overlay) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: true });
    if (!this.gl) {
        console.error('WebGL not available');
        return;
    }

    this._initShaders();
    this._initBuffers();

    // Layout
    this.padding = { left: 50, right: 20, top: 30, bottom: 40 };
    this.stringSpacing = 44;

    // State
    this.notes = [];        // current animated note objects
    this.targetNotes = [];  // target notes to animate toward
    this.voicingGroups = []; // groups of 3 notes that form voicings
    this.activeStrings = [3, 4, 5];
    this.interactive = false;
    this.onClick = null;
    this.animating = false;
    this.time = 0;
    this._rafId = null;
    this._lastTime = 0;

    this.resize();
    this._startLoop();
}

FretboardRenderer.prototype._initShaders = function() {
    var gl = this.gl;

    var vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, VERT_SRC);
    gl.compileShader(vs);

    var fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, FRAG_SRC);
    gl.compileShader(fs);

    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    gl.useProgram(this.program);

    this.a_position = gl.getAttribLocation(this.program, 'a_position');
    this.a_uv = gl.getAttribLocation(this.program, 'a_uv');
    this.u_resolution = gl.getUniformLocation(this.program, 'u_resolution');
    this.u_mode = gl.getUniformLocation(this.program, 'u_mode');
    this.u_color = gl.getUniformLocation(this.program, 'u_color');
    this.u_glow = gl.getUniformLocation(this.program, 'u_glow');
    this.u_radius = gl.getUniformLocation(this.program, 'u_radius');
    this.u_stroke = gl.getUniformLocation(this.program, 'u_stroke');
};

FretboardRenderer.prototype._initBuffers = function() {
    var gl = this.gl;
    this.quadBuffer = gl.createBuffer();
};

FretboardRenderer.prototype.resize = function() {
    var dpr = window.devicePixelRatio || 1;
    var container = this.canvas.parentElement;
    var w = container.clientWidth;
    var h = container.clientHeight || 340;

    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';

    this.width = w * dpr;
    this.height = h * dpr;
    this.dpr = dpr;
    this.cssWidth = w;
    this.cssHeight = h;

    // Compute fret spacing
    var padL = this.padding.left * dpr;
    var padR = this.padding.right * dpr;
    this.fretWidth = (this.width - padL - padR) / FRET_COUNT;

    this.gl.viewport(0, 0, this.width, this.height);

    // Update existing note positions
    for (var i = 0; i < this.notes.length; i++) {
        var n = this.notes[i];
        var di = this._displayIndex(n.string);
        n.x = this._fretX(n.fret);
        n.y = this._stringY(di);
        n.targetX = n.x;
        n.targetY = n.y;
    }
    this._overlayDirty = true;
};

// ===================== Layout Helpers =====================

FretboardRenderer.prototype._fretX = function(fret) {
    var padL = this.padding.left * this.dpr;
    if (fret === 0) return padL - 18 * this.dpr;
    return padL + (fret - 0.5) * this.fretWidth;
};

FretboardRenderer.prototype._stringY = function(displayIndex) {
    var padT = this.padding.top * this.dpr;
    return padT + displayIndex * this.stringSpacing * this.dpr;
};

FretboardRenderer.prototype._displayIndex = function(tuningIndex) {
    return TOTAL_STRINGS - 1 - tuningIndex;
};

// CSS-space versions for overlay positioning
FretboardRenderer.prototype._fretXCSS = function(fret) {
    if (fret === 0) return this.padding.left - 18;
    return this.padding.left + (fret - 0.5) * (this.fretWidth / this.dpr);
};

FretboardRenderer.prototype._stringYCSS = function(displayIndex) {
    return this.padding.top + displayIndex * this.stringSpacing;
};

// ===================== Drawing Primitives =====================

FretboardRenderer.prototype._drawLine = function(x1, y1, x2, y2, width, color) {
    var gl = this.gl;
    var dx = x2 - x1;
    var dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;
    // Perpendicular normal scaled to half-width
    var nx = (-dy / len) * width * 0.5;
    var ny = (dx / len) * width * 0.5;

    var verts = new Float32Array([
        x1 + nx, y1 + ny, 0, 0,
        x1 - nx, y1 - ny, 1, 0,
        x2 + nx, y2 + ny, 0, 1,
        x1 - nx, y1 - ny, 1, 0,
        x2 - nx, y2 - ny, 1, 1,
        x2 + nx, y2 + ny, 0, 1
    ]);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.a_position);
    gl.vertexAttribPointer(this.a_position, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(this.a_uv);
    gl.vertexAttribPointer(this.a_uv, 2, gl.FLOAT, false, 16, 8);

    gl.uniform2f(this.u_resolution, this.width, this.height);
    gl.uniform1f(this.u_mode, 0);
    gl.uniform4f(this.u_color, color[0], color[1], color[2], color[3] !== undefined ? color[3] : 1.0);
    gl.uniform1f(this.u_glow, 0);
    gl.uniform1f(this.u_radius, 0);
    gl.uniform1f(this.u_stroke, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
};

FretboardRenderer.prototype._drawQuad = function(x, y, w, h, color, mode, glow, radius, stroke) {
    var gl = this.gl;
    mode = mode || 0;
    glow = glow || 0;
    radius = radius || 0.4;
    stroke = stroke || 0;

    var verts = new Float32Array([
        x,     y,     0, 0,
        x + w, y,     1, 0,
        x,     y + h, 0, 1,
        x + w, y,     1, 0,
        x + w, y + h, 1, 1,
        x,     y + h, 0, 1
    ]);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);

    gl.enableVertexAttribArray(this.a_position);
    gl.vertexAttribPointer(this.a_position, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(this.a_uv);
    gl.vertexAttribPointer(this.a_uv, 2, gl.FLOAT, false, 16, 8);

    gl.uniform2f(this.u_resolution, this.width, this.height);
    gl.uniform1f(this.u_mode, mode);
    gl.uniform4f(this.u_color, color[0], color[1], color[2], color[3] !== undefined ? color[3] : 1.0);
    gl.uniform1f(this.u_glow, glow);
    gl.uniform1f(this.u_radius, radius);
    gl.uniform1f(this.u_stroke, stroke);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
};

// ===================== Render Frame =====================

FretboardRenderer.prototype._render = function() {
    var gl = this.gl;
    var dpr = this.dpr;

    gl.clearColor(0.039, 0.039, 0.039, 1.0);  // #0a0a0a
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    var padL = this.padding.left * dpr;
    var padT = this.padding.top * dpr;
    var padB = this.padding.bottom * dpr;
    var fbWidth = FRET_COUNT * this.fretWidth;
    var topY = padT - 8 * dpr;
    var botY = padT + (TOTAL_STRINGS - 1) * this.stringSpacing * dpr + 8 * dpr;
    var fbHeight = botY - topY;

    // Background gradient quad (subtle)
    this._drawQuad(padL - 4 * dpr, topY - 4 * dpr, fbWidth + 8 * dpr, fbHeight + 8 * dpr,
        [0.06, 0.06, 0.06, 1.0]);

    // Nut (thick vertical line)
    this._drawQuad(padL - 1.5 * dpr, topY, 3 * dpr, fbHeight, [0.4, 0.4, 0.4, 1.0]);

    // Fret lines
    for (var f = 1; f <= FRET_COUNT; f++) {
        var x = padL + f * this.fretWidth;
        this._drawQuad(x - 0.5 * dpr, topY, 1 * dpr, fbHeight, [0.2, 0.2, 0.2, 1.0]);
    }

    // Fret dots
    var midYdisplay = (TOTAL_STRINGS - 1) / 2;
    var midY = this._stringY(midYdisplay);
    for (var d = 0; d < FRET_DOT_POSITIONS.length; d++) {
        var pos = FRET_DOT_POSITIONS[d];
        var dotSize = 6 * dpr;
        var fx = this._fretX(pos);
        if (pos === 12) {
            var dotSpread = this.stringSpacing * dpr * 1.5;
            var offsets = [-dotSpread, dotSpread];
            for (var o = 0; o < offsets.length; o++) {
                this._drawQuad(fx - dotSize, midY + offsets[o] - dotSize, dotSize * 2, dotSize * 2,
                    [0.22, 0.22, 0.22, 1.0], 1, 0, 0.45);
            }
        } else {
            this._drawQuad(fx - dotSize, midY - dotSize, dotSize * 2, dotSize * 2,
                [0.22, 0.22, 0.22, 1.0], 1, 0, 0.45);
        }
    }

    // Strings
    for (var si = 0; si < TOTAL_STRINGS; si++) {
        var di = this._displayIndex(si);
        var y = this._stringY(di);
        var isActive = this.activeStrings.indexOf(si) !== -1;
        var thickness = (1 + (5 - si) * 0.3) * dpr;
        var alpha = isActive ? 0.55 : 0.12;
        var color = isActive ? [0.55, 0.55, 0.55, alpha] : [0.25, 0.25, 0.25, alpha];
        this._drawQuad(padL, y - thickness / 2, fbWidth, thickness, color);
    }

    // Voicing group connecting lines
    for (var g = 0; g < this.voicingGroups.length; g++) {
        var group = this.voicingGroups[g];
        var pts = [];
        for (var gi = 0; gi < group.length; gi++) {
            var gdi = this._displayIndex(group[gi].string);
            pts.push({ x: this._fretX(group[gi].fret), y: this._stringY(gdi) });
        }
        pts.sort(function(a, b) { return a.y - b.y; });
        for (var li = 0; li < pts.length - 1; li++) {
            this._drawLine(pts[li].x, pts[li].y, pts[li + 1].x, pts[li + 1].y,
                1.5 * dpr, [1.0, 1.0, 1.0, 0.25]);
        }
    }

    // Note markers (animated)
    for (var i = 0; i < this.notes.length; i++) {
        var note = this.notes[i];
        if (note.opacity < 0.01) continue;

        var nx = note.x;
        var ny = note.y;
        var size = (note.size || 22) * dpr;
        var col = note.color;
        var glowIntensity = note.glowIntensity || 0;

        // Root note pulse — scale and brighten
        var pulse = 0;
        if (glowIntensity > 0) {
            pulse = 0.5 + 0.5 * Math.sin(this.time * 3.0 + (note.phase || 0));
            size = size * (1.0 + pulse * 0.15);
        }

        // Stroke outline
        var strokeSize = size + 3 * dpr;
        this._drawQuad(
            nx - strokeSize, ny - strokeSize, strokeSize * 2, strokeSize * 2,
            [col[0], col[1], col[2], note.opacity * 0.8],
            1, 0, 0.38, 0.06
        );

        // Filled circle
        var drawOpacity = note.opacity;
        if (glowIntensity > 0) {
            drawOpacity = note.opacity * (0.85 + 0.15 * pulse);
        }
        this._drawQuad(
            nx - size, ny - size, size * 2, size * 2,
            [col[0], col[1], col[2], drawOpacity],
            1, glowIntensity, 0.38
        );
    }

    // Update overlay labels
    this._updateOverlay();
};

// ===================== Overlay (HTML text) =====================

FretboardRenderer.prototype._updateOverlay = function() {
    if (this._overlayDirty === false) return;
    this._overlayDirty = false;

    var html = '';

    // String labels — hide if there's a note at fret 0 on that string
    var fret0Strings = {};
    for (var i = 0; i < this.notes.length; i++) {
        if (this.notes[i].fret === 0 && this.notes[i].opacity > 0.1) {
            fret0Strings[this.notes[i].string] = true;
        }
    }
    for (var si = 0; si < TOTAL_STRINGS; si++) {
        if (fret0Strings[si]) continue;
        var di = this._displayIndex(si);
        var y = this._stringYCSS(di);
        var isActive = this.activeStrings.indexOf(si) !== -1;
        var alpha = isActive ? 0.6 : 0.15;
        html += '<span class="fb-string-label" style="top:' + y + 'px;left:' +
            (this.padding.left - 22) + 'px;opacity:' + alpha + '">' + STRING_NAMES[si] + '</span>';
    }

    // Fret numbers
    var fretNumY = this._stringYCSS(TOTAL_STRINGS - 1) + 24;
    var fretWidthCSS = this.fretWidth / this.dpr;
    for (var f = 1; f <= FRET_COUNT; f++) {
        var fx = this._fretXCSS(f);
        html += '<span class="fb-fret-number" style="top:' + fretNumY + 'px;left:' + fx + 'px">' + f + '</span>';
    }

    // Fret dot indicators below fret numbers
    var dotY = fretNumY + 16;
    for (var d = 0; d < FRET_DOT_POSITIONS.length; d++) {
        var pos = FRET_DOT_POSITIONS[d];
        var dx = this._fretXCSS(pos);
        if (pos === 12) {
            html += '<span class="fb-fret-dot-label" style="top:' + dotY + 'px;left:' + dx + 'px;line-height:1">\u2022<br>\u2022</span>';
        } else {
            html += '<span class="fb-fret-dot-label" style="top:' + dotY + 'px;left:' + dx + 'px">\u2022</span>';
        }
    }

    // Note labels
    for (var i = 0; i < this.notes.length; i++) {
        var note = this.notes[i];
        if (note.opacity < 0.1 || !note.label) continue;
        var nx = note.x / this.dpr;
        var ny = note.y / this.dpr;
        var fontSize = note.size && note.size < 16 ? 9 : 11;
        html += '<span class="fb-note-label" style="top:' + ny + 'px;left:' + nx +
            'px;opacity:' + Math.min(note.opacity, 1) + ';font-size:' + fontSize + 'px">' + note.label + '</span>';
    }

    this.overlay.innerHTML = html;
};

// ===================== Note Animation =====================

FretboardRenderer.prototype.setNotes = function(notesArray) {
    this.targetNotes = notesArray;
    this._overlayDirty = true;

    // Match existing notes by string+fret key, or create new
    var newNotes = [];
    var usedOld = {};

    for (var i = 0; i < notesArray.length; i++) {
        var target = notesArray[i];
        var di = this._displayIndex(target.string);
        var tx = this._fretX(target.fret);
        var ty = this._stringY(di);
        var col = this._resolveColor(target.color);

        // Find existing note for this string+fret
        var found = -1;
        for (var j = 0; j < this.notes.length; j++) {
            if (!usedOld[j] && this.notes[j].string === target.string && this.notes[j].fret === target.fret) {
                found = j;
                break;
            }
        }

        var noteObj;
        if (found >= 0) {
            usedOld[found] = true;
            noteObj = this.notes[found];
            noteObj.targetOpacity = target.opacity !== undefined ? target.opacity : 1.0;
            noteObj.color = col;
            noteObj.label = target.label || '';
            noteObj.glowTarget = target.glow ? 1.0 : 0;
            noteObj.size = target.size || 22;
        } else {
            noteObj = {
                string: target.string,
                fret: target.fret,
                x: tx,
                y: ty,
                targetX: tx,
                targetY: ty,
                opacity: 0,
                targetOpacity: target.opacity !== undefined ? target.opacity : 1.0,
                color: col,
                label: target.label || '',
                glowIntensity: 0,
                glowTarget: target.glow ? 1.0 : 0,
                phase: Math.random() * Math.PI * 2,
                size: target.size || 22,
                delay: (i * 0.05)  // stagger
            };
        }

        newNotes.push(noteObj);
    }

    // Fade out old notes that weren't matched
    for (var j = 0; j < this.notes.length; j++) {
        if (!usedOld[j]) {
            this.notes[j].targetOpacity = 0;
            this.notes[j].glowTarget = 0;
            newNotes.push(this.notes[j]);
        }
    }

    this.notes = newNotes;
};

FretboardRenderer.prototype._resolveColor = function(name) {
    if (Array.isArray(name)) return name;
    return NOTE_COLORS[name] || NOTE_COLORS.dim;
};

FretboardRenderer.prototype.setActiveStrings = function(stringSet) {
    this.activeStrings = stringSet || [];
    this._overlayDirty = true;
};

FretboardRenderer.prototype.setVoicingGroups = function(groups) {
    this.voicingGroups = groups || [];
};

FretboardRenderer.prototype.setInteractive = function(enabled, onClick) {
    this.interactive = enabled;
    this.onClick = onClick;

    if (enabled && onClick) {
        this._setupClickHandler();
    } else {
        this._removeClickHandler();
    }
};

// ===================== Click Handling =====================

FretboardRenderer.prototype._setupClickHandler = function() {
    this._removeClickHandler();
    var self = this;
    this._clickFn = function(e) {
        if (!self.interactive || !self.onClick) return;

        var rect = self.canvas.getBoundingClientRect();
        var mx = e.clientX - rect.left;
        var my = e.clientY - rect.top;

        // Find nearest active string
        var bestString = -1;
        var bestStringDist = Infinity;
        for (var i = 0; i < self.activeStrings.length; i++) {
            var si = self.activeStrings[i];
            var di = self._displayIndex(si);
            var sy = self._stringYCSS(di);
            var dist = Math.abs(my - sy);
            if (dist < bestStringDist && dist < self.stringSpacing * 0.6) {
                bestStringDist = dist;
                bestString = si;
            }
        }

        if (bestString < 0) return;

        // Find nearest fret
        var bestFret = 0;
        var bestFretDist = Infinity;
        for (var f = 0; f <= FRET_COUNT; f++) {
            var fx = self._fretXCSS(f);
            var dist = Math.abs(mx - fx);
            if (dist < bestFretDist) {
                bestFretDist = dist;
                bestFret = f;
            }
        }

        self.onClick(bestString, bestFret);
    };
    this.canvas.addEventListener('click', this._clickFn);
    this.canvas.style.cursor = 'pointer';
};

FretboardRenderer.prototype._removeClickHandler = function() {
    if (this._clickFn) {
        this.canvas.removeEventListener('click', this._clickFn);
        this._clickFn = null;
    }
    this.canvas.style.cursor = 'default';
};

// ===================== Animation Loop =====================

FretboardRenderer.prototype._startLoop = function() {
    var self = this;
    var lerpSpeed = 0.12;

    function frame(timestamp) {
        var dt = (timestamp - (self._lastTime || timestamp)) / 1000;
        self._lastTime = timestamp;
        self.time += dt;

        // Animate notes
        var anyMoving = false;
        var removeList = [];

        for (var i = 0; i < self.notes.length; i++) {
            var n = self.notes[i];

            // Stagger delay
            if (n.delay && n.delay > 0) {
                n.delay -= dt;
                if (n.opacity < n.targetOpacity) {
                    anyMoving = true;
                    continue;
                }
            }

            // Lerp opacity
            var diff = n.targetOpacity - n.opacity;
            if (Math.abs(diff) > 0.001) {
                n.opacity += diff * lerpSpeed;
                anyMoving = true;
            } else {
                n.opacity = n.targetOpacity;
            }

            // Lerp glow
            var glowDiff = n.glowTarget - n.glowIntensity;
            if (Math.abs(glowDiff) > 0.001) {
                n.glowIntensity += glowDiff * lerpSpeed;
                anyMoving = true;
            } else {
                n.glowIntensity = n.glowTarget;
            }

            // Remove fully faded notes
            if (n.opacity < 0.005 && n.targetOpacity === 0) {
                removeList.push(i);
            }
        }

        // Glow pulse always needs redraw
        for (var i = 0; i < self.notes.length; i++) {
            if (self.notes[i].glowIntensity > 0.01) {
                anyMoving = true;
                break;
            }
        }

        // Remove faded
        for (var r = removeList.length - 1; r >= 0; r--) {
            self.notes.splice(removeList[r], 1);
            self._overlayDirty = true;
        }

        if (anyMoving) self._overlayDirty = true;

        self._render();
        self._rafId = requestAnimationFrame(frame);
    }

    this._rafId = requestAnimationFrame(frame);
};

FretboardRenderer.prototype.destroy = function() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._removeClickHandler();
};
