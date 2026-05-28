/* CD (circular dichroism) spectrum — overlay traces + thermal melt with Tm sigmoid fit */
(function () {
  'use strict';

  // ---------- Parser ----------
  // CSV/TSV. First column = wavelength (nm) OR temperature (°C). Remaining columns = traces.
  // Mode auto-detected: if first-column range starts < 60 and max < 110, treat as MELT;
  // otherwise SPECTRUM. Header row optional (used as trace labels).
  function parseCD(text) {
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim() && !l.startsWith('#'));
    if (!lines.length) throw new Error('Empty file');
    const sep = lines[0].includes('\t') ? '\t' : (lines[0].includes(',') ? ',' : /\s+/);
    const split = l => sep instanceof RegExp ? l.trim().split(sep) : l.split(sep).map(s => s.trim());

    const firstRow = split(lines[0]);
    const isNumeric = firstRow.every(c => c !== '' && !isNaN(parseFloat(c)));
    const headers = isNumeric
      ? firstRow.map((_, i) => i === 0 ? 'x' : 'Trace ' + i)
      : firstRow;
    const dataStart = isNumeric ? 0 : 1;

    const cols = headers.map(() => []);
    for (let r = dataStart; r < lines.length; r++) {
      const parts = split(lines[r]);
      for (let c = 0; c < headers.length; c++) {
        const v = parseFloat(parts[c]);
        cols[c].push(isNaN(v) ? null : v);
      }
    }

    const xs = cols[0].filter(v => v != null);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const mode = (xMin < 60 && xMax < 110) ? 'melt' : 'spectrum';

    const traces = [];
    for (let i = 1; i < headers.length; i++) {
      const x = [], y = [];
      for (let r = 0; r < cols[0].length; r++) {
        if (cols[0][r] != null && cols[i][r] != null) {
          x.push(cols[0][r]);
          y.push(cols[i][r]);
        }
      }
      if (!x.length) continue;
      const tr = { label: headers[i], x, y };
      if (mode === 'melt') tr.fit = fitSigmoidMelt(x, y);
      traces.push(tr);
    }

    return { mode, traces, xLabel: headers[0] };
  }

  // ---------- Two-state thermal melt fit ----------
  // y = N + (D - N) / (1 + exp(-(T - Tm) * k))
  // Returns {N, D, Tm, k, R2}.
  function fitSigmoidMelt(T, y) {
    if (!T.length) return null;
    const n = T.length;
    // Initial guesses
    let N = y[0], D = y[n - 1];
    const sign = D >= N ? 1 : -1;
    // Find half-way y for Tm guess
    const mid = (N + D) / 2;
    let Tm = T[Math.floor(n / 2)];
    for (let i = 0; i < n; i++) {
      if ((sign > 0 && y[i] >= mid) || (sign < 0 && y[i] <= mid)) { Tm = T[i]; break; }
    }
    let k = 0.5 * sign;

    // Levenberg-Marquardt-lite (Gauss-Newton with damping)
    let lambda = 0.001;
    for (let iter = 0; iter < 150; iter++) {
      let J00 = 0, J01 = 0, J02 = 0, J03 = 0;
      let J11 = 0, J12 = 0, J13 = 0, J22 = 0, J23 = 0, J33 = 0;
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0;
      for (let i = 0; i < n; i++) {
        const e = Math.exp(-(T[i] - Tm) * k);
        const denom = 1 + e;
        const pred = N + (D - N) / denom;
        const r = y[i] - pred;
        // partials
        const dN = 1 - 1 / denom;
        const dD = 1 / denom;
        const dTm = -(D - N) * e * k / (denom * denom);
        const dk = (D - N) * (T[i] - Tm) * e / (denom * denom);
        J00 += dN * dN; J01 += dN * dD; J02 += dN * dTm; J03 += dN * dk;
        J11 += dD * dD; J12 += dD * dTm; J13 += dD * dk;
        J22 += dTm * dTm; J23 += dTm * dk;
        J33 += dk * dk;
        b0 += dN * r; b1 += dD * r; b2 += dTm * r; b3 += dk * r;
      }
      // 4x4 solve via Cramer-free Gauss elimination (small enough)
      const A = [
        [J00 + lambda * J00, J01, J02, J03, b0],
        [J01, J11 + lambda * J11, J12, J13, b1],
        [J02, J12, J22 + lambda * J22, J23, b2],
        [J03, J13, J23, J33 + lambda * J33, b3]
      ];
      const sol = gauss4(A);
      if (!sol) break;
      const [dN_, dD_, dTm_, dk_] = sol;
      const trial = { N: N + dN_, D: D + dD_, Tm: Tm + dTm_, k: k + dk_ };
      const ssNew = ssResid(T, y, trial.N, trial.D, trial.Tm, trial.k);
      const ssOld = ssResid(T, y, N, D, Tm, k);
      if (ssNew < ssOld) {
        N = trial.N; D = trial.D; Tm = trial.Tm; k = trial.k;
        lambda *= 0.5;
        if (Math.abs(dN_) + Math.abs(dD_) + Math.abs(dTm_) + Math.abs(dk_) < 1e-7) break;
      } else {
        lambda *= 2;
        if (lambda > 1e8) break;
      }
    }
    const ssRes = ssResid(T, y, N, D, Tm, k);
    const mean = y.reduce((a, b) => a + b, 0) / n;
    const ssTot = y.reduce((a, b) => a + (b - mean) ** 2, 0);
    const R2 = ssTot > 0 ? 1 - ssRes / ssTot : NaN;
    return { N, D, Tm, k, R2 };
  }
  function ssResid(T, y, N, D, Tm, k) {
    let s = 0;
    for (let i = 0; i < T.length; i++) {
      const e = Math.exp(-(T[i] - Tm) * k);
      const pred = N + (D - N) / (1 + e);
      s += (y[i] - pred) ** 2;
    }
    return s;
  }
  function gauss4(M) {
    // 4-row 5-col matrix; returns [x0..x3] or null
    for (let i = 0; i < 4; i++) {
      let piv = i;
      for (let j = i + 1; j < 4; j++) if (Math.abs(M[j][i]) > Math.abs(M[piv][i])) piv = j;
      if (Math.abs(M[piv][i]) < 1e-14) return null;
      if (piv !== i) { const t = M[i]; M[i] = M[piv]; M[piv] = t; }
      for (let j = i + 1; j < 4; j++) {
        const f = M[j][i] / M[i][i];
        for (let c = i; c < 5; c++) M[j][c] -= f * M[i][c];
      }
    }
    const x = [0, 0, 0, 0];
    for (let i = 3; i >= 0; i--) {
      let s = M[i][4];
      for (let j = i + 1; j < 4; j++) s -= M[i][j] * x[j];
      x[i] = s / M[i][i];
    }
    return x;
  }

  // ---------- Helpers ----------
  function niceTicks(min, max, count) {
    const range = max - min;
    if (range === 0) return [min];
    const rough = range / count;
    const pow = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / pow;
    let step;
    if (norm < 1.5) step = 1 * pow;
    else if (norm < 3) step = 2 * pow;
    else if (norm < 7) step = 5 * pow;
    else step = 10 * pow;
    const start = Math.ceil(min / step) * step;
    const ticks = [];
    for (let v = start; v <= max + step * 0.0001; v += step) {
      ticks.push(Math.round(v / step) * step);
    }
    return ticks;
  }
  function formatTick(v, step) {
    const minus = '\u2212';
    if (step >= 1) return String(Math.round(v)).replace('-', minus);
    const d = Math.max(0, Math.ceil(-Math.log10(step)));
    return v.toFixed(d).replace('-', minus);
  }
  function escapeXml(s) {
    return String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
  }
  function richLabel(s) {
    if (!s) return '';
    let out = escapeXml(s);
    out = out.replace(/\bT_m\b/g, '<tspan font-style="italic">T</tspan><tspan baseline-shift="sub" font-size="0.78em">m</tspan>');
    out = out.replace(/\[θ\]/g, '[<tspan font-style="italic">θ</tspan>]');
    return out;
  }
  function fmt(x, sig) {
    sig = sig || 3;
    if (!isFinite(x)) return '\u2014';
    if (x === 0) return '0';
    return Number(x.toPrecision(sig)).toString();
  }
  const PALETTE = ['#000000', '#0072B2', '#D55E00', '#009E73', '#CC79A7', '#56B4E9', '#E69F00'];
  const DASH = ['', '4 3', '1 2', '6 2 1 2', '2 2'];

  // ---------- Renderer ----------
  function renderCD(data, opts) {
    opts = opts || {};
    const mode = opts.mode || data.mode || 'spectrum';
    const W = opts.width || 640;
    const H = opts.height || 460;
    const fontFamily = opts.fontFamily || "'Helvetica Neue', Helvetica, Arial, sans-serif";
    const titleSize = opts.titleSize ?? 13;
    const labelSize = opts.labelSize ?? 11;
    const tickSize = opts.tickSize ?? 9;
    const lineWidth = opts.lineWidth ?? 1.1;
    const borderWidth = opts.borderWidth ?? 0.7;
    const spineStyle = opts.spineStyle || 'L';
    const tickDir = opts.tickDir || (spineStyle === 'box' ? 'in' : 'out');
    const showLegend = opts.showLegend ?? true;
    const showZeroLine = opts.showZeroLine ?? true;
    const useColor = opts.useColor ?? true;
    const title = opts.title || '';
    const xLab = opts.xlab || (mode === 'melt' ? 'Temperature (°C)' : 'Wavelength (nm)');
    const yLab = opts.ylab || (opts.yUnit || (opts.useMRE ? '[θ] (deg cm\u00b2 dmol\u207b\u00b9)' : 'Ellipticity (mdeg)'));

    const traces = data.traces.map((t, i) => ({
      ...t,
      color: useColor && data.traces.length > 1 ? PALETTE[i % PALETTE.length] : '#000',
      dash: useColor ? '' : DASH[i % DASH.length]
    }));

    // Compute ranges
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    traces.forEach(t => {
      for (let i = 0; i < t.x.length; i++) {
        if (t.x[i] < xMin) xMin = t.x[i]; if (t.x[i] > xMax) xMax = t.x[i];
        if (t.y[i] < yMin) yMin = t.y[i]; if (t.y[i] > yMax) yMax = t.y[i];
      }
    });
    if (!isFinite(xMin)) { xMin = 0; xMax = 1; yMin = -1; yMax = 1; }
    const xPad = (xMax - xMin) * 0.02;
    const yPad = (yMax - yMin) * 0.08 || 1;
    xMin -= xPad; xMax += xPad;
    yMin -= yPad; yMax += yPad;

    // Spectrum mode often wants conventional 190..260 range; respect data
    const xTicks = niceTicks(xMin, xMax, 6);
    const yTicks = niceTicks(yMin, yMax, 5);
    const xStep = xTicks.length > 1 ? xTicks[1] - xTicks[0] : 1;
    const yStep = yTicks.length > 1 ? yTicks[1] - yTicks[0] : 1;

    // Snap bounds to nice extents
    xMin = Math.min(xMin, xTicks[0]); xMax = Math.max(xMax, xTicks[xTicks.length - 1]);
    yMin = Math.min(yMin, yTicks[0]); yMax = Math.max(yMax, yTicks[yTicks.length - 1]);

    // Layout
    const titleH = title ? titleSize + 8 : 0;
    const margin = {
      left: Math.max(60, labelSize * 4.6),
      right: 20,
      top: titleH + 12,
      bottom: tickSize + labelSize + 24
    };
    const plotW = W - margin.left - margin.right;
    const plotH = H - margin.top - margin.bottom;
    const plotX = margin.left, plotY = margin.top;
    const sx = v => plotX + (v - xMin) / (xMax - xMin) * plotW;
    const sy = v => plotY + plotH - (v - yMin) / (yMax - yMin) * plotH;

    const parts = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${fontFamily}">`);
    parts.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
    parts.push(`<defs><clipPath id="cdclip"><rect x="${plotX}" y="${plotY}" width="${plotW}" height="${plotH}"/></clipPath></defs>`);

    // Title
    if (title) {
      parts.push(`<text x="${W / 2}" y="${titleSize + 6}" text-anchor="middle" font-size="${titleSize}" fill="#000">${richLabel(title)}</text>`);
    }

    // Zero line (very common in CD)
    if (showZeroLine && yMin < 0 && yMax > 0) {
      const y0 = sy(0);
      parts.push(`<line x1="${plotX}" y1="${y0}" x2="${plotX + plotW}" y2="${y0}" stroke="#bcbcb8" stroke-width="0.6" stroke-dasharray="3 2"/>`);
    }

    // Reference markers for far-UV CD landmarks (only in spectrum mode, when range fits)
    if (mode === 'spectrum' && opts.showLandmarks !== false && xMin <= 222 && xMax >= 208) {
      [208, 222].forEach(L => {
        if (L >= xMin && L <= xMax) {
          const X = sx(L);
          parts.push(`<line x1="${X}" y1="${plotY}" x2="${X}" y2="${plotY + plotH}" stroke="#ececea" stroke-width="0.5"/>`);
          parts.push(`<text x="${X}" y="${plotY + 12}" text-anchor="middle" font-size="${tickSize - 0.5}" fill="#b0b0ab">${L}</text>`);
        }
      });
    }

    // Fit curves for melt mode (drawn under data)
    if (mode === 'melt') {
      traces.forEach(t => {
        if (!t.fit) return;
        const { N, D, Tm, k } = t.fit;
        let d = '';
        const tMinX = Math.min(...t.x), tMaxX = Math.max(...t.x);
        const N1 = 200;
        for (let n = 0; n <= N1; n++) {
          const TT = tMinX + (n / N1) * (tMaxX - tMinX);
          const yy = N + (D - N) / (1 + Math.exp(-(TT - Tm) * k));
          const X = sx(TT), Y = sy(yy);
          d += (n === 0 ? 'M' : 'L') + X.toFixed(2) + ',' + Y.toFixed(2) + ' ';
        }
        parts.push(`<path d="${d}" fill="none" stroke="${t.color}" stroke-width="${lineWidth}" clip-path="url(#cdclip)"/>`);
      });
      // Tm vertical guides
      traces.forEach(t => {
        if (!t.fit) return;
        const X = sx(t.fit.Tm);
        const Y = sy(t.fit.N + (t.fit.D - t.fit.N) / 2);
        parts.push(`<line x1="${X}" y1="${plotY + plotH}" x2="${X}" y2="${Y}" stroke="${t.color}" stroke-width="0.6" stroke-dasharray="3 2" clip-path="url(#cdclip)"/>`);
      });
    }

    // Data traces (lines for spectrum, points for melt)
    traces.forEach(t => {
      if (mode === 'spectrum') {
        let d = '';
        for (let i = 0; i < t.x.length; i++) {
          const X = sx(t.x[i]), Y = sy(t.y[i]);
          d += (i === 0 ? 'M' : 'L') + X.toFixed(2) + ',' + Y.toFixed(2) + ' ';
        }
        const dash = t.dash ? ` stroke-dasharray="${t.dash}"` : '';
        parts.push(`<path d="${d}" fill="none" stroke="${t.color}" stroke-width="${lineWidth}"${dash} stroke-linejoin="round" clip-path="url(#cdclip)"/>`);
      } else {
        // melt: open markers
        for (let i = 0; i < t.x.length; i++) {
          const X = sx(t.x[i]), Y = sy(t.y[i]);
          parts.push(`<circle cx="${X}" cy="${Y}" r="2.6" fill="#ffffff" stroke="${t.color}" stroke-width="0.9"/>`);
        }
      }
    });

    // Axes
    if (spineStyle === 'box') {
      parts.push(`<rect x="${plotX}" y="${plotY}" width="${plotW}" height="${plotH}" fill="none" stroke="#000" stroke-width="${borderWidth}"/>`);
    } else {
      parts.push(`<line x1="${plotX}" y1="${plotY + plotH}" x2="${plotX + plotW}" y2="${plotY + plotH}" stroke="#000" stroke-width="${borderWidth}"/>`);
      parts.push(`<line x1="${plotX}" y1="${plotY}" x2="${plotX}" y2="${plotY + plotH}" stroke="#000" stroke-width="${borderWidth}"/>`);
    }
    const tk = tickDir === 'in' ? -1 : 1;
    const majL = 5 * tk;
    const tkW = Math.max(0.7, borderWidth);
    xTicks.forEach(v => {
      const X = sx(v);
      parts.push(`<line x1="${X}" y1="${plotY + plotH}" x2="${X}" y2="${plotY + plotH + majL}" stroke="#000" stroke-width="${tkW}"/>`);
      parts.push(`<text x="${X}" y="${plotY + plotH + tickSize + 6}" text-anchor="middle" font-size="${tickSize}" fill="#000">${formatTick(v, xStep)}</text>`);
    });
    yTicks.forEach(v => {
      const Y = sy(v);
      parts.push(`<line x1="${plotX}" y1="${Y}" x2="${plotX - majL}" y2="${Y}" stroke="#000" stroke-width="${tkW}"/>`);
      parts.push(`<text x="${plotX - Math.max(majL, 0) - 3}" y="${Y + 3}" text-anchor="end" font-size="${tickSize}" fill="#000">${formatTick(v, yStep)}</text>`);
    });
    parts.push(`<text x="${plotX + plotW / 2}" y="${plotY + plotH + tickSize + labelSize + 18}" text-anchor="middle" font-size="${labelSize}" fill="#000">${richLabel(xLab)}</text>`);
    parts.push(`<text transform="translate(${plotX - margin.left + labelSize + 6} ${plotY + plotH / 2}) rotate(-90)" text-anchor="middle" font-size="${labelSize}" fill="#000">${richLabel(yLab)}</text>`);

    // Legend
    if (showLegend && traces.length > 1) {
      const legW = 150, lineH = labelSize + 4;
      const legH = traces.length * lineH + 8;
      const legX = plotX + plotW - legW - 10;
      const legY = plotY + 8;
      parts.push(`<rect x="${legX}" y="${legY}" width="${legW}" height="${legH}" fill="rgba(255,255,255,0.92)" stroke="#d8d8d4" stroke-width="0.5"/>`);
      traces.forEach((t, i) => {
        const ly = legY + 6 + i * lineH + lineH / 2;
        const dash = t.dash ? ` stroke-dasharray="${t.dash}"` : '';
        parts.push(`<line x1="${legX + 8}" y1="${ly}" x2="${legX + 30}" y2="${ly}" stroke="${t.color}" stroke-width="${lineWidth}"${dash}/>`);
        parts.push(`<text x="${legX + 36}" y="${ly + 3.5}" font-size="${labelSize - 1}" fill="#000">${escapeXml(t.label)}</text>`);
      });
    }

    // Tm parameter box for melt
    if (mode === 'melt' && (opts.showParamBox ?? true)) {
      const rows = [['Sample', 'T\u2098 (°C)', 'R\u00b2']];
      traces.forEach(t => {
        if (!t.fit) return;
        rows.push([t.label, fmt(t.fit.Tm, 4), t.fit.R2 == null ? '\u2014' : t.fit.R2.toFixed(3)]);
      });
      const fs = opts.paramBoxFontSize ?? Math.max(9, Math.round(labelSize * 0.95));
      const cw = fs * 0.58;
      const colW = rows[0].map(() => 0);
      rows.forEach(r => r.forEach((c, i) => {
        const w = String(c).length * cw;
        if (w > colW[i]) colW[i] = w;
      }));
      const colGap = fs * 1.1, padX = fs * 0.8, padY = fs * 0.5;
      const boxW = colW.reduce((a, b) => a + b, 0) + colGap * (colW.length - 1) + padX * 2;
      const lineH = fs * 1.4;
      const boxH = rows.length * lineH + padY * 2;
      const pbX = plotX + 10;
      const pbY = plotY + 10;
      parts.push(`<g font-size="${fs}" fill="#000">`);
      parts.push(`<rect x="${pbX}" y="${pbY}" width="${boxW}" height="${boxH}" fill="rgba(255,255,255,0.94)" stroke="#d8d8d4" stroke-width="0.5"/>`);
      rows.forEach((r, i) => {
        let xOff = pbX + padX;
        const yLine = pbY + padY + (i + 0.8) * lineH;
        r.forEach((cell, c) => {
          const isHead = i === 0;
          const t = isHead ? `<tspan font-weight="600">${escapeXml(cell)}</tspan>` : escapeXml(cell);
          parts.push(`<text x="${xOff}" y="${yLine}" font-size="${fs}">${t}</text>`);
          xOff += colW[c] + colGap;
        });
        if (i === 0) {
          parts.push(`<line x1="${pbX + padX * 0.6}" x2="${pbX + boxW - padX * 0.6}" y1="${yLine + 3}" y2="${yLine + 3}" stroke="#d8d8d4" stroke-width="0.5"/>`);
        }
      });
      parts.push(`</g>`);
    }

    parts.push(`</svg>`);
    return parts.join('');
  }

  // ---------- Sample ----------
  function sampleCD() {
    // Synthetic far-UV CD spectrum: α-helix (WT), partially folded (mutant), unfolded (denatured)
    const wl = [];
    for (let l = 195; l <= 260; l += 1) wl.push(l);
    function helixSpec(scale) {
      // Approx α-helix shape: minima at 208 and 222, max at ~192. Smooth two-Gaussian model.
      return wl.map(l => {
        const a = -38 * Math.exp(-Math.pow((l - 222) / 6.5, 2));
        const b = -34 * Math.exp(-Math.pow((l - 208) / 5.5, 2));
        const c = 18 * Math.exp(-Math.pow((l - 192) / 5, 2));
        return scale * (a + b + c) + (Math.random() - 0.5) * 0.4;
      });
    }
    function unfoldedSpec() {
      return wl.map(l => -18 * Math.exp(-Math.pow((l - 200) / 5, 2)) + (Math.random() - 0.5) * 0.3);
    }
    const traces = [
      { label: 'WT (native)', x: wl.slice(), y: helixSpec(1.0) },
      { label: 'D110A mutant', x: wl.slice(), y: helixSpec(0.62) },
      { label: 'Heat-denatured', x: wl.slice(), y: unfoldedSpec() }
    ];
    return { mode: 'spectrum', traces, xLabel: 'Wavelength (nm)' };
  }

  function sampleCDMelt() {
    // Two thermal-melt curves at fixed wavelength (222 nm): WT (high Tm) + variant (low Tm)
    const T = [];
    for (let t = 25; t <= 90; t += 2.5) T.push(t);
    function melt(TmTrue, k, N, D) {
      return T.map(t => N + (D - N) / (1 + Math.exp(-(t - TmTrue) * k)) + (Math.random() - 0.5) * 0.5);
    }
    const traces = [
      { label: 'WT', x: T.slice(), y: melt(68.4, 0.38, -32, -6) },
      { label: 'D110A', x: T.slice(), y: melt(54.7, 0.30, -22, -4) }
    ];
    traces.forEach(t => { t.fit = fitSigmoidMelt(t.x, t.y); });
    return { mode: 'melt', traces, xLabel: 'Temperature (°C)' };
  }

  const presets = {
    neutral: {
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
      titleSize: 13, labelSize: 11, tickSize: 9,
      lineWidth: 1.1, borderWidth: 0.7,
      tickDir: 'out', spineStyle: 'L',
      showLegend: true, showZeroLine: true, useColor: true,
      width: 640, height: 460
    }
  };

  window.CD = { parse: parseCD, render: renderCD, sample: sampleCD, sampleMelt: sampleCDMelt, fitMelt: fitSigmoidMelt, presets };
})();
