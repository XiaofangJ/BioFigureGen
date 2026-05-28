/* GC-MS — chromatogram + EI mass spectrum + NIST-style mirror match */
(function () {
  'use strict';

  // ---------- Parser ----------
  // Accepts a single text file with optional sections separated by `#` headers:
  //   # CHROM
  //   rt,intensity
  //   0.50,1230
  //   ...
  //   # SPECTRUM rt=8.42 name=Methyl jasmonate
  //   m/z,intensity
  //   55,12
  //   ...
  //   # LIBRARY name=Methyl jasmonate cas=39924-52-2
  //   m/z,intensity
  //   ...
  //
  // If no section headers, infers by column count: 2 numeric columns where x<300 => spectrum, else chromatogram.
  function parseGCMS(text) {
    text = text.replace(/\r/g, '');
    const result = { chromatogram: null, spectra: [], library: null, peaks: [], activeIdx: 0 };

    const sectionRe = /^#\s*(CHROM|SPECTRUM|LIBRARY|PEAKS)\b(.*)$/i;
    const lines = text.split('\n');
    let section = null, sectionMeta = '', buf = [];

    function flush() {
      if (!section) {
        // No section yet — heuristic
        const rows = parseRows(buf);
        if (rows.length) {
          const maxX = Math.max(...rows.map(r => r.x));
          if (maxX < 1000 && rows.every(r => Number.isInteger(r.x))) {
            result.spectra.push({ name: 'Spectrum 1', mz: rows.map(r => r.x), intensity: rows.map(r => r.y) });
          } else {
            result.chromatogram = { rt: rows.map(r => r.x), intensity: rows.map(r => r.y) };
          }
        }
      } else if (section === 'CHROM') {
        const rows = parseRows(buf);
        if (rows.length) result.chromatogram = { rt: rows.map(r => r.x), intensity: rows.map(r => r.y) };
      } else if (section === 'SPECTRUM') {
        const rows = parseRows(buf);
        if (rows.length) {
          const meta = parseMeta(sectionMeta);
          result.spectra.push({
            name: meta.name || ('Spectrum ' + (result.spectra.length + 1)),
            rt: meta.rt != null ? parseFloat(meta.rt) : null,
            mz: rows.map(r => r.x), intensity: rows.map(r => r.y)
          });
        }
      } else if (section === 'LIBRARY') {
        const rows = parseRows(buf);
        if (rows.length) {
          const meta = parseMeta(sectionMeta);
          result.library = {
            name: meta.name || 'Library reference',
            cas: meta.cas || null,
            mz: rows.map(r => r.x), intensity: rows.map(r => r.y)
          };
        }
      } else if (section === 'PEAKS') {
        // rt,name(,area)
        buf.forEach(ln => {
          if (!ln.trim() || /^[a-z]/i.test(ln.split(/[,\t]/)[0])) return;
          const parts = ln.split(/[,\t]/).map(s => s.trim());
          const rt = parseFloat(parts[0]);
          if (isNaN(rt)) return;
          result.peaks.push({ rt, name: parts[1] || '', area: parts[2] ? parseFloat(parts[2]) : null });
        });
      }
      buf = [];
    }

    function parseMeta(str) {
      const out = {};
      const re = /(\w+)=("([^"]*)"|(\S+))/g;
      let m;
      while ((m = re.exec(str)) !== null) {
        out[m[1].toLowerCase()] = m[3] != null ? m[3] : m[4];
      }
      return out;
    }
    function parseRows(arr) {
      const rows = [];
      for (const ln of arr) {
        if (!ln.trim()) continue;
        const parts = ln.split(/[,\t\s]+/).filter(Boolean);
        if (parts.length < 2) continue;
        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        if (isNaN(x) || isNaN(y)) continue;
        rows.push({ x, y });
      }
      return rows;
    }

    for (const ln of lines) {
      const m = ln.match(sectionRe);
      if (m) {
        flush();
        section = m[1].toUpperCase();
        sectionMeta = m[2] || '';
        continue;
      }
      buf.push(ln);
    }
    flush();

    // Auto-detect peaks in chromatogram if none provided
    if (result.chromatogram && !result.peaks.length) {
      result.peaks = detectPeaks(result.chromatogram, 5);
    }
    return result;
  }

  // ---------- Helpers ----------
  function detectPeaks(chrom, topN) {
    if (!chrom || !chrom.intensity.length) return [];
    const I = chrom.intensity;
    const max = Math.max(...I);
    const threshold = max * 0.05;
    const peaks = [];
    for (let i = 2; i < I.length - 2; i++) {
      if (I[i] < threshold) continue;
      if (I[i] >= I[i - 1] && I[i] >= I[i - 2] && I[i] >= I[i + 1] && I[i] >= I[i + 2]) {
        peaks.push({ rt: chrom.rt[i], intensity: I[i], name: '' });
      }
    }
    peaks.sort((a, b) => b.intensity - a.intensity);
    return peaks.slice(0, topN || 5);
  }

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
    out = out.replace(/\bm\/z\b/g, '<tspan font-style="italic">m</tspan>/<tspan font-style="italic">z</tspan>');
    out = out.replace(/\bRT\b/g, '<tspan font-style="italic">t</tspan><tspan baseline-shift="sub" font-size="0.78em">R</tspan>');
    return out;
  }

  // ---------- Spectral similarity (NIST cosine, weighted) ----------
  // Weight intensities by m/z^1.3 * I^0.6 (standard NIST forward-search weighting).
  function nistMatch(expMz, expI, libMz, libI) {
    const mzMin = Math.min(Math.min(...expMz), Math.min(...libMz));
    const mzMax = Math.max(Math.max(...expMz), Math.max(...libMz));
    const N = Math.ceil(mzMax) - Math.floor(mzMin) + 1;
    const offset = Math.floor(mzMin);
    const e = new Float64Array(N), l = new Float64Array(N);
    const maxE = Math.max(...expI), maxL = Math.max(...libI);
    for (let i = 0; i < expMz.length; i++) {
      const k = Math.round(expMz[i]) - offset;
      if (k >= 0 && k < N) e[k] += expI[i] / maxE * 999;
    }
    for (let i = 0; i < libMz.length; i++) {
      const k = Math.round(libMz[i]) - offset;
      if (k >= 0 && k < N) l[k] += libI[i] / maxL * 999;
    }
    let nA = 0, nB = 0, dot = 0;
    for (let i = 0; i < N; i++) {
      const m = i + offset;
      if (e[i] === 0 && l[i] === 0) continue;
      const w = Math.pow(m, 1.3);
      const a = w * Math.pow(e[i], 0.6);
      const b = w * Math.pow(l[i], 0.6);
      nA += a * a; nB += b * b; dot += a * b;
    }
    return nA > 0 && nB > 0 ? (dot * dot) / (nA * nB) * 1000 | 0 : 0;
  }

  // ---------- Renderer ----------
  function renderGCMS(data, opts) {
    opts = opts || {};
    const plotType = opts.plotType || 'overview';
    if (plotType === 'tic') return renderChromOnly(data, opts);
    if (plotType === 'spectrum') return renderSpecOnly(data, opts);
    if (plotType === 'mirror') return renderMirror(data, opts);
    return renderOverview(data, opts);
  }

  function commonOpts(opts) {
    return {
      W: opts.width || 640,
      H: opts.height || 540,
      fontFamily: opts.fontFamily || "'Helvetica Neue', Helvetica, Arial, sans-serif",
      titleSize: opts.titleSize ?? 13,
      labelSize: opts.labelSize ?? 11,
      tickSize: opts.tickSize ?? 9,
      lineWidth: opts.lineWidth ?? 0.7,
      stickWidth: opts.stickWidth ?? 1.0,
      stickColor: opts.stickColor || '#000000',
      libColor: opts.libColor || '#2563eb',
      borderWidth: opts.borderWidth ?? 0.7,
      tickDir: opts.tickDir || 'out',
      spineStyle: opts.spineStyle || 'L',
      showAnnotations: opts.showAnnotations ?? true,
      annoTopN: opts.annoTopN ?? 6,
      annoFontSize: opts.annoFontSize ?? 9,
      title: opts.title || '',
      xlabChrom: opts.xlabChrom || 'RT (min)',
      ylabChrom: opts.ylabChrom || 'Intensity',
      xlabSpec: opts.xlabSpec || 'm/z',
      ylabSpec: opts.ylabSpec || 'Relative abundance (%)',
      showPeakLabels: opts.showPeakLabels ?? true
    };
  }

  // Draw a single axis box + ticks
  function drawAxes(parts, x, y, w, h, xMin, xMax, yMin, yMax, xLab, yLab, c) {
    const xTicks = niceTicks(xMin, xMax, 6);
    const yTicks = niceTicks(yMin, yMax, 5);
    const xStep = xTicks.length > 1 ? xTicks[1] - xTicks[0] : 1;
    const yStep = yTicks.length > 1 ? yTicks[1] - yTicks[0] : 1;
    if (c.spineStyle === 'box') {
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#000" stroke-width="${c.borderWidth}"/>`);
    } else {
      parts.push(`<line x1="${x}" y1="${y + h}" x2="${x + w}" y2="${y + h}" stroke="#000" stroke-width="${c.borderWidth}"/>`);
      parts.push(`<line x1="${x}" y1="${y}" x2="${x}" y2="${y + h}" stroke="#000" stroke-width="${c.borderWidth}"/>`);
    }
    const tk = c.tickDir === 'in' ? -1 : 1;
    const majL = 5 * tk, minL = 2.5 * tk;
    const tkW = Math.max(0.7, c.borderWidth);
    xTicks.forEach(v => {
      const X = x + (v - xMin) / (xMax - xMin) * w;
      parts.push(`<line x1="${X}" y1="${y + h}" x2="${X}" y2="${y + h + majL}" stroke="#000" stroke-width="${tkW}"/>`);
      parts.push(`<text x="${X}" y="${y + h + c.tickSize + 6}" text-anchor="middle" font-size="${c.tickSize}" fill="#000">${formatTick(v, xStep)}</text>`);
    });
    yTicks.forEach(v => {
      const Y = y + h - (v - yMin) / (yMax - yMin) * h;
      parts.push(`<line x1="${x}" y1="${Y}" x2="${x - majL}" y2="${Y}" stroke="#000" stroke-width="${tkW}"/>`);
      parts.push(`<text x="${x - Math.max(majL, 0) - 3}" y="${Y + 3}" text-anchor="end" font-size="${c.tickSize}" fill="#000">${formatTick(v, yStep)}</text>`);
    });
    if (xLab) parts.push(`<text x="${x + w / 2}" y="${y + h + c.tickSize + c.labelSize + 18}" text-anchor="middle" font-size="${c.labelSize}" fill="#000">${richLabel(xLab)}</text>`);
    if (yLab) parts.push(`<text transform="translate(${x - 38} ${y + h / 2}) rotate(-90)" text-anchor="middle" font-size="${c.labelSize}" fill="#000">${richLabel(yLab)}</text>`);
    return { xTicks, yTicks, xStep, yStep };
  }

  // ---- Plot: chromatogram only
  function renderChromOnly(data, opts) {
    const c = commonOpts(opts);
    const chrom = data.chromatogram;
    if (!chrom) return placeholder(c, 'No chromatogram loaded');
    const m = { left: 60, right: 20, top: c.title ? c.titleSize + 22 : 18, bottom: c.tickSize + c.labelSize + 24 };
    return svgFrame(c, parts => {
      const x = m.left, y = m.top, w = c.W - m.left - m.right, h = c.H - m.top - m.bottom;
      drawChromatogram(parts, x, y, w, h, chrom, data.peaks || [], c, opts);
    });
  }

  // ---- Plot: spectrum only
  function renderSpecOnly(data, opts) {
    const c = commonOpts(opts);
    const spec = data.spectra[data.activeIdx];
    if (!spec) return placeholder(c, 'No spectrum loaded');
    const m = { left: 60, right: 20, top: c.title ? c.titleSize + 22 : 18, bottom: c.tickSize + c.labelSize + 24 };
    return svgFrame(c, parts => {
      const x = m.left, y = m.top, w = c.W - m.left - m.right, h = c.H - m.top - m.bottom;
      drawSpectrum(parts, x, y, w, h, spec, c, false);
    });
  }

  // ---- Plot: experimental vs library mirror
  function renderMirror(data, opts) {
    const c = commonOpts(opts);
    const spec = data.spectra[data.activeIdx];
    if (!spec) return placeholder(c, 'No spectrum loaded');
    const lib = data.library;
    if (!lib) return placeholder(c, 'No library reference. Add a # LIBRARY section to the file.');

    const m = { left: 60, right: 20, top: c.title ? c.titleSize + 22 : 18, bottom: c.tickSize + c.labelSize + 24 };
    const score = nistMatch(spec.mz, spec.intensity, lib.mz, lib.intensity);
    return svgFrame(c, parts => {
      const x = m.left, y = m.top, w = c.W - m.left - m.right, h = c.H - m.top - m.bottom;
      const half = h / 2;
      const mzMin = Math.floor(Math.min(Math.min(...spec.mz), Math.min(...lib.mz)) / 10) * 10;
      const mzMax = Math.ceil(Math.max(Math.max(...spec.mz), Math.max(...lib.mz)) / 10) * 10;
      const maxE = Math.max(...spec.intensity);
      const maxL = Math.max(...lib.intensity);
      // Top half: experimental (up)
      drawMirrorSticks(parts, x, y, w, half, spec.mz, spec.intensity, mzMin, mzMax, maxE, c.stickColor, c, 'up');
      // Bottom half: library (down, inverted)
      drawMirrorSticks(parts, x, y + half, w, half, lib.mz, lib.intensity, mzMin, mzMax, maxL, c.libColor, c, 'down');
      // Axes
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#000" stroke-width="${c.borderWidth}"/>`);
      parts.push(`<line x1="${x}" y1="${y + half}" x2="${x + w}" y2="${y + half}" stroke="#000" stroke-width="${c.borderWidth}"/>`);
      // x ticks on bottom
      const xTicks = niceTicks(mzMin, mzMax, 6);
      const xStep = xTicks.length > 1 ? xTicks[1] - xTicks[0] : 10;
      xTicks.forEach(v => {
        const X = x + (v - mzMin) / (mzMax - mzMin) * w;
        parts.push(`<line x1="${X}" y1="${y + h}" x2="${X}" y2="${y + h + 5}" stroke="#000" stroke-width="0.7"/>`);
        parts.push(`<text x="${X}" y="${y + h + c.tickSize + 6}" text-anchor="middle" font-size="${c.tickSize}" fill="#000">${formatTick(v, xStep)}</text>`);
      });
      // y-axis label: % top, % bottom
      const yTicks = [0, 25, 50, 75, 100];
      yTicks.forEach(p => {
        const Yt = y + half - (p / 100) * half;
        const Yb = y + half + (p / 100) * half;
        parts.push(`<line x1="${x}" y1="${Yt}" x2="${x - 5}" y2="${Yt}" stroke="#000" stroke-width="0.7"/>`);
        parts.push(`<text x="${x - 7}" y="${Yt + 3}" text-anchor="end" font-size="${c.tickSize}" fill="#000">${p}</text>`);
        if (p > 0) {
          parts.push(`<line x1="${x}" y1="${Yb}" x2="${x - 5}" y2="${Yb}" stroke="#000" stroke-width="0.7"/>`);
          parts.push(`<text x="${x - 7}" y="${Yb + 3}" text-anchor="end" font-size="${c.tickSize}" fill="#000">${p}</text>`);
        }
      });
      // Labels
      parts.push(`<text x="${x + w / 2}" y="${y + h + c.tickSize + c.labelSize + 18}" text-anchor="middle" font-size="${c.labelSize}" fill="#000">${richLabel(c.xlabSpec)}</text>`);
      parts.push(`<text transform="translate(${x - 40} ${y + half / 2}) rotate(-90)" text-anchor="middle" font-size="${c.labelSize}" fill="#000">${richLabel(c.ylabSpec)}</text>`);
      parts.push(`<text transform="translate(${x - 40} ${y + half + half / 2}) rotate(-90)" text-anchor="middle" font-size="${c.labelSize}" fill="${c.libColor}">${richLabel('Library (' + lib.name + ')')}</text>`);
      // Sample label (top)
      parts.push(`<text x="${x + 6}" y="${y + 14}" font-size="${c.labelSize}" fill="${c.stickColor}" font-weight="600">${escapeXml(spec.name || 'Experimental')}</text>`);
      parts.push(`<text x="${x + w - 6}" y="${y + 14}" font-size="${c.labelSize - 0.5}" text-anchor="end" fill="#000">Match: ${score}/1000</text>`);
      // Annotated top peaks (experimental only)
      annotateTopPeaks(parts, x, y, w, half, spec.mz, spec.intensity, mzMin, mzMax, maxE, c, 'up');
      annotateTopPeaks(parts, x, y + half, w, half, lib.mz, lib.intensity, mzMin, mzMax, maxL, c, 'down');
    });
  }

  function drawMirrorSticks(parts, x, y, w, h, mzArr, intens, mzMin, mzMax, maxI, color, c, dir) {
    const sx = m => x + (m - mzMin) / (mzMax - mzMin) * w;
    for (let i = 0; i < mzArr.length; i++) {
      const X = sx(mzArr[i]);
      const frac = intens[i] / maxI;
      const Y1 = (dir === 'up') ? y + h : y;
      const Y2 = (dir === 'up') ? y + h - frac * h : y + frac * h;
      parts.push(`<line x1="${X.toFixed(2)}" y1="${Y1.toFixed(2)}" x2="${X.toFixed(2)}" y2="${Y2.toFixed(2)}" stroke="${color}" stroke-width="${c.stickWidth}"/>`);
    }
  }

  function annotateTopPeaks(parts, x, y, w, h, mzArr, intens, mzMin, mzMax, maxI, c, dir) {
    if (!c.showAnnotations) return;
    const idxs = intens.map((v, i) => i).sort((a, b) => intens[b] - intens[a]).slice(0, c.annoTopN);
    idxs.forEach(i => {
      const frac = intens[i] / maxI;
      if (frac < 0.05) return;
      const X = x + (mzArr[i] - mzMin) / (mzMax - mzMin) * w;
      const Y = (dir === 'up') ? y + h - frac * h - 3 : y + frac * h + c.annoFontSize + 1;
      parts.push(`<text x="${X.toFixed(1)}" y="${Y.toFixed(1)}" text-anchor="middle" font-size="${c.annoFontSize}" fill="#000">${Math.round(mzArr[i])}</text>`);
    });
  }

  // ---- Plot: chromatogram + spectrum stacked
  function renderOverview(data, opts) {
    const c = commonOpts(opts);
    const chrom = data.chromatogram;
    const spec = data.spectra[data.activeIdx];
    if (!chrom && !spec) return placeholder(c, 'No data loaded');

    return svgFrame(c, parts => {
      const m = { left: 60, right: 20, top: c.title ? c.titleSize + 22 : 18, bottom: c.tickSize + c.labelSize + 24 };
      const gap = 36;
      const innerH = c.H - m.top - m.bottom - gap;
      const topH = chrom && spec ? Math.round(innerH * 0.45) : innerH;
      const botH = innerH - topH;
      const w = c.W - m.left - m.right;
      if (chrom) {
        drawChromatogram(parts, m.left, m.top, w, topH, chrom, data.peaks || [], c, opts);
      }
      if (spec) {
        const sy = m.top + (chrom ? topH + gap : 0);
        const sh = chrom ? botH : innerH;
        drawSpectrum(parts, m.left, sy, w, sh, spec, c, false);
      }
    });
  }

  function drawChromatogram(parts, x, y, w, h, chrom, peaks, c, opts) {
    const rtMin = chrom.rt[0];
    const rtMax = chrom.rt[chrom.rt.length - 1];
    const iMax = Math.max(...chrom.intensity) * 1.08;
    const iMin = 0;
    const sx = v => x + (v - rtMin) / (rtMax - rtMin) * w;
    const sy = v => y + h - (v - iMin) / (iMax - iMin) * h;
    // Trace
    let d = '';
    for (let i = 0; i < chrom.rt.length; i++) {
      const X = sx(chrom.rt[i]);
      const Y = sy(chrom.intensity[i]);
      d += (i === 0 ? 'M' : 'L') + X.toFixed(2) + ',' + Y.toFixed(2) + ' ';
    }
    parts.push(`<path d="${d}" fill="none" stroke="#000" stroke-width="${c.lineWidth}"/>`);
    // Peak markers
    if (peaks && peaks.length) {
      peaks.forEach((pk, idx) => {
        const X = sx(pk.rt);
        const yAtPeak = sy(pk.intensity != null ? pk.intensity : iMax * 0.9);
        // small tick + label
        parts.push(`<line x1="${X}" y1="${yAtPeak - 4}" x2="${X}" y2="${yAtPeak - 14}" stroke="#888" stroke-width="0.6" stroke-dasharray="2 2"/>`);
        const lbl = pk.name || (idx + 1);
        parts.push(`<text x="${X}" y="${yAtPeak - 18}" text-anchor="middle" font-size="${c.annoFontSize}" fill="#000">${escapeXml(String(lbl))}</text>`);
        parts.push(`<text x="${X}" y="${yAtPeak - 6}" text-anchor="middle" font-size="${c.annoFontSize - 1}" fill="#8a8a85">${pk.rt.toFixed(2)}</text>`);
      });
    }
    drawAxes(parts, x, y, w, h, rtMin, rtMax, iMin, iMax, c.xlabChrom, c.ylabChrom, c);
    if (c.title) {
      parts.push(`<text x="${c.W / 2}" y="${c.titleSize + 6}" text-anchor="middle" font-size="${c.titleSize}" fill="#000">${richLabel(c.title)}</text>`);
    }
  }

  function drawSpectrum(parts, x, y, w, h, spec, c, suppressTitle) {
    const mzMin = Math.floor(Math.min(...spec.mz) / 10) * 10;
    const mzMax = Math.ceil(Math.max(...spec.mz) / 10) * 10;
    const iMax = Math.max(...spec.intensity);
    const sx = m => x + (m - mzMin) / (mzMax - mzMin) * w;
    // sticks
    for (let i = 0; i < spec.mz.length; i++) {
      const X = sx(spec.mz[i]);
      const frac = spec.intensity[i] / iMax;
      const Y2 = y + h - frac * h;
      parts.push(`<line x1="${X.toFixed(2)}" y1="${y + h}" x2="${X.toFixed(2)}" y2="${Y2.toFixed(2)}" stroke="${c.stickColor}" stroke-width="${c.stickWidth}"/>`);
    }
    // axes
    drawAxes(parts, x, y, w, h, mzMin, mzMax, 0, 100, c.xlabSpec, c.ylabSpec, c);
    // annotations
    const idxs = spec.intensity.map((v, i) => i).sort((a, b) => spec.intensity[b] - spec.intensity[a]).slice(0, c.annoTopN);
    idxs.forEach(i => {
      const frac = spec.intensity[i] / iMax;
      if (frac < 0.05) return;
      const X = sx(spec.mz[i]);
      const Y = y + h - frac * h - 3;
      parts.push(`<text x="${X.toFixed(1)}" y="${Y.toFixed(1)}" text-anchor="middle" font-size="${c.annoFontSize}" fill="#000">${Math.round(spec.mz[i])}</text>`);
    });
    // spectrum label (top-right corner of panel)
    if (spec.name) {
      const lbl = spec.name + (spec.rt != null ? ` · RT ${spec.rt.toFixed(2)} min` : '');
      parts.push(`<text x="${x + w - 6}" y="${y + 14}" text-anchor="end" font-size="${c.labelSize - 0.5}" fill="#000">${escapeXml(lbl)}</text>`);
    }
    if (!suppressTitle && c.title) {
      parts.push(`<text x="${c.W / 2}" y="${c.titleSize + 6}" text-anchor="middle" font-size="${c.titleSize}" fill="#000">${richLabel(c.title)}</text>`);
    }
  }

  function svgFrame(c, fn) {
    const parts = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${c.W}" height="${c.H}" viewBox="0 0 ${c.W} ${c.H}" font-family="${c.fontFamily}">`);
    parts.push(`<rect width="${c.W}" height="${c.H}" fill="#ffffff"/>`);
    fn(parts);
    parts.push(`</svg>`);
    return parts.join('');
  }

  function placeholder(c, msg) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${c.W}" height="${c.H}" viewBox="0 0 ${c.W} ${c.H}" font-family="${c.fontFamily}"><rect width="${c.W}" height="${c.H}" fill="#ffffff"/><text x="${c.W / 2}" y="${c.H / 2}" text-anchor="middle" font-size="${c.labelSize}" fill="#8a8a85">${escapeXml(msg)}</text></svg>`;
  }

  // ---------- Sample ----------
  // Synthetic enzyme product: a sesquiterpene-like molecule with diagnostic EI ions.
  function sampleGCMS() {
    // Chromatogram: 5 Gaussian peaks
    const rt = [], intensity = [];
    const peaks = [
      { rt: 2.10, name: 'solvent', amp: 8e5, w: 0.05 },
      { rt: 6.45, name: 'internal std', amp: 4.5e6, w: 0.08 },
      { rt: 8.42, name: 'Product A', amp: 7.2e6, w: 0.10 },
      { rt: 9.78, name: 'Substrate', amp: 2.1e6, w: 0.09 },
      { rt: 11.20, name: 'Byproduct', amp: 1.4e6, w: 0.11 }
    ];
    for (let r = 0.5; r <= 13; r += 0.02) {
      let v = Math.random() * 4e3;
      peaks.forEach(p => { v += p.amp * Math.exp(-Math.pow((r - p.rt) / p.w, 2)); });
      rt.push(r);
      intensity.push(v);
    }
    // Spectrum at RT 8.42 — synthetic sesquiterpene-style fragments
    const expPattern = [
      [41, 28], [43, 35], [55, 22], [69, 18], [77, 14], [79, 24], [91, 65], [93, 42],
      [105, 38], [107, 28], [119, 100], [120, 25], [131, 18], [133, 21], [145, 28],
      [161, 32], [175, 22], [189, 14], [202, 18], [204, 76], [205, 14]
    ];
    const spec = {
      name: 'Product A',
      rt: 8.42,
      mz: expPattern.map(p => p[0]),
      intensity: expPattern.map(p => p[1] * (0.9 + Math.random() * 0.2))
    };
    // Library reference — very similar but slightly cleaner
    const libPattern = [
      [41, 24], [43, 32], [55, 20], [69, 16], [77, 12], [79, 22], [91, 70], [93, 38],
      [105, 35], [107, 25], [119, 100], [131, 16], [133, 18], [145, 26],
      [161, 30], [175, 20], [189, 12], [204, 80]
    ];
    const lib = {
      name: '(\u2212)-Caryophyllene oxide',
      cas: '1139-30-6',
      mz: libPattern.map(p => p[0]),
      intensity: libPattern.map(p => p[1])
    };
    return {
      chromatogram: { rt, intensity },
      spectra: [spec],
      library: lib,
      peaks: peaks.map(p => ({ rt: p.rt, name: p.name, intensity: p.amp })),
      activeIdx: 0
    };
  }

  // ---------- Presets ----------
  const presets = {
    neutral: {
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
      titleSize: 13, labelSize: 11, tickSize: 9,
      lineWidth: 0.7, stickWidth: 1.0,
      stickColor: '#000000', libColor: '#2563eb',
      borderWidth: 0.7, tickDir: 'out', spineStyle: 'L',
      showAnnotations: true, annoTopN: 6, annoFontSize: 9,
      width: 640, height: 540
    }
  };

  window.GCMS = { parse: parseGCMS, render: renderGCMS, sample: sampleGCMS, presets, nistMatch };
})();
