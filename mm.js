/* Michaelis-Menten enzyme kinetics — parser + non-linear fit + renderer */
(function () {
  'use strict';

  // ---------- Parser ----------
  // Accepts CSV/TSV. Header row required (first non-numeric row).
  // Layouts supported:
  //   [S]<sep>v                    -> single dataset
  //   [S]<sep>v<sep>err            -> single dataset with SEM
  //   [S]<sep>v1<sep>v2<sep>...    -> N datasets sharing [S], inferred from header
  //   [S]<sep>v1<sep>err1<sep>v2<sep>err2 (when err columns named 'err*' or 'sem*' or 'sd*')
  // Header is used as the dataset label.
  function parseMM(text) {
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
    if (!lines.length) throw new Error('Empty file');
    const sep = lines[0].includes('\t') ? '\t' : (lines[0].includes(',') ? ',' : /\s+/);
    const split = (l) => sep instanceof RegExp ? l.trim().split(sep) : l.split(sep).map(s => s.trim());

    // Detect header
    const firstRow = split(lines[0]);
    const allNumeric = firstRow.every(c => c !== '' && !isNaN(parseFloat(c)));
    let headers, dataStart;
    if (allNumeric) {
      headers = firstRow.map((_, i) => i === 0 ? '[S]' : 'v' + i);
      dataStart = 0;
    } else {
      headers = firstRow;
      dataStart = 1;
    }

    // Identify error columns by header pattern
    const isErrCol = headers.map((h, i) => i > 0 && /^(err|sem|sd|std|σ|sigma)/i.test(h));

    // Build datasets
    const sCol = 0;
    const datasets = [];
    for (let i = 1; i < headers.length; i++) {
      if (isErrCol[i]) continue;
      const errIdx = (i + 1 < headers.length && isErrCol[i + 1]) ? (i + 1) : -1;
      datasets.push({
        label: headers[i],
        sIdx: sCol,
        vIdx: i,
        errIdx,
        S: [], v: [], err: []
      });
    }

    for (let r = dataStart; r < lines.length; r++) {
      const parts = split(lines[r]);
      if (!parts.length) continue;
      const s = parseFloat(parts[sCol]);
      if (isNaN(s)) continue;
      datasets.forEach(ds => {
        const v = parseFloat(parts[ds.vIdx]);
        if (isNaN(v)) return;
        ds.S.push(s);
        ds.v.push(v);
        const e = ds.errIdx >= 0 ? parseFloat(parts[ds.errIdx]) : NaN;
        ds.err.push(isNaN(e) ? null : e);
      });
    }

    // Fit each
    datasets.forEach(ds => {
      ds.fit = fitMM(ds.S, ds.v);
    });

    return {
      xLabel: headers[sCol] || '[S]',
      datasets
    };
  }

  // ---------- Non-linear fit: v = Vmax * S / (Km + S) ----------
  // Gauss-Newton with Lineweaver-Burk seed. Returns {Vmax, Km, kcat?, R2, residSD}.
  function fitMM(S, v) {
    if (!S.length || S.length !== v.length) return null;
    // Seed from LB regression on points with S>0 and v>0
    const xLB = [], yLB = [];
    for (let i = 0; i < S.length; i++) {
      if (S[i] > 0 && v[i] > 0) { xLB.push(1 / S[i]); yLB.push(1 / v[i]); }
    }
    let Vmax = Math.max(...v) * 1.05;
    let Km = Math.max(...S) / 4;
    if (xLB.length >= 2) {
      const n = xLB.length;
      const mx = xLB.reduce((a, b) => a + b, 0) / n;
      const my = yLB.reduce((a, b) => a + b, 0) / n;
      let num = 0, den = 0;
      for (let i = 0; i < n; i++) { num += (xLB[i] - mx) * (yLB[i] - my); den += (xLB[i] - mx) ** 2; }
      const slope = den ? num / den : 0;
      const intercept = my - slope * mx;
      if (intercept > 0) Vmax = 1 / intercept;
      if (slope > 0) Km = slope * Vmax;
    }

    // Gauss-Newton iterations on residuals
    for (let iter = 0; iter < 80; iter++) {
      let J00 = 0, J01 = 0, J11 = 0, b0 = 0, b1 = 0;
      for (let i = 0; i < S.length; i++) {
        const s = S[i];
        const denom = (Km + s);
        const pred = Vmax * s / denom;
        const r = v[i] - pred;
        const dVmax = s / denom;
        const dKm = -Vmax * s / (denom * denom);
        J00 += dVmax * dVmax;
        J01 += dVmax * dKm;
        J11 += dKm * dKm;
        b0 += dVmax * r;
        b1 += dKm * r;
      }
      // Solve 2x2 (J^T J) dx = J^T r
      const det = J00 * J11 - J01 * J01;
      if (Math.abs(det) < 1e-20) break;
      const dV = (J11 * b0 - J01 * b1) / det;
      const dK = (-J01 * b0 + J00 * b1) / det;
      Vmax += dV;
      Km += dK;
      if (Math.abs(dV) < 1e-8 * Math.abs(Vmax) + 1e-12 &&
          Math.abs(dK) < 1e-8 * Math.abs(Km) + 1e-12) break;
    }
    if (Km < 0) Km = 1e-9;
    if (Vmax < 0) Vmax = 1e-9;

    // R^2 & residual SD
    let ssRes = 0, ssTot = 0;
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    for (let i = 0; i < S.length; i++) {
      const pred = Vmax * S[i] / (Km + S[i]);
      ssRes += (v[i] - pred) ** 2;
      ssTot += (v[i] - mean) ** 2;
    }
    const R2 = ssTot > 0 ? 1 - ssRes / ssTot : NaN;
    const dof = Math.max(1, S.length - 2);
    const residSD = Math.sqrt(ssRes / dof);

    return { Vmax, Km, R2, residSD };
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
    const abs = Math.abs(v);
    if (v !== 0 && (abs >= 1e5 || abs < 1e-3)) {
      const e = Math.floor(Math.log10(abs));
      const mant = v / Math.pow(10, e);
      const m = (Math.abs(mant) < 10 ? mant.toFixed(1) : mant.toFixed(0)).replace('-', minus);
      return m + '\u00d710' + supDigits(e);
    }
    if (step >= 1) return String(Math.round(v)).replace('-', minus);
    const d = Math.max(0, Math.ceil(-Math.log10(step)));
    return v.toFixed(d).replace('-', minus);
  }
  function supDigits(n) {
    const map = { '-': '\u207b', '0': '\u2070', '1': '\u00b9', '2': '\u00b2', '3': '\u00b3', '4': '\u2074', '5': '\u2075', '6': '\u2076', '7': '\u2077', '8': '\u2078', '9': '\u2079' };
    return String(n).split('').map(c => map[c] || c).join('');
  }
  function escapeXml(s) {
    return String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
  }
  function richLabel(s) {
    if (!s) return '';
    let out = escapeXml(s);
    out = out.replace(/\bK_m\b/g, '<tspan font-style="italic">K</tspan><tspan font-style="italic" baseline-shift="sub" font-size="0.78em">m</tspan>');
    out = out.replace(/\bV_max\b/g, '<tspan font-style="italic">V</tspan><tspan baseline-shift="sub" font-size="0.78em">max</tspan>');
    out = out.replace(/\bk_cat\b/g, '<tspan font-style="italic">k</tspan><tspan baseline-shift="sub" font-size="0.78em">cat</tspan>');
    out = out.replace(/\[S\]/g, '[<tspan font-style="italic">S</tspan>]');
    out = out.replace(/\bv\b/g, '<tspan font-style="italic">v</tspan>');
    return out;
  }
  function fmt(x, sig) {
    sig = sig || 3;
    if (!isFinite(x)) return '\u2014';
    if (x === 0) return '0';
    const abs = Math.abs(x);
    if (abs >= 1e4 || abs < 1e-3) {
      const e = Math.floor(Math.log10(abs));
      const m = (x / Math.pow(10, e)).toFixed(sig - 1);
      return m + '\u00d710' + supDigits(e);
    }
    return Number(x.toPrecision(sig)).toString();
  }
  function marker(x, y, style, size, fill, stroke, sw) {
    const r = size;
    switch (style) {
      case 'open-circle': return `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffffff" stroke="${stroke}" stroke-width="${sw || 1}"/>`;
      case 'filled-square': return `<rect x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      case 'open-square': return `<rect x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}" fill="#ffffff" stroke="${stroke}" stroke-width="${sw || 1}"/>`;
      case 'filled-triangle': return `<polygon points="${x},${y - r * 1.15} ${x - r},${y + r * 0.7} ${x + r},${y + r * 0.7}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      case 'open-triangle': return `<polygon points="${x},${y - r * 1.15} ${x - r},${y + r * 0.7} ${x + r},${y + r * 0.7}" fill="#ffffff" stroke="${stroke}" stroke-width="${sw || 1}"/>`;
      case 'filled-diamond': return `<polygon points="${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      default: return `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    }
  }

  // Palette for multi-dataset overlay (Wong-style colorblind-safe)
  const PALETTE = ['#000000', '#0072B2', '#D55E00', '#009E73', '#CC79A7', '#56B4E9', '#E69F00', '#F0E442'];
  const MARKER_CYCLE = ['filled-circle', 'open-circle', 'filled-square', 'open-square', 'filled-triangle', 'open-triangle', 'filled-diamond'];

  // ---------- Renderer ----------
  function renderMM(data, opts) {
    opts = opts || {};
    const plotType = opts.plotType || 'mm';
    const W = opts.width || 640;
    const H = opts.height || 480;
    const fontFamily = opts.fontFamily || "'Helvetica Neue', Helvetica, Arial, sans-serif";
    const titleSize = opts.titleSize ?? 13;
    const labelSize = opts.labelSize ?? 11;
    const tickSize = opts.tickSize ?? 9;
    const lineWidth = opts.lineWidth ?? 1.0;
    const borderWidth = opts.borderWidth ?? 0.7;
    const markerSize = opts.markerSize ?? 3.5;
    const errorBarWidth = opts.errorBarWidth ?? 0.7;
    const spineStyle = opts.spineStyle || 'L';
    const tickDir = opts.tickDir || (spineStyle === 'box' ? 'in' : 'out');
    const showParamBox = opts.showParamBox ?? true;
    const showLegend = opts.showLegend ?? true;
    const useColor = opts.useColor ?? true;
    const monoStroke = '#000000';
    const sUnit = opts.sUnit || 'mM';
    const vUnit = opts.vUnit || '\u00b5M s\u207b\u00b9';
    const enzymeConc = parseFloat(opts.enzymeConc); // optional, for kcat
    const title = opts.title || '';

    // Axis labels depend on plot type
    let xLabRaw, yLabRaw;
    if (plotType === 'mm') {
      xLabRaw = `[S] (${sUnit})`;
      yLabRaw = `v (${vUnit})`;
    } else if (plotType === 'lb') {
      xLabRaw = `1/[S] (${sUnit}\u207b\u00b9)`;
      yLabRaw = `1/v (${vUnit.replace(' s\u207b\u00b9', '')}\u207b\u00b9 s)`;
    } else if (plotType === 'eh') {
      xLabRaw = `v/[S] (${vUnit}/${sUnit})`;
      yLabRaw = `v (${vUnit})`;
    } else if (plotType === 'hw') {
      xLabRaw = `[S] (${sUnit})`;
      yLabRaw = `[S]/v (${sUnit}/(${vUnit}))`;
    }
    const xLab = opts.xlab || xLabRaw;
    const yLab = opts.ylab || yLabRaw;

    // Transform data points + fit curves into plot coordinates
    const transformed = data.datasets.map((ds, i) => {
      const pts = [];
      const errs = [];
      for (let k = 0; k < ds.S.length; k++) {
        const s = ds.S[k]; const v = ds.v[k];
        let x, y;
        if (plotType === 'mm') { x = s; y = v; }
        else if (plotType === 'lb') { if (s <= 0 || v <= 0) continue; x = 1 / s; y = 1 / v; }
        else if (plotType === 'eh') { if (s <= 0) continue; x = v / s; y = v; }
        else if (plotType === 'hw') { if (v <= 0) continue; x = s; y = s / v; }
        pts.push({ x, y, raw: { S: s, v } });
        errs.push(ds.err[k]);
      }
      // Fit curve: dense sample from min..max S
      const fitPts = [];
      if (ds.fit) {
        const sMax = Math.max(...ds.S);
        const N = 200;
        for (let n = 0; n <= N; n++) {
          const s = (n / N) * sMax * 1.08;
          const v = ds.fit.Vmax * s / (ds.fit.Km + s);
          let x, y;
          if (plotType === 'mm') { x = s; y = v; }
          else if (plotType === 'lb') { if (s <= 0 || v <= 0) continue; x = 1 / s; y = 1 / v; }
          else if (plotType === 'eh') { if (s <= 0) continue; x = v / s; y = v; }
          else if (plotType === 'hw') { if (v <= 0) continue; x = s; y = s / v; }
          fitPts.push({ x, y });
        }
      }
      const color = useColor && data.datasets.length > 1 ? PALETTE[i % PALETTE.length] : monoStroke;
      const mk = data.datasets.length > 1 ? MARKER_CYCLE[i % MARKER_CYCLE.length] : 'filled-circle';
      return { ds, pts, errs, fitPts, color, marker: mk, idx: i };
    });

    // Compute axis ranges across all
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    transformed.forEach(t => {
      t.pts.forEach(p => {
        if (p.x < xMin) xMin = p.x; if (p.x > xMax) xMax = p.x;
        if (p.y < yMin) yMin = p.y; if (p.y > yMax) yMax = p.y;
      });
      t.fitPts.forEach(p => {
        if (p.x < xMin) xMin = p.x; if (p.x > xMax) xMax = p.x;
        if (p.y < yMin) yMin = p.y; if (p.y > yMax) yMax = p.y;
      });
    });
    if (!isFinite(xMin)) { xMin = 0; xMax = 1; yMin = 0; yMax = 1; }
    if (plotType === 'mm' || plotType === 'hw') xMin = Math.min(0, xMin);
    if (plotType === 'mm' || plotType === 'eh') yMin = Math.min(0, yMin);
    if (plotType === 'lb') { /* allow x-intercept (negative 1/Km), keep natural */ }
    const xPad = (xMax - xMin) * 0.05 || 1;
    const yPad = (yMax - yMin) * 0.06 || 1;
    xMax += xPad; yMax += yPad;
    if (plotType !== 'mm' && plotType !== 'hw') xMin -= xPad * 0.4;
    if (plotType !== 'mm' && plotType !== 'eh') yMin -= yPad * 0.4;

    const xTicks = niceTicks(xMin, xMax, 6);
    const yTicks = niceTicks(yMin, yMax, 5);
    const xStep = xTicks.length > 1 ? xTicks[1] - xTicks[0] : 1;
    const yStep = yTicks.length > 1 ? yTicks[1] - yTicks[0] : 1;
    xMin = Math.min(xMin, xTicks[0]); xMax = Math.max(xMax, xTicks[xTicks.length - 1]);
    yMin = Math.min(yMin, yTicks[0]); yMax = Math.max(yMax, yTicks[yTicks.length - 1]);

    // Layout
    const titleH = title ? titleSize + 8 : 0;
    const margin = {
      left: Math.max(56, labelSize * 4.4),
      right: 18,
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
    parts.push(`<defs><clipPath id="mmclip"><rect x="${plotX}" y="${plotY}" width="${plotW}" height="${plotH}"/></clipPath></defs>`);

    // Title
    if (title) {
      parts.push(`<text x="${W / 2}" y="${titleSize + 6}" text-anchor="middle" font-size="${titleSize}" fill="#000">${richLabel(title)}</text>`);
    }

    // Zero lines for LB (visual aid)
    if (plotType === 'lb') {
      if (xMin < 0 && xMax > 0) {
        const x0 = sx(0);
        parts.push(`<line x1="${x0}" y1="${plotY}" x2="${x0}" y2="${plotY + plotH}" stroke="#cccccc" stroke-width="0.5" stroke-dasharray="2 2"/>`);
      }
      if (yMin < 0 && yMax > 0) {
        const y0 = sy(0);
        parts.push(`<line x1="${plotX}" y1="${y0}" x2="${plotX + plotW}" y2="${y0}" stroke="#cccccc" stroke-width="0.5" stroke-dasharray="2 2"/>`);
      }
    }

    // Fit curves (drawn behind points)
    transformed.forEach(t => {
      if (!t.fitPts.length) return;
      let d = '';
      let started = false;
      t.fitPts.forEach(p => {
        const X = sx(p.x), Y = sy(p.y);
        if (X < plotX - 5 || X > plotX + plotW + 5 || Y < plotY - 5 || Y > plotY + plotH + 5) {
          started = false; return;
        }
        d += (started ? 'L' : 'M') + X.toFixed(2) + ',' + Y.toFixed(2) + ' ';
        started = true;
      });
      parts.push(`<path d="${d}" fill="none" stroke="${t.color}" stroke-width="${lineWidth}" clip-path="url(#mmclip)"/>`);
    });

    // Error bars + points
    transformed.forEach(t => {
      t.pts.forEach((p, k) => {
        const X = sx(p.x), Y = sy(p.y);
        const err = t.errs[k];
        if (err != null && plotType === 'mm') {
          const Y1 = sy(p.y + err);
          const Y2 = sy(p.y - err);
          parts.push(`<g stroke="${t.color}" stroke-width="${errorBarWidth}" fill="none">
            <line x1="${X}" y1="${Y1}" x2="${X}" y2="${Y2}"/>
            <line x1="${X - 3}" y1="${Y1}" x2="${X + 3}" y2="${Y1}"/>
            <line x1="${X - 3}" y1="${Y2}" x2="${X + 3}" y2="${Y2}"/>
          </g>`);
        }
        parts.push(marker(X, Y, t.marker, markerSize, t.color, t.color, 0.8));
      });
    });

    // Axes / spines
    if (spineStyle === 'box') {
      parts.push(`<rect x="${plotX}" y="${plotY}" width="${plotW}" height="${plotH}" fill="none" stroke="#000" stroke-width="${borderWidth}"/>`);
    } else {
      parts.push(`<line x1="${plotX}" y1="${plotY + plotH}" x2="${plotX + plotW}" y2="${plotY + plotH}" stroke="#000" stroke-width="${borderWidth}"/>`);
      parts.push(`<line x1="${plotX}" y1="${plotY}" x2="${plotX}" y2="${plotY + plotH}" stroke="#000" stroke-width="${borderWidth}"/>`);
    }

    // Ticks
    const tk = tickDir === 'in' ? -1 : 1;
    const majL = 5 * tk, minL = 2.5 * tk;
    const tkW = Math.max(0.7, borderWidth);
    xTicks.forEach(v => {
      const X = sx(v);
      const Y = plotY + plotH;
      parts.push(`<line x1="${X}" y1="${Y}" x2="${X}" y2="${Y + majL}" stroke="#000" stroke-width="${tkW}"/>`);
      parts.push(`<text x="${X}" y="${Y + tickSize + 6}" text-anchor="middle" font-size="${tickSize}" fill="#000">${formatTick(v, xStep)}</text>`);
    });
    yTicks.forEach(v => {
      const Y = sy(v);
      parts.push(`<line x1="${plotX}" y1="${Y}" x2="${plotX - majL}" y2="${Y}" stroke="#000" stroke-width="${tkW}"/>`);
      parts.push(`<text x="${plotX - Math.max(majL, 0) - 3}" y="${Y + 3}" text-anchor="end" font-size="${tickSize}" fill="#000">${formatTick(v, yStep)}</text>`);
    });

    // Axis labels
    parts.push(`<text x="${plotX + plotW / 2}" y="${plotY + plotH + tickSize + labelSize + 18}" text-anchor="middle" font-size="${labelSize}" fill="#000">${richLabel(xLab)}</text>`);
    parts.push(`<text transform="translate(${plotX - margin.left + labelSize + 6} ${plotY + plotH / 2}) rotate(-90)" text-anchor="middle" font-size="${labelSize}" fill="#000">${richLabel(yLab)}</text>`);

    // Legend
    if (showLegend && data.datasets.length > 1) {
      const legW = 138, lineH = labelSize + 3;
      const legX = plotX + plotW - legW - 10;
      const legY = plotY + 10;
      const legH = transformed.length * lineH + 8;
      parts.push(`<g>`);
      parts.push(`<rect x="${legX}" y="${legY}" width="${legW}" height="${legH}" fill="rgba(255,255,255,0.9)" stroke="#d8d8d4" stroke-width="0.5"/>`);
      transformed.forEach((t, i) => {
        const ly = legY + 6 + i * lineH + lineH / 2;
        parts.push(marker(legX + 10, ly - 1, t.marker, markerSize, t.color, t.color, 0.8));
        parts.push(`<line x1="${legX + 18}" y1="${ly - 1}" x2="${legX + 28}" y2="${ly - 1}" stroke="${t.color}" stroke-width="${lineWidth}"/>`);
        parts.push(`<text x="${legX + 32}" y="${ly + 3}" font-size="${labelSize - 1}" fill="#000">${escapeXml(t.ds.label)}</text>`);
      });
      parts.push(`</g>`);
    }

    // Parameter box: Km / Vmax / kcat
    if (showParamBox) {
      const fs = opts.paramBoxFontSize ?? Math.max(9, Math.round(labelSize * 0.95));
      const rows = [['Sample', sUnit === 'mM' ? 'K\u2098 (mM)' : `K\u2098 (${sUnit})`, `V\u2098\u2090\u2093 (${vUnit})`]];
      if (isFinite(enzymeConc) && enzymeConc > 0) rows[0].push('k\u209c\u2090\u209c (s\u207b\u00b9)');
      rows[0].push('R\u00b2');
      transformed.forEach(t => {
        if (!t.ds.fit) return;
        const row = [t.ds.label, fmt(t.ds.fit.Km), fmt(t.ds.fit.Vmax)];
        if (isFinite(enzymeConc) && enzymeConc > 0) row.push(fmt(t.ds.fit.Vmax / enzymeConc));
        row.push(t.ds.fit.R2 == null ? '\u2014' : t.ds.fit.R2.toFixed(3));
        rows.push(row);
      });
      const cw = fs * 0.58;
      const colW = rows[0].map(() => 0);
      rows.forEach(r => r.forEach((c, i) => {
        const w = String(c).length * cw;
        if (w > colW[i]) colW[i] = w;
      }));
      const colGap = fs * 1.0, padX = fs * 0.8, padY = fs * 0.5;
      const boxW = colW.reduce((a, b) => a + b, 0) + colGap * (colW.length - 1) + padX * 2;
      const lineH = fs * 1.4;
      const boxH = rows.length * lineH + padY * 2;
      let pbX, pbY;
      const pos = opts.paramBoxPosition || 'bottom-right';
      if (pos === 'bottom-right') { pbX = plotX + plotW - boxW - 8; pbY = plotY + plotH - boxH - 8; }
      else if (pos === 'bottom-left') { pbX = plotX + 8; pbY = plotY + plotH - boxH - 8; }
      else if (pos === 'top-left') { pbX = plotX + 8; pbY = plotY + 8; }
      else { pbX = plotX + plotW - boxW - 8; pbY = plotY + 8; }
      parts.push(`<g font-size="${fs}" fill="#000">`);
      parts.push(`<rect x="${pbX}" y="${pbY}" width="${boxW}" height="${boxH}" fill="rgba(255,255,255,0.92)" stroke="#d8d8d4" stroke-width="0.5"/>`);
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
  function sampleMM() {
    // Simulate WT and a slower variant
    const S = [0.02, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0]; // mM
    function noisy(km, vmax, sigma) {
      return S.map(s => {
        const v = vmax * s / (km + s);
        return v + (Math.random() - 0.5) * sigma * v * 0.12;
      });
    }
    const wt = { label: 'WT', S: S.slice(), v: noisy(0.21, 14.6, 1.0), err: S.map(() => 0.45), sIdx: 0, vIdx: 1, errIdx: -1 };
    const mut = { label: 'D110A', S: S.slice(), v: noisy(0.92, 8.2, 1.0), err: S.map(() => 0.35), sIdx: 0, vIdx: 2, errIdx: -1 };
    wt.fit = fitMM(wt.S, wt.v);
    mut.fit = fitMM(mut.S, mut.v);
    return { xLabel: '[S]', datasets: [wt, mut] };
  }

  // ---------- Presets ----------
  const presets = {
    neutral: {
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
      titleSize: 13, labelSize: 11, tickSize: 9,
      lineWidth: 1.0, borderWidth: 0.7, markerSize: 3.2,
      tickDir: 'out', spineStyle: 'L',
      showParamBox: true, showLegend: true, useColor: true,
      width: 640, height: 460
    }
  };

  window.MM = { parse: parseMM, render: renderMM, sample: sampleMM, fit: fitMM, presets };
})();
