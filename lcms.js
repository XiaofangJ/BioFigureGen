/* LC-MS/MS² parser + publication-quality renderer */
(function () {
  'use strict';

  // ---------- Parsers ----------
  // Supports:
  //  - mzML / indexedmzML — standard XML format with base64-encoded binary arrays (async)
  //  - MGF (Mascot Generic Format) — one or more spectra with PEPMASS / RTINSECONDS
  //  - Simple two-col text: "mz\tintensity" — interpreted as a single MS² spectrum
  //  - Three-col text: "rt\tmz\tintensity" — interpreted as chromatogram + spectra
  //
  // Returns a Promise<data> for uniform handling.
  function parseLCMS(text) {
    text = text.replace(/\r/g, '');
    if (/<\s*(?:indexedmzML|mzML)/i.test(text.slice(0, 4000))) return parseMzML(text);
    if (/BEGIN IONS/i.test(text)) return Promise.resolve(parseMGF(text));
    const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    const sample = lines.find(l => l.includes('\t') || /\s+/.test(l.trim())) || '';
    const cols = sample.split(/[\t,;\s]+/).length;
    if (cols >= 3) return Promise.resolve(parseChromTriplets(lines));
    return Promise.resolve(parseSpectrumText(lines));
  }

  // ---------- mzML ----------
  async function parseMzML(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    const err = doc.querySelector('parsererror');
    if (err) throw new Error('mzML XML parse error');

    const spectrumNodes = [...doc.getElementsByTagName('spectrum')];
    if (!spectrumNodes.length) throw new Error('No <spectrum> elements found');

    const allSpectra = [];
    // Cap parsing at 1000 spectra to keep browser responsive
    const MAX = 1000;
    const limit = Math.min(spectrumNodes.length, MAX);
    for (let i = 0; i < limit; i++) {
      const spec = await parseMzMLSpectrum(spectrumNodes[i]);
      if (spec) allSpectra.push(spec);
    }

    // Separate MS¹ and MS² for chromatogram (use MS¹ for TIC if available, else everything)
    const ms2 = allSpectra.filter(s => s.msLevel === 2);
    const ms1 = allSpectra.filter(s => s.msLevel === 1);
    // Active spectrum: highest-TIC MS² if any, else most-intense overall
    const candidatePool = ms2.length ? ms2 : allSpectra;
    candidatePool.sort((a, b) => sumArr(b.intensity) - sumArr(a.intensity));
    const ordered = [...candidatePool, ...allSpectra.filter(s => !candidatePool.includes(s))];

    // Build chromatogram: prefer dedicated <chromatogram> element if present
    let chromatogram = parseMzMLChromatogram(doc);
    if (!chromatogram) {
      // Synthesize TIC from MS¹ spectra (or MS² if no MS¹)
      const source = ms1.length ? ms1 : allSpectra;
      const pts = source
        .filter(s => s.rt != null)
        .map(s => ({ rt: s.rt / 60, intensity: sumArr(s.intensity) }))
        .sort((a, b) => a.rt - b.rt);
      if (pts.length > 1) {
        chromatogram = { rt: pts.map(p => p.rt), intensity: pts.map(p => p.intensity) };
      }
    }

    return {
      spectra: ordered,
      activeIdx: 0,
      chromatogram,
      annotations: [],
      _stats: {
        total: spectrumNodes.length,
        parsed: limit,
        ms1: ms1.length,
        ms2: ms2.length,
        truncated: spectrumNodes.length > MAX
      }
    };
  }

  async function parseMzMLSpectrum(specEl) {
    let msLevel = null, rt = null, precursorMz = null, charge = null, title = '';
    title = specEl.getAttribute('id') || '';
    // cvParams at the spectrum level
    specEl.querySelectorAll(':scope > cvParam').forEach(cv => {
      const acc = cv.getAttribute('accession');
      if (acc === 'MS:1000511') msLevel = parseInt(cv.getAttribute('value'));
      if (acc === 'MS:1000285') {/* TIC, not needed here */}
    });
    // scan start time
    const scanCv = specEl.querySelector('scan cvParam[accession="MS:1000016"]');
    if (scanCv) {
      const v = parseFloat(scanCv.getAttribute('value'));
      const unit = scanCv.getAttribute('unitName') || scanCv.getAttribute('unitAccession') || '';
      // unit "minute" → convert to seconds for our internal representation
      if (/minute|UO:0000031/i.test(unit)) rt = v * 60;
      else rt = v; // seconds (MS:1000016 typically minutes, but UO:0000010 = second)
    }
    // precursor
    const precCv = specEl.querySelector('precursor selectedIon cvParam[accession="MS:1000744"], precursor selectedIon cvParam[accession="MS:1000040"]');
    if (precCv) precursorMz = parseFloat(precCv.getAttribute('value'));
    const chCv = specEl.querySelector('precursor selectedIon cvParam[accession="MS:1000041"]');
    if (chCv) charge = chCv.getAttribute('value') + '+';

    // Binary data arrays
    const arrays = [...specEl.querySelectorAll('binaryDataArray')];
    let mz = [], intensity = [];
    for (const ba of arrays) {
      const isMz = ba.querySelector('cvParam[accession="MS:1000514"]');
      const isInt = ba.querySelector('cvParam[accession="MS:1000515"]');
      if (!isMz && !isInt) continue;
      const arr = await decodeBinaryDataArray(ba);
      if (!arr) continue;
      if (isMz) mz = arr;
      else if (isInt) intensity = arr;
    }
    if (!mz.length || mz.length !== intensity.length) return null;

    return { mz: Array.from(mz), intensity: Array.from(intensity), title, msLevel, rt, precursorMz, charge };
  }

  async function decodeBinaryDataArray(ba) {
    const binEl = ba.querySelector('binary');
    if (!binEl || !binEl.textContent.trim()) return new Float32Array(0);
    const b64 = binEl.textContent.trim();
    let bytes = base64ToBytes(b64);
    // Detect compression
    const isZlib = ba.querySelector('cvParam[accession="MS:1000574"]'); // zlib compression
    const isNoComp = ba.querySelector('cvParam[accession="MS:1000576"]'); // no compression
    if (isZlib && !isNoComp) {
      try {
        bytes = await zlibInflate(bytes);
      } catch (e) {
        // try raw deflate as fallback
        try { bytes = await zlibInflate(bytes, 'deflate-raw'); }
        catch { return null; }
      }
    }
    // Detect precision
    const is64 = ba.querySelector('cvParam[accession="MS:1000523"]'); // 64-bit float
    const is32 = ba.querySelector('cvParam[accession="MS:1000521"]'); // 32-bit float
    let view;
    if (is64) view = new Float64Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 8));
    else view = new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
    // Float64Array/Float32Array uses native (little-endian on all common platforms; mzML spec is LE)
    return view;
  }

  function parseMzMLChromatogram(doc) {
    const c = doc.querySelector('chromatogram');
    if (!c) return null;
    // pull TIC chromatogram specifically if present
    const all = [...doc.getElementsByTagName('chromatogram')];
    const tic = all.find(ch => ch.querySelector('cvParam[accession="MS:1000235"]')) || all[0];
    if (!tic) return null;
    const arrays = [...tic.querySelectorAll('binaryDataArray')];
    let rt = null, intensity = null;
    // Synchronous fallback won't work — but this function is called outside async,
    // so we just return null and let the caller synthesize the TIC from spectra.
    // (proper async chromatogram parsing kept out for simplicity)
    return null;
  }

  function sumArr(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; }

  // ---------- base64 + zlib helpers ----------
  function base64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function zlibInflate(bytes, format) {
    format = format || 'deflate';
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('DecompressionStream not supported');
    }
    const ds = new DecompressionStream(format);
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  }

  function parseMGF(text) {
    const spectra = [];
    const blocks = text.split(/BEGIN IONS/i).slice(1);
    blocks.forEach(b => {
      const end = b.indexOf('END IONS');
      const body = end >= 0 ? b.slice(0, end) : b;
      const lines = body.split('\n').map(s => s.trim()).filter(Boolean);
      const spec = { mz: [], intensity: [], title: '', precursorMz: null, charge: null, rt: null };
      lines.forEach(ln => {
        const m = ln.match(/^([A-Z]+)=(.*)$/i);
        if (m) {
          const k = m[1].toUpperCase(), v = m[2].trim();
          if (k === 'TITLE') spec.title = v;
          else if (k === 'PEPMASS') spec.precursorMz = parseFloat(v.split(/\s+/)[0]);
          else if (k === 'CHARGE') spec.charge = v;
          else if (k === 'RTINSECONDS' || k === 'RT') spec.rt = parseFloat(v);
        } else {
          const parts = ln.split(/[\t,;\s]+/);
          const mz = parseFloat(parts[0]), it = parseFloat(parts[1]);
          if (!isNaN(mz) && !isNaN(it)) { spec.mz.push(mz); spec.intensity.push(it); }
        }
      });
      if (spec.mz.length) spectra.push(spec);
    });
    return packageSpectra(spectra);
  }

  function parseSpectrumText(lines) {
    const mz = [], intensity = [];
    lines.forEach(ln => {
      const parts = ln.trim().split(/[\t,;\s]+/);
      const a = parseFloat(parts[0]), b = parseFloat(parts[1]);
      if (!isNaN(a) && !isNaN(b)) { mz.push(a); intensity.push(b); }
    });
    return packageSpectra([{ mz, intensity, title: 'MS² spectrum', precursorMz: null, charge: null, rt: null }]);
  }

  function parseChromTriplets(lines) {
    // 3 cols: rt, mz, intensity — treat as a sparse LC-MS map
    const points = [];
    lines.forEach(ln => {
      const parts = ln.trim().split(/[\t,;\s]+/);
      const rt = parseFloat(parts[0]), mz = parseFloat(parts[1]), it = parseFloat(parts[2]);
      if (!isNaN(rt) && !isNaN(mz) && !isNaN(it)) points.push({ rt, mz, intensity: it });
    });
    // Group by rt to build TIC
    const rtBins = new Map();
    points.forEach(p => {
      rtBins.set(p.rt, (rtBins.get(p.rt) || 0) + p.intensity);
    });
    const rts = [...rtBins.keys()].sort((a, b) => a - b);
    const ticInt = rts.map(r => rtBins.get(r));
    // Take peak RT and build a "spectrum" from points within ±0.5 of peak RT
    const peakIdx = ticInt.indexOf(Math.max(...ticInt));
    const peakRT = rts[peakIdx];
    const peakPoints = points.filter(p => Math.abs(p.rt - peakRT) < 0.5);
    const spec = {
      mz: peakPoints.map(p => p.mz),
      intensity: peakPoints.map(p => p.intensity),
      title: 'Peak at RT ' + peakRT.toFixed(2),
      precursorMz: null, charge: null, rt: peakRT
    };
    const pkg = packageSpectra([spec]);
    pkg.chromatogram = { rt: rts, intensity: ticInt };
    return pkg;
  }

  function packageSpectra(spectra) {
    return {
      spectra,
      activeIdx: 0,
      chromatogram: spectraToChromatogram(spectra),
      annotations: []  // user-added fragment labels {mz, label, delta?}
    };
  }
  function spectraToChromatogram(spectra) {
    if (!spectra.length || spectra.every(s => s.rt == null)) return null;
    const pts = spectra.filter(s => s.rt != null).map(s => ({
      rt: s.rt / 60, // sec → min for display
      intensity: s.intensity.reduce((a, b) => a + b, 0)
    }));
    if (!pts.length) return null;
    pts.sort((a, b) => a.rt - b.rt);
    return { rt: pts.map(p => p.rt), intensity: pts.map(p => p.intensity) };
  }

  // ---------- Synthetic sample (progesterone LC-MS/MS) ----------
  function sampleProgesterone() {
    // Realistic-ish synthetic MS² of progesterone [M+H]+ = 315.2319
    const ms2 = {
      title: 'Progesterone [M+H]⁺ MS²',
      precursorMz: 315.2319,
      charge: '1+',
      rt: 492, // 8.2 min × 60
      msLevel: 2,
      mz:        [55.018, 67.054, 77.039, 79.054, 91.054, 97.065, 109.065, 123.080, 135.117, 159.117, 161.132, 173.132, 189.127, 227.181, 245.191, 273.222, 297.221, 315.232],
      intensity: [ 8.4,    12.3,   6.2,   14.1,   18.7,   22.3,   100.0,   19.6,    24.8,    11.4,    16.0,    8.2,     9.5,     14.7,    18.3,    32.1,    62.5,    35.6]
    };
    const annotations = [
      { mz: 315.232, label: '[M+H]⁺' },
      { mz: 297.221, label: '−H₂O' },
      { mz: 273.222, label: 'C₁₉H₂₉O⁺' },
      { mz: 109.065, label: 'A-ring' },
      { mz: 97.065,  label: 'C₆H₉O⁺' }
    ];

    // Synthetic MS¹ scans across the LC run (≈ 80 scans), each containing
    // the progesterone isotope envelope at its peak intensity, plus background masses
    const ms1Scans = [];
    for (let rtMin = 5; rtMin <= 11; rtMin += 0.075) {
      const progesteroneIntensity = 1e6 * Math.exp(-Math.pow((rtMin - 8.2) / 0.18, 2));
      const peak2Intensity = 2.5e5 * Math.exp(-Math.pow((rtMin - 7.4) / 0.22, 2));
      const mz = [], intensity = [];
      // Progesterone isotope envelope (C21H30O2, M+H+ = 315.232)
      [
        [315.2319, 1.00],   // M
        [316.2353, 0.234],  // M+1 (21 carbons × ~1.1%)
        [317.2386, 0.027],  // M+2
        [318.2419, 0.002]
      ].forEach(([m, frac]) => {
        const i = progesteroneIntensity * frac + Math.random() * 1500;
        if (i > 1000) { mz.push(m); intensity.push(i); }
      });
      // Second compound at RT 7.4 (e.g., a related steroid)
      [
        [285.221, 1.00],
        [286.224, 0.21]
      ].forEach(([m, frac]) => {
        const i = peak2Intensity * frac + Math.random() * 1500;
        if (i > 1000) { mz.push(m); intensity.push(i); }
      });
      // Background masses (random across whole run)
      [121.05, 145.08, 178.11, 244.20, 401.36, 549.49].forEach(m => {
        const i = 1.5e4 + Math.random() * 2.5e4;
        mz.push(m); intensity.push(i);
      });
      ms1Scans.push({
        title: 'MS¹ ' + rtMin.toFixed(2) + ' min',
        msLevel: 1,
        rt: rtMin * 60,
        precursorMz: null, charge: null,
        mz, intensity
      });
    }

    // Reference spectrum (e.g., from MassBank for progesterone)
    const reference = {
      mz:        [67.054, 77.039, 91.054, 97.065, 109.065, 121.080, 135.117, 159.117, 173.132, 191.143, 227.181, 245.191, 273.222, 297.221, 315.232],
      intensity: [10.0,   5.0,    14.5,   17.8,   100.0,   12.0,    21.0,    9.5,     7.0,     8.5,     12.3,    16.0,    28.5,    58.0,    32.0]
    };

    return {
      spectra: [ms2, ...ms1Scans],
      activeIdx: 0,
      chromatogram: null, // computed on demand
      annotations,
      reference,
      _stats: { total: ms1Scans.length + 1, parsed: ms1Scans.length + 1, ms1: ms1Scans.length, ms2: 1, truncated: false }
    };
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
    out = out.replace(/\bK_d\b/g, '<tspan font-style="italic">K</tspan><tspan font-style="italic" baseline-shift="sub" font-size="0.78em">d</tspan>');
    out = out.replace(/Δ_([A-Z])/g, '&#916;<tspan font-style="italic">$1</tspan>');
    return out;
  }

  // ---------- Renderer (dispatcher) ----------
  function renderLCMS(data, opts) {
    opts = opts || {};
    const plotType = opts.plotType || 'overview';
    if (plotType === 'mirror')   return renderMirror(data, opts);
    if (plotType === 'map')      return renderMap(data, opts);
    if (plotType === 'ms1')      return renderSingle(data, opts, 'ms1');
    if (plotType === 'ms2')      return renderSingle(data, opts, 'ms2');
    if (plotType === 'masserror') return renderMassError(data, opts);
    return renderOverview(data, opts);
  }

  // ---------- Common metric helpers ----------
  function buildChromatogram(spectra, mode, xicMz, xicTol, xicTolMode) {
    // mode = 'tic' | 'bpc' | 'xic'
    // xicTolMode = 'da' (xicTol = Daltons) or 'ppm' (xicTol = parts-per-million)
    const ms1 = spectra.filter(s => s.msLevel === 1 || s.msLevel == null);
    const pool = ms1.length ? ms1 : spectra;
    const pts = pool
      .filter(s => s.rt != null)
      .map(s => {
        let val = 0;
        if (mode === 'tic') {
          for (let i = 0; i < s.intensity.length; i++) val += s.intensity[i];
        } else if (mode === 'bpc') {
          for (let i = 0; i < s.intensity.length; i++) if (s.intensity[i] > val) val = s.intensity[i];
        } else if (mode === 'xic') {
          // Compute window in Da based on tolerance mode
          const window = (xicTolMode === 'ppm') ? (xicMz * xicTol / 1e6) : xicTol;
          const lo = xicMz - window, hi = xicMz + window;
          for (let i = 0; i < s.mz.length; i++) {
            if (s.mz[i] >= lo && s.mz[i] <= hi) val += s.intensity[i];
          }
        }
        return { rt: s.rt / 60, intensity: val };
      })
      .sort((a, b) => a.rt - b.rt);
    if (!pts.length) return null;
    return { rt: pts.map(p => p.rt), intensity: pts.map(p => p.intensity) };
  }

  // ---------- Renderer: overview (chromatogram + MS¹ + MS²) ----------
  function renderOverview(data, opts) {
    opts = opts || {};
    const W = opts.width || 720;
    const H = opts.height || 700;
    const chromMode = opts.chromMode || 'tic';
    const xicMz = opts.xicMz ?? null;
    const xicTol = opts.xicTol ?? 0.02;
    const xicTolMode = opts.xicTolMode || 'ppm';
    const xicPpm = opts.xicPpm ?? 10;
    // RT view window (zoom)
    const rtViewMin = opts.rtViewMin ?? null;
    const rtViewMax = opts.rtViewMax ?? null;
    let chrom = null;
    if (data.spectra.length > 1) {
      const tol = xicTolMode === 'ppm' ? xicPpm : xicTol;
      const xicMzNum = parseFloat(xicMz);
      if (chromMode === 'xic' && (isNaN(xicMzNum) || xicMzNum <= 0)) {
        chrom = buildChromatogram(data.spectra, 'tic');
      } else {
        chrom = buildChromatogram(data.spectra, chromMode, xicMzNum, tol, xicTolMode);
      }
    } else {
      chrom = data.chromatogram;
    }
    // Apply RT view window if set
    if (chrom && rtViewMin != null && rtViewMax != null && rtViewMax > rtViewMin) {
      const rt = [], intensity = [];
      for (let i = 0; i < chrom.rt.length; i++) {
        if (chrom.rt[i] >= rtViewMin && chrom.rt[i] <= rtViewMax) {
          rt.push(chrom.rt[i]); intensity.push(chrom.intensity[i]);
        }
      }
      if (rt.length >= 2) chrom = { rt, intensity };
    }
    const showChrom = (opts.showChrom ?? true) && chrom && chrom.rt.length > 0;
    const fontFamily = opts.fontFamily || "Arial, 'Helvetica Neue', Helvetica, sans-serif";
    const titleSize = opts.titleSize ?? 14;
    const labelSize = opts.labelSize ?? 12;
    const tickSize = opts.tickSize ?? 10;
    const lineWidth = opts.lineWidth ?? 0.8;
    const stickWidth = opts.stickWidth ?? 1.2;
    const stickColor = opts.stickColor || '#000000';
    const annoStickColor = opts.annoStickColor || '#c1121f';
    const tickDir = opts.tickDir || 'out';
    const spineStyle = opts.spineStyle || 'box';
    const borderWidth = opts.borderWidth ?? 0.8;
    const annoFontSize = opts.annoFontSize ?? 10;
    const annoTopN = opts.annoTopN ?? 6;
    const showAnnotations = opts.showAnnotations ?? true;
    const showPrecursorMarker = opts.showPrecursorMarker ?? true;
    const intensityMode = opts.intensityMode || 'relative';
    const title = opts.title ?? '';

    // Determine which spectra to show in MS¹ and MS² panels
    const active = data.spectra[data.activeIdx];
    let ms1Spec = null, ms2Spec = null;
    if (active) {
      if (active.msLevel === 2) {
        ms2Spec = active;
        // Find nearest MS¹ by RT
        const ms1List = data.spectra.filter(s => s.msLevel === 1 && s.rt != null);
        if (ms1List.length && active.rt != null) {
          ms1List.sort((a, b) => Math.abs(a.rt - active.rt) - Math.abs(b.rt - active.rt));
          ms1Spec = ms1List[0];
        }
      } else {
        // Active is MS¹ (or unspecified — treat as MS¹)
        ms1Spec = active;
        // Find an MS² within ±10s of this RT (DDA-style association)
        if (active.rt != null) {
          const candidates = data.spectra.filter(s => s.msLevel === 2 && s.rt != null && Math.abs(s.rt - active.rt) <= 10);
          if (candidates.length) {
            candidates.sort((a, b) => Math.abs(a.rt - active.rt) - Math.abs(b.rt - active.rt));
            ms2Spec = candidates[0];
          }
        }
      }
    }

    // Layout: title, then up to 3 stacked panels (chrom, MS¹, MS²)
    const titleH = title ? titleSize + 4 : 0;
    const margin = { left: Math.max(50, labelSize * 4.0), right: 14, top: titleH + labelSize + tickSize + 8, bottom: labelSize + tickSize + 12 };
    const innerH = H - margin.top - margin.bottom;
    const gap = 24;
    // Three rows: chrom (30%), MS¹ (35%), MS² (35%) — if all three present
    // If no chromatogram: split between MS¹ (50%) and MS² (50%)
    // If only one MS panel: that takes all
    let topH = 0, midH = 0, botH = 0;
    if (showChrom) {
      // Equal split: chromatogram, MS¹, MS² each take one third of the available height.
      const total = innerH - gap * 2;
      topH = total / 3;
      midH = total / 3;
      botH = total / 3;
    } else if (ms1Spec && ms2Spec) {
      const total = innerH - gap;
      midH = total * 0.5; botH = total * 0.5;
    } else if (ms1Spec) {
      midH = innerH;
    } else if (ms2Spec) {
      botH = innerH;
    }
    const plotW = W - margin.left - margin.right;

    const topX = margin.left, topY = margin.top;
    const midX = margin.left, midY = topY + topH + (showChrom && (ms1Spec || ms2Spec) ? gap : 0);
    const botX = margin.left, botY = midY + midH + (ms1Spec && ms2Spec ? gap : 0);

    const parts = [];
    const chromAttrs = showChrom
      ? ` data-chrom-x="${topX}" data-chrom-y="${topY}" data-chrom-w="${plotW}" data-chrom-h="${topH}" data-chrom-rtmin="${chrom.rt[0]}" data-chrom-rtmax="${chrom.rt[chrom.rt.length-1]}"`
      : '';
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${fontFamily}"${chromAttrs}>`);
    parts.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);

    if (title) parts.push(`<text x="${W/2}" y="${titleSize + 4}" text-anchor="middle" font-size="${titleSize}" fill="#000">${escapeXml(title)}</text>`);

    // ----- Chromatogram -----
    if (showChrom && topH > 0) {
      const c = chrom;
      const xMin = c.rt[0], xMax = c.rt[c.rt.length - 1];
      const yMax_ = Math.max(...c.intensity) * 1.05;
      const yMin = 0;
      const xTicks = niceTicks(xMin, xMax, 6);
      // Use fewer ticks (3) on the chromatogram y-axis so the panel stays compact
      // and tick spacing aligns visually with the MS¹/MS² panels below.
      const yTicks = niceTicks(yMin, yMax_, 3);
      // Compute a y-axis exponent so ticks display as small numbers and the
      // factor ×10ⁿ is shown once above the axis (engineering-style).
      const yPeak = yTicks[yTicks.length - 1];
      let yExp = 0;
      if (yPeak >= 1e3) yExp = Math.floor(Math.log10(yPeak));
      const yScale = Math.pow(10, yExp);
      const yExpLabel = yExp >= 3 ? ('×10' + supDigits(yExp)) : '';
      function sxC(v) { return topX + (v - xMin) / (xMax - xMin) * plotW; }
      function syC(v) { return topY + topH - (v - yMin) / (yMax_ - yMin) * topH; }
      let d = '';
      for (let i = 0; i < c.rt.length; i++) {
        d += (i === 0 ? 'M' : 'L') + sxC(c.rt[i]).toFixed(2) + ',' + syC(c.intensity[i]).toFixed(2) + ' ';
      }
      parts.push(`<path d="${d}" fill="none" stroke="#000" stroke-width="${lineWidth}" stroke-linejoin="round"/>`);

      // Active scan markers
      if (ms1Spec && ms1Spec.rt != null) {
        const x = sxC(ms1Spec.rt / 60);
        if (x >= topX && x <= topX + plotW) {
          parts.push(`<line x1="${x}" y1="${topY}" x2="${x}" y2="${topY + topH}" stroke="${annoStickColor}" stroke-width="0.8" stroke-dasharray="3,2"/>`);
          parts.push(`<text x="${x + 4}" y="${topY + 12}" font-size="${tickSize}" fill="${annoStickColor}">RT ${(ms1Spec.rt/60).toFixed(2)} min</text>`);
        }
      }
      drawAxes(parts, {
        x: topX, y: topY, w: plotW, h: topH,
        xMin: xTicks[0] < xMin ? xTicks[0] : xMin,
        xMax: xTicks[xTicks.length-1] > xMax ? xTicks[xTicks.length-1] : xMax,
        yMin, yMax: yTicks[yTicks.length-1] > yMax_ ? yTicks[yTicks.length-1] : yMax_,
        xTicks, yTicks, xStep: xTicks[1]-xTicks[0], yStep: yTicks[1]-yTicks[0],
        xLabel: opts.xlabChrom || 'Retention time (min)',
        yLabel: chromLabel(chromMode, xicMz, opts.ylabChrom, xicTolMode, xicTolMode === 'ppm' ? xicPpm : xicTol),
        labelSize, tickSize, tickDir, spineStyle, borderWidth,
        leftLabelOffset: margin.left - 28,
        exponentLabel: yExpLabel,
        yTickFmt: (v) => {
          if (v === 0) return '0';
          if (yExp === 0) return formatTick(v, yTicks[1] - yTicks[0]);
          const scaled = v / yScale;
          // Show as integer if the scaled value is a clean integer, else 1 decimal
          if (Math.abs(scaled - Math.round(scaled)) < 0.05) return String(Math.round(scaled));
          return scaled.toFixed(1);
        }
      });
    }

    // Compute m/z ranges for MS¹ and MS² panels based on user settings
    function resolveMzRange(spec, mode, min, max, focusMz, focusWindow) {
      if (!spec) return null;
      if (mode === 'manual' && min != null && max != null && max > min) return [min, max];
      if (mode === 'focus' && focusMz != null) {
        const w = focusWindow ?? 5;
        return [focusMz - w, focusMz + w];
      }
      // auto
      return null;
    }
    const ms1Range = resolveMzRange(ms1Spec, opts.ms1RangeMode || 'auto', opts.ms1Min, opts.ms1Max, xicMz, opts.ms1FocusWindow);
    const ms2Range = resolveMzRange(ms2Spec, opts.ms2RangeMode || 'auto', opts.ms2Min, opts.ms2Max, xicMz, opts.ms2FocusWindow);

    // ----- MS¹ panel -----
    if (ms1Spec && midH > 0) {
      renderSpectrumIntoPanel(parts, {
        spec: ms1Spec, annotations: data.annotations || [],
        X: midX, Y: midY, W: plotW, H: midH,
        stickColor, annoStickColor, stickWidth, annoFontSize, annoTopN,
        showAnnotations, intensityMode,
        labelSize, tickSize, tickDir, spineStyle, borderWidth,
        leftLabelOffset: margin.left - 28,
        xLabel: 'm/z', yLabel: intensityMode === 'relative' ? 'Rel. int. (%) — MS¹' : 'Intensity — MS¹',
        showPrecursorMarker: false,
        xRange: ms1Range,
        xicMarker: (chromMode === 'xic' && xicMz != null) ? { mz: xicMz, color: annoStickColor, tol: xicTolMode === 'ppm' ? (xicMz * xicPpm / 1e6) : xicTol } : null
      });
    } else if (!ms1Spec && showChrom) {
      if (midH > 0) drawEmptyPanel(parts, midX, midY, plotW, midH, 'No MS¹ scan at this RT', fontFamily, labelSize, borderWidth, spineStyle);
    }

    // ----- MS² panel -----
    if (ms2Spec && botH > 0) {
      renderSpectrumIntoPanel(parts, {
        spec: ms2Spec, annotations: data.annotations || [],
        X: botX, Y: botY, W: plotW, H: botH,
        stickColor, annoStickColor, stickWidth, annoFontSize, annoTopN,
        showAnnotations, intensityMode,
        labelSize, tickSize, tickDir, spineStyle, borderWidth,
        leftLabelOffset: margin.left - 28,
        xLabel: 'm/z', yLabel: intensityMode === 'relative' ? 'Rel. int. (%) — MS²' : 'Intensity — MS²',
        showPrecursorMarker, precursorColor: annoStickColor,
        xRange: ms2Range
      });
    } else if (botH > 0) {
      drawEmptyPanel(parts, botX, botY, plotW, botH, 'No MS² spectrum at this RT', fontFamily, labelSize, borderWidth, spineStyle);
    }

    parts.push(`</svg>`);
    return parts.join('');
  }

  function drawEmptyPanel(parts, X, Y, W, H, msg, fontFamily, labelSize, borderWidth, spineStyle) {
    // No border drawn — just centered placeholder text. Keeps the figure clean
    // when a panel has no data (e.g. no MS² at this RT).
    parts.push(`<text x="${X + W/2}" y="${Y + H/2}" text-anchor="middle" font-size="${labelSize}" fill="#b0b0ab" font-family="${fontFamily}">${escapeXml(msg)}</text>`);
  }

  function renderSpectrumIntoPanel(parts, c) {
    const { spec, annotations, X, Y, W, H, stickColor, annoStickColor, stickWidth,
            annoFontSize, annoTopN, showAnnotations, intensityMode,
            labelSize, tickSize, tickDir, spineStyle, borderWidth, leftLabelOffset,
            xLabel, yLabel, showPrecursorMarker, precursorColor, xRange, xicMarker } = c;
    if (!spec || !spec.mz.length) {
      drawEmptyPanel(parts, X, Y, W, H, 'No peaks', "'Helvetica Neue', sans-serif", labelSize, borderWidth, spineStyle);
      return;
    }
    let xMin, xMax;
    if (xRange) {
      xMin = xRange[0]; xMax = xRange[1];
    } else {
      xMin = Math.min(...spec.mz) - 10;
      xMax = (spec.precursorMz ? Math.max(spec.precursorMz, ...spec.mz) : Math.max(...spec.mz)) + 10;
    }
    // Compute intensity only from peaks IN the visible range for proper scaling
    const inRange = spec.mz.map((mz, i) => ({ mz, intensity: spec.intensity[i] })).filter(p => p.mz >= xMin && p.mz <= xMax);
    const maxI = Math.max(...inRange.map(p => p.intensity), 1);
    const yMax = intensityMode === 'relative' ? 105 : maxI * 1.1;
    const renderInt = (v) => intensityMode === 'relative' ? (v / maxI) * 100 : v;
    function sx(v) { return X + (v - xMin) / (xMax - xMin) * W; }
    function sy(v) { return Y + H - renderInt(v) / yMax * H; }

    // XIC marker — band ± tolerance + center line, drawn BEHIND sticks
    if (xicMarker && xicMarker.mz >= xMin && xicMarker.mz <= xMax) {
      const xc = sx(xicMarker.mz);
      const xL = sx(xicMarker.mz - xicMarker.tol);
      const xR = sx(xicMarker.mz + xicMarker.tol);
      // Tolerance band (translucent)
      parts.push(`<rect x="${Math.max(X, xL).toFixed(2)}" y="${Y}" width="${(Math.min(X+W, xR) - Math.max(X, xL)).toFixed(2)}" height="${H}" fill="${xicMarker.color}" opacity="0.08"/>`);
      // Center line
      parts.push(`<line x1="${xc.toFixed(2)}" y1="${Y}" x2="${xc.toFixed(2)}" y2="${Y + H}" stroke="${xicMarker.color}" stroke-width="0.6" stroke-dasharray="3,2" opacity="0.7"/>`);
      // Label at top
      parts.push(`<text x="${xc.toFixed(2)}" y="${(Y + 12).toFixed(2)}" text-anchor="middle" font-size="${annoFontSize}" fill="${xicMarker.color}">XIC ${xicMarker.mz.toFixed(4)}</text>`);
    }

    inRange.forEach(p => {
      const x = sx(p.mz);
      const y0 = Y + H, y1 = sy(p.intensity);
      const ann = showAnnotations && (annotations || []).some(a => Math.abs(a.mz - p.mz) < 0.02);
      parts.push(`<line x1="${x.toFixed(2)}" y1="${y0.toFixed(2)}" x2="${x.toFixed(2)}" y2="${y1.toFixed(2)}" stroke="${ann ? annoStickColor : stickColor}" stroke-width="${stickWidth}"/>`);
    });

    if (showAnnotations) {
      const top = [...inRange].sort((a, b) => b.intensity - a.intensity).slice(0, annoTopN);
      // Greedy non-overlapping label placement: process by intensity desc,
      // skip any label whose bounding box collides with a previously-placed one.
      const placed = []; // {x1,y1,x2,y2}
      const labelCharW = annoFontSize * 0.55; // approx average char width for sans-serif
      const labelH = annoFontSize + 2;
      const padX = 2, padY = 1;
      function collides(box) {
        for (let i = 0; i < placed.length; i++) {
          const p = placed[i];
          if (!(box.x2 < p.x1 || box.x1 > p.x2 || box.y2 < p.y1 || box.y1 > p.y2)) return true;
        }
        return false;
      }
      top.forEach(p => {
        const x = sx(p.mz);
        const yPeakTop = sy(p.intensity);
        const a = (annotations || []).find(z => Math.abs(z.mz - p.mz) < 0.02);
        const mzText = p.mz.toFixed(p.mz < 100 ? 4 : 3);
        const mzW = mzText.length * labelCharW;
        // m/z label sits 4px above peak top
        const mzBox = {
          x1: x - mzW/2 - padX, x2: x + mzW/2 + padX,
          y1: yPeakTop - 4 - labelH - padY, y2: yPeakTop - 4 + padY
        };
        // Allow placing m/z label, but skip if it would collide
        if (collides(mzBox)) return;
        placed.push(mzBox);
        parts.push(`<text x="${x.toFixed(2)}" y="${(yPeakTop - 4).toFixed(2)}" text-anchor="middle" font-size="${annoFontSize}" fill="#000">${mzText}</text>`);
        if (a) {
          const annText = a.label;
          const annW = annText.length * labelCharW;
          const annBox = {
            x1: x - annW/2 - padX, x2: x + annW/2 + padX,
            y1: yPeakTop - 4 - labelH - annFontH() - padY, y2: yPeakTop - 4 - labelH + padY
          };
          if (collides(annBox)) return;
          placed.push(annBox);
          parts.push(`<text x="${x.toFixed(2)}" y="${(yPeakTop - 4 - annoFontSize - 1).toFixed(2)}" text-anchor="middle" font-size="${annoFontSize}" font-weight="bold" fill="${annoStickColor}">${escapeXml(annText)}</text>`);
        }
      });
      function annFontH() { return annoFontSize + 2; }
    }

    if (showPrecursorMarker && spec.precursorMz != null) {
      const xp = sx(spec.precursorMz);
      if (xp >= X - 1 && xp <= X + W + 1) {
        parts.push(`<line x1="${xp.toFixed(2)}" y1="${Y}" x2="${xp.toFixed(2)}" y2="${Y + H}" stroke="${precursorColor || annoStickColor}" stroke-width="0.5" stroke-dasharray="2,2" opacity="0.5"/>`);
        parts.push(`<text x="${xp.toFixed(2)}" y="${Y + 12}" text-anchor="middle" font-size="${tickSize}" fill="${precursorColor || annoStickColor}">precursor ${spec.precursorMz.toFixed(3)}${spec.charge ? ' ('+spec.charge+')' : ''}</text>`);
      }
    }

    const xTicks = niceTicks(xMin, xMax, 8);
    const yTicks = niceTicks(0, yMax, 5);
    drawAxes(parts, {
      x: X, y: Y, w: W, h: H,
      xMin, xMax, yMin: 0, yMax,
      xTicks, yTicks, xStep: xTicks[1]-xTicks[0], yStep: yTicks[1]-yTicks[0],
      xLabel, yLabel,
      labelSize, tickSize, tickDir, spineStyle, borderWidth,
      leftLabelOffset,
      yTickFmt: (v, s) => intensityMode === 'relative' ? formatTick(v, s) : (Math.abs(v) >= 1e3 ? (v/1e3).toFixed(0) + 'k' : formatTick(v, s))
    });
  }

  function chromLabel(mode, mz, fallback, tolMode, tolValue) {
    if (mode === 'tic') return 'TIC intensity';
    if (mode === 'bpc') return 'Base peak intensity';
    if (mode === 'xic') {
      const m = mz != null ? mz.toFixed(4) : '?';
      const tol = tolMode === 'ppm' ? '±' + (tolValue ?? 10).toFixed(0) + ' ppm' : '±' + (tolValue ?? 0.02).toFixed(3) + ' Da';
      return 'XIC ' + m + ' ' + tol;
    }
    return fallback || 'Intensity';
  }

  // ---------- Renderer: single MS¹ or MS² spectrum (full canvas) ----------
  function renderSingle(data, opts, kind) {
    opts = opts || {};
    const W = opts.width || 720;
    const H = opts.height || 480;
    const fontFamily = opts.fontFamily || "Arial, 'Helvetica Neue', Helvetica, sans-serif";
    const titleSize = opts.titleSize ?? 14;
    const labelSize = opts.labelSize ?? 12;
    const tickSize = opts.tickSize ?? 10;
    const stickWidth = opts.stickWidth ?? 1.2;
    const stickColor = opts.stickColor || '#000000';
    const annoStickColor = opts.annoStickColor || '#c1121f';
    const tickDir = opts.tickDir || 'out';
    const spineStyle = opts.spineStyle || 'box';
    const borderWidth = opts.borderWidth ?? 0.8;
    const annoFontSize = opts.annoFontSize ?? 10;
    const annoTopN = opts.annoTopN ?? 6;
    const showAnnotations = opts.showAnnotations ?? true;
    const intensityMode = opts.intensityMode || 'relative';
    const isotopeBracket = opts.isotopeBracket ?? null; // {center, width} for isotope zoom
    const title = opts.title ?? '';

    // Pick spectrum: ms1 wants MS¹, ms2 wants MS²
    let spec = null;
    const active = data.spectra[data.activeIdx];
    if (kind === 'ms1') {
      // Try to find an MS¹ near the active MS²'s RT
      const ms1 = data.spectra.filter(s => s.msLevel === 1);
      if (ms1.length && active) {
        ms1.sort((a, b) => Math.abs((a.rt ?? 0) - (active.rt ?? 0)) - Math.abs((b.rt ?? 0) - (active.rt ?? 0)));
        spec = ms1[0];
      } else if (ms1.length) {
        ms1.sort((a, b) => sumArr(b.intensity) - sumArr(a.intensity));
        spec = ms1[0];
      }
      if (!spec) return emptyMessage(W, H, 'No MS¹ spectrum in this dataset', fontFamily);
    } else {
      spec = active;
      if (!spec || (kind === 'ms2' && active.msLevel === 1)) {
        // No MS² active — try to find one
        const ms2 = data.spectra.filter(s => s.msLevel === 2);
        if (ms2.length && active && active.rt != null) {
          ms2.sort((a, b) => Math.abs((a.rt ?? 0) - (active.rt ?? 0)) - Math.abs((b.rt ?? 0) - (active.rt ?? 0)));
          spec = ms2[0];
        } else if (ms2.length) {
          ms2.sort((a, b) => sumArr(b.intensity) - sumArr(a.intensity));
          spec = ms2[0];
        } else {
          return emptyMessage(W, H, 'No MS² spectrum in this dataset', fontFamily);
        }
      }
    }

    return renderSpectrumPanel({
      W, H, fontFamily, titleSize, labelSize, tickSize,
      stickWidth, stickColor, annoStickColor, tickDir, spineStyle, borderWidth,
      annoFontSize, annoTopN, showAnnotations,
      intensityMode, title, kind,
      spec, annotations: data.annotations || [],
      isotopeBracket
    });
  }

  function emptyMessage(W, H, msg, fontFamily) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${fontFamily}"><rect width="${W}" height="${H}" fill="#ffffff"/><text x="${W/2}" y="${H/2}" text-anchor="middle" font-size="14" fill="#8a8a85">${escapeXml(msg)}</text></svg>`;
  }

  function renderSpectrumPanel(o) {
    const { W, H, fontFamily, titleSize, labelSize, tickSize, stickWidth, stickColor, annoStickColor,
            tickDir, spineStyle, borderWidth, annoFontSize, annoTopN, showAnnotations,
            intensityMode, title, spec, annotations, kind, isotopeBracket } = o;

    const titleH = title ? titleSize + 4 : 0;
    const margin = { left: Math.max(50, labelSize * 4.0), right: 14, top: titleH + labelSize + tickSize + 8, bottom: labelSize + tickSize + 12 };
    const plotW = W - margin.left - margin.right;
    const plotH = H - margin.top - margin.bottom;
    const X = margin.left, Y = margin.top;

    let xMin, xMax;
    if (isotopeBracket) {
      xMin = isotopeBracket.center - isotopeBracket.width / 2;
      xMax = isotopeBracket.center + isotopeBracket.width / 2;
    } else {
      xMin = Math.min(...spec.mz) - 10;
      xMax = (spec.precursorMz && kind !== 'ms1') ? Math.max(spec.precursorMz, ...spec.mz) + 10 : Math.max(...spec.mz) + 10;
    }
    // Filter peaks to range for intensity scaling
    const inRange = spec.mz.map((mz, i) => ({ mz, intensity: spec.intensity[i], i })).filter(p => p.mz >= xMin && p.mz <= xMax);
    const maxI = Math.max(...inRange.map(p => p.intensity), 1);
    let yMax;
    const intMap = (v) => intensityMode === 'relative' ? (v / maxI) * 100 : v;
    yMax = intensityMode === 'relative' ? 105 : maxI * 1.1;

    function sx(v) { return X + (v - xMin) / (xMax - xMin) * plotW; }
    function sy(v) { return Y + plotH - intMap(v) / yMax * plotH; }

    const parts = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${fontFamily}">`);
    parts.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
    if (title) parts.push(`<text x="${W/2}" y="${titleSize + 4}" text-anchor="middle" font-size="${titleSize}" fill="#000">${escapeXml(title)}</text>`);

    // sticks
    inRange.forEach(p => {
      const x = sx(p.mz);
      const y0 = Y + plotH, y1 = sy(p.intensity);
      const anno = showAnnotations && annotations.some(a => Math.abs(a.mz - p.mz) < 0.02);
      parts.push(`<line x1="${x.toFixed(2)}" y1="${y0.toFixed(2)}" x2="${x.toFixed(2)}" y2="${y1.toFixed(2)}" stroke="${anno ? annoStickColor : stickColor}" stroke-width="${stickWidth}"/>`);
    });

    // top-N labels
    if (showAnnotations) {
      const top = [...inRange].sort((a, b) => b.intensity - a.intensity).slice(0, annoTopN);
      top.forEach(p => {
        const x = sx(p.mz);
        const y = sy(p.intensity) - 4;
        const ann = annotations.find(a => Math.abs(a.mz - p.mz) < 0.02);
        parts.push(`<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle" font-size="${annoFontSize}" fill="#000">${p.mz.toFixed(p.mz < 100 ? 4 : 3)}</text>`);
        if (ann) parts.push(`<text x="${x.toFixed(2)}" y="${(y - annoFontSize - 1).toFixed(2)}" text-anchor="middle" font-size="${annoFontSize}" font-weight="bold" fill="${annoStickColor}">${escapeXml(ann.label)}</text>`);
      });
    }

    const xTicks = niceTicks(xMin, xMax, 8);
    const yTicks = niceTicks(0, yMax, 5);
    drawAxes(parts, {
      x: X, y: Y, w: plotW, h: plotH,
      xMin, xMax, yMin: 0, yMax,
      xTicks, yTicks, xStep: xTicks[1]-xTicks[0], yStep: yTicks[1]-yTicks[0],
      xLabel: 'm/z',
      yLabel: intensityMode === 'relative' ? 'Relative intensity (%)' : 'Intensity',
      labelSize, tickSize, tickDir, spineStyle, borderWidth,
      leftLabelOffset: margin.left - 28,
      yTickFmt: (v, s) => intensityMode === 'relative' ? formatTick(v, s) : (Math.abs(v) >= 1e3 ? (v/1e3).toFixed(0) + 'k' : formatTick(v, s))
    });

    parts.push(`</svg>`);
    return parts.join('');
  }

  // ---------- Renderer: mirror plot (experimental vs reference) ----------
  function renderMirror(data, opts) {
    opts = opts || {};
    const W = opts.width || 720;
    const H = opts.height || 540;
    const fontFamily = opts.fontFamily || "Arial, 'Helvetica Neue', Helvetica, sans-serif";
    const titleSize = opts.titleSize ?? 14;
    const labelSize = opts.labelSize ?? 12;
    const tickSize = opts.tickSize ?? 10;
    const stickWidth = opts.stickWidth ?? 1.2;
    const topColor = opts.mirrorTopColor || '#000000';
    const botColor = opts.mirrorBotColor || '#2563eb';
    const tickDir = opts.tickDir || 'out';
    const spineStyle = opts.spineStyle || 'box';
    const borderWidth = opts.borderWidth ?? 0.8;
    const annoFontSize = opts.annoFontSize ?? 10;
    const annoTopN = opts.annoTopN ?? 5;
    const title = opts.title ?? '';
    const topLabel = opts.mirrorTopLabel || 'Experimental';
    const botLabel = opts.mirrorBotLabel || 'Reference';

    const spec = data.spectra[data.activeIdx];
    const ref = data.reference; // {mz, intensity}
    if (!spec) return emptyMessage(W, H, 'No spectrum loaded', fontFamily);
    if (!ref || !ref.mz.length) return emptyMessage(W, H, 'Paste a reference spectrum (m/z\\tintensity) in the inspector', fontFamily);

    const titleH = title ? titleSize + 4 : 0;
    const margin = { left: Math.max(50, labelSize * 4.0), right: 14, top: titleH + labelSize + 6, bottom: labelSize + tickSize + 12 };
    const plotW = W - margin.left - margin.right;
    const plotH = H - margin.top - margin.bottom;
    const X = margin.left, Y = margin.top;
    const midY = Y + plotH / 2;

    const allMz = spec.mz.concat(ref.mz);
    const xMin = Math.min(...allMz) - 10;
    const xMax = Math.max(...allMz) + 10;
    const maxExp = Math.max(...spec.intensity, 1);
    const maxRef = Math.max(...ref.intensity, 1);
    function sx(v) { return X + (v - xMin) / (xMax - xMin) * plotW; }

    const parts = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${fontFamily}">`);
    parts.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
    if (title) parts.push(`<text x="${W/2}" y="${titleSize + 4}" text-anchor="middle" font-size="${titleSize}" fill="#000">${escapeXml(title)}</text>`);

    // Center axis line
    parts.push(`<line x1="${X}" y1="${midY}" x2="${X + plotW}" y2="${midY}" stroke="#000" stroke-width="${borderWidth}"/>`);

    // Experimental (top, pointing up)
    spec.mz.forEach((mz, i) => {
      const rel = spec.intensity[i] / maxExp * 100;
      const x = sx(mz);
      const y1 = midY - (rel / 100) * (plotH / 2 - 4);
      parts.push(`<line x1="${x.toFixed(2)}" y1="${midY}" x2="${x.toFixed(2)}" y2="${y1.toFixed(2)}" stroke="${topColor}" stroke-width="${stickWidth}"/>`);
    });
    // Reference (bottom, pointing down)
    ref.mz.forEach((mz, i) => {
      const rel = ref.intensity[i] / maxRef * 100;
      const x = sx(mz);
      const y1 = midY + (rel / 100) * (plotH / 2 - 4);
      parts.push(`<line x1="${x.toFixed(2)}" y1="${midY}" x2="${x.toFixed(2)}" y2="${y1.toFixed(2)}" stroke="${botColor}" stroke-width="${stickWidth}"/>`);
    });

    // Top-N labels on each side
    const topExp = spec.mz.map((mz, i) => ({ mz, intensity: spec.intensity[i] })).sort((a, b) => b.intensity - a.intensity).slice(0, annoTopN);
    topExp.forEach(p => {
      const rel = p.intensity / maxExp * 100;
      const x = sx(p.mz);
      const y = midY - (rel / 100) * (plotH / 2 - 4) - 4;
      parts.push(`<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle" font-size="${annoFontSize}" fill="${topColor}">${p.mz.toFixed(3)}</text>`);
    });
    const topRef = ref.mz.map((mz, i) => ({ mz, intensity: ref.intensity[i] })).sort((a, b) => b.intensity - a.intensity).slice(0, annoTopN);
    topRef.forEach(p => {
      const rel = p.intensity / maxRef * 100;
      const x = sx(p.mz);
      const y = midY + (rel / 100) * (plotH / 2 - 4) + annoFontSize + 2;
      parts.push(`<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle" font-size="${annoFontSize}" fill="${botColor}">${p.mz.toFixed(3)}</text>`);
    });

    // Side labels
    parts.push(`<text x="${X + 6}" y="${Y + annoFontSize + 4}" font-size="${annoFontSize + 1}" font-weight="bold" fill="${topColor}">${escapeXml(topLabel)}</text>`);
    parts.push(`<text x="${X + 6}" y="${Y + plotH - 6}" font-size="${annoFontSize + 1}" font-weight="bold" fill="${botColor}">${escapeXml(botLabel)}</text>`);

    // Cosine similarity score
    const score = cosineScore(spec, ref);
    parts.push(`<text x="${X + plotW - 6}" y="${Y + annoFontSize + 4}" text-anchor="end" font-size="${annoFontSize + 1}" fill="#000">cos = ${score.toFixed(3)}</text>`);

    // Frame
    if (spineStyle === 'L') {
      parts.push(`<line x1="${X}" y1="${Y}" x2="${X}" y2="${Y + plotH}" stroke="#000" stroke-width="${borderWidth}"/>`);
      parts.push(`<line x1="${X}" y1="${Y + plotH}" x2="${X + plotW}" y2="${Y + plotH}" stroke="#000" stroke-width="${borderWidth}"/>`);
    } else {
      parts.push(`<rect x="${X}" y="${Y}" width="${plotW}" height="${plotH}" fill="none" stroke="#000" stroke-width="${borderWidth}"/>`);
    }

    // X axis ticks
    const xTicks = niceTicks(xMin, xMax, 8);
    const xStep = xTicks[1] - xTicks[0];
    const td = tickDir === 'in' ? -1 : 1;
    xTicks.forEach(v => {
      const x = sx(v);
      if (x < X - 0.5 || x > X + plotW + 0.5) return;
      parts.push(`<line x1="${x}" y1="${Y + plotH}" x2="${x}" y2="${Y + plotH + 5 * td}" stroke="#000" stroke-width="${borderWidth}"/>`);
      parts.push(`<text x="${x}" y="${Y + plotH + tickSize + 6}" text-anchor="middle" font-size="${tickSize}" fill="#000">${formatTick(v, xStep)}</text>`);
    });
    // Y axis: relative on both sides, 0 at middle
    [100, 50, 0, 50, 100].forEach((v, idx) => {
      const isTop = idx < 2;
      const isMid = idx === 2;
      const y = isMid ? midY : (isTop ? midY - (v / 100) * (plotH / 2 - 4) : midY + (v / 100) * (plotH / 2 - 4));
      parts.push(`<line x1="${X}" y1="${y}" x2="${X + 5 * td}" y2="${y}" stroke="#000" stroke-width="${borderWidth}"/>`);
      parts.push(`<text x="${X - 7}" y="${y + 3.5}" text-anchor="end" font-size="${tickSize}" fill="#000">${v}</text>`);
    });

    parts.push(`<text x="${X + plotW / 2}" y="${Y + plotH + tickSize + labelSize + 12}" text-anchor="middle" font-size="${labelSize}" fill="#000">${richLabel('m/z')}</text>`);
    parts.push(`<text transform="translate(${margin.left - 28}, ${Y + plotH / 2}) rotate(-90)" text-anchor="middle" font-size="${labelSize}" fill="#000">Relative intensity (%)</text>`);

    parts.push(`</svg>`);
    return parts.join('');
  }

  function cosineScore(a, b, tol) {
    tol = tol ?? 0.02;
    // Normalize
    const ma = Math.max(...a.intensity, 1), mb = Math.max(...b.intensity, 1);
    let dot = 0, sa = 0, sb = 0;
    a.intensity.forEach((v) => { sa += (v / ma) * (v / ma); });
    b.intensity.forEach((v) => { sb += (v / mb) * (v / mb); });
    a.mz.forEach((mz, i) => {
      const matchIdx = b.mz.findIndex(m => Math.abs(m - mz) < tol);
      if (matchIdx >= 0) dot += (a.intensity[i] / ma) * (b.intensity[matchIdx] / mb);
    });
    const denom = Math.sqrt(sa * sb);
    return denom > 0 ? dot / denom : 0;
  }

  // ---------- Renderer: 2D LC-MS map (RT × m/z heatmap) ----------
  function renderMap(data, opts) {
    opts = opts || {};
    const W = opts.width || 720;
    const H = opts.height || 540;
    const fontFamily = opts.fontFamily || "Arial, 'Helvetica Neue', Helvetica, sans-serif";
    const titleSize = opts.titleSize ?? 14;
    const labelSize = opts.labelSize ?? 12;
    const tickSize = opts.tickSize ?? 10;
    const tickDir = opts.tickDir || 'out';
    const spineStyle = opts.spineStyle || 'box';
    const borderWidth = opts.borderWidth ?? 0.8;
    const colorScale = opts.colorScale || 'viridis';
    const title = opts.title ?? '';

    // Collect (rt, mz, intensity) from all MS¹ scans (or MS² if no MS¹)
    const ms1 = data.spectra.filter(s => s.msLevel === 1);
    const pool = ms1.length ? ms1 : data.spectra;
    if (pool.length < 2) return emptyMessage(W, H, '2D map requires multiple scans (load an mzML file)', fontFamily);

    const titleH = title ? titleSize + 4 : 0;
    const margin = { left: Math.max(50, labelSize * 4.0), right: 70, top: titleH + 8, bottom: labelSize + tickSize + 12 };
    const plotW = W - margin.left - margin.right;
    const plotH = H - margin.top - margin.bottom;
    const X = margin.left, Y = margin.top;

    // Ranges
    let rtMin = Infinity, rtMax = -Infinity, mzMin = Infinity, mzMax = -Infinity, intMax = 0;
    pool.forEach(s => {
      if (s.rt != null) {
        const r = s.rt / 60;
        if (r < rtMin) rtMin = r;
        if (r > rtMax) rtMax = r;
      }
      for (let i = 0; i < s.mz.length; i++) {
        if (s.mz[i] < mzMin) mzMin = s.mz[i];
        if (s.mz[i] > mzMax) mzMax = s.mz[i];
        if (s.intensity[i] > intMax) intMax = s.intensity[i];
      }
    });
    if (!isFinite(rtMin) || !isFinite(mzMin)) return emptyMessage(W, H, 'No usable RT/mz data', fontFamily);

    // Log scale for intensity
    const logMin = Math.log10(intMax * 1e-4 + 1);
    const logMax = Math.log10(intMax + 1);

    function sx(v) { return X + (v - rtMin) / (rtMax - rtMin) * plotW; }
    function sy(v) { return Y + plotH - (v - mzMin) / (mzMax - mzMin) * plotH; }

    const parts = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${fontFamily}">`);
    parts.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
    if (title) parts.push(`<text x="${W/2}" y="${titleSize + 4}" text-anchor="middle" font-size="${titleSize}" fill="#000">${escapeXml(title)}</text>`);
    // White plot area
    parts.push(`<rect x="${X}" y="${Y}" width="${plotW}" height="${plotH}" fill="#fafaf8"/>`);

    // Dots
    pool.forEach(s => {
      if (s.rt == null) return;
      const r = s.rt / 60;
      const xPx = sx(r);
      for (let i = 0; i < s.mz.length; i++) {
        if (s.intensity[i] < intMax * 1e-4) continue;
        const yPx = sy(s.mz[i]);
        const t = (Math.log10(s.intensity[i] + 1) - logMin) / (logMax - logMin);
        const tc = Math.max(0, Math.min(1, t));
        const c = colorRamp(tc, colorScale);
        parts.push(`<circle cx="${xPx.toFixed(2)}" cy="${yPx.toFixed(2)}" r="1.4" fill="${c}" opacity="0.8"/>`);
      }
    });

    // Frame
    parts.push(`<rect x="${X}" y="${Y}" width="${plotW}" height="${plotH}" fill="none" stroke="#000" stroke-width="${borderWidth}"/>`);

    // Axes
    const xTicks = niceTicks(rtMin, rtMax, 6);
    const yTicks = niceTicks(mzMin, mzMax, 6);
    drawAxes(parts, {
      x: X, y: Y, w: plotW, h: plotH,
      xMin: rtMin, xMax: rtMax, yMin: mzMin, yMax: mzMax,
      xTicks, yTicks, xStep: xTicks[1]-xTicks[0], yStep: yTicks[1]-yTicks[0],
      xLabel: 'Retention time (min)', yLabel: 'm/z',
      labelSize, tickSize, tickDir, spineStyle: 'box', borderWidth,
      leftLabelOffset: margin.left - 28
    });

    // Color bar
    const cbX = X + plotW + 14;
    const cbW = 12;
    const cbH = plotH * 0.7;
    const cbY = Y + (plotH - cbH) / 2;
    const ncells = 64;
    for (let i = 0; i < ncells; i++) {
      const t = i / (ncells - 1);
      parts.push(`<rect x="${cbX}" y="${(cbY + cbH * (1 - (i+1)/ncells)).toFixed(2)}" width="${cbW}" height="${(cbH/ncells + 0.5).toFixed(2)}" fill="${colorRamp(t, colorScale)}"/>`);
    }
    parts.push(`<rect x="${cbX}" y="${cbY}" width="${cbW}" height="${cbH}" fill="none" stroke="#000" stroke-width="0.5"/>`);
    parts.push(`<text x="${cbX + cbW + 5}" y="${cbY + 5}" font-size="${tickSize}" fill="#000">${(intMax).toExponential(1)}</text>`);
    parts.push(`<text x="${cbX + cbW + 5}" y="${cbY + cbH + 4}" font-size="${tickSize}" fill="#000">low</text>`);
    parts.push(`<text transform="translate(${cbX + cbW + 38}, ${cbY + cbH/2}) rotate(-90)" text-anchor="middle" font-size="${tickSize}" fill="#000">log intensity</text>`);

    parts.push(`</svg>`);
    return parts.join('');
  }

  function colorRamp(t, scale) {
    // viridis-like ramp (approx) or grayscale
    if (scale === 'gray') {
      const v = Math.round((1 - t) * 220);
      return `rgb(${v},${v},${v})`;
    }
    // Approx viridis
    const stops = [
      [68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]
    ];
    const idx = t * (stops.length - 1);
    const i0 = Math.floor(idx);
    const i1 = Math.min(stops.length - 1, i0 + 1);
    const f = idx - i0;
    const r = Math.round(stops[i0][0] + (stops[i1][0] - stops[i0][0]) * f);
    const g = Math.round(stops[i0][1] + (stops[i1][1] - stops[i0][1]) * f);
    const b = Math.round(stops[i0][2] + (stops[i1][2] - stops[i0][2]) * f);
    return `rgb(${r},${g},${b})`;
  }

  // ---------- Renderer: mass error plot ----------
  function renderMassError(data, opts) {
    opts = opts || {};
    const W = opts.width || 720;
    const H = opts.height || 480;
    const fontFamily = opts.fontFamily || "Arial, 'Helvetica Neue', Helvetica, sans-serif";
    const titleSize = opts.titleSize ?? 14;
    const labelSize = opts.labelSize ?? 12;
    const tickSize = opts.tickSize ?? 10;
    const tickDir = opts.tickDir || 'out';
    const spineStyle = opts.spineStyle || 'box';
    const borderWidth = opts.borderWidth ?? 0.8;
    const markerSize = opts.markerSize ?? 3;
    const markerFill = opts.markerFill || '#000000';
    const annoFontSize = opts.annoFontSize ?? 9;
    const title = opts.title ?? '';

    // Use annotations as theoretical masses, peaks as measured
    const annos = data.annotations || [];
    const spec = data.spectra[data.activeIdx];
    if (!spec || !annos.length) return emptyMessage(W, H, 'Mass error needs annotations (theoretical m/z) — add some in the editor', fontFamily);

    // Compute matched pairs: nearest peak within 50 mDa
    const pairs = annos.map(a => {
      let best = null, bestDelta = Infinity;
      spec.mz.forEach((m, i) => {
        const d = Math.abs(m - a.mz);
        if (d < bestDelta) { bestDelta = d; best = { mz: m, intensity: spec.intensity[i] }; }
      });
      if (!best || bestDelta > 0.05) return null;
      const ppm = (best.mz - a.mz) / a.mz * 1e6;
      return { theoretical: a.mz, measured: best.mz, ppm, label: a.label, intensity: best.intensity };
    }).filter(Boolean);
    if (!pairs.length) return emptyMessage(W, H, 'No matched annotations within 50 mDa', fontFamily);

    const titleH = title ? titleSize + 4 : 0;
    const margin = { left: Math.max(50, labelSize * 4.0), right: 14, top: titleH + 8, bottom: labelSize + tickSize + 12 };
    const plotW = W - margin.left - margin.right;
    const plotH = H - margin.top - margin.bottom;
    const X = margin.left, Y = margin.top;

    const xMin = Math.min(...pairs.map(p => p.theoretical)) - 5;
    const xMax = Math.max(...pairs.map(p => p.theoretical)) + 5;
    const maxAbs = Math.max(...pairs.map(p => Math.abs(p.ppm)), 5);
    const yMin = -maxAbs * 1.1, yMax = maxAbs * 1.1;

    function sx(v) { return X + (v - xMin) / (xMax - xMin) * plotW; }
    function sy(v) { return Y + plotH - (v - yMin) / (yMax - yMin) * plotH; }

    const parts = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${fontFamily}">`);
    parts.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
    if (title) parts.push(`<text x="${W/2}" y="${titleSize + 4}" text-anchor="middle" font-size="${titleSize}" fill="#000">${escapeXml(title)}</text>`);

    // Zero line
    parts.push(`<line x1="${X}" y1="${sy(0)}" x2="${X + plotW}" y2="${sy(0)}" stroke="#888" stroke-width="0.6" stroke-dasharray="3,2"/>`);

    // ±5 ppm bands
    if (maxAbs > 5) {
      parts.push(`<line x1="${X}" y1="${sy(5)}" x2="${X + plotW}" y2="${sy(5)}" stroke="#c1121f" stroke-width="0.4" stroke-dasharray="2,2" opacity="0.5"/>`);
      parts.push(`<line x1="${X}" y1="${sy(-5)}" x2="${X + plotW}" y2="${sy(-5)}" stroke="#c1121f" stroke-width="0.4" stroke-dasharray="2,2" opacity="0.5"/>`);
    }

    // Points
    pairs.forEach(p => {
      const x = sx(p.theoretical);
      const y = sy(p.ppm);
      parts.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${markerSize}" fill="${markerFill}"/>`);
      if (p.label) parts.push(`<text x="${x.toFixed(2)}" y="${(y - markerSize - 3).toFixed(2)}" text-anchor="middle" font-size="${annoFontSize}" fill="#000">${escapeXml(p.label)}</text>`);
    });

    // Stats
    const meanPpm = pairs.reduce((a, b) => a + b.ppm, 0) / pairs.length;
    const stdPpm = Math.sqrt(pairs.reduce((a, b) => a + Math.pow(b.ppm - meanPpm, 2), 0) / pairs.length);
    parts.push(`<text x="${X + plotW - 6}" y="${Y + tickSize + 4}" text-anchor="end" font-size="${tickSize}" fill="#000">n = ${pairs.length} · mean = ${meanPpm.toFixed(2)} ppm · σ = ${stdPpm.toFixed(2)}</text>`);

    const xTicks = niceTicks(xMin, xMax, 6);
    const yTicks = niceTicks(yMin, yMax, 5);
    drawAxes(parts, {
      x: X, y: Y, w: plotW, h: plotH,
      xMin, xMax, yMin, yMax, xTicks, yTicks,
      xStep: xTicks[1]-xTicks[0], yStep: yTicks[1]-yTicks[0],
      xLabel: 'Theoretical m/z', yLabel: 'Mass error (ppm)',
      labelSize, tickSize, tickDir, spineStyle, borderWidth,
      leftLabelOffset: margin.left - 28
    });
    parts.push(`</svg>`);
    return parts.join('');
  }

  function drawAxes(parts, c) {
    const td = c.tickDir === 'in' ? -1 : 1;
    const majL = 5 * td;
    const minL = 2.5 * td;
    const tkW = Math.max(0.6, c.borderWidth);

    function sx(v) { return c.x + (v - c.xMin) / (c.xMax - c.xMin) * c.w; }
    function sy(v) { return c.y + c.h - (v - c.yMin) / (c.yMax - c.yMin) * c.h; }

    // Spines
    if (c.spineStyle === 'L') {
      parts.push(`<line x1="${c.x}" y1="${c.y + c.h}" x2="${c.x + c.w}" y2="${c.y + c.h}" stroke="#000" stroke-width="${c.borderWidth}"/>`);
      parts.push(`<line x1="${c.x}" y1="${c.y}" x2="${c.x}" y2="${c.y + c.h}" stroke="#000" stroke-width="${c.borderWidth}"/>`);
    } else {
      parts.push(`<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="none" stroke="#000" stroke-width="${c.borderWidth}"/>`);
    }

    // Bottom ticks (x axis)
    c.xTicks.forEach(v => {
      const x = sx(v);
      if (x < c.x - 0.5 || x > c.x + c.w + 0.5) return;
      const yAx = c.y + c.h;
      parts.push(`<line x1="${x}" y1="${yAx}" x2="${x}" y2="${yAx + majL}" stroke="#000" stroke-width="${tkW}"/>`);
      parts.push(`<text x="${x}" y="${yAx + c.tickSize + 6}" text-anchor="middle" font-size="${c.tickSize}" fill="#000">${formatTick(v, c.xStep)}</text>`);
    });
    const xMinor = c.xStep / 5;
    for (let v = c.xTicks[0]; v <= c.xTicks[c.xTicks.length-1]; v += xMinor) {
      const x = sx(v);
      if (x < c.x - 0.5 || x > c.x + c.w + 0.5) continue;
      parts.push(`<line x1="${x}" y1="${c.y + c.h}" x2="${x}" y2="${c.y + c.h + minL}" stroke="#000" stroke-width="0.6"/>`);
    }
    // Left ticks (y axis)
    const yTextX = c.x - Math.max(majL, 0) - 3;
    c.yTicks.forEach(v => {
      const y = sy(v);
      if (y < c.y - 0.5 || y > c.y + c.h + 0.5) return;
      parts.push(`<line x1="${c.x}" y1="${y}" x2="${c.x - majL}" y2="${y}" stroke="#000" stroke-width="${tkW}"/>`);
      parts.push(`<text x="${yTextX}" y="${y + 3.5}" text-anchor="end" font-size="${c.tickSize}" fill="#000">${c.yTickFmt ? c.yTickFmt(v, c.yStep) : formatTick(v, c.yStep)}</text>`);
    });
    const yMinor = c.yStep / 5;
    for (let v = c.yTicks[0]; v <= c.yTicks[c.yTicks.length-1]; v += yMinor) {
      const y = sy(v);
      if (y < c.y - 0.5 || y > c.y + c.h + 0.5) continue;
      parts.push(`<line x1="${c.x}" y1="${y}" x2="${c.x - minL}" y2="${y}" stroke="#000" stroke-width="0.6"/>`);
    }

    // Labels
    parts.push(`<text x="${c.x + c.w/2}" y="${c.y + c.h + c.tickSize + c.labelSize + 12}" text-anchor="middle" font-size="${c.labelSize}" fill="#000">${richLabel(c.xLabel)}</text>`);
    parts.push(`<text transform="translate(${c.leftLabelOffset}, ${c.y + c.h/2}) rotate(-90)" text-anchor="middle" font-size="${c.labelSize}" fill="#000">${richLabel(c.yLabel)}</text>`);
    // Optional exponent label above y-axis (e.g. "×10⁶" for TIC intensity)
    if (c.exponentLabel) {
      parts.push(`<text x="${c.x - 4}" y="${c.y - 5}" text-anchor="end" font-size="${c.tickSize}" fill="#000">${c.exponentLabel}</text>`);
    }
  }

  // expose
  window.LCMS = {
    parse: parseLCMS,
    render: renderLCMS,
    sample: sampleProgesterone,
    presets: {
      neutral: {
        fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        titleSize: 13, labelSize: 11, tickSize: 9,
        lineWidth: 0.7, stickWidth: 1.0,
        stickColor: '#000000', annoStickColor: '#c1121f',
        borderWidth: 0.7, tickDir: 'out', spineStyle: 'L',
        annoFontSize: 9, width: 800, height: 700
      },
      nature: { fontFamily: "Arial, 'Helvetica Neue', Helvetica, sans-serif", titleSize: 8, labelSize: 7, tickSize: 6, lineWidth: 0.5, stickWidth: 0.8, borderWidth: 0.5, tickDir: 'in', spineStyle: 'L', annoFontSize: 6, width: 336, height: 380 },
      cell:   { fontFamily: "Arial, 'Helvetica Neue', Helvetica, sans-serif", titleSize: 9, labelSize: 8, tickSize: 7, lineWidth: 0.6, stickWidth: 1.0, borderWidth: 0.75, tickDir: 'out', spineStyle: 'box', annoFontSize: 7, width: 322, height: 380 },
      science:{ fontFamily: "Arial, 'Helvetica Neue', Helvetica, sans-serif", titleSize: 8, labelSize: 7, tickSize: 6, lineWidth: 0.5, stickWidth: 0.7, borderWidth: 0.5, tickDir: 'in', spineStyle: 'L', annoFontSize: 6, width: 454, height: 420 }
    }
  };
})();
