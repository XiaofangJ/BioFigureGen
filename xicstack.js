/* XIC Stack panel — multi-file XIC comparison
   Layout based on plot_lc_ms.py: each subsequent sample is offset by (x_offset, y_offset)
   in data coordinates, producing a diagonal staircase stack.
*/
(function () {
  'use strict';

  const PALETTE = [
    '#2563eb', '#ea7600', '#16a34a', '#dc2626',
    '#9333ea', '#a16207', '#0891b2', '#7a7a7a'
  ];

  function buildXIC(spectra, mz, tol, tolMode) {
    const ms1 = spectra.filter(s => s.msLevel === 1 || s.msLevel == null);
    const pool = ms1.length ? ms1 : spectra;
    const window = tolMode === 'ppm' ? (mz * tol / 1e6) : tol;
    const lo = mz - window, hi = mz + window;
    const pts = pool
      .filter(s => s.rt != null)
      .map(s => {
        let val = 0;
        for (let i = 0; i < s.mz.length; i++) {
          if (s.mz[i] >= lo && s.mz[i] <= hi) val += s.intensity[i];
        }
        return { rt: s.rt / 60, intensity: val };
      })
      .sort((a, b) => a.rt - b.rt);
    if (!pts.length) return null;
    const rt = pts.map(p => p.rt);
    const intensity = pts.map(p => p.intensity);
    const maxI = Math.max(...intensity, 1);
    const apexIdx = intensity.indexOf(maxI);
    return { rt, intensity, maxI, apexRT: rt[apexIdx] };
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
    for (let v = start; v <= max + step * 0.0001; v += step) ticks.push(Math.round(v / step) * step);
    return ticks;
  }
  function formatTick(v, step) {
    const minus = '\u2212';
    const abs = Math.abs(v);
    if (v !== 0 && (abs >= 1e5 || abs < 1e-3)) {
      const e = Math.floor(Math.log10(abs));
      const mant = v / Math.pow(10, e);
      const mantStr = (Math.abs(mant) < 10 ? mant.toFixed(1) : mant.toFixed(0)).replace('-', minus);
      const expStr = supDigits(e);
      return mantStr + '\u00d710' + expStr;
    }
    let s;
    if (step >= 1) s = String(Math.round(v));
    else {
      const decimals = Math.max(0, Math.ceil(-Math.log10(step)));
      s = v.toFixed(decimals);
    }
    return s.replace('-', minus);
  }
  function supDigits(n) {
    const map = { '-': '\u207b', '0': '\u2070', '1': '\u00b9', '2': '\u00b2', '3': '\u00b3', '4': '\u2074', '5': '\u2075', '6': '\u2076', '7': '\u2077', '8': '\u2078', '9': '\u2079' };
    return String(n).split('').map(c => map[c] || c).join('');
  }
  function escapeXml(s) {
    return String(s).replace(/[<>&"']/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;' }[c]));
  }
  function richLabel(s) {
    if (!s) return '';
    let out = escapeXml(s);
    out = out.replace(/\bm\/z\b/g, '<tspan font-style="italic">m</tspan>/<tspan font-style="italic">z</tspan>');
    return out;
  }

  // ---------- Renderer ----------
  // files[0] = TOP of the stack (matches inspector top-to-bottom order)
  function renderXICStack(data, opts) {
    opts = opts || {};
    const W = opts.width || 1100;
    const H = opts.height || 660;
    const fontFamily = opts.fontFamily || "Arial, 'Helvetica Neue', Helvetica, sans-serif";
    const titleSize = opts.titleSize ?? 14;
    const labelSize = opts.labelSize ?? 12;
    const tickSize = opts.tickSize ?? 11;
    const traceWidth = opts.traceWidth ?? 1.0;
    const fillUnder = opts.fillUnder ?? false;
    const showApexMarker = opts.showApexMarker ?? true;
    const refIdx = opts.referenceFile ?? null;
    const standardIdx = opts.standardFile ?? null;
    const xOffsetMin = opts.xOffsetMin ?? 0.0;     // x offset per sample (minutes)
    const yOffsetFrac = opts.yOffsetFrac ?? 0.18;  // y offset per sample (fraction of normalized max)
    const showFileLabels = opts.showFileLabels ?? true;
    const title = opts.title ?? '';
    const xicMz = opts.xicMz ?? null;
    const xicTol = opts.xicTol ?? 10;
    const xicTolMode = opts.xicTolMode || 'ppm';
    const rtViewMin = opts.rtViewMin ?? null;
    const rtViewMax = opts.rtViewMax ?? null;

    const files = (data && data.files) || [];
    if (!files.length) {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${fontFamily}"><rect width="${W}" height="${H}" fill="#ffffff"/><text x="${W/2}" y="${H/2}" text-anchor="middle" font-size="14" fill="#8a8a85">Add files in the inspector and set XIC m/z to plot.</text></svg>`;
    }

    const n = files.length;

    let allRT = [];
    files.forEach(f => { if (f.xic && f.xic.rt) allRT = allRT.concat(f.xic.rt); });
    let rtMinRaw = Math.min(...allRT), rtMaxRaw = Math.max(...allRT);
    if (rtViewMin != null) rtMinRaw = rtViewMin;
    if (rtViewMax != null) rtMaxRaw = rtViewMax;

    // Normalization
    //  - If a standard file is selected: scale the standard so its peak = max of all OTHER samples
    //    (others are then normalized to that same denominator → all peaks comparable)
    //  - Else: global max across all files
    const peaks = files.map(f => (f.xic ? f.xic.maxI : 0));
    const globalMax = Math.max(1, ...peaks);
    let normDenom = globalMax;
    let standardScale = 1;
    if (standardIdx != null && peaks[standardIdx] > 0) {
      const othersMax = Math.max(1, ...peaks.filter((_, i) => i !== standardIdx));
      normDenom = othersMax;
      // The standard trace gets multiplied by standardScale before being divided by normDenom,
      // so its scaled peak equals othersMax.
      standardScale = othersMax / peaks[standardIdx];
    }

    // Data-axis bounds include all offsets — extra 0.5 step past last sample for the diagonal axis
    const stackEnd = (n + 0.5);
    const xDataMin = rtMinRaw;
    const xDataMax = rtMaxRaw + stackEnd * xOffsetMin;
    const yDataMin = 0;
    const yDataMax = 1.0 + stackEnd * yOffsetFrac;

    const titleH = title ? titleSize + 4 : 0;
    const rightLabelW = showFileLabels ? Math.max(90, ...files.map(f => (f.name || '').length * (labelSize * 0.55))) + 12 : 16;
    const margin = {
      left: Math.max(50, labelSize * 4.0),
      right: rightLabelW + 8,
      top: titleH + 10,
      bottom: labelSize + tickSize + 12
    };
    const plotW = W - margin.left - margin.right;
    const plotH = H - margin.top - margin.bottom;
    const X = margin.left, Y = margin.top;

    function sxData(v) { return X + (v - xDataMin) / (xDataMax - xDataMin) * plotW; }
    function syData(v) { return Y + plotH - (v - yDataMin) / (yDataMax - yDataMin) * plotH; }

    const parts = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${fontFamily}">`);
    parts.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
    if (title) parts.push(`<text x="${W/2}" y="${titleSize + 4}" text-anchor="middle" font-size="${titleSize}" fill="#000">${escapeXml(title)}</text>`);

    // Diagonal "left axis" line — from (rt_min, 0) up to slightly above the
    // topmost trace's baseline (one half-row past the last sample) so the axis
    // visibly "sticks out" past the data.
    if (xOffsetMin > 0 || yOffsetFrac > 0) {
      const axisTop = n + 0.5;
      const x1 = sxData(rtMinRaw), y1 = syData(0);
      const x2 = sxData(rtMinRaw + axisTop * xOffsetMin), y2 = syData(axisTop * yOffsetFrac);
      parts.push(`<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#000" stroke-width="1"/>`);
    }
    // Bottom axis (horizontal): rt_min → rt_max at y=0
    parts.push(`<line x1="${sxData(rtMinRaw).toFixed(2)}" y1="${syData(0).toFixed(2)}" x2="${sxData(rtMaxRaw).toFixed(2)}" y2="${syData(0).toFixed(2)}" stroke="#000" stroke-width="1.5"/>`);
    // Hide Y axis + Y label when X offset = 0 AND Y offset = 1 (stacked-only, no shared baseline)
    const hideYAxis = (xOffsetMin === 0 && yOffsetFrac >= 1);

    // Left axis (vertical at rt_min): 0 → 1.0
    if (!hideYAxis) {
      parts.push(`<line x1="${sxData(rtMinRaw).toFixed(2)}" y1="${syData(0).toFixed(2)}" x2="${sxData(rtMinRaw).toFixed(2)}" y2="${syData(1.0).toFixed(2)}" stroke="#000" stroke-width="1.5"/>`);
    }

    // Apex marker (highlight line) — diagonal-shifted from reference file's apex
    let apex = null;
    if (showApexMarker && refIdx != null && files[refIdx]?.xic) {
      apex = files[refIdx].xic.apexRT;
    }
    if (showApexMarker && apex != null && apex >= rtMinRaw && apex <= rtMaxRaw) {
      const x1 = sxData(apex), y1 = syData(0);
      const x2 = sxData(apex + stackEnd * xOffsetMin), y2 = syData(stackEnd * yOffsetFrac);
      parts.push(`<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#888" stroke-width="0.8" stroke-dasharray="4,3"/>`);
      parts.push(`<text x="${(x2 + 6).toFixed(2)}" y="${(y2 - 2).toFixed(2)}" font-size="${tickSize}" fill="#333">${apex.toFixed(2)}</text>`);
    }

    // Traces — file[0] at top → use stackPos starting at 1 for bottom (matches the
    // reference Python's (i+1)*offset convention, leaving a gap above the x axis).
    files.forEach((f, listIdx) => {
      if (!f.xic) return;
      const stackPos = n - listIdx; // bottom row = 1, top row = n
      const dx = stackPos * xOffsetMin;
      const dy = stackPos * yOffsetFrac;
      const color = f.color || PALETTE[listIdx % PALETTE.length];

      let d = '';
      let started = false;
      let lastX = null, lastY = null;
      const scale = (listIdx === standardIdx) ? standardScale : 1;
      for (let k = 0; k < f.xic.rt.length; k++) {
        const r = f.xic.rt[k];
        if (r < rtMinRaw || r > rtMaxRaw) { started = false; continue; }
        const yNorm = (f.xic.intensity[k] * scale) / normDenom;
        const x = sxData(r + dx);
        const y = syData(yNorm + dy);
        d += (started ? 'L' : 'M') + x.toFixed(2) + ',' + y.toFixed(2) + ' ';
        started = true;
        lastX = x; lastY = y;
      }
      if (d) {
        if (fillUnder) {
          const xRightEdge = sxData(rtMaxRaw + dx);
          const xLeftEdge = sxData(rtMinRaw + dx);
          const yBase = syData(dy);
          const fillD = d + 'L' + xRightEdge.toFixed(2) + ',' + yBase.toFixed(2) + ' L' + xLeftEdge.toFixed(2) + ',' + yBase.toFixed(2) + ' Z';
          parts.push(`<path d="${fillD}" fill="${color}" fill-opacity="0.12"/>`);
        }
        parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${traceWidth}" stroke-linejoin="round" stroke-linecap="round"/>`);

        if (showFileLabels && lastX != null) {
          const isRef = refIdx === listIdx;
          const isStd = standardIdx === listIdx;
          const marker = (isRef ? ' ★' : '') + (isStd ? ' ◆' : '');
          parts.push(`<text x="${(lastX + 6).toFixed(2)}" y="${(lastY + 4).toFixed(2)}" font-size="${labelSize}" font-weight="${isRef || isStd ? 'bold' : 'normal'}" fill="${color}">${escapeXml(f.name || ('file '+(listIdx+1)))}${marker}</text>`);
        }
      }
    });

    // X axis ticks (along bottom axis)
    const xTicks = niceTicks(rtMinRaw, rtMaxRaw, 6);
    const xStep = xTicks[1] - xTicks[0];
    xTicks.forEach(v => {
      if (v < rtMinRaw - 0.01 || v > rtMaxRaw + 0.01) return;
      const x = sxData(v);
      const yAx = syData(0);
      parts.push(`<line x1="${x}" y1="${yAx}" x2="${x}" y2="${yAx + 5}" stroke="#000" stroke-width="1"/>`);
      parts.push(`<text x="${x}" y="${yAx + tickSize + 6}" text-anchor="middle" font-size="${tickSize}" fill="#000">${formatTick(v, xStep)}</text>`);
    });
    const xMinor = xStep / 5;
    for (let v = xTicks[0]; v <= xTicks[xTicks.length - 1]; v += xMinor) {
      if (v < rtMinRaw - 0.01 || v > rtMaxRaw + 0.01) continue;
      const x = sxData(v);
      const yAx = syData(0);
      parts.push(`<line x1="${x}" y1="${yAx}" x2="${x}" y2="${yAx + 2.5}" stroke="#000" stroke-width="0.6"/>`);
    }

    // Y axis ticks: 0, 50, 100 (% of denom) — hidden when offsets give independent rows
    if (!hideYAxis) {
      [0, 0.5, 1.0].forEach(v => {
        const y = syData(v);
        const x = sxData(rtMinRaw);
        parts.push(`<line x1="${x}" y1="${y}" x2="${x - 5}" y2="${y}" stroke="#000" stroke-width="1"/>`);
        parts.push(`<text x="${(x - 8).toFixed(2)}" y="${(y + 3.5).toFixed(2)}" text-anchor="end" font-size="${tickSize}" fill="#000">${(v * 100).toFixed(0)}</text>`);
      });
    }

    parts.push(`<text x="${(sxData(rtMinRaw) + (sxData(rtMaxRaw) - sxData(rtMinRaw))/2).toFixed(2)}" y="${(syData(0) + tickSize + labelSize + 12).toFixed(2)}" text-anchor="middle" font-size="${labelSize}" fill="#000">${richLabel(opts.xLabel || 'Retention time (min)')}</text>`);
    if (!hideYAxis) {
      parts.push(`<text transform="translate(${margin.left - 28}, ${(syData(0) + syData(1.0))/2}) rotate(-90)" text-anchor="middle" font-size="${labelSize}" fill="#000">${richLabel(opts.yLabel || 'Relative intensity (%)')}</text>`);
    }

    if (xicMz != null) {
      const tolStr = xicTolMode === 'ppm' ? '±' + xicTol + ' ppm' : '±' + xicTol + ' Da';
      parts.push(`<text x="${(X + plotW - 6).toFixed(2)}" y="${(Y + tickSize + 4).toFixed(2)}" text-anchor="end" font-size="${tickSize}" fill="#333">XIC <tspan font-style="italic">m</tspan>/<tspan font-style="italic">z</tspan> ${xicMz.toFixed(4)} ${tolStr}</text>`);
    }

    parts.push(`</svg>`);
    return parts.join('');
  }

  window.XICStack = {
    render: renderXICStack,
    buildXIC,
    palette: PALETTE
  };
})();
