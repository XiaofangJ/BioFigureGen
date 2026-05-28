/* ITC parser + publication-quality figure renderer */
(function () {
  'use strict';

  // ----- Parser -----
  function parseITC(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    // First non-empty line = title
    let title = '';
    let i = 0;
    while (i < lines.length && !lines[i].trim()) i++;
    if (i < lines.length) { title = lines[i].trim(); i++; }
    // Skip filename line(s) and find header row containing "Time"
    let headerIdx = -1;
    for (let j = i; j < Math.min(i + 8, lines.length); j++) {
      if (/time/i.test(lines[j]) && /heat/i.test(lines[j])) { headerIdx = j; break; }
    }
    if (headerIdx < 0) headerIdx = i + 1;
    const headers = lines[headerIdx].split('\t').map(s => s.trim());
    const time = [], heat = [], mr = [], dh = [], mrFit = [], fit = [];    for (let k = headerIdx + 1; k < lines.length; k++) {
      const ln = lines[k];
      if (!ln.trim()) continue;
      const parts = ln.split('\t');
      const num = (s) => {
        if (s === undefined) return null;
        const t = s.trim();
        if (!t) return null;
        const v = parseFloat(t);
        return isNaN(v) ? null : v;
      };
      const t0 = num(parts[0]);
      const t1 = num(parts[1]);
      if (t0 !== null && t1 !== null) { time.push(t0); heat.push(t1); }
      const m = num(parts[2]); const d = num(parts[3]);
      if (m !== null && d !== null) { mr.push(m); dh.push(d); }
      const mf = num(parts[4]); const ft = num(parts[5]);
      if (mf !== null && ft !== null) { mrFit.push(mf); fit.push(ft); }
    }
    return { title, headers, time, heat, mr, dh, mrFit, fit, excluded: new Array(mr.length).fill(false) };
  }

  // ----- Helpers -----
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
    // Use proper Unicode minus sign instead of hyphen-minus
    const minus = '\u2212';
    // Auto switch to scientific notation for very small / very large numbers
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

  // Superscript a signed integer using Unicode digit glyphs
  function supDigits(n) {
    const map = { '-': '\u207b', '0': '\u2070', '1': '\u00b9', '2': '\u00b2', '3': '\u00b3', '4': '\u2074', '5': '\u2075', '6': '\u2076', '7': '\u2077', '8': '\u2078', '9': '\u2079' };
    return String(n).split('').map(c => map[c] || c).join('');
  }

  function escapeXml(s) {
    return String(s).replace(/[<>&"']/g, c => ({
      '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
    }[c]));
  }

  // Render a label with light math markup support:
  //   "m/z"        → italic m / italic z
  //   "K_d (M)"    → italic K, subscript italic d, then " (M)"
  //   "Δ_H ..."    → Δ + italic H + rest
  //   "Δ_S ..."    → Δ + italic S + rest
  //   "Δ_G ..."    → Δ + italic G + rest
  //   "T_m ..."    → italic T + subscript m + rest
  // Returns inline SVG content (already XML-escaped where needed).
  function richLabel(s) {
    if (!s) return '';
    let out = escapeXml(s);
    // Italic m/z (and m/z appearing inside parentheses)
    out = out.replace(/\bm\/z\b/g, '<tspan font-style="italic">m</tspan>/<tspan font-style="italic">z</tspan>');
    // K_d → italic K with subscript italic d
    out = out.replace(/\bK_d\b/g, '<tspan font-style="italic">K</tspan><tspan font-style="italic" baseline-shift="sub" font-size="0.78em">d</tspan>');
    out = out.replace(/\bK_a\b/g, '<tspan font-style="italic">K</tspan><tspan font-style="italic" baseline-shift="sub" font-size="0.78em">a</tspan>');
    out = out.replace(/\bT_m\b/g, '<tspan font-style="italic">T</tspan><tspan font-style="italic" baseline-shift="sub" font-size="0.78em">m</tspan>');
    // ΔH / ΔS / ΔG / ΔCp / ΔΔG with the variable italicized: write "Δ_H" / "Δ_S" / "Δ_G"
    out = out.replace(/Δ_([A-Z])/g, '&#916;<tspan font-style="italic">$1</tspan>');
    out = out.replace(/Δ_([A-Z])([a-z])/g, '&#916;<tspan font-style="italic">$1</tspan><tspan font-style="italic" baseline-shift="sub" font-size="0.78em">$2</tspan>');
    // Stand-alone n (binding stoichiometry) — italicize if it's a single n token
    return out;
  }

  // ----- Renderer -----
  // Produces an SVG <svg>...</svg> string for the ITC figure
  function renderITC(data, opts) {
    opts = opts || {};
    const W = opts.width || 900;
    const H = opts.height || 620;
    const title = opts.title ?? data.title ?? '';
    const xlab1 = opts.xlab1 || 'Time (s)';
    const ylab1 = opts.ylab1 || 'Corrected Heat Rate (µJ/s)';
    const xlab2 = opts.xlab2 || 'Mole Ratio';
    const ylab2 = opts.ylab2 || 'Enthalpy and Fit (kJ/mol)';
    const traceColor = opts.traceColor || '#000000';
    const traceWidth = opts.traceWidth ?? 1.1;
    const fitColor = opts.fitColor || '#000000';
    const fitWidth = opts.fitWidth ?? 1.4;
    const markerSize = opts.markerSize ?? 5;
    const markerStyle = opts.markerStyle || 'filled-circle';
    const markerFill = opts.markerFill || '#000000';
    const markerStroke = opts.markerStroke || '#000000';
    const markerStrokeWidth = opts.markerStrokeWidth ?? 1.0;
    const borderWidth = opts.borderWidth ?? 1.0;
    const spineStyle = opts.spineStyle || 'box'; // 'box' | 'L' (bottom+left only)
    // In full-box mode ticks default to inward so they don't visually "stick out"
    // of the box. L-spine mode keeps the explicit user setting (default outward).
    const tickDir = opts.tickDir || (spineStyle === 'box' ? 'in' : 'out');
    const showGridLines = opts.showGridLines ?? false;
    const showGridBands = opts.showGridBands ?? false;
    const boldLabels = opts.boldLabels ?? false;
    const showParamBox = opts.showParamBox ?? true;
    const fontFamily = opts.fontFamily || "Arial, 'Helvetica Neue', Helvetica, sans-serif";
    const titleSize = opts.titleSize ?? 20;
    const labelSize = opts.labelSize ?? 16;
    const tickSize = opts.tickSize ?? 13;
    const panelLabelA = opts.panelLabelA || '';
    const panelLabelB = opts.panelLabelB || '';
    const panelLabelSize = opts.panelLabelSize ?? Math.round(titleSize * 1.1);
    const panelLabelBold = opts.panelLabelBold ?? true;
    const params = opts.params || {};
    // Panel layout: 'joined' = panels touch, time axis at top of top panel (compact);
    //               'separated' = visible gap between panels, time axis BELOW top panel
    //                with its own x-label "Time (s)". Matches the AffinityWorks/Origin
    //                style shown in the example image.
    const panelLayout = opts.panelLayout || 'separated';
    const isSep = panelLayout === 'separated';

    // Layout: title strip, then top panel (thermogram), then bottom (isotherm)
    const titleH = title ? titleSize + 4 : 0;
    const topAxisLabelH = labelSize + 6;
    const topTickH = tickSize + 4;
    const botAxisLabelH = labelSize + 6;
    const botTickH = tickSize + 4;
    let topMargin, gap;
    if (isSep) {
      topMargin = titleH + 4;
      gap = botTickH + botAxisLabelH + 4;
    } else {
      topMargin = titleH + topAxisLabelH + topTickH + 2;
      gap = 0;
    }
    const botMargin = botAxisLabelH + botTickH + 2;
    // ----- Pre-compute parameter box dimensions (so we can size the right margin) -----
    let pbDims = null;
    if (showParamBox && params) {
      let pbFontSize = opts.paramBoxFontSize ?? Math.max(9, Math.round(labelSize * 0.92));
      const rowsData = [
        ['Variable', 'Value', '95% CI'],
        ['K_d (M)',                              params.kd || '',  params.kdCI ? '\u00b1\u202f' + params.kdCI : ''],
        ['n',                                    params.n  || '',  params.nCI  ? '\u00b1\u202f' + params.nCI  : ''],
        ['ΔH (kJ mol\u207b\u00b9)',              params.dH || '',  params.dHCI ? '\u00b1\u202f' + params.dHCI : ''],
        ['ΔS (J mol\u207b\u00b9 K\u207b\u00b9)', params.dS || '',  params.dSCI ? '\u00b1\u202f' + params.dSCI : '']
      ];
      function plainLen(s) { return String(s).replace(/_(\w)/g, '$1').length; }
      function measure(fs) {
        const cw = fs * 0.58;
        const colW = [0, 0, 0];
        rowsData.forEach(r => r.forEach((cell, c) => {
          const w = plainLen(cell) * cw;
          if (w > colW[c]) colW[c] = w;
        }));
        const colGap = fs * 1.2;
        const padX = fs * 0.9;
        const boxW = colW.reduce((a, b) => a + b, 0) + colGap * 2 + padX * 2;
        return { colW, colGap, padX, boxW, fs };
      }
      let dims = measure(pbFontSize);
      pbDims = { rowsData, ...dims, fontSize: pbFontSize };
    }

    // Reserve right margin if param box is positioned outside the plot area
    const pbOutside = showParamBox && (opts.paramBoxPosition === 'outside-right') && pbDims;
    const rightMargin = pbOutside ? Math.ceil(pbDims.boxW + 18) : 18;
    const margin = { left: Math.max(58, labelSize * 4.2), right: rightMargin, top: topMargin, bottom: botMargin };
    const plotW = W - margin.left - margin.right;
    const plotH = H - margin.top - margin.bottom - gap;
    // When separated, give both panels equal weight; joined keeps current 45/55 split.
    const topH = plotH * (isSep ? 0.5 : 0.45);
    const botH = plotH * (isSep ? 0.5 : 0.55);

    // ---- Scales ----
    // Top panel: time vs heat
    const tMin = data.time.length ? data.time[0] : 0;
    const tMax = data.time.length ? data.time[data.time.length - 1] : 1;
    let heatMin = 0, heatMax = 1;
    if (data.heat.length) {
      heatMin = Math.min(0, ...data.heat);
      heatMax = Math.max(...data.heat);
    }
    // Pad heatMax slightly
    heatMax = heatMax + (heatMax - heatMin) * 0.05;

    // Bottom panel: enthalpy data ranges (skip excluded for autoscale)
    const allMR = [], allDH = [];
    for (let i = 0; i < data.mr.length; i++) {
      if (data.excluded && data.excluded[i]) continue;
      allMR.push(data.mr[i]); allDH.push(data.dh[i]);
    }
    for (let i = 0; i < data.mrFit.length; i++) {
      allMR.push(data.mrFit[i]); allDH.push(data.fit[i]);
    }
    let mrMin = 0, mrMax = 1.4, dhMin = -80, dhMax = 5;
    if (allMR.length) {
      mrMin = Math.min(...allMR);
      mrMax = Math.max(...allMR);
      const pad = (mrMax - mrMin) * 0.07;
      mrMin -= pad; mrMax += pad;
    }
    if (allDH.length) {
      dhMin = Math.min(...allDH);
      dhMax = Math.max(...allDH);
      const pad = (dhMax - dhMin) * 0.08;
      dhMin -= pad; dhMax += pad;
    }

    // Nice ticks
    const tTicks = niceTicks(tMin, tMax, 5);
    const tStep = tTicks.length > 1 ? tTicks[1] - tTicks[0] : tMax - tMin;
    const heatTicks = niceTicks(heatMin, heatMax, 5);
    const heatStep = heatTicks.length > 1 ? heatTicks[1] - heatTicks[0] : 1;
    const mrTicks = niceTicks(mrMin, mrMax, 7);
    const mrStep = mrTicks.length > 1 ? mrTicks[1] - mrTicks[0] : 0.2;
    const dhTicks = niceTicks(dhMin, dhMax, 5);
    const dhStep = dhTicks.length > 1 ? dhTicks[1] - dhTicks[0] : 20;

    // Snap axis bounds to nice extents
    const tAxisMin = tTicks[0] < tMin ? tTicks[0] : tMin;
    const tAxisMax = tTicks[tTicks.length - 1] > tMax ? tTicks[tTicks.length - 1] : tMax;
    const heatAxisMin = Math.min(heatTicks[0], heatMin);
    const heatAxisMax = Math.max(heatTicks[heatTicks.length - 1], heatMax);
    const mrAxisMin = Math.min(mrTicks[0], mrMin);
    const mrAxisMax = Math.max(mrTicks[mrTicks.length - 1], mrMax);
    const dhAxisMin = Math.min(dhTicks[0], dhMin);
    const dhAxisMax = Math.max(dhTicks[dhTicks.length - 1], dhMax);

    // Plot rectangles
    const topX = margin.left, topY = margin.top;
    const botX = margin.left, botY = margin.top + topH + gap;

    function sxTop(v) { return topX + (v - tAxisMin) / (tAxisMax - tAxisMin) * plotW; }
    function syTop(v) { return topY + topH - (v - heatAxisMin) / (heatAxisMax - heatAxisMin) * topH; }
    function sxBot(v) { return botX + (v - mrAxisMin) / (mrAxisMax - mrAxisMin) * plotW; }
    function syBot(v) { return botY + botH - (v - dhAxisMin) / (dhAxisMax - dhAxisMin) * botH; }

    // ---- Build SVG ----
    const parts = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${fontFamily}">`);
    parts.push(`<defs>
      <clipPath id="cliptop"><rect x="${topX}" y="${topY}" width="${plotW}" height="${topH}"/></clipPath>
      <clipPath id="clipbot"><rect x="${botX}" y="${botY}" width="${plotW}" height="${botH}"/></clipPath>
    </defs>`);

    // White background
    parts.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);

    // Subtle banded background for grid feel (alternating very light gray)
    if (showGridBands) {
      // horizontal bands for top panel
      for (let k = 0; k < heatTicks.length - 1; k++) {
        if (k % 2 === 0) {
          const y1 = syTop(heatTicks[k]);
          const y2 = syTop(heatTicks[k + 1]);
          parts.push(`<rect x="${topX}" y="${Math.min(y1,y2)}" width="${plotW}" height="${Math.abs(y2-y1)}" fill="#f4f4f4"/>`);
        }
      }
      // horizontal bands for bottom panel
      for (let k = 0; k < dhTicks.length - 1; k++) {
        if (k % 2 === 0) {
          const y1 = syBot(dhTicks[k]);
          const y2 = syBot(dhTicks[k + 1]);
          parts.push(`<rect x="${botX}" y="${Math.min(y1,y2)}" width="${plotW}" height="${Math.abs(y2-y1)}" fill="#f4f4f4"/>`);
        }
      }
    }

    // Grid lines
    if (showGridLines) {
      const gColor = '#e8e8e8';
      const gW = 0.5;
      mrTicks.forEach(v => {
        const x = sxBot(v);
        parts.push(`<line x1="${x}" y1="${botY}" x2="${x}" y2="${botY + botH}" stroke="${gColor}" stroke-width="${gW}"/>`);
      });
      tTicks.forEach(v => {
        const x = sxTop(v);
        parts.push(`<line x1="${x}" y1="${topY}" x2="${x}" y2="${topY + topH}" stroke="${gColor}" stroke-width="${gW}"/>`);
      });
      heatTicks.forEach(v => {
        const y = syTop(v);
        parts.push(`<line x1="${topX}" y1="${y}" x2="${topX + plotW}" y2="${y}" stroke="${gColor}" stroke-width="${gW}"/>`);
      });
      dhTicks.forEach(v => {
        const y = syBot(v);
        parts.push(`<line x1="${botX}" y1="${y}" x2="${botX + plotW}" y2="${y}" stroke="${gColor}" stroke-width="${gW}"/>`);
      });
    }

    // ----- Top panel: thermogram -----
    if (data.time.length && data.heat.length) {
      let d = '';
      for (let i = 0; i < data.time.length; i++) {
        const x = sxTop(data.time[i]);
        const y = syTop(data.heat[i]);
        d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2) + ' ';
      }
      parts.push(`<path d="${d}" fill="none" stroke="${traceColor}" stroke-width="${traceWidth}" stroke-linejoin="round" stroke-linecap="round" clip-path="url(#cliptop)"/>`);
    }

    // ----- Bottom panel: fit line -----
    if (data.mrFit.length && data.fit.length) {
      let d = '';
      for (let i = 0; i < data.mrFit.length; i++) {
        const x = sxBot(data.mrFit[i]);
        const y = syBot(data.fit[i]);
        d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2) + ' ';
      }
      parts.push(`<path d="${d}" fill="none" stroke="${fitColor}" stroke-width="${fitWidth}" clip-path="url(#clipbot)"/>`);
    }

    // ----- Bottom panel: data points (flat publication markers) -----
    for (let i = 0; i < data.mr.length; i++) {
      if (data.excluded && data.excluded[i]) continue;
      const x = sxBot(data.mr[i]);
      const y = syBot(data.dh[i]);
      parts.push(marker(x, y, markerStyle, markerSize, markerFill, markerStroke, markerStrokeWidth));
    }

    // ----- Panel borders (full box or L-shape) -----
    if (spineStyle === 'L') {
      // L-spine: bottom + left only for each panel.
      // Joined layout: top panel's "bottom" is the time axis which lives at the TOP
      //                of the panel (this is the shared edge with the isotherm below),
      //                so we draw top + left.
      // Separated layout: each panel is a self-contained L (bottom + left).
      if (isSep) {
        parts.push(`<line x1="${topX}" y1="${topY + topH}" x2="${topX + plotW}" y2="${topY + topH}" stroke="#000" stroke-width="${borderWidth}"/>`);
        parts.push(`<line x1="${topX}" y1="${topY}" x2="${topX}" y2="${topY + topH}" stroke="#000" stroke-width="${borderWidth}"/>`);
      } else {
        parts.push(`<line x1="${topX}" y1="${topY}" x2="${topX + plotW}" y2="${topY}" stroke="#000" stroke-width="${borderWidth}"/>`);
        parts.push(`<line x1="${topX}" y1="${topY}" x2="${topX}" y2="${topY + topH}" stroke="#000" stroke-width="${borderWidth}"/>`);
      }
      parts.push(`<line x1="${botX}" y1="${botY + botH}" x2="${botX + plotW}" y2="${botY + botH}" stroke="#000" stroke-width="${borderWidth}"/>`);
      parts.push(`<line x1="${botX}" y1="${botY}" x2="${botX}" y2="${botY + botH}" stroke="#000" stroke-width="${borderWidth}"/>`);
    } else {
      parts.push(`<rect x="${topX}" y="${topY}" width="${plotW}" height="${topH}" fill="none" stroke="#000" stroke-width="${borderWidth}"/>`);
      parts.push(`<rect x="${botX}" y="${botY}" width="${plotW}" height="${botH}" fill="none" stroke="#000" stroke-width="${borderWidth}"/>`);
    }

    // ----- Tick marks (direction-aware) -----
    const td = tickDir === 'in' ? -1 : 1;
    const majL = 6 * td;   // major length signed (positive = outward)
    const minL = 3 * td;
    const tkW = Math.max(0.8, borderWidth);
    const minorW = 0.7;

    // Top panel: time axis.
    // - joined layout: axis at TOP of top panel, ticks point up (outward = negative y)
    // - separated layout: axis at BOTTOM of top panel, ticks point down (outward = positive y)
    if (isSep) {
      const yAx = topY + topH;
      tTicks.forEach(v => {
        const x = sxTop(v);
        parts.push(`<line x1="${x}" y1="${yAx}" x2="${x}" y2="${yAx + majL}" stroke="#000" stroke-width="${tkW}"/>`);
        parts.push(`<text x="${x}" y="${yAx + tickSize + 6}" text-anchor="middle" font-size="${tickSize}" fill="#000">${formatTick(v, tStep)}</text>`);
      });
      const tMinorStepS = tStep / 5;
      for (let v = tTicks[0]; v <= tTicks[tTicks.length - 1]; v += tMinorStepS) {
        const x = sxTop(v);
        if (x >= topX - 0.5 && x <= topX + plotW + 0.5) {
          parts.push(`<line x1="${x}" y1="${yAx}" x2="${x}" y2="${yAx + minL}" stroke="#000" stroke-width="${minorW}"/>`);
        }
      }
    } else {
      tTicks.forEach(v => {
        const x = sxTop(v);
        parts.push(`<line x1="${x}" y1="${topY}" x2="${x}" y2="${topY - majL}" stroke="#000" stroke-width="${tkW}"/>`);
        parts.push(`<text x="${x}" y="${topY - 10}" text-anchor="middle" font-size="${tickSize}" fill="#000">${formatTick(v, tStep)}</text>`);
      });
      const tMinorStep = tStep / 5;
      for (let v = tTicks[0]; v <= tTicks[tTicks.length - 1]; v += tMinorStep) {
        const x = sxTop(v);
        if (x >= topX - 0.5 && x <= topX + plotW + 0.5) {
          parts.push(`<line x1="${x}" y1="${topY}" x2="${x}" y2="${topY - minL}" stroke="#000" stroke-width="${minorW}"/>`);
        }
      }
    }

    // Top panel: left axis (heat) — outward = left = negative x
    heatTicks.forEach(v => {
      const y = syTop(v);
      parts.push(`<line x1="${topX}" y1="${y}" x2="${topX - majL}" y2="${y}" stroke="#000" stroke-width="${tkW}"/>`);
      parts.push(`<text x="${topX - Math.max(majL, 0) - 3}" y="${y + 4}" text-anchor="end" font-size="${tickSize}" fill="#000">${formatTick(v, heatStep)}</text>`);
    });
    const heatMinorStep = heatStep / 5;
    for (let v = heatTicks[0]; v <= heatTicks[heatTicks.length - 1]; v += heatMinorStep) {
      const y = syTop(v);
      if (y >= topY - 0.5 && y <= topY + topH + 0.5) {
        parts.push(`<line x1="${topX}" y1="${y}" x2="${topX - minL}" y2="${y}" stroke="#000" stroke-width="${minorW}"/>`);
      }
    }
    // (Right y-axis ticks intentionally omitted — even in box mode — for a cleaner figure.)
    // The right spine of the box is still drawn, but no tick marks protrude from it.

    // Bottom panel: bottom axis (mole ratio) — outward = down = positive y
    mrTicks.forEach(v => {
      const x = sxBot(v);
      const yAx = botY + botH;
      parts.push(`<line x1="${x}" y1="${yAx}" x2="${x}" y2="${yAx + majL}" stroke="#000" stroke-width="${tkW}"/>`);
      parts.push(`<text x="${x}" y="${yAx + tickSize + 6}" text-anchor="middle" font-size="${tickSize}" fill="#000">${formatTick(v, mrStep)}</text>`);
    });
    const mrMinorStep = mrStep / 5;
    for (let v = mrTicks[0]; v <= mrTicks[mrTicks.length - 1]; v += mrMinorStep) {
      const x = sxBot(v);
      if (x >= botX - 0.5 && x <= botX + plotW + 0.5) {
        parts.push(`<line x1="${x}" y1="${botY + botH}" x2="${x}" y2="${botY + botH + minL}" stroke="#000" stroke-width="${minorW}"/>`);
      }
    }

    // Bottom panel: left axis (enthalpy) — outward = left = negative x
    dhTicks.forEach(v => {
      const y = syBot(v);
      parts.push(`<line x1="${botX}" y1="${y}" x2="${botX - majL}" y2="${y}" stroke="#000" stroke-width="${tkW}"/>`);
      parts.push(`<text x="${botX - Math.max(majL, 0) - 3}" y="${y + 4}" text-anchor="end" font-size="${tickSize}" fill="#000">${formatTick(v, dhStep)}</text>`);
    });
    const dhMinorStep = dhStep / 5;
    for (let v = dhTicks[0]; v <= dhTicks[dhTicks.length - 1]; v += dhMinorStep) {
      const y = syBot(v);
      if (y >= botY - 0.5 && y <= botY + botH + 0.5) {
        parts.push(`<line x1="${botX}" y1="${y}" x2="${botX - minL}" y2="${y}" stroke="#000" stroke-width="${minorW}"/>`);
      }
    }
    // (Right y-axis ticks intentionally omitted in box mode as well.)

    // ----- Title -----
    if (title) {
      parts.push(`<text x="${W / 2}" y="${titleSize + 4}" text-anchor="middle" font-size="${titleSize}" fill="#000">${escapeXml(title)}</text>`);
    }

    // ----- Panel labels (a, b for multi-panel figures) -----
    if (panelLabelA) {
      parts.push(`<text x="${margin.left - 50}" y="${topY - 4}" font-size="${panelLabelSize}" font-weight="${panelLabelBold ? 'bold' : 'normal'}" fill="#000">${escapeXml(panelLabelA)}</text>`);
    }
    if (panelLabelB) {
      parts.push(`<text x="${margin.left - 50}" y="${botY + 16}" font-size="${panelLabelSize}" font-weight="${panelLabelBold ? 'bold' : 'normal'}" fill="#000">${escapeXml(panelLabelB)}</text>`);
    }

    // ----- Axis labels -----
    const lbW = boldLabels ? 'bold' : 'normal';
    const leftLabelOffset = margin.left - 28;
    if (isSep) {
      // Time axis label sits below the top panel's tick numbers (in the gap)
      const topXLabelY = topY + topH + topTickH + labelSize + 2;
      parts.push(`<text x="${topX + plotW / 2}" y="${topXLabelY}" text-anchor="middle" font-size="${labelSize}" font-weight="${lbW}" fill="#000">${richLabel(xlab1)}</text>`);
    } else {
      // Time axis label between title and top edge of top panel
      const topLabelY = titleH + labelSize;
      parts.push(`<text x="${topX + plotW / 2}" y="${topLabelY}" text-anchor="middle" font-size="${labelSize}" font-weight="${lbW}" fill="#000">${richLabel(xlab1)}</text>`);
    }
    // Left labels are positioned just outside the longest tick number
    parts.push(`<text transform="translate(${leftLabelOffset}, ${topY + topH / 2}) rotate(-90)" text-anchor="middle" font-size="${labelSize}" font-weight="${lbW}" fill="#000">${richLabel(ylab1)}</text>`);
    // Bottom axis label
    parts.push(`<text x="${botX + plotW / 2}" y="${botY + botH + botTickH + labelSize + 2}" text-anchor="middle" font-size="${labelSize}" font-weight="${lbW}" fill="#000">${richLabel(xlab2)}</text>`);
    parts.push(`<text transform="translate(${leftLabelOffset}, ${botY + botH / 2}) rotate(-90)" text-anchor="middle" font-size="${labelSize}" font-weight="${lbW}" fill="#000">${richLabel(ylab2)}</text>`);

    // ----- Parameter box -----
    if (showParamBox && params && pbDims) {
      const { rowsData, colW, colGap, padX, boxW, fontSize: pbFontSize } = pbDims;
      const rowGap = pbFontSize + 6;
      const padY = pbFontSize * 0.9;
      // Box has: optional model subtitle + header row + 4 data rows
      const modelLabel = params.model || 'Independent';
      const subtitleH = modelLabel ? pbFontSize + 4 : 0;
      const boxH = subtitleH + rowsData.length * rowGap + padY * 1.6;

      const pos = opts.paramBoxPosition || 'outside-right';
      const innerPad = 10;
      let bx, by;
      if (pos === 'outside-right') {
        bx = botX + plotW + 16;
        by = botY + (botH - boxH) / 2;
      } else if (pos === 'top-left') {
        bx = botX + innerPad; by = botY + innerPad;
      } else if (pos === 'top-right') {
        bx = botX + plotW - boxW - innerPad; by = botY + innerPad;
      } else if (pos === 'bottom-left') {
        bx = botX + innerPad; by = botY + botH - boxH - innerPad;
      } else {
        bx = botX + plotW - boxW - innerPad; by = botY + botH - boxH - innerPad;
      }

      // Background + hairline border
      parts.push(`<rect x="${bx}" y="${by}" width="${boxW}" height="${boxH}" fill="#ffffff" fill-opacity="0.98" stroke="#1a1a1a" stroke-width="0.5"/>`);

      const colX = [bx + padX];
      for (let i = 1; i < 3; i++) colX.push(colX[i - 1] + colW[i - 1] + colGap);

      // Variable cell renderer
      function renderVar(label, x, y) {
        if (label === 'K_d (M)') {
          return `<text x="${x}" y="${y}" font-size="${pbFontSize}" fill="#000"><tspan font-style="italic">K</tspan><tspan font-style="italic" baseline-shift="sub" font-size="${(pbFontSize*0.78).toFixed(1)}">d</tspan> (M)</text>`;
        }
        if (label === 'n') {
          return `<text x="${x}" y="${y}" font-size="${pbFontSize}" fill="#000"><tspan font-style="italic">n</tspan></text>`;
        }
        if (/^ΔH/.test(label)) {
          return `<text x="${x}" y="${y}" font-size="${pbFontSize}" fill="#000">&#916;<tspan font-style="italic">H</tspan>${escapeXml(label.slice(2))}</text>`;
        }
        if (/^ΔS/.test(label)) {
          return `<text x="${x}" y="${y}" font-size="${pbFontSize}" fill="#000">&#916;<tspan font-style="italic">S</tspan>${escapeXml(label.slice(2))}</text>`;
        }
        return `<text x="${x}" y="${y}" font-size="${pbFontSize}" fill="#000">${escapeXml(label)}</text>`;
      }

      // Model subtitle
      let nextY = by + padY + pbFontSize;
      if (modelLabel) {
        parts.push(`<text x="${bx + padX}" y="${nextY}" font-size="${(pbFontSize * 0.85).toFixed(1)}" font-weight="600" fill="#666" letter-spacing="0.05em">${escapeXml(modelLabel.toUpperCase())} MODEL</text>`);
        nextY += subtitleH;
      }

      // Header row (column titles)
      const headerBaseY = nextY;
      rowsData[0].forEach((cell, ci) => {
        parts.push(`<text x="${colX[ci]}" y="${headerBaseY}" font-size="${(pbFontSize * 0.85).toFixed(1)}" font-weight="600" fill="#666" letter-spacing="0.05em">${escapeXml(String(cell).toUpperCase())}</text>`);
      });
      const headerLineY = headerBaseY + 4;
      parts.push(`<line x1="${bx + padX * 0.4}" y1="${headerLineY}" x2="${bx + boxW - padX * 0.4}" y2="${headerLineY}" stroke="#1a1a1a" stroke-width="0.5"/>`);

      // Data rows
      for (let ri = 1; ri < rowsData.length; ri++) {
        const yBase = headerBaseY + ri * rowGap + 2;
        rowsData[ri].forEach((cell, ci) => {
          if (ci === 0) parts.push(renderVar(cell, colX[ci], yBase));
          else parts.push(`<text x="${colX[ci]}" y="${yBase}" font-size="${pbFontSize}" fill="#000">${escapeXml(cell)}</text>`);
        });
      }
    }

    parts.push(`</svg>`);
    return parts.join('');
  }

  function sub(c) { return c; } // placeholder; SVG <tspan> in svg requires more — keep ASCII

  // Marker primitives — flat shapes for publication
  function marker(x, y, style, size, fill, stroke, sw) {
    const xs = x.toFixed(2), ys = y.toFixed(2);
    const r = size;
    switch (style) {
      case 'filled-circle':
        return `<circle cx="${xs}" cy="${ys}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      case 'open-circle':
        return `<circle cx="${xs}" cy="${ys}" r="${r}" fill="#ffffff" stroke="${stroke}" stroke-width="${sw}"/>`;
      case 'filled-square':
        return `<rect x="${(x-r).toFixed(2)}" y="${(y-r).toFixed(2)}" width="${r*2}" height="${r*2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      case 'open-square':
        return `<rect x="${(x-r).toFixed(2)}" y="${(y-r).toFixed(2)}" width="${r*2}" height="${r*2}" fill="#ffffff" stroke="${stroke}" stroke-width="${sw}"/>`;
      case 'filled-triangle': {
        const h = r * 1.732;
        const pts = `${x},${y - r * 1.155} ${x - r},${y + h/2 - r*0.577} ${x + r},${y + h/2 - r*0.577}`;
        return `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      }
      case 'open-triangle': {
        const h = r * 1.732;
        const pts = `${x},${y - r * 1.155} ${x - r},${y + h/2 - r*0.577} ${x + r},${y + h/2 - r*0.577}`;
        return `<polygon points="${pts}" fill="#ffffff" stroke="${stroke}" stroke-width="${sw}"/>`;
      }
      case 'filled-diamond': {
        const pts = `${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`;
        return `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      }
      case 'open-diamond': {
        const pts = `${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`;
        return `<polygon points="${pts}" fill="#ffffff" stroke="${stroke}" stroke-width="${sw}"/>`;
      }
      case 'plus':
        return `<g stroke="${stroke}" stroke-width="${sw * 2}" stroke-linecap="butt">` +
          `<line x1="${(x-r).toFixed(2)}" y1="${ys}" x2="${(x+r).toFixed(2)}" y2="${ys}"/>` +
          `<line x1="${xs}" y1="${(y-r).toFixed(2)}" x2="${xs}" y2="${(y+r).toFixed(2)}"/>` +
          `</g>`;
      case 'cross':
        return `<g stroke="${stroke}" stroke-width="${sw * 2}" stroke-linecap="butt">` +
          `<line x1="${(x-r*0.7).toFixed(2)}" y1="${(y-r*0.7).toFixed(2)}" x2="${(x+r*0.7).toFixed(2)}" y2="${(y+r*0.7).toFixed(2)}"/>` +
          `<line x1="${(x-r*0.7).toFixed(2)}" y1="${(y+r*0.7).toFixed(2)}" x2="${(x+r*0.7).toFixed(2)}" y2="${(y-r*0.7).toFixed(2)}"/>` +
          `</g>`;
      default:
        return `<circle cx="${xs}" cy="${ys}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    }
  }

  // ----- Default fit params from data file (this file ships with the demo) -----
  const DEFAULT_PARAMS = {
    model: 'Independent',
    kd: '8.675\u202f\u00d7\u202f10\u207b\u2078', kdCI: '3.62\u202f\u00d7\u202f10\u207b\u2078',
    n: '0.746', nCI: '0.029',
    dH: '\u221253.62', dHCI: '3.237',
    dS: '\u221244.64', dSCI: '',
    conf: '95'
  };

  // ----- Built-in synthetic sample (progesterone titrating into 5\u03b1-reductase) -----
  function sampleITC() {
    // 250 thermogram time points, 30 injections at evenly spaced times
    const time = [], heat = [];
    const tEnd = 4200; // 70 min
    const nInj = 30;
    const injDt = tEnd / nInj;
    for (let i = 0; i < 250; i++) {
      const t = i * (tEnd / 249);
      // Find nearest injection time
      let h = 0;
      for (let k = 1; k <= nInj; k++) {
        const tInj = k * injDt;
        if (t > tInj) {
          // Exponential decay back to baseline
          const dt = t - tInj;
          // Heat amplitude shrinks as we approach saturation (sigmoidal binding)
          const mr = k * 0.045;
          const amp = -2.6 / (1 + Math.exp((mr - 0.75) * 8)) - 0.1;
          h += amp * Math.exp(-dt / 28);
        }
      }
      time.push(t);
      heat.push(h + (Math.random() - 0.5) * 0.05);
    }
    // Injection-by-injection enthalpy (binding isotherm)
    const mr = [], dh = [];
    for (let k = 1; k <= nInj; k++) {
      const m = k * 0.045;
      // Sigmoid-shaped isotherm with N = 0.75, ΔH = -53.6 kJ/mol
      const enth = -53.6 / (1 + Math.exp((m - 0.75) * 9)) - 0.5 + (Math.random() - 0.5) * 1.2;
      mr.push(m); dh.push(enth);
    }
    // Smooth fit curve
    const mrFit = [], fit = [];
    for (let i = 0; i <= 80; i++) {
      const m = 0 + i * (1.5 / 80);
      mrFit.push(m);
      fit.push(-53.6 / (1 + Math.exp((m - 0.75) * 9)) - 0.5);
    }
    return {
      title: 'Progesterone into 5\u03b1-reductase',
      headers: ['Time', 'Heat', 'Mole Ratio', 'Enthalpy', 'MRFit', 'Fit'],
      time, heat, mr, dh, mrFit, fit,
      excluded: new Array(mr.length).fill(false)
    };
  }

  // expose
  window.ITC = {
    parse: parseITC,
    render: renderITC,
    sample: sampleITC,
    defaultParams: DEFAULT_PARAMS,
    presets: {
      neutral: {
        // Journal-neutral default — modern L-spine, ticks-out, hairline strokes.
        // Works for most chem/biology journals as a generic conservative starting point.
        fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        titleSize: 13,
        labelSize: 11,
        tickSize: 9,
        traceWidth: 0.7,
        fitWidth: 1.0,
        markerSize: 3.2,
        markerStyle: 'filled-circle',
        markerFill: '#000000',
        markerStroke: '#000000',
        markerStrokeWidth: 0,
        borderWidth: 0.7,
        tickDir: 'out',
        spineStyle: 'L',
        boldLabels: false,
        showGridLines: false,
        showGridBands: false,
        showParamBox: true,
        paramBoxPosition: 'outside-right',
        panelLabelBold: true,
        width: 640,
        height: 520
      },
      nature: {
        // Nature: 89mm single, 183mm double col. Sans-serif. 5-7pt min.
        fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        titleSize: 8,
        labelSize: 7,
        tickSize: 6,
        traceWidth: 0.6,
        fitWidth: 0.9,
        markerSize: 2.6,
        markerStyle: 'filled-circle',
        markerFill: '#000000',
        markerStroke: '#000000',
        markerStrokeWidth: 0,
        borderWidth: 0.6,
        tickDir: 'in',
        spineStyle: 'L',
        boldLabels: false,
        showGridLines: false,
        showGridBands: false,
        showParamBox: true,
        width: 336,  // 89mm at 3.78 px/mm
        height: 380
      },
      cell: {
        // Cell: 85mm / 174mm. Helvetica preferred.
        fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        titleSize: 9,
        labelSize: 8,
        tickSize: 7,
        traceWidth: 0.75,
        fitWidth: 1.0,
        markerSize: 3,
        markerStyle: 'filled-circle',
        markerFill: '#000000',
        markerStroke: '#000000',
        markerStrokeWidth: 0,
        borderWidth: 0.75,
        tickDir: 'out',
        spineStyle: 'box',
        boldLabels: false,
        showGridLines: false,
        showGridBands: false,
        showParamBox: true,
        width: 322,  // 85mm
        height: 380
      },
      science: {
        // Science: 55mm single, 120mm double. Helvetica. Very small.
        fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        titleSize: 8,
        labelSize: 7,
        tickSize: 6,
        traceWidth: 0.5,
        fitWidth: 0.8,
        markerSize: 2.4,
        markerStyle: 'open-circle',
        markerFill: '#000000',
        markerStroke: '#000000',
        markerStrokeWidth: 0.6,
        borderWidth: 0.5,
        tickDir: 'in',
        spineStyle: 'L',
        boldLabels: false,
        showGridLines: false,
        showGridBands: false,
        showParamBox: true,
        width: 454,  // 120mm double col
        height: 480
      },
      preview: {
        // Larger version of any of the above for on-screen preview — multiply font sizes
        // The app handles this by separate "display scale" if needed
      }
    }
  };
})();
