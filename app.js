/* JiangLab_BioFigureGen — main app */
(function () {
  'use strict';

  // ---------- Panel registry ----------
  const PANEL_TYPES = [
    { id: 'itc', name: 'ITC', sub: 'Calorimetry', status: 'ready' },
    { id: 'lcms', name: 'LC-MS / MS²', sub: 'Mass spectrometry', status: 'ready' },
    { id: 'xicstack', name: 'XIC Compare', sub: 'Multi-file XIC ridge', status: 'ready' },
    { id: 'gcms', name: 'GC-MS', sub: 'Chromatogram + EI / NIST match', status: 'ready' },
    { id: 'mm', name: 'Michaelis–Menten', sub: 'Enzyme kinetics', status: 'ready' },
    { id: 'cd', name: 'CD spectrum', sub: 'Folding + thermal melt', status: 'ready' }
  ];

  // ---------- State ----------
  const state = {
    activeType: 'itc',
    panels: {
      itc: {
        data: null, // {time,heat,mr,dh,mrFit,fit,title}
        fileName: null,
        zoom: 'fit',
        opts: {
          title: '',
          xlab1: 'Time (s)',
          ylab1: 'Corrected heat rate (μJ s\u207b\u00b9)',
          xlab2: 'Molar ratio',
          ylab2: 'Δ_H (kJ mol\u207b\u00b9)',
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          titleSize: 13,
          labelSize: 11,
          tickSize: 9,
          traceWidth: 0.7,
          fitWidth: 1.0,
          markerSize: 2,
          markerStyle: 'filled-circle',
          markerFill: '#000000',
          markerStroke: '#000000',
          markerStrokeWidth: 0,
          borderWidth: 0.7,
          tickDir: 'in',
          spineStyle: 'box',
          boldLabels: false,
          showGridLines: false,
          showGridBands: false,
          showParamBox: true,
          paramBoxPosition: 'bottom-right',
          paramBoxFontSize: 11,
          panelLabelA: 'a',
          panelLabelB: 'b',
          panelLabelBold: true,
          panelLayout: 'separated',
          journalPreset: 'neutral',
          width: 640,
          height: 520,
          params: { ...window.ITC.defaultParams }
        }
      },
      lcms: {
        data: null,
        fileName: null,
        zoom: 'fit',
        opts: {
          title: '',
          xlabChrom: 'Retention time (min)',
          ylabChrom: 'Intensity',
          xlabSpec: 'm/z',
          ylabSpec: 'Intensity',
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          titleSize: 13,
          labelSize: 11,
          tickSize: 9,
          lineWidth: 0.7,
          stickWidth: 1.0,
          stickColor: '#000000',
          annoStickColor: '#c1121f',
          borderWidth: 0.7,
          tickDir: 'out',
          spineStyle: 'L',
          showChrom: true,
          showAnnotations: true,
          showPrecursorMarker: true,
          annoTopN: 6,
          annoFontSize: 10,
          intensityMode: 'relative',
          plotType: 'overview',
          chromMode: 'tic',
          xicMz: 315.232,
          xicTol: 0.02,
          xicTolMode: 'ppm',
          xicPpm: 10,
          ms1RangeMode: 'auto',
          ms1Min: 100,
          ms1Max: 1000,
          ms1FocusWindow: 5,
          ms2RangeMode: 'auto',
          ms2Min: 100,
          ms2Max: 1000,
          ms2FocusWindow: 5,
          rtViewMin: null,
          rtViewMax: null,
          mirrorTopColor: '#000000',
          mirrorBotColor: '#2563eb',
          mirrorTopLabel: 'Experimental',
          mirrorBotLabel: 'Reference',
          colorScale: 'viridis',
          journalPreset: 'neutral',
          width: 640,
          height: 540
        }
      },
      xicstack: {
        files: [],
        opts: {
          title: '',
          xicMz: 315.232,
          xicTol: 10,
          xicTolMode: 'ppm',
          referenceFile: null,
          standardFile: null,
          showApexMarker: true,
          showFileLabels: true,
          fillUnder: false,
          xOffsetMin: 0.08,
          yOffsetFrac: 0.12,
          rtViewMin: null,
          rtViewMax: null,
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          titleSize: 13, labelSize: 11, tickSize: 9,
          traceWidth: 1.0,
          journalPreset: 'neutral',
          width: 720, height: 480
        },
        zoom: 'fit'
      },
      gcms: {
        data: null,
        fileName: null,
        zoom: 'fit',
        opts: {
          title: '',
          plotType: 'overview',
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          titleSize: 13, labelSize: 11, tickSize: 9,
          lineWidth: 0.7, stickWidth: 1.0,
          stickColor: '#000000', libColor: '#2563eb',
          borderWidth: 0.7, tickDir: 'out', spineStyle: 'L',
          showAnnotations: true, annoTopN: 6, annoFontSize: 9,
          showPeakLabels: true,
          xlabChrom: 'RT (min)', ylabChrom: 'Intensity',
          xlabSpec: 'm/z', ylabSpec: 'Relative abundance (%)',
          journalPreset: 'neutral',
          width: 640, height: 540
        }
      },
      mm: {
        data: null,
        fileName: null,
        zoom: 'fit',
        opts: {
          title: '',
          plotType: 'mm',
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          titleSize: 13, labelSize: 11, tickSize: 9,
          lineWidth: 1.0, borderWidth: 0.7,
          markerSize: 3.2, errorBarWidth: 0.7,
          tickDir: 'out', spineStyle: 'L',
          showParamBox: true, paramBoxPosition: 'bottom-right', paramBoxFontSize: 10,
          showLegend: true, useColor: true,
          sUnit: 'mM', vUnit: '\u00b5M s\u207b\u00b9',
          enzymeConc: '',
          journalPreset: 'neutral',
          width: 640, height: 460
        }
      },
      cd: {
        data: null,
        fileName: null,
        zoom: 'fit',
        opts: {
          title: '',
          mode: 'spectrum',
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          titleSize: 13, labelSize: 11, tickSize: 9,
          lineWidth: 1.1, borderWidth: 0.7,
          tickDir: 'out', spineStyle: 'L',
          showLegend: true, showZeroLine: true, showLandmarks: true,
          showParamBox: true, paramBoxFontSize: 10,
          useColor: true,
          xlab: '', ylab: '',
          journalPreset: 'neutral',
          width: 640, height: 460
        }
      }
    }
  };

  // ---------- DOM refs ----------
  const $ = (id) => document.getElementById(id);
  const rail = $('rail-list');
  const stage = $('stage');
  const inspector = $('inspector');
  const fileInput = $('file-input');
  const dropOverlay = $('drop-overlay');
  const crumbs = $('crumbs');

  // ---------- Rail ----------
  function renderRail() {
    rail.innerHTML = '';
    PANEL_TYPES.forEach(p => {
      const el = document.createElement('div');
      el.className = 'panel-item' + (p.id === state.activeType ? ' active' : '');
      el.innerHTML = `
        <span class="panel-dot"></span>
        <span class="panel-label">
          <div>${p.name}</div>
          <div style="font-size:10.5px;color:#8a8a85;margin-top:1px;">${p.sub}</div>
        </span>
        ${p.status === 'planned' ? '<span class="panel-tag">Soon</span>' : ''}
      `;
      el.addEventListener('click', () => {
        state.activeType = p.id;
        renderAll();
      });
      rail.appendChild(el);
    });
  }

  // ---------- Crumbs ----------
  function renderCrumbs() {
    const cur = PANEL_TYPES.find(p => p.id === state.activeType);
    let fileName = '';
    const cur_panel = state.panels[state.activeType];
    if (cur_panel && cur_panel.fileName) fileName = cur_panel.fileName;
    crumbs.innerHTML = `
      <span>Workspace</span>
      <span class="sep">/</span>
      <span class="active">${cur.name}</span>
      ${fileName ? `<span class="sep">/</span><span style="color:#555">${escapeHtml(fileName)}</span>` : ''}
    `;
  }

  // ---------- Stage ----------
  function renderStage() {
    stage.innerHTML = '';
    if (state.activeType === 'itc') return renderITCStage();
    if (state.activeType === 'lcms') return renderLCMSStage();
    if (state.activeType === 'xicstack') return renderXICStackStage();
    if (state.activeType === 'gcms') return renderGCMSStage();
    if (state.activeType === 'mm') return renderMMStage();
    if (state.activeType === 'cd') return renderCDStage();
    renderPlaceholder();
  }

  function renderITCStage() {
    const p = state.panels.itc;
    // Stage header bar
    const hdr = document.createElement('div');
    hdr.className = 'stage-header';
    hdr.innerHTML = `
      <div>
        <div class="stage-title">${p.data ? escapeHtml(p.opts.title || 'Untitled') : 'ITC Figure'}</div>
        <div class="stage-sub">${p.data
          ? p.data.time.length + ' time points · ' + p.data.mr.length + ' injections · ' + p.data.fit.length + ' fit points'
          : 'No data loaded'}</div>
      </div>
      <div class="spacer"></div>
      <div class="zoom-controls">
        <button class="zoom-btn ${p.zoom==='fit'?'active':''}" data-z="fit">Fit</button>
        <button class="zoom-btn ${p.zoom===0.5?'active':''}" data-z="0.5">50%</button>
        <button class="zoom-btn ${p.zoom===0.75?'active':''}" data-z="0.75">75%</button>
        <button class="zoom-btn ${p.zoom===1?'active':''}" data-z="1">100%</button>
        <button class="zoom-btn ${p.zoom===1.5?'active':''}" data-z="1.5">150%</button>
      </div>
      <button class="btn ghost" id="open-btn">
        <svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 5h12v8H2z"/><path d="M2 5l2-2h4l2 2"/></svg>
        Open data
      </button>
      <button class="btn ghost" id="edit-btn" ${!p.data ? 'disabled style="opacity:0.5;pointer-events:none"' : ''}>
        <svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h12M2 7h12M2 11h12"/></svg>
        Edit data
      </button>
      <div style="position:relative">
        <button class="btn primary" id="export-btn">
          <svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2v9M4 7l4 4 4-4M3 14h10"/></svg>
          Export
        </button>
      </div>
    `;
    stage.appendChild(hdr);

    hdr.querySelectorAll('.zoom-btn').forEach(b => {
      b.addEventListener('click', () => {
        const z = b.dataset.z;
        p.zoom = z === 'fit' ? 'fit' : parseFloat(z);
        renderStage();
      });
    });
    hdr.querySelector('#open-btn').addEventListener('click', () => fileInput.click());
    const editBtn = hdr.querySelector('#edit-btn');
    if (editBtn) editBtn.addEventListener('click', openDataEditor);
    hdr.querySelector('#export-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openExportMenu(e.currentTarget);
    });

    // Canvas
    const wrap = document.createElement('div');
    wrap.className = 'canvas-wrap';
    if (!p.data) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="empty-card">
            <div class="empty-icon"><em>f</em></div>
            <h2>Drop an ITC text file</h2>
            <p>Tab-separated columns: Time (s), Corrected Heat Rate, Mole Ratio, Enthalpy, Mole Ratio (fit), Fit.<br>The figure will render automatically with publication-quality typography.</p>
            <div class="empty-actions">
              <button class="btn" id="open-btn-2">Choose file…</button>
              <button class="btn ghost" id="sample-btn">Use sample (Progesterone → 5R)</button>
            </div>
          </div>
        </div>
      `;
    } else {
      const frame = document.createElement('div');
      frame.className = 'figure-frame';
      frame.innerHTML = window.ITC.render(p.data, p.opts);
      wrap.appendChild(frame);
    }
    stage.appendChild(wrap);
    // Apply zoom by resizing the SVG width/height (the SVG has viewBox so it scales cleanly)
    if (p.data) applyZoom();

    if (!p.data) {
      wrap.querySelector('#open-btn-2').addEventListener('click', () => fileInput.click());
      wrap.querySelector('#sample-btn').addEventListener('click', loadSample);
    }
  }

  function applyZoom() {
    const p = state.panels[state.activeType];
    if (!p) return;
    const wrap = stage.querySelector('.canvas-wrap');
    const frame = stage.querySelector('.figure-frame');
    if (!wrap || !frame) return;
    const svg = frame.querySelector('svg');
    if (!svg) return;
    const baseW = p.opts.width;
    const baseH = p.opts.height;
    // available inner area = wrap minus its padding (16px each side from CSS)
    const cs = getComputedStyle(wrap);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const availW = Math.max(50, wrap.clientWidth - padX);
    const availH = Math.max(50, wrap.clientHeight - padY);
    let scale;
    if (p.zoom === 'fit') {
      scale = Math.min(availW / baseW, availH / baseH);
      scale = Math.min(scale, 1.5); // don't blow up small figures past 150%
    } else {
      scale = p.zoom;
    }
    svg.setAttribute('width', Math.round(baseW * scale));
    svg.setAttribute('height', Math.round(baseH * scale));
  }

  // Re-fit when the window resizes (only matters in 'fit' mode but harmless otherwise)
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const p = state.panels[state.activeType];
      if (p && p.data) applyZoom();
    }, 80);
  });

  function renderLCMSStage() {
    const p = state.panels.lcms;
    const o = p.opts;
    const hdr = document.createElement('div');
    hdr.className = 'stage-header';
    const ms2title = p.data ? (p.data.spectra[p.data.activeIdx]?.title || 'MS² spectrum') : 'LC-MS / MS² Figure';
    hdr.innerHTML = `
      <div>
        <div class="stage-title">${escapeHtml(ms2title)}</div>
        <div class="stage-sub">${p.data
          ? p.data.spectra.length + ' spectra · ' + (p.data.spectra[p.data.activeIdx]?.mz.length || 0) + ' peaks' + (p.data.chromatogram ? ' · ' + p.data.chromatogram.rt.length + ' chromatogram points' : '')
          : 'No data loaded'}</div>
      </div>
      <div class="spacer"></div>
      <div class="zoom-controls">
        <button class="zoom-btn ${p.zoom==='fit'?'active':''}" data-z="fit">Fit</button>
        <button class="zoom-btn ${p.zoom===0.5?'active':''}" data-z="0.5">50%</button>
        <button class="zoom-btn ${p.zoom===0.75?'active':''}" data-z="0.75">75%</button>
        <button class="zoom-btn ${p.zoom===1?'active':''}" data-z="1">100%</button>
        <button class="zoom-btn ${p.zoom===1.5?'active':''}" data-z="1.5">150%</button>
      </div>
      <button class="btn ghost" id="open-btn">
        <svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 5h12v8H2z"/><path d="M2 5l2-2h4l2 2"/></svg>
        Open .mzML / .mgf / .txt
      </button>
      <div style="position:relative">
        <button class="btn primary" id="export-btn">
          <svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2v9M4 7l4 4 4-4M3 14h10"/></svg>
          Export
        </button>
      </div>
    `;
    stage.appendChild(hdr);

    // Plot-type pill bar
    if (p.data) {
      const pills = document.createElement('div');
      pills.className = 'plot-type-bar';
      const types = [
        { id: 'overview',  name: 'Chromatogram + MS²', icon: '⌐' },
        { id: 'ms1',       name: 'MS¹ spectrum',        icon: '│' },
        { id: 'ms2',       name: 'MS² spectrum',        icon: '⏐' },
        { id: 'mirror',    name: 'Mirror plot',         icon: '↕' },
        { id: 'map',       name: '2D LC-MS map',        icon: '▦' },
        { id: 'masserror', name: 'Mass error (ppm)',    icon: 'Δ' }
      ];
      pills.innerHTML = types.map(t => `
        <button class="pill ${o.plotType===t.id?'active':''}" data-plot="${t.id}">
          <span class="pill-icon">${t.icon}</span>
          <span class="pill-name">${t.name}</span>
        </button>
      `).join('');
      stage.appendChild(pills);
      // Per plot type default canvas height (width stays consistent at 640).
      // Spectra-only views are short; chromatogram-bearing views are tall.
      const PLOT_HEIGHTS = {
        overview: 540,
        ms1: 280,
        ms2: 280,
        mirror: 360,
        map: 540,
        masserror: 360
      };
      pills.querySelectorAll('.pill').forEach(b => {
        b.addEventListener('click', () => {
          o.plotType = b.dataset.plot;
          if (PLOT_HEIGHTS[o.plotType] != null) o.height = PLOT_HEIGHTS[o.plotType];
          renderAll();
        });
      });
    }

    hdr.querySelectorAll('.zoom-btn').forEach(b => {
      b.addEventListener('click', () => {
        const z = b.dataset.z;
        p.zoom = z === 'fit' ? 'fit' : parseFloat(z);
        renderStage();
      });
    });
    hdr.querySelector('#open-btn').addEventListener('click', () => fileInput.click());
    hdr.querySelector('#export-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openExportMenu(e.currentTarget);
    });

    const wrap = document.createElement('div');
    wrap.className = 'canvas-wrap';
    if (!p.data) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="empty-card">
            <div class="empty-icon"><em>m/z</em></div>
            <h2>Drop an MS² spectrum</h2>
            <p>Supports <b>.mgf</b> (Mascot Generic Format), two-column <b>m/z  intensity</b> text, or three-column <b>rt  m/z  intensity</b> for chromatogram + spectra. Annotated fragments and precursor markers render automatically.</p>
            <div class="empty-actions">
              <button class="btn" id="open-btn-2">Choose file…</button>
              <button class="btn ghost" id="sample-btn">Synthetic MS²</button>
              <button class="btn ghost" id="sample-mzml-btn">Real mzML (Bruker, 1063 scans)</button>
            </div>
          </div>
        </div>
      `;
    } else {
      const frame = document.createElement('div');
      frame.className = 'figure-frame';
      frame.innerHTML = window.LCMS.render(p.data, p.opts);
      wrap.appendChild(frame);
    }
    stage.appendChild(wrap);
    if (p.data) {
      applyZoom();
      attachLCMSInteractivity();
    }

    if (!p.data) {
      wrap.querySelector('#open-btn-2').addEventListener('click', () => fileInput.click());
      wrap.querySelector('#sample-btn').addEventListener('click', loadLCMSSample);
      wrap.querySelector('#sample-mzml-btn').addEventListener('click', loadMzMLSample);
    }
  }

  async function loadMzMLSample() {
    try {
      showStatus('Loading & parsing mzML…');
      const resp = await fetch('samples/29_SIR4_ferredoxin_pregnenolone_1.mzML');
      const text = await resp.text();
      const parsed = await window.LCMS.parse(text);
      hideStatus();
      state.panels.lcms.data = parsed;
      state.panels.lcms.fileName = '29_SIR4_ferredoxin_pregnenolone_1.mzML (sample)';
      state.panels.lcms.opts.title = '29_SIR4_ferredoxin_pregnenolone_1';
      state.activeType = 'lcms';
      renderAll();
    } catch (e) {
      hideStatus();
      alert('Could not load mzML sample: ' + e.message);
    }
  }
  window.__loadMzMLSample = loadMzMLSample;

  function loadLCMSSample() {
    const data = window.LCMS.sample();
    state.panels.lcms.data = data;
    state.panels.lcms.fileName = 'Progesterone MS² (sample)';
    state.panels.lcms.opts.title = '';
    state.activeType = 'lcms';
    renderAll();
  }
  window.__loadLCMSSample = loadLCMSSample;

  // ---------- XIC Stack panel ----------
  function renderXICStackStage() {
    const p = state.panels.xicstack;
    const o = p.opts;
    const hdr = document.createElement('div');
    hdr.className = 'stage-header';
    hdr.innerHTML = `
      <div>
        <div class="stage-title">XIC Compare — m/z ${o.xicMz?.toFixed(4) || '?'}</div>
        <div class="stage-sub">${p.files.length} ${p.files.length === 1 ? 'file' : 'files'} loaded${o.xicTolMode === 'ppm' ? ' · ±'+o.xicTol+' ppm' : ' · ±'+o.xicTol+' Da'}</div>
      </div>
      <div class="spacer"></div>
      <div class="zoom-controls">
        <button class="zoom-btn ${p.zoom==='fit'?'active':''}" data-z="fit">Fit</button>
        <button class="zoom-btn ${p.zoom===0.75?'active':''}" data-z="0.75">75%</button>
        <button class="zoom-btn ${p.zoom===1?'active':''}" data-z="1">100%</button>
        <button class="zoom-btn ${p.zoom===1.25?'active':''}" data-z="1.25">125%</button>
      </div>
      <button class="btn primary" id="add-mzml-btn">+ Add mzML</button>
      <button class="btn" id="export-xicstack-btn">Export SVG</button>
    `;
    stage.appendChild(hdr);
    hdr.querySelectorAll('.zoom-btn').forEach(b => {
      b.addEventListener('click', () => {
        p.zoom = b.dataset.z === 'fit' ? 'fit' : parseFloat(b.dataset.z);
        renderStage();
      });
    });
    hdr.querySelector('#add-mzml-btn').addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.mzML,.mzml,.xml';
      inp.multiple = true;
      inp.addEventListener('change', e => {
        const files = [...e.target.files];
        addMzMLFiles(files);
      });
      inp.click();
    });
    hdr.querySelector('#export-xicstack-btn').addEventListener('click', () => {
      const svg = window.XICStack.render({ files: p.files }, p.opts);
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'xic_compare.svg';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    const wrap = document.createElement('div');
    wrap.className = 'canvas-wrap';
    if (!p.files.length) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="empty-card">
            <div class="empty-icon"><em>≡</em></div>
            <h2>Compare XIC across runs</h2>
            <p>Upload multiple <b>.mzML</b> files. Specify a target m/z and ppm tolerance, and each file is plotted as a ridge-style XIC trace stacked vertically with sample labels. Pick a reference run to anchor an apex marker.</p>
            <div class="empty-actions">
              <button class="btn primary" id="add-mzml-btn-2">+ Add mzML files</button>
              <button class="btn ghost" id="load-demo-btn">Load demo (4 synthetic runs)</button>
            </div>
          </div>
        </div>
      `;
      wrap.querySelector('#add-mzml-btn-2').addEventListener('click', () => hdr.querySelector('#add-mzml-btn').click());
      wrap.querySelector('#load-demo-btn').addEventListener('click', loadXICStackDemo);
    } else {
      const frame = document.createElement('div');
      frame.className = 'figure-frame';
      frame.innerHTML = window.XICStack.render({ files: p.files }, p.opts);
      wrap.appendChild(frame);
    }
    stage.appendChild(wrap);
    if (p.files.length) applyZoom();
  }

  async function addMzMLFiles(files) {
    const p = state.panels.xicstack;
    showStatus('Parsing ' + files.length + ' mzML file(s)…');
    for (const f of files) {
      try {
        const text = await f.text();
        const data = await window.LCMS.parse(text);
        const xic = recomputeXIC(data, p.opts);
        p.files.push({
          name: f.name.replace(/\.mzml$/i, ''),
          fileName: f.name,
          data,
          color: window.XICStack.palette[p.files.length % window.XICStack.palette.length],
          xic
        });
      } catch (err) {
        console.error('Failed to parse', f.name, err);
        alert('Failed to parse ' + f.name + ': ' + err.message);
      }
    }
    hideStatus();
    renderAll();
  }

  function recomputeXIC(parsedData, opts) {
    const mz = parseFloat(opts.xicMz);
    if (isNaN(mz) || mz <= 0) return null;
    return window.XICStack.buildXIC(parsedData.spectra, mz, parseFloat(opts.xicTol), opts.xicTolMode);
  }

  function recomputeAllXICs() {
    const p = state.panels.xicstack;
    p.files.forEach(f => {
      f.xic = recomputeXIC(f.data, p.opts);
    });
  }

  function loadXICStackDemo() {
    const p = state.panels.xicstack;
    const names = ['Sample_1', 'Sample_2', 'Sample_3 (Standard)', 'Sample_4'];
    const apex = [7.95, 8.10, 8.17, 8.42];
    const amplitudes = [2.0e5, 5.0e5, 1.0e6, 3.0e5];
    names.forEach((name, idx) => {
      const spectra = [];
      for (let r = 5; r <= 11; r += 0.05) {
        const intens = amplitudes[idx] * Math.exp(-Math.pow((r - apex[idx]) / 0.13, 2)) + Math.random() * 800;
        spectra.push({ msLevel: 1, rt: r * 60, mz: [315.232], intensity: [intens] });
      }
      const data = { spectra };
      const xic = recomputeXIC(data, p.opts);
      p.files.push({
        name, fileName: name + '.mzML',
        data,
        color: window.XICStack.palette[p.files.length % window.XICStack.palette.length],
        xic
      });
    });
    p.opts.referenceFile = 2;
    renderAll();
  }

  function renderXICStackInspector() {
    const p = state.panels.xicstack;
    const o = p.opts;

    inspector.appendChild(sectionEl('Files (' + p.files.length + ') — drag to reorder', `
      ${p.files.length ? `
        <div class="xic-file-list" id="xic-file-list">
          ${p.files.map((f, i) => `
            <div class="xic-file-row${o.referenceFile === i ? ' ref' : ''}${o.standardFile === i ? ' std' : ''}" draggable="true" data-idx="${i}">
              <span class="xic-drag-handle" title="Drag to reorder">⋮⋮</span>
              <input type="color" class="xic-color" data-idx="${i}" value="${f.color}" title="Trace color"/>
              <input type="text" class="xic-name" data-idx="${i}" value="${escapeAttr(f.name)}" placeholder="Sample label"/>
              <button class="xic-std-btn" data-idx="${i}" title="Set as standard — its peak is normalized to the max of all other samples">${o.standardFile === i ? '◆' : '◇'}</button>
              <button class="xic-ref-btn" data-idx="${i}" title="Set as reference (apex marker line)">${o.referenceFile === i ? '★' : '☆'}</button>
              <button class="xic-del-btn" data-idx="${i}" title="Remove">✕</button>
            </div>
          `).join('')}
        </div>
        <div style="font-size:10.5px;color:#8a8a85;line-height:1.45;margin-top:6px;">
          <b>⋮⋮</b> drag to reorder · <b>◆</b> standard (peak rescaled to max of others) · <b>★</b> reference (apex marker)<br>
          Top of list = top of stacked plot.
        </div>
      ` : `<div style="font-size:11.5px;color:#8a8a85;">No files added. Use the <b>+ Add mzML</b> button above.</div>`}
    `));

    inspector.appendChild(sectionEl('XIC parameters', `
      <div class="field-row">
        ${textField('Target m/z', 'xicMz', o.xicMz)}
        <div class="field">
          <label class="field-label">Tolerance unit</label>
          <select class="field-select" data-opt="xicTolMode">
            <option value="ppm" ${o.xicTolMode==='ppm'?'selected':''}>ppm</option>
            <option value="da" ${o.xicTolMode==='da'?'selected':''}>Daltons</option>
          </select>
        </div>
      </div>
      <div class="field">
        ${o.xicTolMode === 'ppm'
          ? rangeField('Tolerance', 'xicTol', o.xicTol, 1, 100, 1, ' ppm')
          : rangeField('Tolerance', 'xicTol', o.xicTol, 0.001, 1, 0.001, ' Da')}
      </div>
      <button class="btn primary" id="recompute-xics" style="width:100%;justify-content:center;">Recompute all XICs</button>
    `));

    inspector.appendChild(sectionEl('Display', `
      ${rangeField('X offset per sample (min)', 'xOffsetMin', o.xOffsetMin, 0, 2, 0.05, ' min')}
      ${rangeField('Y offset per sample (frac)', 'yOffsetFrac', o.yOffsetFrac, 0, 1, 0.02, '')}
      ${toggleField('Apex marker (dashed line from reference)', 'showApexMarker', o.showApexMarker)}
      ${toggleField('Show sample labels', 'showFileLabels', o.showFileLabels)}
      ${toggleField('Fill under traces', 'fillUnder', o.fillUnder)}
      ${rangeField('Trace line weight', 'traceWidth', o.traceWidth, 0.5, 3, 0.1, 'px')}
    `));

    inspector.appendChild(sectionEl('RT range (zoom)', `
      <div class="field-row">
        <div class="field"><label class="field-label">RT min (min)</label><input class="field-input" type="number" step="0.01" id="xic-rt-min" value="${o.rtViewMin != null ? o.rtViewMin : ''}" placeholder="auto"/></div>
        <div class="field"><label class="field-label">RT max (min)</label><input class="field-input" type="number" step="0.01" id="xic-rt-max" value="${o.rtViewMax != null ? o.rtViewMax : ''}" placeholder="auto"/></div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn primary" id="apply-xic-rt" style="flex:1;justify-content:center;">Apply</button>
        <button class="btn" id="reset-xic-rt" style="flex:1;justify-content:center;">Reset</button>
      </div>
    `));

    inspector.appendChild(sectionEl('Typography', `
      ${rangeField('Title size', 'titleSize', o.titleSize, 8, 24, 1, 'px')}
      ${rangeField('Axis label size', 'labelSize', o.labelSize, 7, 18, 1, 'px')}
      ${rangeField('Tick label size', 'tickSize', o.tickSize, 7, 16, 1, 'px')}
      ${textField('Title', 'title', o.title)}
    `));

    inspector.appendChild(sectionEl('Canvas', `
      <div class="field-row">
        ${numField('Width', 'width', o.width, 400, 2400, 10)}
        ${numField('Height', 'height', o.height, 200, 1800, 10)}
      </div>
    `));

    // Wire up
    inspector.querySelectorAll('[data-opt]').forEach(inp => {
      inp.addEventListener('input', () => onOptChange(inp));
    });
    inspector.querySelectorAll('[data-toggle]').forEach(t => {
      t.addEventListener('click', () => {
        const key = t.dataset.toggle;
        o[key] = !o[key];
        t.classList.toggle('on');
        renderStage();
      });
    });
    inspector.querySelectorAll('.insp-section-header').forEach(h => {
      h.addEventListener('click', () => h.parentElement.classList.toggle('collapsed'));
    });
    inspector.querySelectorAll('.xic-color').forEach(inp => {
      inp.addEventListener('input', e => {
        const i = parseInt(e.target.dataset.idx);
        p.files[i].color = e.target.value;
        renderStage();
      });
    });
    inspector.querySelectorAll('.xic-name').forEach(inp => {
      inp.addEventListener('input', e => {
        const i = parseInt(e.target.dataset.idx);
        p.files[i].name = e.target.value;
        renderStage();
      });
    });
    inspector.querySelectorAll('.xic-ref-btn').forEach(b => {
      b.addEventListener('click', e => {
        const i = parseInt(e.currentTarget.dataset.idx);
        o.referenceFile = (o.referenceFile === i) ? null : i;
        renderInspector();
        renderStage();
      });
    });
    inspector.querySelectorAll('.xic-std-btn').forEach(b => {
      b.addEventListener('click', e => {
        const i = parseInt(e.currentTarget.dataset.idx);
        o.standardFile = (o.standardFile === i) ? null : i;
        renderInspector();
        renderStage();
      });
    });
    // Drag-to-reorder
    const list = inspector.querySelector('#xic-file-list');
    if (list) {
      let dragSrc = null;
      list.querySelectorAll('.xic-file-row').forEach(row => {
        row.addEventListener('dragstart', e => {
          dragSrc = parseInt(row.dataset.idx);
          row.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(dragSrc));
        });
        row.addEventListener('dragend', () => {
          row.classList.remove('dragging');
          list.querySelectorAll('.xic-file-row').forEach(r => r.classList.remove('drag-over'));
        });
        row.addEventListener('dragover', e => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          row.classList.add('drag-over');
        });
        row.addEventListener('dragleave', () => {
          row.classList.remove('drag-over');
        });
        row.addEventListener('drop', e => {
          e.preventDefault();
          row.classList.remove('drag-over');
          const tgt = parseInt(row.dataset.idx);
          if (dragSrc == null || dragSrc === tgt) return;
          // Reorder
          const moved = p.files.splice(dragSrc, 1)[0];
          p.files.splice(tgt, 0, moved);
          // Adjust reference index
          if (o.referenceFile === dragSrc) o.referenceFile = tgt;
          else if (dragSrc < o.referenceFile && tgt >= o.referenceFile) o.referenceFile--;
          else if (dragSrc > o.referenceFile && tgt <= o.referenceFile) o.referenceFile++;
          // Adjust standard index
          if (o.standardFile === dragSrc) o.standardFile = tgt;
          else if (dragSrc < o.standardFile && tgt >= o.standardFile) o.standardFile--;
          else if (dragSrc > o.standardFile && tgt <= o.standardFile) o.standardFile++;
          dragSrc = null;
          renderAll();
        });
      });
    }
    inspector.querySelectorAll('.xic-del-btn').forEach(b => {
      b.addEventListener('click', e => {
        const i = parseInt(e.currentTarget.dataset.idx);
        p.files.splice(i, 1);
        if (o.referenceFile === i) o.referenceFile = null;
        else if (o.referenceFile != null && o.referenceFile > i) o.referenceFile--;
        renderAll();
      });
    });
    const recomp = inspector.querySelector('#recompute-xics');
    if (recomp) recomp.addEventListener('click', () => {
      recomputeAllXICs();
      renderStage();
    });
    const applyRt = inspector.querySelector('#apply-xic-rt');
    if (applyRt) applyRt.addEventListener('click', () => {
      const lo = parseFloat(inspector.querySelector('#xic-rt-min').value);
      const hi = parseFloat(inspector.querySelector('#xic-rt-max').value);
      if (!isNaN(lo) && !isNaN(hi) && hi > lo) {
        o.rtViewMin = lo; o.rtViewMax = hi;
      }
      renderStage();
    });
    const resetRt = inspector.querySelector('#reset-xic-rt');
    if (resetRt) resetRt.addEventListener('click', () => {
      o.rtViewMin = null; o.rtViewMax = null;
      renderInspector();
      renderStage();
    });
  }

  // ============================================================================
  // GC-MS panel
  // ============================================================================
  function renderGCMSStage() {
    const p = state.panels.gcms;
    const o = p.opts;
    const hdr = stageHeader({
      title: p.data ? (o.title || (p.data.spectra[p.data.activeIdx]?.name || 'GC-MS')) : 'GC-MS Figure',
      sub: p.data
        ? `${p.data.spectra.length} spectra · ${p.data.chromatogram ? p.data.chromatogram.rt.length + ' chrom points' : 'no chromatogram'}${p.data.library ? ' · library loaded' : ''}`
        : 'No data loaded',
      panel: p,
      openLabel: 'Open .csv / .txt'
    });
    stage.appendChild(hdr);

    if (p.data) {
      const pills = document.createElement('div');
      pills.className = 'plot-type-bar';
      const types = [
        { id: 'overview',  name: 'Chrom + EI',     icon: '⌐' },
        { id: 'tic',       name: 'Chromatogram',   icon: '∿' },
        { id: 'spectrum',  name: 'EI spectrum',    icon: '⏐' },
        { id: 'mirror',    name: 'Library mirror', icon: '↕' }
      ];
      pills.innerHTML = types.map(t => `
        <button class="pill ${o.plotType===t.id?'active':''}" data-plot="${t.id}">
          <span class="pill-icon">${t.icon}</span>
          <span class="pill-name">${t.name}</span>
        </button>
      `).join('');
      stage.appendChild(pills);
      const PLOT_HEIGHTS = { overview: 540, tic: 360, spectrum: 360, mirror: 460 };
      pills.querySelectorAll('.pill').forEach(b => {
        b.addEventListener('click', () => {
          o.plotType = b.dataset.plot;
          if (PLOT_HEIGHTS[o.plotType] != null) o.height = PLOT_HEIGHTS[o.plotType];
          renderAll();
        });
      });
    }

    const wrap = document.createElement('div');
    wrap.className = 'canvas-wrap';
    if (!p.data) {
      wrap.innerHTML = emptyCard({
        glyph: 'gc',
        title: 'Drop a GC-MS file',
        body: `Text file with optional sections — <code>#&nbsp;CHROM</code> (rt,intensity), <code>#&nbsp;SPECTRUM&nbsp;rt=…&nbsp;name=…</code> (m/z,intensity), <code>#&nbsp;LIBRARY&nbsp;name=…</code> (m/z,intensity), <code>#&nbsp;PEAKS</code> (rt,name). The mirror plot includes a NIST-style match score.`,
        sample: 'Synthetic enzyme product + NIST match'
      });
      wrap.querySelector('#open-btn-2').addEventListener('click', () => fileInput.click());
      wrap.querySelector('#sample-btn').addEventListener('click', loadGCMSSample);
    } else {
      const frame = document.createElement('div');
      frame.className = 'figure-frame';
      frame.innerHTML = window.GCMS.render(p.data, o);
      wrap.appendChild(frame);
    }
    stage.appendChild(wrap);
    if (p.data) applyZoom();
  }

  function renderGCMSInspector() {
    const p = state.panels.gcms;
    const o = p.opts;
    inspector.appendChild(sectionEl('Style', `
      <button class="btn" id="reset-preset-gcms" style="width:100%;justify-content:center;">↺ Reset style to defaults</button>
    `));
    inspector.appendChild(sectionEl('Data', p.data ? `
      <div class="data-summary">
        <div class="summary-row"><span class="key">File</span><span class="val">${escapeHtml(p.fileName || '—')}</span></div>
        <div class="summary-row"><span class="key">Spectra</span><span class="val">${p.data.spectra.length}</span></div>
        <div class="summary-row"><span class="key">Chromatogram</span><span class="val">${p.data.chromatogram ? p.data.chromatogram.rt.length + ' pts' : '—'}</span></div>
        <div class="summary-row"><span class="key">Peaks</span><span class="val">${p.data.peaks?.length || 0}</span></div>
        <div class="summary-row"><span class="key">Library</span><span class="val">${p.data.library ? escapeHtml(p.data.library.name) : '—'}</span></div>
      </div>
      ${p.data.spectra.length > 1 ? `
        <div class="field" style="margin-top:8px;">
          <label class="field-label">Active spectrum</label>
          <select class="field-select" id="gcms-active-spec">
            ${p.data.spectra.map((s, i) => `<option value="${i}" ${i===p.data.activeIdx?'selected':''}>${escapeHtml(s.name || ('Spectrum ' + (i+1)))}${s.rt != null ? ' · RT ' + s.rt.toFixed(2) : ''}</option>`).join('')}
          </select>
        </div>
      ` : ''}
    ` : `<div style="font-size:11.5px;color:#8a8a85;">No data loaded.</div>`));
    inspector.appendChild(sectionEl('Title & Labels', `
      ${textField('Title', 'title', o.title)}
      ${textField('Chromatogram x-axis', 'xlabChrom', o.xlabChrom)}
      ${textField('Chromatogram y-axis', 'ylabChrom', o.ylabChrom)}
      ${textField('Spectrum x-axis', 'xlabSpec', o.xlabSpec)}
      ${textField('Spectrum y-axis', 'ylabSpec', o.ylabSpec)}
    `));
    inspector.appendChild(sectionEl('Typography', `
      ${rangeField('Title size', 'titleSize', o.titleSize, 8, 24, 1, 'px')}
      ${rangeField('Axis label size', 'labelSize', o.labelSize, 7, 18, 1, 'px')}
      ${rangeField('Tick label size', 'tickSize', o.tickSize, 7, 16, 1, 'px')}
      ${rangeField('Annotation size', 'annoFontSize', o.annoFontSize, 6, 14, 1, 'px')}
    `));
    inspector.appendChild(sectionEl('Style', `
      ${rangeField('Trace line weight', 'lineWidth', o.lineWidth, 0.4, 3, 0.1, 'px')}
      ${rangeField('Stick weight', 'stickWidth', o.stickWidth, 0.4, 3, 0.1, 'px')}
      ${rangeField('Border weight', 'borderWidth', o.borderWidth, 0.4, 3, 0.1, 'px')}
      <div class="field"><label class="field-label">Spine style</label>
        <select class="field-select" data-opt="spineStyle">
          <option value="box" ${o.spineStyle==='box'?'selected':''}>Full box</option>
          <option value="L" ${o.spineStyle==='L'?'selected':''}>L-shape</option>
        </select>
      </div>
      <div class="field"><label class="field-label">Tick direction</label>
        <select class="field-select" data-opt="tickDir">
          <option value="out" ${o.tickDir==='out'?'selected':''}>Outward</option>
          <option value="in" ${o.tickDir==='in'?'selected':''}>Inward</option>
        </select>
      </div>
      ${toggleField('Show m/z annotations', 'showAnnotations', o.showAnnotations)}
      ${rangeField('Top N annotations', 'annoTopN', o.annoTopN, 0, 20, 1, '')}
    `));
    inspector.appendChild(sectionEl('Colors', `
      <div class="field-row">
        <div class="field"><label class="field-label">Stick</label><input class="field-input" type="color" data-opt="stickColor" value="${o.stickColor}"/></div>
        <div class="field"><label class="field-label">Library</label><input class="field-input" type="color" data-opt="libColor" value="${o.libColor}"/></div>
      </div>
    `));
    inspector.appendChild(sectionEl('Canvas', `
      <div class="field-row">
        ${numField('Width', 'width', o.width, 200, 2400, 10)}
        ${numField('Height', 'height', o.height, 200, 1800, 10)}
      </div>
    `));
    wireInspectorCommon();
    const reset = inspector.querySelector('#reset-preset-gcms');
    if (reset) reset.addEventListener('click', () => resetPanelDefaults('gcms'));
    const sel = inspector.querySelector('#gcms-active-spec');
    if (sel) sel.addEventListener('change', e => {
      p.data.activeIdx = parseInt(e.target.value);
      renderStage();
    });
  }

  async function loadGCMSSample() {
    const data = window.GCMS.sample();
    state.panels.gcms.data = data;
    state.panels.gcms.fileName = 'Caryophyllene oxide demo (built-in)';
    state.panels.gcms.opts.title = '';
    state.activeType = 'gcms';
    renderAll();
  }
  window.__loadGCMSSample = loadGCMSSample;

  // ============================================================================
  // Michaelis-Menten panel
  // ============================================================================
  function renderMMStage() {
    const p = state.panels.mm;
    const o = p.opts;
    const hdr = stageHeader({
      title: p.data ? (o.title || 'Michaelis–Menten') : 'Michaelis–Menten Figure',
      sub: p.data
        ? `${p.data.datasets.length} dataset${p.data.datasets.length===1?'':'s'} · ${p.data.datasets[0]?.S.length || 0} points`
        : 'No data loaded',
      panel: p,
      openLabel: 'Open .csv / .tsv'
    });
    stage.appendChild(hdr);

    if (p.data) {
      const pills = document.createElement('div');
      pills.className = 'plot-type-bar';
      const types = [
        { id: 'mm', name: 'Michaelis–Menten',   icon: 'v' },
        { id: 'lb', name: 'Lineweaver–Burk',    icon: '1' },
        { id: 'eh', name: 'Eadie–Hofstee',      icon: 'e' },
        { id: 'hw', name: 'Hanes–Woolf',        icon: 'h' }
      ];
      pills.innerHTML = types.map(t => `
        <button class="pill ${o.plotType===t.id?'active':''}" data-plot="${t.id}">
          <span class="pill-icon">${t.icon}</span>
          <span class="pill-name">${t.name}</span>
        </button>
      `).join('');
      stage.appendChild(pills);
      pills.querySelectorAll('.pill').forEach(b => {
        b.addEventListener('click', () => {
          o.plotType = b.dataset.plot;
          renderAll();
        });
      });
    }

    const wrap = document.createElement('div');
    wrap.className = 'canvas-wrap';
    if (!p.data) {
      wrap.innerHTML = emptyCard({
        glyph: 'v',
        title: 'Drop a kinetics CSV',
        body: `Columns: <code>[S], v</code> (single curve) or <code>[S], v_WT, v_mut1, …</code> (overlay). Optional <code>err</code> columns add SEM bars. K<sub>m</sub>, V<sub>max</sub> and k<sub>cat</sub> are fit by Gauss–Newton on the hyperbola. Linearizations available as separate plot types.`,
        sample: 'Synthetic WT + slow variant'
      });
      wrap.querySelector('#open-btn-2').addEventListener('click', () => fileInput.click());
      wrap.querySelector('#sample-btn').addEventListener('click', loadMMSample);
    } else {
      const frame = document.createElement('div');
      frame.className = 'figure-frame';
      frame.innerHTML = window.MM.render(p.data, o);
      wrap.appendChild(frame);
    }
    stage.appendChild(wrap);
    if (p.data) applyZoom();
  }

  function renderMMInspector() {
    const p = state.panels.mm;
    const o = p.opts;
    inspector.appendChild(sectionEl('Style', `
      <button class="btn" id="reset-preset-mm" style="width:100%;justify-content:center;">↺ Reset style to defaults</button>
    `));
    inspector.appendChild(sectionEl('Data', p.data ? `
      <div class="data-summary">
        <div class="summary-row"><span class="key">File</span><span class="val">${escapeHtml(p.fileName || '—')}</span></div>
        <div class="summary-row"><span class="key">Datasets</span><span class="val">${p.data.datasets.length}</span></div>
        ${p.data.datasets.map(ds => ds.fit ? `
          <div class="summary-row"><span class="key">${escapeHtml(ds.label)}</span><span class="val">K\u2098 ${mmFmt(ds.fit.Km)} · V\u2098\u2090\u2093 ${mmFmt(ds.fit.Vmax)} · R\u00b2 ${ds.fit.R2.toFixed(3)}</span></div>
        ` : '').join('')}
      </div>
    ` : `<div style="font-size:11.5px;color:#8a8a85;">No data loaded.</div>`));
    inspector.appendChild(sectionEl('Units & kcat', `
      <div class="field-row">
        ${textField('[S] unit', 'sUnit', o.sUnit)}
        ${textField('v unit', 'vUnit', o.vUnit)}
      </div>
      ${textField('[E] for k\u209c\u2090\u209c (same units as V\u2098\u2090\u2093)', 'enzymeConc', o.enzymeConc)}
      <div style="font-size:10.5px;color:#8a8a85;line-height:1.45;">Optional. If set, k\u209c\u2090\u209c column appears in the parameter box.</div>
    `));
    inspector.appendChild(sectionEl('Title & Labels', `
      ${textField('Title', 'title', o.title)}
    `));
    inspector.appendChild(sectionEl('Typography', `
      ${rangeField('Title size', 'titleSize', o.titleSize, 8, 24, 1, 'px')}
      ${rangeField('Axis label size', 'labelSize', o.labelSize, 7, 18, 1, 'px')}
      ${rangeField('Tick label size', 'tickSize', o.tickSize, 7, 16, 1, 'px')}
    `));
    inspector.appendChild(sectionEl('Style', `
      ${rangeField('Fit line weight', 'lineWidth', o.lineWidth, 0.4, 3, 0.1, 'px')}
      ${rangeField('Border weight', 'borderWidth', o.borderWidth, 0.4, 3, 0.1, 'px')}
      ${rangeField('Marker size', 'markerSize', o.markerSize, 1, 10, 0.5, 'px')}
      ${rangeField('Error bar weight', 'errorBarWidth', o.errorBarWidth, 0.4, 2, 0.1, 'px')}
      <div class="field"><label class="field-label">Spine style</label>
        <select class="field-select" data-opt="spineStyle">
          <option value="box" ${o.spineStyle==='box'?'selected':''}>Full box</option>
          <option value="L" ${o.spineStyle==='L'?'selected':''}>L-shape</option>
        </select>
      </div>
      ${toggleField('Color overlays', 'useColor', o.useColor)}
      ${toggleField('Show legend', 'showLegend', o.showLegend)}
      ${toggleField('Show parameter table', 'showParamBox', o.showParamBox)}
      <div class="field"><label class="field-label">Parameter box position</label>
        <select class="field-select" data-opt="paramBoxPosition">
          <option value="bottom-right" ${o.paramBoxPosition==='bottom-right'?'selected':''}>Bottom-right</option>
          <option value="bottom-left" ${o.paramBoxPosition==='bottom-left'?'selected':''}>Bottom-left</option>
          <option value="top-right" ${o.paramBoxPosition==='top-right'?'selected':''}>Top-right</option>
          <option value="top-left" ${o.paramBoxPosition==='top-left'?'selected':''}>Top-left</option>
        </select>
      </div>
    `));
    inspector.appendChild(sectionEl('Canvas', `
      <div class="field-row">
        ${numField('Width', 'width', o.width, 200, 2400, 10)}
        ${numField('Height', 'height', o.height, 200, 1800, 10)}
      </div>
    `));
    wireInspectorCommon();
    const reset = inspector.querySelector('#reset-preset-mm');
    if (reset) reset.addEventListener('click', () => resetPanelDefaults('mm'));
  }

  function mmFmt(x) {
    if (!isFinite(x)) return '—';
    if (Math.abs(x) >= 1e4 || Math.abs(x) < 1e-3) return x.toExponential(2);
    return Number(x.toPrecision(3)).toString();
  }

  async function loadMMSample() {
    const data = window.MM.sample();
    state.panels.mm.data = data;
    state.panels.mm.fileName = 'WT vs D110A (built-in)';
    state.panels.mm.opts.title = '';
    state.activeType = 'mm';
    renderAll();
  }
  window.__loadMMSample = loadMMSample;

  // ============================================================================
  // CD spectrum panel
  // ============================================================================
  function renderCDStage() {
    const p = state.panels.cd;
    const o = p.opts;
    const hdr = stageHeader({
      title: p.data ? (o.title || (p.data.mode === 'melt' ? 'Thermal melt' : 'CD spectrum')) : 'CD Spectrum Figure',
      sub: p.data
        ? `${p.data.traces.length} trace${p.data.traces.length===1?'':'s'} · mode: ${p.data.mode}`
        : 'No data loaded',
      panel: p,
      openLabel: 'Open .csv / .txt'
    });
    stage.appendChild(hdr);

    if (p.data) {
      const pills = document.createElement('div');
      pills.className = 'plot-type-bar';
      const types = [
        { id: 'spectrum', name: 'CD spectrum',  icon: 'λ' },
        { id: 'melt',     name: 'Thermal melt', icon: 'T' }
      ];
      pills.innerHTML = types.map(t => `
        <button class="pill ${(o.mode||p.data.mode)===t.id?'active':''}" data-mode="${t.id}">
          <span class="pill-icon">${t.icon}</span>
          <span class="pill-name">${t.name}</span>
        </button>
      `).join('');
      stage.appendChild(pills);
      pills.querySelectorAll('.pill').forEach(b => {
        b.addEventListener('click', () => {
          o.mode = b.dataset.mode;
          renderAll();
        });
      });
    }

    const wrap = document.createElement('div');
    wrap.className = 'canvas-wrap';
    if (!p.data) {
      wrap.innerHTML = emptyCard({
        glyph: 'θ',
        title: 'Drop a CD data file',
        body: `Columns: <code>wavelength, trace1, trace2, …</code> (spectrum) or <code>temperature, signal1, signal2, …</code> (melt). Mode auto-detected. Helix landmarks at 208/222 nm are marked; melts get a two-state sigmoid fit with extracted T<sub>m</sub>.`,
        sample: 'WT vs mutant CD overlay',
        extraSampleId: 'sample-melt-btn',
        extraSampleLabel: 'Sample thermal melt'
      });
      wrap.querySelector('#open-btn-2').addEventListener('click', () => fileInput.click());
      wrap.querySelector('#sample-btn').addEventListener('click', loadCDSample);
      const meltBtn = wrap.querySelector('#sample-melt-btn');
      if (meltBtn) meltBtn.addEventListener('click', loadCDMeltSample);
    } else {
      const frame = document.createElement('div');
      frame.className = 'figure-frame';
      frame.innerHTML = window.CD.render(p.data, o);
      wrap.appendChild(frame);
    }
    stage.appendChild(wrap);
    if (p.data) applyZoom();
  }

  function renderCDInspector() {
    const p = state.panels.cd;
    const o = p.opts;
    inspector.appendChild(sectionEl('Style', `
      <button class="btn" id="reset-preset-cd" style="width:100%;justify-content:center;">↺ Reset style to defaults</button>
    `));
    inspector.appendChild(sectionEl('Data', p.data ? `
      <div class="data-summary">
        <div class="summary-row"><span class="key">File</span><span class="val">${escapeHtml(p.fileName || '—')}</span></div>
        <div class="summary-row"><span class="key">Mode</span><span class="val">${p.data.mode}</span></div>
        <div class="summary-row"><span class="key">Traces</span><span class="val">${p.data.traces.length}</span></div>
        ${p.data.mode === 'melt' ? p.data.traces.map(t => t.fit ? `
          <div class="summary-row"><span class="key">${escapeHtml(t.label)}</span><span class="val">T\u2098 ${t.fit.Tm.toFixed(1)} °C · R\u00b2 ${t.fit.R2.toFixed(3)}</span></div>
        ` : '').join('') : ''}
      </div>
    ` : `<div style="font-size:11.5px;color:#8a8a85;">No data loaded.</div>`));
    inspector.appendChild(sectionEl('Title & Labels', `
      ${textField('Title', 'title', o.title)}
      ${textField('x-axis label', 'xlab', o.xlab)}
      ${textField('y-axis label', 'ylab', o.ylab)}
      <div style="font-size:10.5px;color:#8a8a85;line-height:1.45;">Leave blank for auto labels (Wavelength (nm) / Ellipticity (mdeg) or Temperature (°C)).</div>
    `));
    inspector.appendChild(sectionEl('Typography', `
      ${rangeField('Title size', 'titleSize', o.titleSize, 8, 24, 1, 'px')}
      ${rangeField('Axis label size', 'labelSize', o.labelSize, 7, 18, 1, 'px')}
      ${rangeField('Tick label size', 'tickSize', o.tickSize, 7, 16, 1, 'px')}
    `));
    inspector.appendChild(sectionEl('Style', `
      ${rangeField('Line weight', 'lineWidth', o.lineWidth, 0.4, 3, 0.1, 'px')}
      ${rangeField('Border weight', 'borderWidth', o.borderWidth, 0.4, 3, 0.1, 'px')}
      <div class="field"><label class="field-label">Spine style</label>
        <select class="field-select" data-opt="spineStyle">
          <option value="box" ${o.spineStyle==='box'?'selected':''}>Full box</option>
          <option value="L" ${o.spineStyle==='L'?'selected':''}>L-shape</option>
        </select>
      </div>
      ${toggleField('Show zero line', 'showZeroLine', o.showZeroLine)}
      ${toggleField('Show 208/222 nm helix landmarks', 'showLandmarks', o.showLandmarks)}
      ${toggleField('Color overlays', 'useColor', o.useColor)}
      ${toggleField('Show legend', 'showLegend', o.showLegend)}
      ${toggleField('Show T\u2098 parameter table', 'showParamBox', o.showParamBox)}
    `));
    inspector.appendChild(sectionEl('Canvas', `
      <div class="field-row">
        ${numField('Width', 'width', o.width, 200, 2400, 10)}
        ${numField('Height', 'height', o.height, 200, 1800, 10)}
      </div>
    `));
    wireInspectorCommon();
    const reset = inspector.querySelector('#reset-preset-cd');
    if (reset) reset.addEventListener('click', () => resetPanelDefaults('cd'));
  }

  async function loadCDSample() {
    const data = window.CD.sample();
    state.panels.cd.data = data;
    state.panels.cd.fileName = 'WT/mutant/denatured CD (built-in)';
    state.panels.cd.opts.title = '';
    state.panels.cd.opts.mode = 'spectrum';
    state.activeType = 'cd';
    renderAll();
  }
  async function loadCDMeltSample() {
    const data = window.CD.sampleMelt();
    state.panels.cd.data = data;
    state.panels.cd.fileName = 'WT vs D110A thermal melt (built-in)';
    state.panels.cd.opts.title = '';
    state.panels.cd.opts.mode = 'melt';
    state.activeType = 'cd';
    renderAll();
  }
  window.__loadCDSample = loadCDSample;
  window.__loadCDMeltSample = loadCDMeltSample;

  // ============================================================================
  // Shared chrome helpers for new panels
  // ============================================================================
  function stageHeader({ title, sub, panel, openLabel }) {
    const hdr = document.createElement('div');
    hdr.className = 'stage-header';
    hdr.innerHTML = `
      <div>
        <div class="stage-title">${escapeHtml(title)}</div>
        <div class="stage-sub">${escapeHtml(sub)}</div>
      </div>
      <div class="spacer"></div>
      <div class="zoom-controls">
        <button class="zoom-btn ${panel.zoom==='fit'?'active':''}" data-z="fit">Fit</button>
        <button class="zoom-btn ${panel.zoom===0.75?'active':''}" data-z="0.75">75%</button>
        <button class="zoom-btn ${panel.zoom===1?'active':''}" data-z="1">100%</button>
        <button class="zoom-btn ${panel.zoom===1.25?'active':''}" data-z="1.25">125%</button>
        <button class="zoom-btn ${panel.zoom===1.5?'active':''}" data-z="1.5">150%</button>
      </div>
      <button class="btn ghost" id="open-btn">
        <svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 5h12v8H2z"/><path d="M2 5l2-2h4l2 2"/></svg>
        ${escapeHtml(openLabel || 'Open file')}
      </button>
      <button class="btn primary" id="export-btn">
        <svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2v9M4 7l4 4 4-4M3 14h10"/></svg>
        Export
      </button>
    `;
    hdr.querySelectorAll('.zoom-btn').forEach(b => {
      b.addEventListener('click', () => {
        const z = b.dataset.z;
        panel.zoom = z === 'fit' ? 'fit' : parseFloat(z);
        renderStage();
      });
    });
    hdr.querySelector('#open-btn').addEventListener('click', () => fileInput.click());
    hdr.querySelector('#export-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openExportMenu(e.currentTarget);
    });
    return hdr;
  }

  function emptyCard({ glyph, title, body, sample, extraSampleId, extraSampleLabel }) {
    return `
      <div class="empty-state">
        <div class="empty-card">
          <div class="empty-icon"><em>${escapeHtml(glyph || 'f')}</em></div>
          <h2>${escapeHtml(title)}</h2>
          <p>${body}</p>
          <div class="empty-actions">
            <button class="btn" id="open-btn-2">Choose file…</button>
            <button class="btn ghost" id="sample-btn">${escapeHtml(sample || 'Use sample')}</button>
            ${extraSampleId ? `<button class="btn ghost" id="${extraSampleId}">${escapeHtml(extraSampleLabel)}</button>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  function wireInspectorCommon() {
    inspector.querySelectorAll('[data-opt]').forEach(inp => {
      inp.addEventListener('input', () => onOptChange(inp));
    });
    inspector.querySelectorAll('[data-toggle]').forEach(t => {
      t.addEventListener('click', () => {
        const key = t.dataset.toggle;
        const o = state.panels[state.activeType].opts;
        o[key] = !o[key];
        t.classList.toggle('on');
        renderStage();
      });
    });
    inspector.querySelectorAll('.insp-section-header').forEach(h => {
      h.addEventListener('click', () => h.parentElement.classList.toggle('collapsed'));
    });
  }

  function renderPlaceholder() {
    const cur = PANEL_TYPES.find(p => p.id === state.activeType);
    const wrap = document.createElement('div');
    wrap.className = 'placeholder-panel';
    wrap.innerHTML = `
      <div class="ph-card">
        <div class="ph-icon">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="9"/>
            <path d="M11 6v5l3 2"/>
          </svg>
        </div>
        <h3>${cur.name}</h3>
        <p>This instrument panel is reserved — once we wire up its parser and renderer, it will accept the appropriate file format and produce a journal-grade figure with the same toolset.</p>
        <span class="ph-tag">Coming soon</span>
      </div>
    `;
    stage.appendChild(wrap);
  }

  // ---------- Inspector ----------
  function renderInspector() {
    inspector.innerHTML = '';
    if (state.activeType === 'itc') return renderITCInspector();
    if (state.activeType === 'lcms') return renderLCMSInspector();
    if (state.activeType === 'xicstack') return renderXICStackInspector();
    if (state.activeType === 'gcms') return renderGCMSInspector();
    if (state.activeType === 'mm') return renderMMInspector();
    if (state.activeType === 'cd') return renderCDInspector();
    inspector.innerHTML = `<div style="padding:20px;color:#8a8a85;font-size:12px;line-height:1.5;">Switch to an active panel to access controls.</div>`;
  }

  function renderITCInspector() {
    if (state.activeType !== 'itc') {
      inspector.innerHTML = `<div style="padding:20px;color:#8a8a85;font-size:12px;line-height:1.5;">Switch to the <b style="color:#1a1a1a">ITC</b> panel to access figure controls.</div>`;
      return;
    }
    const p = state.panels.itc;
    const o = p.opts;

    inspector.appendChild(sectionEl('Style', `
      <button class="btn" id="reset-preset-itc" style="width:100%;justify-content:center;">↺ Reset style to defaults</button>
      <div style="font-size:10.5px;color:#8a8a85;line-height:1.45;margin-top:6px;">
        Restores journal-neutral defaults (Helvetica · 11pt · L-spine · ticks out · hairline strokes).
      </div>
    `));

    inspector.appendChild(sectionEl('Data', `
      ${p.data ? `
        <div class="data-summary">
          <div class="summary-row"><span class="key">File</span><span class="val">${escapeHtml(p.fileName || '—')}</span></div>
          <div class="summary-row"><span class="key">Time points</span><span class="val">${p.data.time.length}</span></div>
          <div class="summary-row"><span class="key">Injections</span><span class="val">${p.data.mr.length}</span></div>
          <div class="summary-row"><span class="key">Fit points</span><span class="val">${p.data.fit.length}</span></div>
          <div class="summary-row"><span class="key">Injections used</span><span class="val">${p.data.excluded.filter(x => !x).length}/${p.data.mr.length}</span></div>
          <div class="summary-row"><span class="key">Time range</span><span class="val">${p.data.time[0]?.toFixed(0)}–${p.data.time[p.data.time.length-1]?.toFixed(0)} s</span></div>
        </div>
        <button class="btn" id="open-editor-btn" style="margin-top:8px;width:100%;justify-content:center;">Edit data table…</button>
      ` : `<div style="font-size:11.5px;color:#8a8a85;">No data loaded.</div>`}
    `));

    inspector.appendChild(sectionEl('Title & Labels', `
      ${textField('Title', 'title', o.title)}
      ${textField('Top y-axis label', 'ylab1', o.ylab1)}
      ${textField('Top x-axis label', 'xlab1', o.xlab1)}
      ${textField('Bottom y-axis label', 'ylab2', o.ylab2)}
      ${textField('Bottom x-axis label', 'xlab2', o.xlab2)}
    `));

    inspector.appendChild(sectionEl('Typography', `
      <div class="field">
        <label class="field-label">Font family</label>
        <select class="field-select" data-opt="fontFamily">
          <option value="'Times New Roman', Times, serif" ${o.fontFamily.includes('Times') ? 'selected':''}>Times (serif)</option>
          <option value="Georgia, serif" ${o.fontFamily.includes('Georgia') ? 'selected':''}>Georgia</option>
          <option value="Arial, 'Helvetica Neue', Helvetica, sans-serif" ${o.fontFamily.includes('Helvetica') ? 'selected':''}>Helvetica</option>
          <option value="'Inter', sans-serif" ${o.fontFamily.includes('Inter') ? 'selected':''}>Inter</option>
        </select>
      </div>
      ${rangeField('Title size', 'titleSize', o.titleSize, 12, 32, 1, 'px')}
      ${rangeField('Axis label size', 'labelSize', o.labelSize, 10, 24, 1, 'px')}
      ${rangeField('Tick label size', 'tickSize', o.tickSize, 8, 18, 1, 'px')}
    `));

    inspector.appendChild(sectionEl('Style', `
      ${rangeField('Trace line weight', 'traceWidth', o.traceWidth, 0.4, 3, 0.1, 'px')}
      ${rangeField('Fit line weight', 'fitWidth', o.fitWidth, 0.4, 3, 0.1, 'px')}
      ${rangeField('Axis border weight', 'borderWidth', o.borderWidth, 0.5, 3, 0.1, 'px')}
      <div class="field">
        <label class="field-label">Tick direction</label>
        <select class="field-select" data-opt="tickDir">
          <option value="out" ${o.tickDir==='out'?'selected':''}>Outward (Cell)</option>
          <option value="in" ${o.tickDir==='in'?'selected':''}>Inward (Nature/Science)</option>
        </select>
      </div>
      <div class="field">
        <label class="field-label">Spine style</label>
        <select class="field-select" data-opt="spineStyle">
          <option value="box" ${o.spineStyle==='box'?'selected':''}>Full box (Cell)</option>
          <option value="L" ${o.spineStyle==='L'?'selected':''}>L-shape (Nature/Science)</option>
        </select>
      </div>
      <div class="field">
        <label class="field-label">Panel layout</label>
        <select class="field-select" data-opt="panelLayout">
          <option value="joined" ${(o.panelLayout||'separated')==='joined'?'selected':''}>Joined — panels touch, time axis on top</option>
          <option value="separated" ${(o.panelLayout||'separated')==='separated'?'selected':''}>Separated — gap between, time axis below</option>
        </select>
      </div>
      ${toggleField('Bold axis labels', 'boldLabels', o.boldLabels)}
      ${toggleField('Grid lines (faint)', 'showGridLines', o.showGridLines)}
      ${toggleField('Grid bands (zebra)', 'showGridBands', o.showGridBands)}
      ${toggleField('Show parameter box', 'showParamBox', o.showParamBox)}
      <div class="field">
        <label class="field-label">Parameter box position</label>
        <select class="field-select" data-opt="paramBoxPosition">
          <option value="bottom-right" ${(o.paramBoxPosition||'bottom-right')==='bottom-right'?'selected':''}>Bottom-right (inside)</option>
          <option value="bottom-left" ${o.paramBoxPosition==='bottom-left'?'selected':''}>Bottom-left (inside)</option>
          <option value="top-right" ${o.paramBoxPosition==='top-right'?'selected':''}>Top-right (inside)</option>
          <option value="top-left" ${o.paramBoxPosition==='top-left'?'selected':''}>Top-left (inside)</option>
          <option value="outside-right" ${o.paramBoxPosition==='outside-right'?'selected':''}>Outside (right of figure)</option>
        </select>
      </div>
      ${rangeField('Parameter box font', 'paramBoxFontSize', o.paramBoxFontSize ?? 11, 7, 18, 1, 'px')}
    `));

    inspector.appendChild(sectionEl('Markers (data points)', `
      <div class="field">
        <label class="field-label">Marker style</label>
        <select class="field-select" data-opt="markerStyle">
          <option value="filled-circle" ${o.markerStyle==='filled-circle'?'selected':''}>● Filled circle</option>
          <option value="open-circle" ${o.markerStyle==='open-circle'?'selected':''}>○ Open circle</option>
          <option value="filled-square" ${o.markerStyle==='filled-square'?'selected':''}>■ Filled square</option>
          <option value="open-square" ${o.markerStyle==='open-square'?'selected':''}>□ Open square</option>
          <option value="filled-triangle" ${o.markerStyle==='filled-triangle'?'selected':''}>▲ Filled triangle</option>
          <option value="open-triangle" ${o.markerStyle==='open-triangle'?'selected':''}>△ Open triangle</option>
          <option value="filled-diamond" ${o.markerStyle==='filled-diamond'?'selected':''}>◆ Filled diamond</option>
          <option value="open-diamond" ${o.markerStyle==='open-diamond'?'selected':''}>◇ Open diamond</option>
          <option value="plus" ${o.markerStyle==='plus'?'selected':''}>+ Plus</option>
          <option value="cross" ${o.markerStyle==='cross'?'selected':''}>× Cross</option>
        </select>
      </div>
      ${rangeField('Marker size', 'markerSize', o.markerSize, 1.5, 12, 0.5, 'px')}
      ${rangeField('Marker outline weight', 'markerStrokeWidth', o.markerStrokeWidth, 0, 2, 0.1, 'px')}
      <div class="field-row">
        <div class="field">
          <label class="field-label">Fill</label>
          <input class="field-input" type="color" data-opt="markerFill" value="${o.markerFill}"/>
        </div>
        <div class="field">
          <label class="field-label">Outline</label>
          <input class="field-input" type="color" data-opt="markerStroke" value="${o.markerStroke}"/>
        </div>
      </div>
    `));

    inspector.appendChild(sectionEl('Canvas size', `
      <div class="field-row">
        ${numField('Width', 'width', o.width, 100, 2400, 2)}
        ${numField('Height', 'height', o.height, 100, 1800, 2)}
      </div>
      <div style="font-size:10.5px;color:#8a8a85;line-height:1.45;">SVG units (≈ 3.78 px/mm). Print sizes: Nature single 336 (89mm), Cell single 322 (85mm), Science double 454 (120mm).</div>
    `));

    inspector.appendChild(sectionEl('Panel labels', `
      <div class="field-row">
        ${textField('Top panel (e.g. a)', 'panelLabelA', o.panelLabelA)}
        ${textField('Bottom panel', 'panelLabelB', o.panelLabelB)}
      </div>
      ${toggleField('Bold labels', 'panelLabelBold', o.panelLabelBold)}
      <div style="font-size:10.5px;color:#8a8a85;line-height:1.45;">Nature uses lowercase bold (a, b); Cell/Science use uppercase (A, B).</div>
    `));

    inspector.appendChild(sectionEl('Fit parameters', `
      <div class="field-row">
        ${textField('Model', 'p_model', o.params.model)}
        ${textField('Confidence %', 'p_conf', o.params.conf)}
      </div>
      <div class="field-row">
        ${textField('K_d (M)', 'p_kd', o.params.kd)}
        ${textField('± K_d CI', 'p_kdCI', o.params.kdCI)}
      </div>
      <div class="field-row">
        ${textField('n', 'p_n', o.params.n)}
        ${textField('± n CI', 'p_nCI', o.params.nCI)}
      </div>
      <div class="field-row">
        ${textField('ΔH (kJ/mol)', 'p_dH', o.params.dH)}
        ${textField('± ΔH CI', 'p_dHCI', o.params.dHCI)}
      </div>
      <div class="field-row">
        ${textField('ΔS (J/mol·K)', 'p_dS', o.params.dS)}
        ${textField('± ΔS CI', 'p_dSCI', o.params.dSCI)}
      </div>
    `));

    // wire up controls
    inspector.querySelectorAll('[data-opt]').forEach(inp => {
      inp.addEventListener('input', () => onOptChange(inp));
    });
    inspector.querySelectorAll('.preset-btn').forEach(b => {
      b.addEventListener('click', () => applyPreset(b.dataset.preset));
    });
    const resetItcPreset = inspector.querySelector('#reset-preset-itc');
    if (resetItcPreset) resetItcPreset.addEventListener('click', () => resetPanelDefaults('itc'));
    const oeb = inspector.querySelector('#open-editor-btn');
    if (oeb) oeb.addEventListener('click', openDataEditor);
    inspector.querySelectorAll('[data-toggle]').forEach(t => {
      t.addEventListener('click', () => {
        const key = t.dataset.toggle;
        o[key] = !o[key];
        t.classList.toggle('on');
        renderStage();
      });
    });
    inspector.querySelectorAll('.insp-section-header').forEach(h => {
      h.addEventListener('click', () => h.parentElement.classList.toggle('collapsed'));
    });
  }

  function renderLCMSInspector() {
    const p = state.panels.lcms;
    const o = p.opts;

    const specOption = (s, i) => {
      const baseName = s.title || ('Spectrum ' + (i + 1));
      // Trim long mzML scan IDs to a short scan number
      const m = baseName.match(/scan[= ]?(\d+)/i);
      const shortName = m ? 'scan ' + m[1] : baseName;
      const rt = s.rt != null ? ' · RT ' + (s.rt / 60).toFixed(2) + ' min' : '';
      const lvl = s.msLevel ? ' · MS' + s.msLevel : '';
      const prec = s.precursorMz != null ? ' · ' + s.precursorMz.toFixed(3) : '';
      const sel = i === p.data.activeIdx ? 'selected' : '';
      return '<option value="' + i + '" ' + sel + '>' + escapeHtml(shortName) + rt + lvl + prec + '</option>';
    };

    // Sort the dropdown by RT (with stable index tiebreaker) so spectra are in run order
    const sortedSpec = p.data ? p.data.spectra.map((s, i) => ({ s, i }))
      .sort((a, b) => {
        const ra = a.s.rt ?? Infinity;
        const rb = b.s.rt ?? Infinity;
        if (ra !== rb) return ra - rb;
        return a.i - b.i;
      }) : [];

    inspector.appendChild(sectionEl('Style', `
      <button class="btn" id="reset-preset-lcms" style="width:100%;justify-content:center;">↺ Reset style to defaults</button>
    `));

    inspector.appendChild(sectionEl('Data', `
      ${p.data ? `
        <div class="data-summary">
          <div class="summary-row"><span class="key">File</span><span class="val">${escapeHtml(p.fileName || '—')}</span></div>
          <div class="summary-row"><span class="key">Spectra</span><span class="val">${p.data.spectra.length}</span></div>
          <div class="summary-row"><span class="key">Active peaks</span><span class="val">${p.data.spectra[p.data.activeIdx]?.mz.length || 0}</span></div>
          ${p.data.spectra[p.data.activeIdx]?.precursorMz != null ? `<div class="summary-row"><span class="key">Precursor</span><span class="val">${p.data.spectra[p.data.activeIdx].precursorMz.toFixed(4)}</span></div>` : ''}
          ${p.data.spectra[p.data.activeIdx]?.charge ? `<div class="summary-row"><span class="key">Charge</span><span class="val">${escapeHtml(p.data.spectra[p.data.activeIdx].charge)}</span></div>` : ''}
          ${p.data.spectra[p.data.activeIdx]?.rt != null ? `<div class="summary-row"><span class="key">RT</span><span class="val">${(p.data.spectra[p.data.activeIdx].rt/60).toFixed(2)} min</span></div>` : ''}
        </div>
        ${p.data.spectra.length > 1 ? `
          <div class="field" style="margin-top:8px;">
            <label class="field-label">Active spectrum (sorted by RT)</label>
            <select class="field-select" id="active-spec">
              ${sortedSpec.map(o => specOption(o.s, o.i)).join('')}
            </select>
          </div>
        ` : ''}
        <button class="btn" id="open-lcms-editor-btn" style="margin-top:8px;width:100%;justify-content:center;">Edit peaks & annotations…</button>
      ` : `<div style="font-size:11.5px;color:#8a8a85;">No data loaded.</div>`}
    `));

    inspector.appendChild(sectionEl('Title & Labels', `
      ${textField('Title', 'title', o.title)}
      ${textField('Chrom. x-axis', 'xlabChrom', o.xlabChrom)}
      ${textField('Chrom. y-axis', 'ylabChrom', o.ylabChrom)}
      ${textField('Spectrum x-axis', 'xlabSpec', o.xlabSpec)}
      ${textField('Spectrum y-axis', 'ylabSpec', o.ylabSpec)}
    `));

    // Plot-type-specific inspector controls
    if (o.plotType === 'overview') {
      const zoomed = o.rtViewMin != null && o.rtViewMax != null;
      // Determine absolute RT range from chromatogram if available
      let rtAbsMin = 0, rtAbsMax = 60;
      if (p.data && p.data.spectra) {
        const rts = p.data.spectra.map(s => s.rt).filter(r => r != null);
        if (rts.length) {
          rtAbsMin = Math.min(...rts) / 60;
          rtAbsMax = Math.max(...rts) / 60;
        }
      }
      const curMin = zoomed ? o.rtViewMin : rtAbsMin;
      const curMax = zoomed ? o.rtViewMax : rtAbsMax;
      inspector.appendChild(sectionEl('Chromatogram zoom (RT range)', `
        <div class="field-row">
          <div class="field">
            <label class="field-label">RT min (min)</label>
            <input class="field-input" type="number" step="0.01" id="rt-view-min" value="${curMin.toFixed(2)}"/>
          </div>
          <div class="field">
            <label class="field-label">RT max (min)</label>
            <input class="field-input" type="number" step="0.01" id="rt-view-max" value="${curMax.toFixed(2)}"/>
          </div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn primary" id="apply-rt-zoom" style="flex:1;justify-content:center;">Apply zoom</button>
          <button class="btn" id="reset-rt-zoom" style="flex:1;justify-content:center;">Reset</button>
        </div>
        <div style="font-size:10.5px;color:#8a8a85;line-height:1.45;margin-top:4px;">
          Full range: <b>${rtAbsMin.toFixed(2)} – ${rtAbsMax.toFixed(2)}</b> min.${zoomed ? ' Currently zoomed.' : ''}<br>
          You can also <b>drag</b> on the chromatogram or use <b>scroll wheel</b> / <b>double-click</b> to reset.
        </div>
      `));

      inspector.appendChild(sectionEl('Chromatogram mode', `
        <div class="field">
          <label class="field-label">Type</label>
          <select class="field-select" data-opt="chromMode">
            <option value="tic" ${o.chromMode==='tic'?'selected':''}>TIC — Total ion current</option>
            <option value="bpc" ${o.chromMode==='bpc'?'selected':''}>BPC — Base peak chromatogram</option>
            <option value="xic" ${o.chromMode==='xic'?'selected':''}>XIC — Extracted ion (single m/z)</option>
          </select>
        </div>
        ${o.chromMode === 'xic' ? `
          <div class="field-row">
            ${textField('XIC m/z', 'xicMz', o.xicMz)}
            <div class="field">
              <label class="field-label">Tolerance unit</label>
              <select class="field-select" data-opt="xicTolMode">
                <option value="ppm" ${o.xicTolMode==='ppm'?'selected':''}>ppm</option>
                <option value="da" ${o.xicTolMode==='da'?'selected':''}>Daltons</option>
              </select>
            </div>
          </div>
          <div class="field">
            ${o.xicTolMode === 'ppm'
              ? rangeField('Tolerance', 'xicPpm', o.xicPpm, 1, 100, 1, ' ppm')
              : rangeField('Tolerance', 'xicTol', o.xicTol, 0.001, 1, 0.001, ' Da')}
          </div>
          <div style="font-size:10.5px;color:#8a8a85;line-height:1.45;">
            ${o.xicTolMode === 'ppm'
              ? 'Window = m/z × ppm / 10⁶. At m/z ' + (parseFloat(o.xicMz)||0).toFixed(4) + ', ±' + o.xicPpm + ' ppm ≈ ±' + ((parseFloat(o.xicMz)||0) * o.xicPpm / 1e6).toFixed(5) + ' Da.'
              : 'Sums all peaks within ±' + o.xicTol + ' Da of the target m/z per scan.'}
          </div>
          <button class="btn primary" id="jump-xic-apex" style="width:100%;justify-content:center;margin-top:6px;">
            🎯 Jump to XIC peak apex
          </button>
          <div style="font-size:10.5px;color:#8a8a85;line-height:1.45;margin-top:4px;">
            Finds the RT where this m/z has max intensity and focuses MS¹ to that mass so the peak is visible.
          </div>
        ` : ''}
      `));

      // Compute current MS¹/MS² range for pre-fill
      const effectiveRange = function(modeKey, minKey, maxKey, focusWinKey) {
        const mode = o[modeKey] || 'auto';
        let lo = null, hi = null;
        if (mode === 'manual') { lo = o[minKey]; hi = o[maxKey]; }
        else if (mode === 'focus') {
          const m = parseFloat(o.xicMz) || 0;
          lo = m - o[focusWinKey]; hi = m + o[focusWinKey];
        }
        return { lo: lo != null ? lo : 100, hi: hi != null ? hi : 1000, mode };
      };
      const ms1R = effectiveRange('ms1RangeMode', 'ms1Min', 'ms1Max', 'ms1FocusWindow');
      const ms2R = effectiveRange('ms2RangeMode', 'ms2Min', 'ms2Max', 'ms2FocusWindow');
      const ms1ModeNote = ms1R.mode === 'auto' ? 'Auto-scaling to all peaks in scan.'
        : (ms1R.mode === 'focus' ? 'Focused on XIC m/z (set via "Jump to XIC peak apex").' : 'Manual range applied.');
      const ms2ModeNote = ms2R.mode === 'auto' ? 'Auto-scaling to all peaks in scan.'
        : (ms2R.mode === 'focus' ? 'Focused on XIC m/z.' : 'Manual range applied.');
      const ms1XicHint = o.chromMode === 'xic' ? '<div style="font-size:10.5px;color:#8a8a85;line-height:1.45;">Faint red band on MS¹ marks the XIC tolerance window.</div>' : '';

      inspector.appendChild(sectionEl('MS¹ panel — m/z range', `
        <div class="field-row">
          <div class="field"><label class="field-label">m/z min</label><input class="field-input" type="number" step="0.01" id="ms1-min-input" value="${ms1R.lo.toFixed(2)}"/></div>
          <div class="field"><label class="field-label">m/z max</label><input class="field-input" type="number" step="0.01" id="ms1-max-input" value="${ms1R.hi.toFixed(2)}"/></div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn primary" id="apply-ms1-range" style="flex:1;justify-content:center;">Apply</button>
          <button class="btn" id="reset-ms1-range" style="flex:1;justify-content:center;">Auto (full)</button>
        </div>
        <div style="font-size:10.5px;color:#8a8a85;line-height:1.45;margin-top:4px;">${ms1ModeNote}</div>
        ${ms1XicHint}
      `));

      inspector.appendChild(sectionEl('MS² panel — m/z range', `
        <div class="field-row">
          <div class="field"><label class="field-label">m/z min</label><input class="field-input" type="number" step="0.01" id="ms2-min-input" value="${ms2R.lo.toFixed(2)}"/></div>
          <div class="field"><label class="field-label">m/z max</label><input class="field-input" type="number" step="0.01" id="ms2-max-input" value="${ms2R.hi.toFixed(2)}"/></div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn primary" id="apply-ms2-range" style="flex:1;justify-content:center;">Apply</button>
          <button class="btn" id="reset-ms2-range" style="flex:1;justify-content:center;">Auto (full)</button>
        </div>
        <div style="font-size:10.5px;color:#8a8a85;line-height:1.45;margin-top:4px;">${ms2ModeNote}</div>
      `));
    }
    if (o.plotType === 'mirror') {
      const refMz = (p.data?.reference?.mz || []).join('\t');
      const refIn = (p.data?.reference?.intensity || []).join('\t');
      const refPaste = (p.data?.reference?.mz || []).map((m, i) => m + '\t' + p.data.reference.intensity[i]).join('\n');
      inspector.appendChild(sectionEl('Mirror plot', `
        <div class="field-row">
          ${textField('Top label', 'mirrorTopLabel', o.mirrorTopLabel)}
          ${textField('Bottom label', 'mirrorBotLabel', o.mirrorBotLabel)}
        </div>
        <div class="field-row">
          <div class="field"><label class="field-label">Top color</label><input class="field-input" type="color" data-opt="mirrorTopColor" value="${o.mirrorTopColor}"/></div>
          <div class="field"><label class="field-label">Bottom color</label><input class="field-input" type="color" data-opt="mirrorBotColor" value="${o.mirrorBotColor}"/></div>
        </div>
        <div class="field">
          <label class="field-label">Reference spectrum (m/z &nbsp;⇥&nbsp; intensity, one per line)</label>
          <textarea id="ref-paste" rows="6" style="width:100%;font-family:ui-monospace,SF Mono,Menlo,monospace;font-size:11px;background:#fafaf8;border:1px solid #d8d8d4;border-radius:4px;padding:6px 8px;color:#1a1a1a;resize:vertical;">${escapeHtml(refPaste)}</textarea>
        </div>
        <button class="btn" id="apply-ref" style="width:100%;justify-content:center;">Apply reference</button>
      `));
    }
    if (o.plotType === 'map') {
      inspector.appendChild(sectionEl('2D LC-MS map', `
        <div class="field">
          <label class="field-label">Color scale</label>
          <select class="field-select" data-opt="colorScale">
            <option value="viridis" ${o.colorScale==='viridis'?'selected':''}>Viridis</option>
            <option value="gray" ${o.colorScale==='gray'?'selected':''}>Grayscale</option>
          </select>
        </div>
        <div style="font-size:10.5px;color:#8a8a85;line-height:1.45;">Each dot is a peak; color encodes log intensity. Requires multiple MS¹ scans.</div>
      `));
    }
    if (o.plotType === 'masserror') {
      inspector.appendChild(sectionEl('Mass error', `
        <div style="font-size:11.5px;color:#555;line-height:1.5;">
          Computes ppm error between each <b>Annotation</b> m/z (theoretical) and the nearest measured peak within 50 mDa.
          Dashed red lines mark ±5 ppm.
        </div>
        <div style="font-size:10.5px;color:#8a8a85;margin-top:6px;">Add or edit annotations via the data editor.</div>
      `));
    }

    inspector.appendChild(sectionEl('Typography', `
      <div class="field">
        <label class="field-label">Font family</label>
        <select class="field-select" data-opt="fontFamily">
          <option value="Arial, 'Helvetica Neue', Helvetica, sans-serif" ${o.fontFamily.includes('Helvetica') ? 'selected':''}>Helvetica</option>
          <option value="'Arial', sans-serif" ${o.fontFamily.includes('Arial') && !o.fontFamily.includes('Helvetica') ? 'selected':''}>Arial</option>
          <option value="'Times New Roman', Times, serif" ${o.fontFamily.includes('Times') ? 'selected':''}>Times (serif)</option>
          <option value="'Inter', sans-serif" ${o.fontFamily.includes('Inter') ? 'selected':''}>Inter</option>
        </select>
      </div>
      ${rangeField('Title size', 'titleSize', o.titleSize, 6, 24, 1, 'px')}
      ${rangeField('Axis label size', 'labelSize', o.labelSize, 6, 18, 1, 'px')}
      ${rangeField('Tick label size', 'tickSize', o.tickSize, 5, 14, 1, 'px')}
      ${rangeField('Annotation size', 'annoFontSize', o.annoFontSize, 5, 16, 1, 'px')}
    `));

    inspector.appendChild(sectionEl('Plots', `
      ${toggleField('Show chromatogram', 'showChrom', o.showChrom)}
      ${toggleField('Show fragment annotations', 'showAnnotations', o.showAnnotations)}
      ${toggleField('Show precursor marker', 'showPrecursorMarker', o.showPrecursorMarker)}
      <div class="field">
        <label class="field-label">Intensity scale</label>
        <select class="field-select" data-opt="intensityMode">
          <option value="relative" ${o.intensityMode==='relative'?'selected':''}>Relative (% of base peak)</option>
          <option value="absolute" ${o.intensityMode==='absolute'?'selected':''}>Absolute counts</option>
        </select>
      </div>
      ${rangeField('Annotate top N peaks', 'annoTopN', o.annoTopN, 0, 20, 1, '')}
    `));

    inspector.appendChild(sectionEl('Style', `
      ${rangeField('Chromatogram line', 'lineWidth', o.lineWidth, 0.3, 2.5, 0.1, 'px')}
      ${rangeField('Stick width', 'stickWidth', o.stickWidth, 0.4, 3, 0.1, 'px')}
      ${rangeField('Axis border weight', 'borderWidth', o.borderWidth, 0.3, 2, 0.1, 'px')}
      <div class="field">
        <label class="field-label">Tick direction</label>
        <select class="field-select" data-opt="tickDir">
          <option value="out" ${o.tickDir==='out'?'selected':''}>Outward (Cell)</option>
          <option value="in" ${o.tickDir==='in'?'selected':''}>Inward (Nature/Science)</option>
        </select>
      </div>
      <div class="field">
        <label class="field-label">Spine style</label>
        <select class="field-select" data-opt="spineStyle">
          <option value="box" ${o.spineStyle==='box'?'selected':''}>Full box (Cell)</option>
          <option value="L" ${o.spineStyle==='L'?'selected':''}>L-shape (Nature/Science)</option>
        </select>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Stick color</label>
          <input class="field-input" type="color" data-opt="stickColor" value="${o.stickColor}"/>
        </div>
        <div class="field">
          <label class="field-label">Annotated stick</label>
          <input class="field-input" type="color" data-opt="annoStickColor" value="${o.annoStickColor}"/>
        </div>
      </div>
    `));

    inspector.appendChild(sectionEl('Canvas size', `
      <div class="field-row">
        ${numField('Width', 'width', o.width, 100, 2400, 2)}
        ${numField('Height', 'height', o.height, 100, 1800, 2)}
      </div>
    `));

    // wire up
    inspector.querySelectorAll('[data-opt]').forEach(inp => {
      inp.addEventListener('input', () => onOptChange(inp));
    });
    inspector.querySelectorAll('.preset-btn').forEach(b => {
      b.addEventListener('click', () => applyPreset(b.dataset.preset));
    });
    inspector.querySelectorAll('[data-toggle]').forEach(t => {
      t.addEventListener('click', () => {
        const key = t.dataset.toggle;
        o[key] = !o[key];
        t.classList.toggle('on');
        renderStage();
      });
    });
    const as = inspector.querySelector('#active-spec');
    if (as) as.addEventListener('change', e => {
      p.data.activeIdx = parseInt(e.target.value);
      renderAll();
    });
    const editBtn = inspector.querySelector('#open-lcms-editor-btn');
    if (editBtn) editBtn.addEventListener('click', openLCMSEditor);
    const jumpBtn = inspector.querySelector('#jump-xic-apex');
    if (jumpBtn) jumpBtn.addEventListener('click', jumpToXICApex);
    const resetLcmsPreset = inspector.querySelector('#reset-preset-lcms');
    if (resetLcmsPreset) resetLcmsPreset.addEventListener('click', () => resetPanelDefaults('lcms'));
    const resetZoom = inspector.querySelector('#reset-rt-zoom');
    if (resetZoom) resetZoom.addEventListener('click', () => {
      p.opts.rtViewMin = null;
      p.opts.rtViewMax = null;
      renderAll();
    });
    const applyZoom_ = inspector.querySelector('#apply-rt-zoom');
    if (applyZoom_) applyZoom_.addEventListener('click', () => {
      const minEl = inspector.querySelector('#rt-view-min');
      const maxEl = inspector.querySelector('#rt-view-max');
      const lo = parseFloat(minEl.value);
      const hi = parseFloat(maxEl.value);
      if (isNaN(lo) || isNaN(hi) || hi <= lo) {
        alert('Enter valid RT min < RT max.');
        return;
      }
      p.opts.rtViewMin = lo;
      p.opts.rtViewMax = hi;
      renderAll();
    });

    const applyMs1 = inspector.querySelector('#apply-ms1-range');
    if (applyMs1) applyMs1.addEventListener('click', () => {
      const lo = parseFloat(inspector.querySelector('#ms1-min-input').value);
      const hi = parseFloat(inspector.querySelector('#ms1-max-input').value);
      if (isNaN(lo) || isNaN(hi) || hi <= lo) { alert('Enter valid m/z min < m/z max.'); return; }
      p.opts.ms1RangeMode = 'manual';
      p.opts.ms1Min = lo; p.opts.ms1Max = hi;
      renderAll();
    });
    const resetMs1 = inspector.querySelector('#reset-ms1-range');
    if (resetMs1) resetMs1.addEventListener('click', () => {
      p.opts.ms1RangeMode = 'auto';
      renderAll();
    });
    const applyMs2 = inspector.querySelector('#apply-ms2-range');
    if (applyMs2) applyMs2.addEventListener('click', () => {
      const lo = parseFloat(inspector.querySelector('#ms2-min-input').value);
      const hi = parseFloat(inspector.querySelector('#ms2-max-input').value);
      if (isNaN(lo) || isNaN(hi) || hi <= lo) { alert('Enter valid m/z min < m/z max.'); return; }
      p.opts.ms2RangeMode = 'manual';
      p.opts.ms2Min = lo; p.opts.ms2Max = hi;
      renderAll();
    });
    const resetMs2 = inspector.querySelector('#reset-ms2-range');
    if (resetMs2) resetMs2.addEventListener('click', () => {
      p.opts.ms2RangeMode = 'auto';
      renderAll();
    });
    const applyRef = inspector.querySelector('#apply-ref');
    if (applyRef) applyRef.addEventListener('click', () => {
      const ta = inspector.querySelector('#ref-paste');
      const lines = ta.value.split('\n').map(s => s.trim()).filter(Boolean);
      const mz = [], intensity = [];
      lines.forEach(ln => {
        const parts = ln.split(/[\t,;\s]+/);
        const a = parseFloat(parts[0]), b = parseFloat(parts[1]);
        if (!isNaN(a) && !isNaN(b)) { mz.push(a); intensity.push(b); }
      });
      if (!mz.length) { alert('Could not parse reference. Use m/z<TAB>intensity per line.'); return; }
      p.data.reference = { mz, intensity };
      renderStage();
    });
    inspector.querySelectorAll('.insp-section-header').forEach(h => {
      h.addEventListener('click', () => h.parentElement.classList.toggle('collapsed'));
    });
  }

  // ---------- LC-MS Data / Annotation Editor ----------
  function openLCMSEditor() {
    const p = state.panels.lcms;
    if (!p.data) return;
    closeDataEditor();
    const spec = p.data.spectra[p.data.activeIdx];

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'data-editor';
    overlay.innerHTML = `
      <div class="modal">
        <header class="modal-header">
          <div>
            <h3 class="modal-title">Spectrum & Annotations</h3>
            <p class="modal-sub">Edit peak intensities, label fragments, or remove peaks. Updates render live.</p>
          </div>
          <button class="btn ghost" id="de-close" title="Close (Esc)">✕</button>
        </header>
        <div class="modal-body">
          <div class="de-tabs">
            <button class="de-tab active" data-tab="peaks">Peaks (${spec.mz.length})</button>
            <button class="de-tab" data-tab="annos">Annotations (${(p.data.annotations||[]).length})</button>
            <button class="de-tab" data-tab="meta">Metadata</button>
          </div>
          <div class="de-pane" id="de-pane-peaks"></div>
          <div class="de-pane hidden" id="de-pane-annos"></div>
          <div class="de-pane hidden" id="de-pane-meta"></div>
        </div>
        <footer class="modal-footer">
          <span class="de-help"><kbd>Esc</kbd> close</span>
          <div class="spacer"></div>
          <button class="btn ghost" id="add-anno">+ Annotation</button>
          <button class="btn primary" id="de-done">Done</button>
        </footer>
      </div>
    `;
    document.body.appendChild(overlay);

    function buildPeaks() {
      const pane = document.getElementById('de-pane-peaks');
      const rows = spec.mz.map((_, i) => `
        <tr data-idx="${i}">
          <td class="de-num">${i + 1}</td>
          <td><input type="number" step="any" data-col="mz" data-idx="${i}" value="${spec.mz[i]}"/></td>
          <td><input type="number" step="any" data-col="intensity" data-idx="${i}" value="${spec.intensity[i]}"/></td>
          <td class="de-toggle"><button class="btn ghost de-row-del" data-idx="${i}" style="padding:2px 6px;">✕</button></td>
        </tr>
      `).join('');
      pane.innerHTML = `
        <table class="de-table">
          <thead><tr><th class="de-num">#</th><th>m/z</th><th>Intensity</th><th class="de-toggle"></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `;
      pane.querySelectorAll('input[type=number]').forEach(inp => {
        inp.addEventListener('input', e => {
          const i = parseInt(e.target.dataset.idx);
          const col = e.target.dataset.col;
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) { spec[col][i] = v; livePreviewLCMS(); }
        });
      });
      pane.querySelectorAll('.de-row-del').forEach(b => {
        b.addEventListener('click', () => {
          const i = parseInt(b.dataset.idx);
          spec.mz.splice(i, 1);
          spec.intensity.splice(i, 1);
          buildPeaks();
          livePreviewLCMS();
        });
      });
    }
    function buildAnnos() {
      const pane = document.getElementById('de-pane-annos');
      const annos = p.data.annotations || (p.data.annotations = []);
      if (!annos.length) {
        pane.innerHTML = `<div style="padding:24px;text-align:center;color:#8a8a85;font-size:12px;">No annotations yet. Click <b>+ Annotation</b> in the footer.</div>`;
        return;
      }
      const rows = annos.map((a, i) => `
        <tr data-idx="${i}">
          <td class="de-num">${i + 1}</td>
          <td><input type="number" step="any" data-col="mz" data-idx="${i}" value="${a.mz}"/></td>
          <td><input type="text" data-col="label" data-idx="${i}" value="${escapeAttr(a.label)}"/></td>
          <td class="de-toggle"><button class="btn ghost de-anno-del" data-idx="${i}" style="padding:2px 6px;">✕</button></td>
        </tr>
      `).join('');
      pane.innerHTML = `
        <table class="de-table">
          <thead><tr><th class="de-num">#</th><th>m/z</th><th>Label</th><th class="de-toggle"></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `;
      pane.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('input', e => {
          const i = parseInt(e.target.dataset.idx);
          const col = e.target.dataset.col;
          const v = col === 'mz' ? parseFloat(e.target.value) : e.target.value;
          if (col === 'mz' && isNaN(v)) return;
          annos[i][col] = v;
          livePreviewLCMS();
        });
      });
      pane.querySelectorAll('.de-anno-del').forEach(b => {
        b.addEventListener('click', () => {
          annos.splice(parseInt(b.dataset.idx), 1);
          buildAnnos();
          livePreviewLCMS();
        });
      });
    }
    function buildMeta() {
      const pane = document.getElementById('de-pane-meta');
      pane.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px;padding:8px 0;">
          ${textField('Title', 'm_title', spec.title || '')}
          <div class="field-row">
            ${textField('Precursor m/z', 'm_precursorMz', spec.precursorMz ?? '')}
            ${textField('Charge', 'm_charge', spec.charge ?? '')}
          </div>
          ${textField('Retention time (s)', 'm_rt', spec.rt ?? '')}
        </div>
      `;
      pane.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('input', e => {
          const k = e.target.dataset.opt.slice(2);
          let v = e.target.value;
          if (k !== 'title' && k !== 'charge') v = parseFloat(v);
          spec[k] = isNaN(v) ? null : v;
          livePreviewLCMS();
        });
      });
    }

    buildPeaks(); buildAnnos(); buildMeta();

    overlay.querySelectorAll('.de-tab').forEach(t => {
      t.addEventListener('click', () => {
        overlay.querySelectorAll('.de-tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        overlay.querySelectorAll('.de-pane').forEach(x => x.classList.add('hidden'));
        document.getElementById('de-pane-' + t.dataset.tab).classList.remove('hidden');
      });
    });
    overlay.querySelector('#de-close').addEventListener('click', closeDataEditor);
    overlay.querySelector('#de-done').addEventListener('click', closeDataEditor);
    overlay.querySelector('#add-anno').addEventListener('click', () => {
      const annos = p.data.annotations || (p.data.annotations = []);
      const baseMz = spec.mz[Math.floor(spec.mz.length/2)] || 100;
      annos.push({ mz: baseMz, label: 'Fragment' });
      // switch to annotations tab
      overlay.querySelector('.de-tab[data-tab="annos"]').click();
      buildAnnos();
      livePreviewLCMS();
    });
    overlay.addEventListener('click', e => { if (e.target === overlay) closeDataEditor(); });
    document.addEventListener('keydown', editorEsc);
  }

  function jumpToXICApex() {
    const p = state.panels.lcms;
    const o = p.opts;
    if (!p.data || o.chromMode !== 'xic' || o.xicMz == null) return;
    const target = parseFloat(o.xicMz);
    const window = o.xicTolMode === 'ppm' ? (target * o.xicPpm / 1e6) : o.xicTol;
    let best = { intensity: 0, idx: -1 };
    p.data.spectra.forEach((s, i) => {
      if (s.msLevel !== 1 && s.msLevel != null) return;
      let val = 0;
      for (let j = 0; j < s.mz.length; j++) {
        if (s.mz[j] >= target - window && s.mz[j] <= target + window) val += s.intensity[j];
      }
      if (val > best.intensity) { best = { intensity: val, idx: i }; }
    });
    if (best.idx < 0 || best.intensity === 0) {
      alert('No signal found for m/z ' + target.toFixed(4) + ' within the tolerance window.\\nTry a wider tolerance (e.g. 50 ppm or 0.05 Da).');
      return;
    }
    p.data.activeIdx = best.idx;
    // Also auto-focus MS¹ panel on the XIC m/z so the peak is visible
    o.ms1RangeMode = 'focus';
    if (o.ms1FocusWindow > 10) o.ms1FocusWindow = 5;
    renderAll();
  }

  function livePreviewLCMS() {
    const frame = stage.querySelector('.figure-frame');
    if (!frame) return;
    frame.innerHTML = window.LCMS.render(state.panels.lcms.data, state.panels.lcms.opts);
    applyZoom();
    attachLCMSInteractivity();
  }

  // ---------- Chromatogram scrubbing ----------
  function attachLCMSInteractivity() {
    const p = state.panels.lcms;
    if (!p.data || p.opts.plotType !== 'overview') return;
    const svg = stage.querySelector('.figure-frame svg');
    if (!svg) return;
    const cx = parseFloat(svg.getAttribute('data-chrom-x'));
    const cy = parseFloat(svg.getAttribute('data-chrom-y'));
    const cw = parseFloat(svg.getAttribute('data-chrom-w'));
    const ch = parseFloat(svg.getAttribute('data-chrom-h'));
    const rtMin = parseFloat(svg.getAttribute('data-chrom-rtmin'));
    const rtMax = parseFloat(svg.getAttribute('data-chrom-rtmax'));
    if (isNaN(cx) || isNaN(rtMin)) return;

    // Build sorted index of scans that have an RT
    const scans = p.data.spectra.map((s, i) => ({ s, i })).filter(o => o.s.rt != null);
    if (scans.length < 2) return;
    scans.sort((a, b) => a.s.rt - b.s.rt);

    function clientToSvg(ev, svgEl) {
      svgEl = svgEl || ev.currentTarget;
      const rect = svgEl.getBoundingClientRect();
      const vb = svgEl.viewBox.baseVal;
      const x = (ev.clientX - rect.left) / rect.width * vb.width;
      const y = (ev.clientY - rect.top) / rect.height * vb.height;
      return { x, y };
    }

    function nearestScan(rtSeconds) {
      // Binary search
      let lo = 0, hi = scans.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (scans[mid].s.rt < rtSeconds) lo = mid + 1; else hi = mid;
      }
      // Compare with predecessor
      if (lo > 0 && Math.abs(scans[lo-1].s.rt - rtSeconds) < Math.abs(scans[lo].s.rt - rtSeconds)) lo--;
      return scans[lo];
    }

    function drawScrubberSvg(svgEl, xPx, target) {
      let g = svgEl.querySelector('#scrubber');
      if (!g) {
        g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('id', 'scrubber');
        g.setAttribute('pointer-events', 'none');
        svgEl.appendChild(g);
      }
      const label = `RT ${(target.s.rt/60).toFixed(2)} min · scan ${target.i+1}/${p.data.spectra.length}` + (target.s.msLevel ? ` · MS${target.s.msLevel}` : '');
      const labelW = label.length * 5.2 + 8;
      // Keep label inside chromatogram bounds
      const labelX = (xPx + 4 + labelW > cx + cw) ? xPx - 4 - labelW : xPx + 4;
      g.innerHTML = `
        <line x1="${xPx.toFixed(2)}" y1="${cy}" x2="${xPx.toFixed(2)}" y2="${cy + ch}" stroke="#c1121f" stroke-width="0.8"/>
        <rect x="${labelX.toFixed(2)}" y="${cy + 2}" width="${labelW}" height="14" fill="#ffffff" opacity="0.92" stroke="#c1121f" stroke-width="0.4"/>
        <text x="${(labelX + 4).toFixed(2)}" y="${cy + 12}" font-size="9" fill="#c1121f" font-family="${p.opts.fontFamily}">${label}</text>
      `;
    }

    let raf = null, pendingX = null, pendingY = null, lastScanIdx = -1, currentSvg = svg;
    function onMove(ev) {
      // If a zoom-drag is in progress, suppress scrubber re-renders (they detach the SVG)
      if (dragStart) return;
      currentSvg = ev.currentTarget;
      const { x, y } = clientToSvg(ev, currentSvg);
      pendingX = x; pendingY = y;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const xx = pendingX, yy = pendingY;
        // Out of chromatogram bounds → hide scrubber
        if (xx < cx || xx > cx + cw || yy < cy || yy > cy + ch) return;
        const rtMinutes = rtMin + (xx - cx) / cw * (rtMax - rtMin);
        const target = nearestScan(rtMinutes * 60);
        if (target.i !== lastScanIdx) {
          lastScanIdx = target.i;
          p.data.activeIdx = target.i;
          // Re-render the whole figure (chromatogram is stable; only MS² panel changes)
          const frame = stage.querySelector('.figure-frame');
          frame.innerHTML = window.LCMS.render(p.data, p.opts);
          applyZoom();
          const newSvg = stage.querySelector('.figure-frame svg');
          currentSvg = newSvg;
          drawScrubberSvg(newSvg, xx, target);
          // Re-bind events on the new SVG
          newSvg.addEventListener('mousemove', onMove);
          newSvg.addEventListener('mouseleave', onLeave);
          newSvg.addEventListener('mousedown', onDown);
          newSvg.addEventListener('mousemove', onDrag);
          newSvg.addEventListener('mouseup', onUp);
          newSvg.addEventListener('dblclick', onDblClick);
          newSvg.addEventListener('wheel', onWheel, { passive: false });
          newSvg.style.cursor = 'crosshair';
          // Also update header subtitle
          const sub = stage.querySelector('.stage-sub');
          if (sub) sub.textContent = (p.data.spectra.length + ' spectra · scan ' + (target.i+1) + (target.s.msLevel ? ' (MS'+target.s.msLevel+')' : '') + ' · RT ' + (target.s.rt/60).toFixed(2) + ' min · ' + target.s.mz.length + ' peaks');
        } else {
          drawScrubberSvg(currentSvg, xx, target);
        }
      });
    }
    function onLeave(ev) {
      const cur = ev?.currentTarget || stage.querySelector('.figure-frame svg');
      const g = cur && cur.querySelector('#scrubber');
      if (g) g.remove();
    }
    svg.addEventListener('mousemove', onMove);
    svg.addEventListener('mouseleave', onLeave);
    svg.style.cursor = 'crosshair';

    // ---- Box zoom: shift-drag (or middle-drag) inside chromatogram to zoom RT range
    let dragStart = null;
    let dragRect = null;
    function ensureDragRect(svgEl) {
      if (dragRect && dragRect.parentNode === svgEl) return dragRect;
      if (dragRect) dragRect.remove();
      dragRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      dragRect.setAttribute('fill', '#c1121f');
      dragRect.setAttribute('fill-opacity', '0.12');
      dragRect.setAttribute('stroke', '#c1121f');
      dragRect.setAttribute('stroke-width', '0.8');
      dragRect.setAttribute('pointer-events', 'none');
      svgEl.appendChild(dragRect);
      return dragRect;
    }
    function onDown(ev) {
      const svgEl = ev.currentTarget;
      const { x, y } = clientToSvg(ev, svgEl);
      if (x < cx || x > cx + cw || y < cy || y > cy + ch) return;
      // Hold Shift OR any drag in chromatogram begins zoom selection
      dragStart = { x, y, svgEl };
      ev.preventDefault();
    }
    function onDrag(ev) {
      if (!dragStart) return;
      const { x } = clientToSvg(ev, dragStart.svgEl);
      const x1 = Math.max(cx, Math.min(cx + cw, dragStart.x));
      const x2 = Math.max(cx, Math.min(cx + cw, x));
      const r = ensureDragRect(dragStart.svgEl);
      r.setAttribute('x', Math.min(x1, x2).toFixed(2));
      r.setAttribute('y', cy);
      r.setAttribute('width', Math.abs(x2 - x1).toFixed(2));
      r.setAttribute('height', ch);
    }
    function onUp(ev) {
      if (!dragStart) return;
      const { x } = clientToSvg(ev, dragStart.svgEl);
      const x1 = Math.max(cx, Math.min(cx + cw, dragStart.x));
      const x2 = Math.max(cx, Math.min(cx + cw, x));
      dragStart = null;
      if (dragRect) { dragRect.remove(); dragRect = null; }
      // Need at least 5px drag to count as a zoom
      if (Math.abs(x2 - x1) < 5) return;
      const lo = Math.min(x1, x2), hi = Math.max(x1, x2);
      const newMin = rtMin + (lo - cx) / cw * (rtMax - rtMin);
      const newMax = rtMin + (hi - cx) / cw * (rtMax - rtMin);
      p.opts.rtViewMin = newMin;
      p.opts.rtViewMax = newMax;
      renderAll();
    }
    function onDblClick(ev) {
      const { x, y } = clientToSvg(ev, ev.currentTarget);
      if (x < cx || x > cx + cw || y < cy || y > cy + ch) return;
      // Reset zoom
      p.opts.rtViewMin = null;
      p.opts.rtViewMax = null;
      renderAll();
    }
    // Wheel zoom: scroll to zoom in/out around cursor
    function onWheel(ev) {
      const svgEl = ev.currentTarget;
      const { x, y } = clientToSvg(ev, svgEl);
      if (x < cx || x > cx + cw || y < cy || y > cy + ch) return;
      ev.preventDefault();
      const factor = ev.deltaY < 0 ? 0.75 : 1.333;
      const curMin = p.opts.rtViewMin ?? rtMin;
      const curMax = p.opts.rtViewMax ?? rtMax;
      const range = curMax - curMin;
      const center = curMin + (x - cx) / cw * range;
      const newRange = range * factor;
      let newMin = center - (center - curMin) * factor;
      let newMax = center + (curMax - center) * factor;
      // Clamp to global bounds
      newMin = Math.max(rtMin, newMin);
      newMax = Math.min(rtMax, newMax);
      if (newMax - newMin < (rtMax - rtMin) * 0.005) return; // don't over-zoom
      if (Math.abs(newMin - rtMin) < (rtMax - rtMin) * 0.01 && Math.abs(newMax - rtMax) < (rtMax - rtMin) * 0.01) {
        // Effectively full range — clear zoom
        p.opts.rtViewMin = null;
        p.opts.rtViewMax = null;
      } else {
        p.opts.rtViewMin = newMin;
        p.opts.rtViewMax = newMax;
      }
      renderAll();
    }
    svg.addEventListener('mousedown', onDown);
    svg.addEventListener('mousemove', onDrag);
    svg.addEventListener('mouseup', onUp);
    svg.addEventListener('dblclick', onDblClick);
    svg.addEventListener('wheel', onWheel, { passive: false });
  }

  function onOptChange(inp) {
    const o = state.panels[state.activeType].opts;
    const key = inp.dataset.opt;
    let v = inp.value;
    if (inp.type === 'number' || inp.type === 'range') v = parseFloat(v);
    const numericKeys = ['xicMz', 'xicTol', 'xicPpm', 'ms1Min', 'ms1Max', 'ms2Min', 'ms2Max', 'ms1FocusWindow', 'ms2FocusWindow', 'width', 'height'];
    if (numericKeys.includes(key) && typeof v === 'string') {
      const n = parseFloat(v);
      if (!isNaN(n)) v = n;
    }
    if (key.startsWith('p_')) {
      const k = key.slice(2);
      o.params[k] = v;
    } else {
      o[key] = v;
    }
    // Auto-flip tick direction when spine style changes:
    // - Full box → ticks inward (so they don't stick out of the box)
    // - L-spine  → ticks outward (so they're visible alongside the spine)
    if (key === 'spineStyle') {
      o.tickDir = (v === 'box') ? 'in' : 'out';
      // Re-render inspector so the tickDir dropdown reflects the new value
      renderInspector();
    }
    // For XIC stack: m/z or tolerance changes don't auto-recompute (heavy) — user clicks the button
    if (state.activeType === 'xicstack' && (key === 'xicMz' || key === 'xicTol' || key === 'xicTolMode')) {
      // just re-render — user must click "Recompute" to actually rebuild XICs
    }
    // Any manual edit flips out of a preset
    if (key !== 'title' && !key.startsWith('p_') && !['xlab1','ylab1','xlab2','ylab2','panelLabelA','panelLabelB'].includes(key)) {
      o.journalPreset = 'custom';
    }
    if (inp.type === 'range') {
      const lab = inp.previousElementSibling?.querySelector?.('.val');
      if (lab) lab.textContent = (Math.round(v * 100) / 100) + (inp.dataset.unit || '');
    }
    renderStage();
    if (['chromMode', 'xicTolMode', 'plotType', 'intensityMode', 'ms1RangeMode', 'ms2RangeMode', 'normalize'].includes(key)) renderInspector();
    if (key === 'title') renderCrumbs();
  }

  function applyPreset(name) {
    const o = state.panels[state.activeType].opts;
    o.journalPreset = name;
    if (name === 'custom') { renderAll(); return; }
    const presetsObj = state.activeType === 'lcms' ? window.LCMS.presets : window.ITC.presets;
    const preset = presetsObj[name];
    if (!preset) return;
    Object.keys(preset).forEach(k => { o[k] = preset[k]; });
    renderAll();
  }

  // Default style settings (the "shipped" defaults) — used by the reset button.
  // Match the 'neutral' journal preset: L-spine, ticks out, hairline strokes, Helvetica.
  const DEFAULT_STYLE = {
    itc: {
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
      titleSize: 13, labelSize: 11, tickSize: 9,
      traceWidth: 0.7, fitWidth: 1.0,
      markerSize: 2, markerStyle: 'filled-circle',
      markerFill: '#000000', markerStroke: '#000000', markerStrokeWidth: 0,
      borderWidth: 0.7, tickDir: 'in', spineStyle: 'box',
      boldLabels: false, showGridLines: false, showGridBands: false,
      showParamBox: true, paramBoxPosition: 'bottom-right', paramBoxFontSize: 11,
      panelLabelA: 'a', panelLabelB: 'b', panelLabelBold: true, panelLayout: 'separated',
      journalPreset: 'neutral', width: 640, height: 520
    },
    lcms: {
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
      titleSize: 13, labelSize: 11, tickSize: 9,
      lineWidth: 0.7, stickWidth: 1.0,
      stickColor: '#000000', annoStickColor: '#c1121f',
      borderWidth: 0.7, tickDir: 'out', spineStyle: 'L',
      annoFontSize: 9, annoTopN: 6,
      journalPreset: 'neutral', width: 640, height: 540
    },
    gcms: {
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
      titleSize: 13, labelSize: 11, tickSize: 9,
      lineWidth: 0.7, stickWidth: 1.0,
      stickColor: '#000000', libColor: '#2563eb',
      borderWidth: 0.7, tickDir: 'out', spineStyle: 'L',
      showAnnotations: true, annoTopN: 6, annoFontSize: 9,
      journalPreset: 'neutral', width: 640, height: 540
    },
    mm: {
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
      titleSize: 13, labelSize: 11, tickSize: 9,
      lineWidth: 1.0, borderWidth: 0.7,
      markerSize: 3.2, errorBarWidth: 0.7,
      tickDir: 'out', spineStyle: 'L',
      showParamBox: true, showLegend: true, useColor: true,
      journalPreset: 'neutral', width: 640, height: 460
    },
    cd: {
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
      titleSize: 13, labelSize: 11, tickSize: 9,
      lineWidth: 1.1, borderWidth: 0.7,
      tickDir: 'out', spineStyle: 'L',
      showLegend: true, showZeroLine: true, showLandmarks: true,
      showParamBox: true, useColor: true,
      journalPreset: 'neutral', width: 640, height: 460
    }
  };

  function resetPanelDefaults(panelId) {
    const o = state.panels[panelId].opts;
    const defaults = DEFAULT_STYLE[panelId];
    if (!defaults) return;
    Object.keys(defaults).forEach(k => { o[k] = defaults[k]; });
    renderAll();
  }

  // ---------- Field helpers ----------
  function sectionEl(title, bodyHtml) {
    const div = document.createElement('div');
    div.className = 'insp-section';
    div.innerHTML = `
      <div class="insp-section-header">
        <span class="insp-section-title">${title}</span>
        <span class="insp-section-chevron">▼</span>
      </div>
      <div class="insp-section-body">${bodyHtml}</div>
    `;
    return div;
  }
  function textField(label, key, val) {
    return `
      <div class="field">
        <label class="field-label">${label}</label>
        <input class="field-input" data-opt="${key}" value="${escapeAttr(val ?? '')}"/>
      </div>`;
  }
  function numField(label, key, val, min, max, step) {
    return `
      <div class="field">
        <label class="field-label">${label}</label>
        <input class="field-input" type="number" min="${min}" max="${max}" step="${step}" data-opt="${key}" value="${val}"/>
      </div>`;
  }
  function rangeField(label, key, val, min, max, step, unit) {
    return `
      <div class="field">
        <div class="field-range-label">
          <span>${label}</span>
          <span class="val">${val}${unit || ''}</span>
        </div>
        <input class="field-range" type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-opt="${key}" data-unit="${unit || ''}"/>
      </div>`;
  }
  function toggleField(label, key, on) {
    return `
      <div class="toggle-row">
        <span class="field-label">${label}</span>
        <div class="toggle ${on?'on':''}" data-toggle="${key}"></div>
      </div>`;
  }

  // ---------- File handling ----------
  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) readFile(file);
    fileInput.value = '';
  });

  function readFile(file) {
    const fr = new FileReader();
    fr.onload = async () => {
      const text = fr.result;
      try {
        if (state.activeType === 'lcms') {
          const isMzML = /\.mzml$/i.test(file.name) || /<\s*(?:indexedmzML|mzML)/i.test(text.slice(0, 4000));
          if (isMzML) showStatus('Parsing mzML…');
          const parsed = await window.LCMS.parse(text);
          hideStatus();
          state.panels.lcms.data = parsed;
          state.panels.lcms.fileName = file.name;
          if (isMzML) {
            state.panels.lcms.opts.title = file.name.replace(/\.mzml$/i, '');
          } else if (parsed.spectra[0]?.title) {
            state.panels.lcms.opts.title = parsed.spectra[0].title;
          }
          if (parsed._stats) {
            console.log(`mzML: parsed ${parsed._stats.parsed}/${parsed._stats.total} spectra (${parsed._stats.ms1} MS¹, ${parsed._stats.ms2} MS²)${parsed._stats.truncated ? ' — truncated' : ''}`);
          }
        } else if (state.activeType === 'gcms') {
          const parsed = window.GCMS.parse(text);
          state.panels.gcms.data = parsed;
          state.panels.gcms.fileName = file.name;
          state.panels.gcms.opts.title = file.name.replace(/\.[^.]+$/, '');
        } else if (state.activeType === 'mm') {
          const parsed = window.MM.parse(text);
          state.panels.mm.data = parsed;
          state.panels.mm.fileName = file.name;
          state.panels.mm.opts.title = file.name.replace(/\.[^.]+$/, '');
        } else if (state.activeType === 'cd') {
          const parsed = window.CD.parse(text);
          state.panels.cd.data = parsed;
          state.panels.cd.fileName = file.name;
          state.panels.cd.opts.title = file.name.replace(/\.[^.]+$/, '');
          state.panels.cd.opts.mode = parsed.mode;
        } else {
          const parsed = window.ITC.parse(text);
          state.panels.itc.data = parsed;
          state.panels.itc.fileName = file.name;
          const stem = file.name.replace(/\.(txt|tsv|csv|dat)$/i, '');
          state.panels.itc.opts.title = stem;
          state.activeType = 'itc';
        }
        renderAll();
      } catch (err) {
        hideStatus();
        alert('Could not parse file: ' + err.message);
      }
    };
    fr.readAsText(file);
  }

  // ---------- transient status banner ----------
  function showStatus(msg) {
    hideStatus();
    const el = document.createElement('div');
    el.id = 'status-banner';
    el.textContent = msg;
    el.style.cssText = 'position:fixed;top:64px;left:50%;transform:translateX(-50%);background:#1a1a1a;color:#fff;padding:8px 16px;border-radius:6px;font-size:12px;z-index:200;box-shadow:0 4px 16px rgba(0,0,0,0.18);';
    document.body.appendChild(el);
  }
  function hideStatus() {
    const el = document.getElementById('status-banner');
    if (el) el.remove();
  }

  // Drag & drop
  let dragDepth = 0;
  window.addEventListener('dragenter', e => {
    e.preventDefault();
    dragDepth++;
    dropOverlay.classList.add('show');
  });
  window.addEventListener('dragleave', e => {
    e.preventDefault();
    dragDepth--;
    if (dragDepth <= 0) {
      dragDepth = 0;
      dropOverlay.classList.remove('show');
    }
  });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault();
    dragDepth = 0;
    dropOverlay.classList.remove('show');
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  });

  // Sample loader
  async function loadSample() {
    function applyBuiltIn() {
      const parsed = window.ITC.sample();
      state.panels.itc.data = parsed;
      state.panels.itc.fileName = 'Progesterone_5br (built-in sample)';
      state.panels.itc.opts.title = 'Progesterone_5br';
      renderAll();
    }
    try {
      const resp = await fetch('samples/Progesterone_5br.txt');
      if (!resp.ok) throw new Error('no sample file');
      const text = await resp.text();
      const parsed = window.ITC.parse(text);
      state.panels.itc.data = parsed;
      state.panels.itc.fileName = 'Progesterone_5br.txt (sample)';
      state.panels.itc.opts.title = 'Progesterone_5br';
      renderAll();
    } catch (e) {
      // Network or file unavailable — fall back to built-in synthetic sample
      if (window.ITC && window.ITC.sample) applyBuiltIn();
    }
  }
  window.__loadSample = loadSample;

  // ---------- Data Editor ----------
  function openDataEditor() {
    const p = state.panels.itc;
    if (!p.data) return;
    closeDataEditor();
    const d = p.data;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'data-editor';
    overlay.innerHTML = `
      <div class="modal">
        <header class="modal-header">
          <div>
            <h3 class="modal-title">Data Editor</h3>
            <p class="modal-sub">Edit values, exclude injections, then close to update the figure.</p>
          </div>
          <button class="btn ghost" id="de-close" title="Close (Esc)">✕</button>
        </header>
        <div class="modal-body">
          <div class="de-tabs">
            <button class="de-tab active" data-tab="iso">Isotherm (${d.mr.length} injections)</button>
            <button class="de-tab" data-tab="therm">Thermogram (${d.time.length} points)</button>
            <button class="de-tab" data-tab="fit">Fit (${d.fit.length} points)</button>
          </div>
          <div class="de-pane" id="de-pane-iso"></div>
          <div class="de-pane hidden" id="de-pane-therm"></div>
          <div class="de-pane hidden" id="de-pane-fit"></div>
        </div>
        <footer class="modal-footer">
          <span class="de-help">
            <kbd>Space</kbd> toggle exclude · <kbd>Esc</kbd> close
          </span>
          <div class="spacer"></div>
          <button class="btn ghost" id="de-include-all">Include all</button>
          <button class="btn ghost" id="de-exclude-first">Exclude 1st injection</button>
          <button class="btn primary" id="de-done">Done</button>
        </footer>
      </div>
    `;
    document.body.appendChild(overlay);

    function buildIso() {
      const pane = document.getElementById('de-pane-iso');
      const rows = d.mr.map((_, i) => `
        <tr data-idx="${i}" class="${d.excluded[i] ? 'excluded' : ''}">
          <td class="de-num">${i + 1}</td>
          <td class="de-toggle">
            <input type="checkbox" data-ex="${i}" ${d.excluded[i] ? '' : 'checked'} title="Include this injection in figure"/>
          </td>
          <td><input type="number" step="any" data-col="mr" data-idx="${i}" value="${d.mr[i]}"/></td>
          <td><input type="number" step="any" data-col="dh" data-idx="${i}" value="${d.dh[i]}"/></td>
        </tr>
      `).join('');
      pane.innerHTML = `
        <table class="de-table">
          <thead>
            <tr>
              <th class="de-num">#</th>
              <th class="de-toggle">In</th>
              <th>Mole Ratio</th>
              <th>Enthalpy (kJ/mol)</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
      pane.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.addEventListener('change', e => {
          const i = parseInt(e.target.dataset.ex);
          d.excluded[i] = !e.target.checked;
          e.target.closest('tr').classList.toggle('excluded', d.excluded[i]);
          livePreview();
        });
      });
      pane.querySelectorAll('input[type=number]').forEach(inp => {
        inp.addEventListener('input', e => {
          const i = parseInt(e.target.dataset.idx);
          const col = e.target.dataset.col;
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) {
            d[col][i] = v;
            livePreview();
          }
        });
      });
      // keyboard: space toggles exclude on focused row
      pane.addEventListener('keydown', e => {
        if (e.key === ' ' && e.target.tagName === 'INPUT' && e.target.type === 'number') {
          e.preventDefault();
          const tr = e.target.closest('tr');
          const cb = tr.querySelector('input[type=checkbox]');
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change'));
        }
      });
    }

    function buildSimpleTable(paneId, xs, ys, xLabel, yLabel, xKey, yKey) {
      const pane = document.getElementById(paneId);
      const rows = xs.map((_, i) => `
        <tr data-idx="${i}">
          <td class="de-num">${i + 1}</td>
          <td><input type="number" step="any" data-col="${xKey}" data-idx="${i}" value="${xs[i]}"/></td>
          <td><input type="number" step="any" data-col="${yKey}" data-idx="${i}" value="${ys[i]}"/></td>
        </tr>
      `).join('');
      pane.innerHTML = `
        <table class="de-table">
          <thead>
            <tr>
              <th class="de-num">#</th>
              <th>${xLabel}</th>
              <th>${yLabel}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
      pane.querySelectorAll('input[type=number]').forEach(inp => {
        inp.addEventListener('input', e => {
          const i = parseInt(e.target.dataset.idx);
          const col = e.target.dataset.col;
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) {
            d[col][i] = v;
            livePreview();
          }
        });
      });
    }

    buildIso();
    buildSimpleTable('de-pane-therm', d.time, d.heat, 'Time (s)', 'Heat (µJ/s)', 'time', 'heat');
    buildSimpleTable('de-pane-fit', d.mrFit, d.fit, 'Mole Ratio (fit)', 'Fit (kJ/mol)', 'mrFit', 'fit');

    overlay.querySelectorAll('.de-tab').forEach(t => {
      t.addEventListener('click', () => {
        overlay.querySelectorAll('.de-tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        overlay.querySelectorAll('.de-pane').forEach(x => x.classList.add('hidden'));
        document.getElementById('de-pane-' + t.dataset.tab).classList.remove('hidden');
      });
    });

    overlay.querySelector('#de-close').addEventListener('click', closeDataEditor);
    overlay.querySelector('#de-done').addEventListener('click', closeDataEditor);
    overlay.querySelector('#de-include-all').addEventListener('click', () => {
      d.excluded = d.excluded.map(() => false);
      buildIso();
      livePreview();
    });
    overlay.querySelector('#de-exclude-first').addEventListener('click', () => {
      if (d.excluded.length) d.excluded[0] = true;
      buildIso();
      livePreview();
    });

    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeDataEditor();
    });

    document.addEventListener('keydown', editorEsc);
  }

  function editorEsc(e) {
    if (e.key === 'Escape') closeDataEditor();
  }
  function closeDataEditor() {
    const el = document.getElementById('data-editor');
    if (el) el.remove();
    document.removeEventListener('keydown', editorEsc);
  }
  function livePreview() {
    // Re-render the figure SVG without rebuilding stage chrome (keeps editor open)
    const frame = stage.querySelector('.figure-frame');
    if (!frame) return;
    frame.innerHTML = window.ITC.render(state.panels.itc.data, state.panels.itc.opts);
    applyZoom();
    // Update the stage subtitle count
    const sub = stage.querySelector('.stage-sub');
    if (sub) {
      const d = state.panels.itc.data;
      const used = d.excluded.filter(x => !x).length;
      sub.textContent = `${d.time.length} time points · ${used}/${d.mr.length} injections used · ${d.fit.length} fit points`;
    }
  }

  // ---------- Export menu ----------
  let openMenu = null;
  function openExportMenu(anchor) {
    closeMenu();
    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.innerHTML = `
      <div class="menu-item" data-act="svg"><svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3h7l3 3v7H3z"/></svg>Download SVG <span class="kbd">⌘S</span></div>
      <div class="menu-item" data-act="pdf"><svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3h7l3 3v7H3z"/><path d="M5 9h6M5 11h4"/></svg>Print / Save PDF <span class="kbd">⌘P</span></div>
      <div class="menu-sep"></div>
      <div class="menu-item" data-act="copy"><svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="9" height="9"/><path d="M2 11V2h9"/></svg>Copy SVG to clipboard</div>
    `;
    const r = anchor.getBoundingClientRect();
    menu.style.top = (r.bottom + 6) + 'px';
    menu.style.right = (window.innerWidth - r.right) + 'px';
    document.body.appendChild(menu);
    openMenu = menu;
    menu.addEventListener('click', e => {
      const act = e.target.closest('.menu-item')?.dataset.act;
      if (!act) return;
      if (act === 'svg') exportSVG();
      if (act === 'pdf') exportPDF();
      if (act === 'copy') copySVG();
      closeMenu();
    });
    setTimeout(() => document.addEventListener('click', closeMenuOnce, { once: true }), 0);
  }
  function closeMenuOnce() { closeMenu(); }
  function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; } }

  function currentSVG() {
    const p = state.panels[state.activeType];
    if (!p) return null;
    if (state.activeType === 'lcms') return p.data ? window.LCMS.render(p.data, p.opts) : null;
    if (state.activeType === 'xicstack') return p.files.length ? window.XICStack.render({ files: p.files }, p.opts) : null;
    if (state.activeType === 'gcms') return p.data ? window.GCMS.render(p.data, p.opts) : null;
    if (state.activeType === 'mm') return p.data ? window.MM.render(p.data, p.opts) : null;
    if (state.activeType === 'cd') return p.data ? window.CD.render(p.data, p.opts) : null;
    return p.data ? window.ITC.render(p.data, p.opts) : null;
  }

  function baseName() {
    const p = state.panels[state.activeType];
    const fn = (p && p.fileName) || 'figure';
    return fn.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_');
  }

  function exportSVG() {
    const svg = currentSVG();
    if (!svg) return alert('Load data first.');
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    triggerDownload(blob, baseName() + '.svg');
  }

  async function copySVG() {
    const svg = currentSVG();
    if (!svg) return;
    try {
      await navigator.clipboard.writeText(svg);
    } catch (e) {
      alert('Could not copy to clipboard: ' + e.message);
    }
  }

  function exportPDF() {
    const p = state.panels[state.activeType];
    const svg = currentSVG();
    if (!svg) return alert('Load data first.');
    const o = p.opts;
    // Open a new window with just the SVG, sized to landscape letter; user prints to PDF.
    const w = window.open('', '_blank');
    if (!w) return alert('Pop-up blocked. Allow pop-ups to export PDF.');
    w.document.write(`<!doctype html><html><head><title>${escapeHtml(o.title || 'figure')}</title>
      <style>
        @page { size: ${o.width > o.height ? 'landscape' : 'portrait'}; margin: 0.5in; }
        html, body { margin: 0; padding: 0; background: #fff; }
        body { display: grid; place-items: center; min-height: 100vh; }
        svg { max-width: 100%; max-height: 100vh; height: auto; }
        .hint {
          position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
          font: 12px -apple-system, sans-serif; color: #555;
          background: #f4f4f2; border: 1px solid #d8d8d4; border-radius: 6px;
          padding: 6px 12px;
        }
        @media print { .hint { display: none; } }
      </style></head><body>
      <div class="hint">Use your browser's <b>Print → Save as PDF</b> (⌘/Ctrl + P)</div>
      ${svg}
      <script>setTimeout(()=>window.print(), 350);<\/script>
    </body></html>`);
    w.document.close();
  }

  function triggerDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- Utils ----------
  function escapeHtml(s) {
    return String(s ?? '').replace(/[<>&]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;' }[c]));
  }
  function escapeAttr(s) {
    return String(s ?? '').replace(/[<>&"']/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;' }[c]));
  }

  // ---------- Keyboard shortcuts ----------
  window.addEventListener('keydown', e => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 's') { e.preventDefault(); exportSVG(); }
    if (mod && e.key === 'p') { e.preventDefault(); exportPDF(); }
    if (mod && e.key === 'o') { e.preventDefault(); fileInput.click(); }
  });

  // ---------- Config save / load (cross-panel) ----------
  // Saves the active panel's `opts` (settings only — not the raw data).
  // For XIC stack, also includes per-file metadata (name, color, reference flag, original file name)
  // so a saved config + the same source files can be reloaded identically.
  function saveConfig() {
    const panelId = state.activeType;
    const p = state.panels[panelId];
    if (!p) return;
    const config = {
      app: 'JiangLab_BioFigureGen',
      version: 1,
      panel: panelId,
      savedAt: new Date().toISOString(),
      opts: JSON.parse(JSON.stringify(p.opts))
    };
    if (panelId === 'xicstack' && p.files) {
      config.files = p.files.map(f => ({ name: f.name, fileName: f.fileName, color: f.color }));
    }
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    a.href = url; a.download = `jianglab_biofiguregen_${panelId}_${stamp}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function loadConfig() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const config = JSON.parse(text);
        if (config.app !== 'JiangLab_BioFigureGen' && config.app !== 'BioFigureGen' || !config.panel || !config.opts) {
          alert('Not a valid JiangLab_BioFigureGen config file.');
          return;
        }
        const panel = state.panels[config.panel];
        if (!panel) {
          alert('Unknown panel type: ' + config.panel);
          return;
        }
        Object.assign(panel.opts, config.opts);
        state.activeType = config.panel;
        // For XIC stack, restore per-file metadata if the same number of files is loaded
        if (config.panel === 'xicstack' && config.files && panel.files.length) {
          config.files.forEach((meta, i) => {
            if (i < panel.files.length) {
              if (meta.name) panel.files[i].name = meta.name;
              if (meta.color) panel.files[i].color = meta.color;
            }
          });
        }
        renderAll();
      } catch (err) {
        alert('Could not load config: ' + err.message);
      }
    });
    inp.click();
  }

  // Wire top-bar buttons
  document.getElementById('save-config-btn')?.addEventListener('click', saveConfig);
  document.getElementById('load-config-btn')?.addEventListener('click', loadConfig);

  function renderAll() {
    renderRail();
    renderCrumbs();
    renderStage();
    renderInspector();
  }
  renderAll();
  // Auto-load sample on first boot so users see something immediately
  loadSample();
})();
