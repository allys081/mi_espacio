/* Lógica compartida de Traslado (renaico) e Instituto (instituto) · Mi Espacio */
(function () {
  const KEY_DATA = 'estacion_detallada_data';
  const KEY_CATS = 'estacion_categorias';
  const KEY_FONT = 'estacion_fuente_titulos';
  const KEY_ACC = 'estacion_acento';
  const KEY_COSAS = 'estacion_cosas';
  const KEY_LUGAR = 'estacion_lugar';
  const KEY_CAL_ITEMS = 'estacion_cal_items_v2';
  const KEY_HAB = 'estacion_habitos_v1';
  const KEY_NOTAS = 'estacion_notas_importantes';
  const PAGE = window.ESTACION_PAGE || 'renaico';

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const vibrar = () => { if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {} };

  let toastTimer;
  function toast(text, onUndo) {
    if (window.MiEspacio && MiEspacio.toast) {
      MiEspacio.toast(text, onUndo);
      return;
    }
    const el = $('#toastMsg');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
  }

  const DEFAULT_DATA = {
    renaico: [
      { id: 'r1', cat: 'llevar_tec', title: 'Computador y estación de trabajo', summary: 'Cargador original, mouse y soporte', detail: '• Revisar cargador de alta potencia.\n• Mouse inalámbrico + pila de repuesto.', checked: true }
    ],
    instituto: [
      { id: 'i1', cat: 'estudio', title: 'Bloques de enfoque: 45m / 15m', summary: 'Hábito diario', detail: 'Poner temporizador visible.', checked: false }
    ]
  };

  const DEFAULT_CATS = {
    renaico: [
      { key: 'llevar_tec', name: 'Tecnológico & Cables', packing: true },
      { key: 'llevar_skin', name: 'Skincare & Aseo', packing: true }
    ],
    instituto: [
      { key: 'estudio', name: 'Enfoque & Hábitos de Estudio', packing: false },
      { key: 'estructura', name: 'Estructura & Organización', packing: false }
    ]
  };

  let appData = JSON.parse(localStorage.getItem(KEY_DATA) || 'null') || DEFAULT_DATA;
  let catData = JSON.parse(localStorage.getItem(KEY_CATS) || 'null') || DEFAULT_CATS;
  let calItems = JSON.parse(localStorage.getItem(KEY_CAL_ITEMS) || 'null') || [];
  calItems = calItems.filter(x => !(x.id === 'c1' && /base de datos/i.test(x.title)));
  let cosasData = JSON.parse(localStorage.getItem(KEY_COSAS) || 'null') || { renaico: [], hualqui: [] };
  let lugar = localStorage.getItem(KEY_LUGAR) === 'hualqui' ? 'hualqui' : 'renaico';
  const LUGAR_NOMBRE = { renaico: 'Renaico', hualqui: 'Hualqui' };

  let currentSection = PAGE;
  let institutoSubView = 'prox';
  let estadoFiltro = 'por';
  const esCal = () => institutoSubView !== 'apuntes' && institutoSubView !== 'notas';
  let searchQuery = '';
  let openCats = {};
  let manualToggledCats = {};
  {
    const firstRen = (catData.renaico || []).find(c => (appData.renaico || []).some(it => it.cat === c.key && !it.checked)) || (catData.renaico || [])[0];
    if (firstRen) openCats[firstRen.key] = true;
    openCats.estudio = true;
  }
  let selectedDetailId = null;
  let editingId = null;
  let editingCatKey = null;
  let openCatMenuKey = null;
  let hechosOpen = false;

  // Estado del calendario de Instituto
  const now = new Date();
  let calYear = now.getFullYear();
  let calMonth = now.getMonth();
  const pad = n => String(n).padStart(2, '0');
  const ks = (y, m, d) => y + '-' + pad(m + 1) + '-' + pad(d);
  const TODAY = ks(now.getFullYear(), now.getMonth(), now.getDate());
  let selectedCalDay = TODAY;
  let calViewMode = 'mes'; // 'mes' | 'semana'
  let weekOffset = 0;
  let evalRepeat = 'none'; // 'none' | 'weekly' | 'biweekly'

  const toU = s => { const a = String(s || TODAY).split('-').map(Number); return Date.UTC(a[0], (a[1] || 1) - 1, a[2] || 1); };
  const diffDays = s => Math.round((toU(s) - toU(TODAY)) / 864e5);
  const MES_NOMBRES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  function fmtDate(s) {
    if (!s) return '';
    const a = s.split('-').map(Number);
    return new Date(a[0], a[1] - 1, a[2]).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
  }
  function fmtDayLong(s) {
    if (!s) return '';
    const a = s.split('-').map(Number);
    return new Date(a[0], a[1] - 1, a[2]).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' });
  }

  // Fotos en IndexedDB para cosasData
  let cosasFotosCache = {};
  async function cargarFotosCosas() {
    if (!window.MiEspacio || !MiEspacio.fotos) return;
    try {
      const todas = await MiEspacio.fotos.todas();
      Object.keys(todas).forEach(k => {
        if (k.startsWith('cosa_')) cosasFotosCache[k.slice(5)] = todas[k];
      });
      // Migrar fotos en base64 si existían en cosasData
      let migrado = false;
      ['renaico', 'hualqui'].forEach(l => {
        (cosasData[l] || []).forEach(c => {
          if (c.foto && c.foto.startsWith('data:')) {
            cosasFotosCache[c.id] = c.foto;
            MiEspacio.fotos.poner('cosa_' + c.id, c.foto);
            c.tieneFoto = true;
            delete c.foto;
            migrado = true;
          }
        });
      });
      if (migrado) localStorage.setItem(KEY_COSAS, JSON.stringify(cosasData));
      render();
    } catch (e) {}
  }

  function saveAll() {
    const rdj = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
    const otro = PAGE === 'renaico' ? 'instituto' : 'renaico';
    try {
      const d = rdj(KEY_DATA) || {}; if (!Array.isArray(d[otro])) d[otro] = appData[otro]; d[PAGE] = appData[PAGE];
      const c = rdj(KEY_CATS) || {}; if (!Array.isArray(c[otro])) c[otro] = catData[otro]; c[PAGE] = catData[PAGE];
      localStorage.setItem(KEY_DATA, JSON.stringify(d));
      localStorage.setItem(KEY_CATS, JSON.stringify(c));
      if (PAGE === 'renaico') localStorage.setItem(KEY_COSAS, JSON.stringify(cosasData));
      else localStorage.setItem(KEY_CAL_ITEMS, JSON.stringify(calItems));
    } catch (e) { alert('Almacenamiento lleno. Haz un respaldo desde Mi Espacio.'); }
    updatePackingProgress();
    updateCalendarUI();
    if (window.MiEspacio && MiEspacio.actualizarNav) MiEspacio.actualizarNav();
  }

  let temaId = estTheme(localStorage.getItem(KEY_ACC) || 'lila').id;
  const HALF_CIRCLE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/></svg>';

  function applyTheme(themeName) {
    try { localStorage.setItem('app_tema', themeName === 'dark' ? 'oscuro' : 'claro'); } catch (e) {}
    estApplyTheme(temaId, themeName);
    if ($('#btnThemeToggle')) $('#btnThemeToggle').innerHTML = HALF_CIRCLE_SVG;
  }

  if ($('#btnThemeToggle')) {
    $('#btnThemeToggle').onclick = () => {
      vibrar();
      const current = document.documentElement.dataset.theme;
      applyTheme(current === 'dark' ? 'light' : 'dark');
    };
  }

  const FONTS = {
    fraunces: "'Fraunces', Georgia, serif",
    jakarta: "'Plus Jakarta Sans', system-ui, sans-serif",
    fira: "'Fira Sans', system-ui, sans-serif",
    chivo: "'Chivo', system-ui, sans-serif",
    space: "'Space Grotesk', system-ui, sans-serif"
  };

  function setFont(key, silent) {
    if (!FONTS[key]) key = 'fraunces';
    try { localStorage.setItem(KEY_FONT, key); localStorage.setItem('app_fuente', key); } catch (e) {}
    document.documentElement.style.setProperty('--font-title', FONTS[key]);
    $$('#fontDropdown .font-btn').forEach(b => b.classList.toggle('active', b.dataset.f === key));
    if (!silent) toast('Letra actualizada');
  }

  function renderTemas() {
    if (!$('#themeList')) return;
    $('#themeList').innerHTML = EST_THEMES.map(t => `
      <button class="theme-row ${t.id === temaId ? 'on' : ''}" data-tema="${t.id}">
        <span class="theme-swatch" style="background:linear-gradient(135deg, ${t.g[0]}, ${t.g[1]});">
          <span class="theme-dots">${t.sw.map(c => `<i style="background:${c}"></i>`).join('')}</span>
        </span>
        <span class="theme-info">
          <span class="theme-name" style="display:block">${esc(t.n)}</span>
          <span class="theme-desc" style="display:block">${esc(t.d)}</span>
        </span>
        <span class="theme-radio ${t.id === temaId ? 'on' : ''}"></span>
      </button>`).join('');
    if ($('#temaActual')) $('#temaActual').textContent = '· ' + estTheme(temaId).n;
  }

  function setTema(id, inicial) {
    const T = estTheme(id);
    temaId = T.id;
    localStorage.setItem(KEY_ACC, temaId);
    if (!inicial) applyTheme(T.m);
    renderTemas();
    if (window.__listo && !inicial) toast('Tema: ' + T.n);
  }

  if ($('#themeList')) {
    $('#themeList').addEventListener('click', e => {
      const r = e.target.closest('[data-tema]');
      if (r) { vibrar(); setTema(r.dataset.tema); }
    });
  }
  if ($('#btnTemas')) $('#btnTemas').onclick = () => { renderTemas(); $('#modalTemas').classList.add('active'); };

  if ($('#btnMenu')) {
    $('#btnMenu').onclick = e => { e.stopPropagation(); $('#fontDropdown').classList.toggle('open'); };
  }
  if ($('#fontDropdown')) {
    $('#fontDropdown').addEventListener('click', e => {
      e.stopPropagation();
      const f = e.target.closest('.font-btn');
      if (f) setFont(f.dataset.f);
      if (e.target.closest('#btnExport') || e.target.closest('#btnImport') || e.target.closest('#btnTemas') || e.target.closest('#btnMenuCats')) {
        $('#fontDropdown').classList.remove('open');
      }
    });
  }
  document.addEventListener('click', () => {
    if ($('#fontDropdown')) $('#fontDropdown').classList.remove('open');
    if (openCatMenuKey) {
      openCatMenuKey = null;
      $$('.cat-pop-menu.open').forEach(el => el.classList.remove('open'));
    }
  });

  function aplicarCabecera() {
    const isRen = currentSection === 'renaico';
    if ($('#headerTitleText')) $('#headerTitleText').textContent = isRen ? 'Traslado a' : 'Instituto';
    if ($('#selLugar')) {
      $('#selLugar').style.display = isRen ? '' : 'none';
      $('#selLugar').value = lugar;
    }
    if ($('#headerSubtitle')) $('#headerSubtitle').textContent = isRen ? 'Resumen & detalle para no olvidar nada' : 'Eventos, apuntes y notas importantes';
    if ($('#btnCosas')) $('#btnCosas').style.display = 'none';
    if ($('#estadoTabs')) $('#estadoTabs').style.display = isRen ? 'grid' : 'none';

    const btnLeft = $('#btnCatManager');
    if (btnLeft) {
      if (isRen) {
        if (estadoFiltro === 'que') {
          btnLeft.style.display = 'none';
        } else {
          btnLeft.style.display = '';
          btnLeft.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg> Modo bolso`;
        }
      } else {
        btnLeft.style.display = institutoSubView === 'apuntes' ? '' : 'none';
        btnLeft.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> Categorías`;
      }
    }

    if ($('#fabAddTxt')) {
      $('#fabAddTxt').textContent = isRen
        ? (estadoFiltro === 'que' ? 'Agregar cosa' : 'Agregar tarea')
        : (institutoSubView === 'notas' ? 'Agregar nota' : institutoSubView !== 'apuntes' ? 'Agregar evento' : 'Agregar apunte');
    }
    if ($('#packingCard')) $('#packingCard').style.display = isRen ? 'flex' : 'none';
    if ($('#institutoSectionView')) $('#institutoSectionView').style.display = isRen ? 'none' : 'block';
  }

  window.switchSection = function (sec) {
    currentSection = sec;
    if ($('#tabRenaico')) $('#tabRenaico').classList.toggle('active', sec === 'renaico');
    if ($('#tabInstituto')) $('#tabInstituto').classList.toggle('active', sec === 'instituto');
    aplicarCabecera();
    render();
  };

  window.switchInstitutoSub = function (sub) {
    institutoSubView = sub;
    [['prox', 'btnViewProx', 'subViewProx'], ['cal', 'btnViewCal', 'subViewCal'], ['apuntes', 'btnViewApuntes', 'subViewApuntes'], ['notas', 'btnViewNotas', 'subViewNotas']].forEach(([s, b, v]) => {
      if ($('#' + b)) $('#' + b).classList.toggle('active', sub === s);
      if ($('#' + v)) $('#' + v).style.display = sub === s ? 'block' : 'none';
    });
    aplicarCabecera();
    render();
  };

  if ($('#selLugar')) {
    $('#selLugar').onchange = e => {
      lugar = e.target.value === 'hualqui' ? 'hualqui' : 'renaico';
      localStorage.setItem(KEY_LUGAR, lugar);
      aplicarCabecera();
      render();
      toast('Destino: ' + LUGAR_NOMBRE[lugar]);
    };
  }

  function getPackingStats() {
    const list = (appData.renaico || []).filter(it => {
      const c = (catData.renaico || []).find(x => x.key === it.cat);
      return c && c.packing;
    });
    const total = list.length;
    const packed = list.filter(it => it.checked).length;
    const percent = total > 0 ? Math.round((packed / total) * 100) : 0;
    return { list, total, packed, percent };
  }

  function updatePackingProgress() {
    const { total, packed, percent } = getPackingStats();
    const deg = Math.round((percent / 100) * 360);
    if ($('#packingRing')) {
      $('#packingRing').style.background = `conic-gradient(var(--emerald) ${deg}deg, var(--card-elevated) 0deg)`;
      const sp = $('#packingRing span');
      if (sp) sp.textContent = `${percent}%`;
    }
    if ($('#packingCountTxt')) {
      $('#packingCountTxt').textContent = `${packed} de ${total} listos`;
    }
    if ($('#packingPercent')) $('#packingPercent').textContent = `${percent}% (${packed}/${total})`;
    if ($('#packingBarFill')) $('#packingBarFill').style.width = `${percent}%`;
    renderModoBolso();
  }

  /* ---------- Modo bolso (pantalla completa en Traslado) ---------- */
  window.openModoBolso = function () {
    const v = $('#modoBolsoView');
    if (!v) return;
    v.classList.add('active');
    renderModoBolso();
  };
  window.closeModoBolso = function () {
    const v = $('#modoBolsoView');
    if (v) v.classList.remove('active');
  };

  function renderModoBolso() {
    const v = $('#modoBolsoView');
    if (!v || !v.classList.contains('active')) return;
    const { list, total, packed, percent } = getPackingStats();
    const deg = Math.round((percent / 100) * 360);
    if ($('#bolsoLugarTxt')) $('#bolsoLugarTxt').textContent = LUGAR_NOMBRE[lugar];
    if ($('#bolsoRing')) {
      $('#bolsoRing').style.background = `conic-gradient(var(--emerald) ${deg}deg, var(--card-elevated) 0deg)`;
      $('#bolsoRing').innerHTML = `<span>${packed}/${total}</span>`;
    }
    if ($('#bolsoBarFill')) $('#bolsoBarFill').style.width = `${percent}%`;
    const faltan = total - packed;
    if ($('#bolsoFaltanTxt')) {
      $('#bolsoFaltanTxt').textContent = faltan === 0 ? '¡Todo empacado para viajar!' : `Faltan ${faltan} ${faltan === 1 ? 'cosa' : 'cosas'}`;
    }
    const box = $('#bolsoList');
    if (!box) return;
    if (!list.length) {
      box.innerHTML = '<div style="text-align:center;color:var(--muted);padding:32px 12px;">No hay ítems de equipaje configurados.</div>';
      return;
    }
    // Ordenar pendientes primero, luego empacados
    const sorted = [...list].sort((a, b) => (a.checked ? 1 : 0) - (b.checked ? 1 : 0));
    box.innerHTML = sorted.map(it => {
      const cat = (catData.renaico || []).find(c => c.key === it.cat);
      return `
        <div class="bolso-item ${it.checked ? 'done' : ''}" onclick="toggleItemCheck('${it.id}', event)">
          <button type="button" class="bolso-check ${it.checked ? 'checked' : ''}" aria-label="Marcar">${it.checked ? '✓' : ''}</button>
          <div class="bolso-info">
            <div class="bolso-title">${esc(it.title)}</div>
            <div class="bolso-sub">${esc(cat ? cat.name : '')}${it.summary ? ' · ' + esc(it.summary) : ''}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  /* ---------- Formas de eventos (Certamen ●, Trabajo ■, Presentación ▲) ---------- */
  function shapeHtml(kind, extraCls) {
    const k = kind || 'certamen';
    const cls = k === 'trabajo' ? 'shape-trab' : (k === 'presentacion' ? 'shape-pres' : 'shape-cert');
    return `<i class="ev-shape ${cls} ${extraCls || ''}" aria-hidden="true"></i>`;
  }

  /* ---------- Calendario (Mes y Semana) ---------- */
  window.setCalViewMode = function (mode) {
    calViewMode = mode === 'semana' ? 'semana' : 'mes';
    if ($('#btnCalMes')) $('#btnCalMes').classList.toggle('on', calViewMode === 'mes');
    if ($('#btnCalSemana')) $('#btnCalSemana').classList.toggle('on', calViewMode === 'semana');
    if ($('#calMesWrap')) $('#calMesWrap').style.display = calViewMode === 'mes' ? 'block' : 'none';
    if ($('#calSemanaWrap')) $('#calSemanaWrap').style.display = calViewMode === 'semana' ? 'block' : 'none';
    updateCalendarUI();
  };

  window.shiftWeek = function (delta) {
    weekOffset += delta;
    updateCalendarUI();
  };

  function eventsForDate(dateStr) {
    const targetU = toU(dateStr);
    const targetDow = new Date(targetU + 12 * 36e5).getUTCDay();
    return calItems.filter(it => {
      if (it.checked) return false;
      if (it.evalDate === dateStr) return true;
      if (it.repeat === 'weekly' || it.repeat === 'biweekly') {
        const startU = toU(it.evalDate);
        if (targetU < startU) return false;
        const startDow = new Date(startU + 12 * 36e5).getUTCDay();
        if (targetDow !== startDow) return false;
        if (it.repeat === 'biweekly') {
          const weeks = Math.round((targetU - startU) / (7 * 864e5));
          return weeks % 2 === 0;
        }
        return true;
      }
      return false;
    });
  }

  function updateCalendarUI() {
    if (currentSection !== 'instituto' || institutoSubView !== 'cal') return;
    const items = calItems.filter(it => !it.checked && diffDays(it.evalDate) >= 0);

    const selTarget = $('#selectEvalTarget');
    if (selTarget) {
      const currentTargetVal = selTarget.value;
      selTarget.innerHTML = items.length ? items.map(e => `<option value="${e.id}">${esc(e.title)}</option>`).join('') : '<option value="">Sin eventos</option>';
      if (currentTargetVal && items.some(e => e.id === currentTargetVal)) {
        selTarget.value = currentTargetVal;
      } else if (items.length) {
        selTarget.value = items[0].id;
      }

      const heroNum = $('#heroNum');
      const heroTitle = $('#heroTitle');
      const heroDesc = $('#heroDesc');
      const targetEval = items.find(e => e.id === selTarget.value);

      if (targetEval && heroNum) {
        const n = diffDays(targetEval.evalDate);
        heroNum.className = 'hero-num ' + (n <= 3 ? 'soon' : '');
        heroNum.innerHTML = `<b>${n}</b><span>${n === 1 ? 'día' : 'días'}</span>`;
        heroTitle.textContent = targetEval.title;
        heroDesc.textContent = `Fecha: ${fmtDate(targetEval.evalDate)}${targetEval.evalTime ? ' · ' + targetEval.evalTime : ''} · ${n === 0 ? '¡Es hoy!' : n === 1 ? 'Es mañana.' : 'Faltan ' + n + ' días.'}`;
      } else if (heroNum) {
        heroNum.className = 'hero-num none';
        heroNum.innerHTML = '<b>–</b><span>días</span>';
        heroTitle.textContent = 'Sin eventos próximos';
        heroDesc.textContent = 'Agrega una evaluación o clase.';
      }
    }

    if (calViewMode === 'semana') {
      renderWeekSchedule();
      return;
    }

    // Cuadrícula mensual
    if ($('#calMonthTitle')) $('#calMonthTitle').textContent = MES_NOMBRES[calMonth] + ' ' + calYear;
    const first = (new Date(calYear, calMonth, 1).getDay() + 6) % 7;
    const dim = new Date(calYear, calMonth + 1, 0).getDate();
    const prevDim = new Date(calYear, calMonth, 0).getDate();

    let h = '';
    ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach(d => { h += '<div class="dw">' + d + '</div>'; });

    for (let i = 0; i < 42; i++) {
      let dn = i - first + 1, o = false, y = calYear, m = calMonth;
      if (dn < 1) { dn = prevDim + dn; m = calMonth - 1; o = true; }
      else if (dn > dim) { dn = dn - dim; m = calMonth + 1; o = true; }
      if (m < 0) { m = 11; y = calYear - 1; } else if (m > 11) { m = 0; y = calYear + 1; }

      const k = ks(y, m, dn);
      const dayEvs = eventsForDate(k);
      let dots = '';
      dayEvs.slice(0, 3).forEach(e => {
        dots += shapeHtml(e.kind);
      });

      const isSel = k === selectedCalDay;
      h += `<button class="c ${o ? 'o ' : ''}${k === TODAY ? 't ' : ''}${isSel ? 's ' : ''}" onclick="selectCalDay('${k}')">${dn}<span class="dots">${dots}</span></button>`;
    }
    if ($('#calGrid')) $('#calGrid').innerHTML = h;
    renderSelectedDayInline();
  }

  window.selectCalDay = function (dateStr) {
    vibrar();
    selectedCalDay = dateStr;
    updateCalendarUI();
  };

  function renderSelectedDayInline() {
    const box = $('#calDayInline');
    if (!box) return;
    const items = eventsForDate(selectedCalDay);
    const dayLabel = fmtDayLong(selectedCalDay).toUpperCase();
    const KIND_NOM = { certamen: 'Certamen', trabajo: 'Trabajo', presentacion: 'Presentación', tarea: 'Clase / Tarea' };
    box.innerHTML = `
      <div class="cal-day-head">
        <span class="cal-day-title">${esc(dayLabel)}</span>
        <button type="button" class="btn-add-day-ev" onclick="openAddTaskModal(null, '${selectedCalDay}')">＋ Evento</button>
      </div>
      ${items.length === 0
        ? `<div style="font-size:0.8rem;color:var(--muted);padding:10px 4px;">Sin eventos para este día.</div>`
        : items.map(it => {
          const n = diffDays(selectedCalDay);
          const repTxt = it.repeat === 'weekly' ? ' · Semanal' : (it.repeat === 'biweekly' ? ' · Cada 2 sem' : '');
          return `
            <div class="ev-row" onclick="openCalDetailModal('${it.id}')">
              ${shapeHtml(it.kind, 'lg')}
              <div class="b">
                <b>${esc(it.title)}</b>
                <small>${it.evalTime ? esc(it.evalTime) + ' · ' : ''}${KIND_NOM[it.kind || 'certamen']}${repTxt}${it.summary ? ' · ' + esc(it.summary) : ''}</small>
              </div>
              <span class="d ${n <= 3 && n >= 0 ? 'soon' : ''}">${diaTxt(n)}</span>
            </div>
          `;
        }).join('')
      }
    `;
  }

  function renderWeekSchedule() {
    const grid = $('#weekScheduleGrid');
    const titleEl = $('#weekRangeTitle');
    if (!grid) return;

    // Calcular lunes de la semana actual + weekOffset
    const base = new Date();
    const dow = (base.getDay() + 6) % 7; // 0 = Lunes
    const monday = new Date(base.getFullYear(), base.getMonth(), base.getDate() - dow + weekOffset * 7);
    const days = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      days.push({
        label: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'][i],
        num: d.getDate(),
        key: ks(d.getFullYear(), d.getMonth(), d.getDate())
      });
    }
    if (titleEl) {
      const firstD = days[0], lastD = days[4];
      titleEl.textContent = `${firstD.num} – ${lastD.num} ${MES_NOMBRES[monday.getMonth()].slice(0, 3)}`;
    }

    const hours = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'];
    let h = `<div class="wk-head"><div class="wk-corner"></div>${days.map(d => `<div class="wk-day ${d.key === TODAY ? 'today' : ''}" onclick="openAddTaskModal(null, '${d.key}')"><span>${d.label}</span><b>${d.num}</b></div>`).join('')}</div>`;

    hours.forEach((hr, idx) => {
      const hrNum = parseInt(hr.slice(0, 2), 10);
      h += `<div class="wk-row"><div class="wk-hour">${hr}</div>`;
      days.forEach(d => {
        const evs = eventsForDate(d.key).filter(e => {
          const t = e.evalTime || '08:30';
          const eh = parseInt(t.slice(0, 2), 10);
          if (idx === hours.length - 1) return eh >= hrNum;
          return eh >= hrNum && eh < hrNum + 2;
        });
        // Ordenar certámenes arriba
        evs.sort((a, b) => (a.kind === 'certamen' ? -1 : 1) - (b.kind === 'certamen' ? -1 : 1));
        h += `<div class="wk-cell" onclick="openAddTaskModal(null, '${d.key}')">${evs.map(e => {
          const isCert = (e.kind || 'certamen') === 'certamen';
          const isTrab = e.kind === 'trabajo';
          const cls = isCert ? 'wk-ev-cert' : (isTrab ? 'wk-ev-trab' : 'wk-ev-sem');
          const sub = isCert ? 'CERTAMEN' : (e.repeat && e.repeat !== 'none' ? 'Semanal' : (e.evalTime || ''));
          return `<div class="wk-ev ${cls}" onclick="event.stopPropagation(); openCalDetailModal('${e.id}')"><b>${esc(e.title)}</b><span>${esc(sub)}</span></div>`;
        }).join('')}</div>`;
      });
      h += `</div>`;
    });

    grid.innerHTML = h;
  }

  if ($('#selectEvalTarget')) $('#selectEvalTarget').onchange = () => updateCalendarUI();

  /* ---------- Acordeón de categorías y menú ⋮ ---------- */
  window.toggleCategoryAccordion = function (key) {
    vibrar();
    const isCurrentlyOpen = !!$('#cat_acc_' + key)?.classList.contains('open');
    manualToggledCats[key] = true;
    openCats[key] = !isCurrentlyOpen;
    render();
  };

  window.toggleCatMenu = function (key, ev) {
    if (ev) ev.stopPropagation();
    openCatMenuKey = openCatMenuKey === key ? null : key;
    $$('.cat-pop-menu').forEach(m => m.classList.toggle('open', m.id === 'cat_menu_' + openCatMenuKey));
  };

  function render() {
    const q = norm(searchQuery);
    const isSearching = q.length > 0;
    const categories = catData[currentSection] || [];
    const items = appData[currentSection] || [];
    let html = '';

    categories.forEach(cat => {
      let allCatItems = items.filter(x => x.cat === cat.key);
      let catItems = allCatItems;
      if (isSearching) {
        catItems = catItems.filter(x => norm(x.title).includes(q) || norm(x.summary).includes(q) || norm(x.detail).includes(q));
      }

      const doneCount = allCatItems.filter(x => x.checked).length;
      const totalCount = allCatItems.length;
      const esTarea = currentSection === 'renaico';
      const isComplete = esTarea && totalCount > 0 && doneCount === totalCount;

      // Auto-colapsar categorías completas salvo que el usuario la haya abierto manualmente
      let isOpen = isSearching || !!openCats[cat.key];
      if (esTarea && isComplete && !manualToggledCats[cat.key] && !isSearching) {
        isOpen = false;
      }

      if (esTarea && !isSearching) {
        if (estadoFiltro === 'por') catItems = catItems.filter(x => !x.checked);
        else if (estadoFiltro === 'emp') catItems = catItems.filter(x => x.checked);
      }

      const badgeHtml = isComplete
        ? `<span class="cat-counter complete">Completa ${doneCount}/${totalCount}</span>`
        : `<span class="cat-counter">${esTarea ? doneCount + '/' + totalCount : allCatItems.length}</span>`;

      html += `
        <div class="cat-accordion ${isOpen ? 'open' : ''} ${isComplete ? 'is-complete' : ''}" id="cat_acc_${cat.key}">
          <div class="cat-header" onclick="toggleCategoryAccordion('${cat.key}')">
            <span class="cat-title-text font-title">
              ${isComplete ? '<span class="cat-check-ok">✓</span>' : ''}
              ${esc(cat.name)}
            </span>
            <div class="cat-badge-wrap">
              ${badgeHtml}
              <button type="button" class="cat-dots-btn" aria-label="Opciones de categoría" onclick="toggleCatMenu('${cat.key}', event)">⋮</button>
              <span class="cat-arrow">▼</span>
            </div>
            <div class="cat-pop-menu" id="cat_menu_${cat.key}" onclick="event.stopPropagation()">
              <button type="button" onclick="openCategoryForm('${cat.key}'); toggleCatMenu(null, event)">Editar categoría</button>
              <button type="button" onclick="openCategoryForm(); toggleCatMenu(null, event)">Nueva categoría</button>
              <button type="button" class="danger" onclick="confirmDeleteCat('${cat.key}'); toggleCatMenu(null, event)">Eliminar categoría</button>
            </div>
          </div>
          <div class="cat-content">
            ${catItems.length === 0 ? '<div style="font-size:0.75rem;color:var(--muted);font-style:italic;text-align:center;padding:12px 0;">Vacío.</div>' : catItems.map(it => `
              <div class="task-row" onclick="openDetailModal('${it.id}')">
                ${esTarea ? `<button class="task-checkbox ${it.checked ? 'checked' : ''}" onclick="toggleItemCheck('${it.id}', event)">${it.checked ? '✓' : ''}</button>` : ''}
                <div class="task-body">
                  <div class="task-title ${esTarea && it.checked ? 'done' : ''}">${esc(it.title)}</div>
                  ${it.summary ? `<div class="task-summary-pill"><span>${esc(it.summary)}</span></div>` : ''}
                </div>
                <span class="task-arrow">›</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    });

    if ($('#institutoApuntesArea')) {
      $('#institutoApuntesArea').innerHTML = html || '<div style="text-align:center;padding:36px;color:var(--muted);">No hay categorías.</div>';
    }
    if ($('#mainContentArea')) {
      if (currentSection === 'renaico' && estadoFiltro === 'que' && !isSearching) {
        $('#mainContentArea').innerHTML = renderCosasInline();
      } else {
        $('#mainContentArea').innerHTML = currentSection === 'renaico' ? html : '';
      }
    }
    if (currentSection === 'instituto') {
      renderProximo();
      renderHabitos();
      renderNotas();
    }
    updatePackingProgress();
    updateCalendarUI();
    if (window.MiEspacio && MiEspacio.actualizarNav) MiEspacio.actualizarNav();
  }

  window.setEstado = function (e) {
    estadoFiltro = e;
    if ($('#tabPor')) $('#tabPor').classList.toggle('on', e === 'por');
    if ($('#tabEmp')) $('#tabEmp').classList.toggle('on', e === 'emp');
    if ($('#tabQue')) $('#tabQue').classList.toggle('on', e === 'que');
    aplicarCabecera();
    render();
  };

  /* ---------- Cosas que quedaron en el lugar ---------- */
  let cosaEditId = null, cosaFotoData = null;
  function getCosasLugar() {
    if (!cosasData || typeof cosasData !== 'object') cosasData = { renaico: [], hualqui: [] };
    if (!Array.isArray(cosasData[lugar])) cosasData[lugar] = [];
    return cosasData[lugar];
  }
  function renderCosasInline() {
    const list = getCosasLugar();
    if (!list.length) {
      return `<div class="cat-accordion open"><div class="cat-header" style="cursor:default"><span class="cat-title-text font-title">Quedaron en ${esc(LUGAR_NOMBRE[lugar])}</span><span class="cat-counter">0</span></div><div class="cat-content" style="display:block"><div style="font-size:0.8rem;color:var(--muted);text-align:center;padding:18px 8px;">Aún no has registrado cosas que quedaron en ${esc(LUGAR_NOMBRE[lugar])}.<br><small>Usa "＋ Agregar cosa" abajo para anotar lo que dejaste allá.</small></div></div></div>`;
    }
    return `<div class="cat-accordion open"><div class="cat-header" style="cursor:default"><span class="cat-title-text font-title">Quedaron en ${esc(LUGAR_NOMBRE[lugar])}</span><span class="cat-counter">${list.length}</span></div><div class="cat-content" style="display:block">${list.map(c => {
      const f = cosasFotosCache[c.id] || c.foto || null;
      const ini = (c.nombre || '?').trim().charAt(0).toUpperCase();
      return `
      <div class="cosa-row">
        <div class="cosa-thumb">${f ? `<img src="${f}" style="width:100%;height:100%;object-fit:cover;border-radius:11px" alt="">` : `<span class="font-title" style="font-weight:700;font-size:1.1rem;color:var(--p)">${esc(ini)}</span>`}</div>
        <div class="cosa-info">
          <div class="cosa-name">${esc(c.nombre)}</div>
          ${c.ubi ? `<div class="cosa-loc">${esc(c.ubi)}</div>` : ''}
        </div>
        <button class="mini-btn" onclick="openCosaForm('${c.id}')" aria-label="Editar">✎</button>
        <button class="mini-btn" onclick="deleteCosa('${c.id}')" aria-label="Eliminar">✕</button>
      </div>`;
    }).join('')}</div></div>`;
  }

  function updateCosaPhotoPreview() {
    const box = $('#cosaPbox'); if (!box) return;
    const img = box.querySelector('img'), sp = box.querySelector('span'), rm = $('#cosaRm');
    if (cosaFotoData) { img.src = cosaFotoData; img.style.display = 'block'; sp.style.display = 'none'; rm.style.display = 'grid'; }
    else { img.removeAttribute('src'); img.style.display = 'none'; sp.style.display = 'block'; rm.style.display = 'none'; }
  }

  window.openCosaForm = function (id) {
    const list = getCosasLugar();
    const c = id ? list.find(x => x.id === id) : null;
    cosaEditId = c ? c.id : null;
    cosaFotoData = c ? (cosasFotosCache[c.id] || c.foto || null) : null;
    $('#cosaFormTitle').textContent = c ? 'Editar cosa' : 'Nueva cosa en ' + LUGAR_NOMBRE[lugar];
    $('#cosaNombre').value = c ? c.nombre : '';
    $('#cosaUbi').value = c ? (c.ubi || '') : '';
    updateCosaPhotoPreview();
    $('#modalCosaForm').classList.add('active');
    setTimeout(() => $('#cosaNombre').focus(), 120);
  };

  window.deleteCosa = function (id) {
    const list = getCosasLugar();
    const idx = list.findIndex(x => x.id === id);
    if (idx === -1) return;
    const backup = list[idx];
    const fotoBackup = cosasFotosCache[id];
    list.splice(idx, 1);
    delete cosasFotosCache[id];
    if (window.MiEspacio && MiEspacio.fotos) MiEspacio.fotos.borrar('cosa_' + id);
    saveAll();
    render();
    toast('Objeto eliminado', () => {
      getCosasLugar().splice(idx, 0, backup);
      if (fotoBackup) {
        cosasFotosCache[id] = fotoBackup;
        if (window.MiEspacio && MiEspacio.fotos) MiEspacio.fotos.poner('cosa_' + id, fotoBackup);
      }
      saveAll();
      render();
    });
  };

  if ($('#btnCosaCam')) $('#btnCosaCam').onclick = () => $('#cosaFileCam').click();
  if ($('#btnCosaGal')) $('#btnCosaGal').onclick = () => $('#cosaFileGal').click();
  if ($('#cosaRm')) $('#cosaRm').onclick = () => { cosaFotoData = null; updateCosaPhotoPreview(); };
  ['#cosaFileCam', '#cosaFileGal'].forEach(sel => {
    const inp = $(sel);
    if (inp) inp.onchange = e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      const r = new FileReader();
      r.onload = ev => {
        const im = new Image();
        im.onload = () => {
          const k = Math.min(1, 480 / Math.max(im.width, im.height));
          const cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
          cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
          cosaFotoData = cv.toDataURL('image/jpeg', 0.65);
          updateCosaPhotoPreview();
        };
        im.src = ev.target.result;
      };
      r.readAsDataURL(f);
    };
  });

  if ($('#btnSaveCosa')) {
    $('#btnSaveCosa').onclick = () => {
      const nombre = $('#cosaNombre').value.trim();
      if (!nombre) return alert('Escribe el nombre del objeto');
      const ubi = $('#cosaUbi').value.trim();
      const list = getCosasLugar();
      const id = cosaEditId || ('cs_' + Date.now().toString(36));
      if (cosaFotoData) {
        cosasFotosCache[id] = cosaFotoData;
        if (window.MiEspacio && MiEspacio.fotos) MiEspacio.fotos.poner('cosa_' + id, cosaFotoData);
      } else {
        delete cosasFotosCache[id];
        if (window.MiEspacio && MiEspacio.fotos) MiEspacio.fotos.borrar('cosa_' + id);
      }
      if (cosaEditId) {
        const c = list.find(x => x.id === cosaEditId);
        if (c) { c.nombre = nombre; c.ubi = ubi; c.tieneFoto = !!cosaFotoData; delete c.foto; }
      } else {
        list.unshift({ id, nombre, ubi, tieneFoto: !!cosaFotoData });
      }
      saveAll(); $('#modalCosaForm').classList.remove('active'); render(); toast('Guardado');
    };
  }

  document.addEventListener('click', e => {
    if (e.target.closest('[data-close-cosa]')) $('#modalCosaForm').classList.remove('active');
    if (e.target.closest('[data-close-cat]')) $('#modalCategory').classList.remove('active');
  });

  /* ---------- Instituto · Próximo + Hechos archivados ---------- */
  const KIND_NOM = { certamen: 'Certamen', trabajo: 'Trabajo', presentacion: 'Presentación', tarea: 'Tarea' };
  function diaTxt(n) { return n === 0 ? 'Hoy' : n === 1 ? 'Mañana' : n < 0 ? 'Hace ' + Math.abs(n) + 'd' : 'En ' + n + ' días'; }

  window.toggleHechosArchive = function () {
    hechosOpen = !hechosOpen;
    renderProximo();
  };

  function renderProximo() {
    const hero = $('#proxHero'), box = $('#proxArea');
    if (!hero || !box) return;
    const q = norm(searchQuery);
    const items = calItems
      .filter(x => !x.checked && x.evalDate && diffDays(x.evalDate) >= 0 && (!q || norm(x.title).includes(q) || norm(x.summary).includes(q)))
      .sort((a, b) => diffDays(a.evalDate) - diffDays(b.evalDate));
    const hechos = calItems
      .filter(x => x.checked && (!q || norm(x.title).includes(q)))
      .sort((a, b) => toU(b.evalDate) - toU(a.evalDate));

    if (!items.length) {
      hero.innerHTML = '<div class="hero-num none"><b>–</b><span>días</span></div><div style="flex:1"><h2 class="font-title" style="font-size:.95rem">Sin eventos próximos</h2><p style="font-size:.72rem;color:var(--muted)">Usa ＋ para agregar una evaluación o tarea.</p></div>';
    } else {
      const t = items[0], n = diffDays(t.evalDate);
      hero.innerHTML = `<div class="hero-num ${n <= 3 ? 'soon' : ''}"><b>${n}</b><span>${n === 1 ? 'día' : 'días'}</span></div>
        <div style="flex:1;min-width:0"><h2 class="font-title" style="font-size:.95rem;font-weight:700">${esc(t.title)}</h2>
        <p style="font-size:.72rem;color:var(--muted)">${esc(new Date(toU(t.evalDate) + 12 * 36e5).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }))}${t.evalTime ? ' · ' + esc(t.evalTime) : ''}</p></div>`;
    }

    const fila = it => {
      const n = diffDays(it.evalDate), k = it.kind || 'certamen';
      const f = new Date(toU(it.evalDate) + 12 * 36e5).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
      return `
        <div class="ev-row" onclick="openCalDetailModal('${it.id}')">
          <button type="button" class="task-checkbox" onclick="toggleCalItemCheck('${it.id}', event)" aria-label="Marcar como hecho"></button>
          ${shapeHtml(k, 'lg')}
          <div class="b">
            <b>${esc(it.title)}</b>
            <small>${esc(f)}${it.evalTime ? ' · ' + esc(it.evalTime) : ''} · ${KIND_NOM[k] || 'Tarea'}</small>
          </div>
          <span class="d ${n <= 3 ? 'soon' : ''}">${diaTxt(n)}</span>
        </div>`;
    };

    const semana = items.filter(x => diffDays(x.evalDate) <= 7);
    const despues = items.filter(x => diffDays(x.evalDate) > 7);

    const hechosHtml = hechos.length ? `
      <div class="hechos-archive ${hechosOpen ? 'open' : ''}">
        <button type="button" class="hechos-head" onclick="toggleHechosArchive()">
          <span>Hechos (${hechos.length})</span>
          <span class="cat-arrow">▼</span>
        </button>
        <div class="hechos-body">
          ${hechos.map(it => `
            <div class="ev-row done-row" onclick="toggleCalItemCheck('${it.id}', event)" title="Toca para restaurar">
              <button type="button" class="task-checkbox checked" tabindex="-1">✓</button>
              <div class="b">
                <b style="text-decoration:line-through;opacity:.65">${esc(it.title)}</b>
                <small>${fmtDate(it.evalDate)} · ${KIND_NOM[it.kind || 'certamen']}</small>
              </div>
              <span class="d done-pill">Hecho</span>
            </div>
          `).join('')}
          <p class="hechos-hint">Los eventos hechos se archivan aquí en vez de desaparecer. Toca uno para restaurarlo.</p>
        </div>
      </div>
    ` : '';

    box.innerHTML =
      (semana.length ? '<div class="sec-t">Esta semana</div>' + semana.map(fila).join('') : '') +
      (despues.length ? '<div class="sec-t">Más adelante</div>' + despues.map(fila).join('') : '') +
      hechosHtml;
  }

  /* ---------- Instituto · Hábitos con casilla diaria y racha (sin emoji fuego) ---------- */
  const leerHab = () => { try { const h = JSON.parse(localStorage.getItem(KEY_HAB) || 'null'); return (h && h.done && h.full) ? h : { done: {}, full: {} }; } catch (e) { return { done: {}, full: {} }; } };
  const habitos = () => (appData.instituto || []).filter(x => x.cat === 'estudio');
  function racha(h) {
    let n = 0; const d = new Date();
    const k = x => ks(x.getFullYear(), x.getMonth(), x.getDate());
    if (!h.full[k(d)]) d.setDate(d.getDate() - 1);
    while (h.full[k(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  window.toggleHabito = function (id) {
    vibrar();
    const h = leerHab(), lista = habitos();
    const hoy = h.done[TODAY] || [];
    h.done[TODAY] = hoy.includes(id) ? hoy.filter(x => x !== id) : hoy.concat(id);
    h.full[TODAY] = lista.length > 0 && lista.every(x => h.done[TODAY].includes(x.id));
    try { localStorage.setItem(KEY_HAB, JSON.stringify(h)); } catch (e) {}
    renderHabitos();
  };
  function renderHabitos() {
    const box = $('#habitosCard'); if (!box) return;
    const lista = habitos();
    if (!lista.length) { box.innerHTML = ''; return; }
    const h = leerHab(), hoy = h.done[TODAY] || [];
    const hechos = lista.filter(x => hoy.includes(x.id)).length;
    const deg = Math.round(hechos / lista.length * 360), r = racha(h);
    box.innerHTML = `<div class="hab-card"><div class="hab-head">
      <div class="hab-ring" style="background:conic-gradient(var(--p) ${deg}deg, var(--card-elevated) 0)"><span>${hechos}/${lista.length}</span></div>
      <div><div class="font-title" style="font-weight:700">Hábitos de hoy</div><div style="font-size:.74rem;color:var(--muted)">Racha: ${r} ${r === 1 ? 'día' : 'días'}</div></div></div>
      ${lista.map(x => `<div class="hab-row ${hoy.includes(x.id) ? 'done' : ''}" onclick="toggleHabito('${x.id}')"><button class="task-checkbox ${hoy.includes(x.id) ? 'checked' : ''}" tabindex="-1">${hoy.includes(x.id) ? '✓' : ''}</button><span class="t">${esc(x.title)}</span></div>`).join('')}</div>`;
  }

  /* ---------- Modales de eventos y tareas ---------- */
  window.openDayEventsModal = function (dateStr) {
    selectCalDay(dateStr);
  };

  window.openCalDetailModal = function (id) {
    const it = calItems.find(x => x.id === id);
    if (!it) return;
    selectedDetailId = id;
    const kind = it.kind || 'certamen';
    const kindName = KIND_NOM[kind] || 'Tarea';
    const statusBadge = $('#detStatusBadge');
    if (statusBadge) {
      statusBadge.style.display = 'inline-flex';
      statusBadge.textContent = it.checked ? 'Hecho' : 'Pendiente';
      statusBadge.className = 'det-badge ' + (it.checked ? 'done' : 'pending');
    }
    $('#detCatBadge').textContent = `${kindName} · ${fmtDate(it.evalDate)}${it.evalTime ? ' · ' + it.evalTime : ''}`;
    $('#detTitle').textContent = it.title;
    const sBox = $('#detSummaryBox');
    if (it.summary) { sBox.style.display = 'block'; $('#detSummaryTxt').textContent = it.summary; } else { sBox.style.display = 'none'; }
    $('#detBodyTxt').textContent = it.detail || 'Sin detalles.';
    $('#detToggleCheck').textContent = it.checked ? 'Desmarcar' : 'Marcar hecho';
    $('#detToggleCheck').style.display = '';
    $('#detToggleCheck').onclick = () => { toggleCalItemCheck(id); closeModals(); };
    $('#detEdit').style.display = '';
    $('#detEdit').onclick = () => { closeModals(); openAddTaskModal(id); };
    $('#detDelete').onclick = () => {
      deleteCalItem(id);
      closeModals();
    };
    $('#modalDetail').classList.add('active');
  };

  window.toggleCalItemCheck = function (id, e) {
    if (e) e.stopPropagation();
    const it = calItems.find(x => x.id === id);
    if (it) {
      vibrar();
      it.checked = !it.checked;
      saveAll();
      render();
      toast(it.checked ? 'Archivado en Hechos' : 'Evento restaurado');
    }
  };

  window.deleteCalItem = function (id) {
    const idx = calItems.findIndex(x => x.id === id);
    if (idx === -1) return;
    const backup = calItems[idx];
    calItems.splice(idx, 1);
    saveAll();
    render();
    toast('Evento eliminado', () => {
      calItems.splice(idx, 0, backup);
      saveAll();
      render();
    });
  };

  window.openDetailModal = function (id) {
    vibrar();
    selectedDetailId = id;
    const it = (appData[currentSection] || []).find(x => x.id === id);
    if (!it) return;
    const cat = (catData[currentSection] || []).find(c => c.key === it.cat);
    const statusBadge = $('#detStatusBadge');
    if (statusBadge) {
      if (currentSection === 'renaico') {
        statusBadge.style.display = 'inline-flex';
        statusBadge.textContent = it.checked ? 'Empacado' : 'Por empacar';
        statusBadge.className = 'det-badge ' + (it.checked ? 'done' : 'pending');
      } else {
        statusBadge.style.display = 'none';
      }
    }
    $('#detCatBadge').textContent = cat ? cat.name : 'Elemento';
    $('#detTitle').textContent = it.title;
    const sBox = $('#detSummaryBox');
    if (it.summary) { sBox.style.display = 'block'; $('#detSummaryTxt').textContent = it.summary; } else { sBox.style.display = 'none'; }
    $('#detBodyTxt').textContent = it.detail || 'Sin especificaciones detalladas.';
    $('#detToggleCheck').style.display = currentSection === 'renaico' ? '' : 'none';
    $('#detToggleCheck').textContent = it.checked ? 'Desmarcar' : 'Marcar empacado';
    $('#detEdit').style.display = '';
    $('#detToggleCheck').onclick = () => { toggleItemCheck(id); openDetailModal(id); };
    $('#detEdit').onclick = () => { closeModals(); openAddTaskModal(id); };
    $('#detDelete').onclick = () => {
      const list = appData[currentSection] || [];
      const idx = list.findIndex(x => x.id === id);
      if (idx === -1) return;
      const backup = list[idx];
      list.splice(idx, 1);
      saveAll();
      closeModals();
      render();
      toast('Elemento eliminado', () => {
        appData[currentSection].splice(idx, 0, backup);
        saveAll();
        render();
      });
    };
    $('#modalDetail').classList.add('active');
  };

  window.toggleItemCheck = function (id, e) {
    if (e) e.stopPropagation();
    const it = (appData[currentSection] || []).find(x => x.id === id);
    if (it) { vibrar(); it.checked = !it.checked; saveAll(); render(); }
  };

  window.setEvalRepeat = function (val) {
    evalRepeat = val || 'none';
    $$('#repeatChips button').forEach(b => b.classList.toggle('on', b.dataset.rep === evalRepeat));
  };

  window.openAddTaskModal = function (editId, presetDate) {
    const isInstCal = currentSection === 'instituto' && esCal();
    const cats = catData[currentSection] || [];
    if (!isInstCal && !cats.length) return alert('Crea primero una categoría.');
    editingId = editId || null;

    const it = editingId ? (isInstCal ? calItems.find(x => x.id === editingId) : (appData[currentSection] || []).find(x => x.id === editingId)) : null;

    $('#formModalTitle').textContent = it ? 'Editar' : (isInstCal ? 'Nuevo evento' : (currentSection === 'renaico' ? 'Nueva tarea' : 'Nuevo apunte'));
    $('#inpTitle').value = it ? it.title : '';
    $('#inpSummary').value = it ? it.summary : '';
    $('#inpDetail').value = it ? it.detail : '';
    $('#inpEvalDate').value = (it && (it.evalDate || it.evalD)) ? (it.evalDate || it.evalD) : (presetDate || selectedCalDay || TODAY);
    if ($('#inpEvalTime')) $('#inpEvalTime').value = (it && it.evalTime) ? it.evalTime : '08:30';
    $('#inpEvalType').value = (it && it.kind) ? it.kind : 'certamen';
    setEvalRepeat(it && it.repeat ? it.repeat : 'none');

    if (isInstCal) {
      $('#groupEvalDate').style.display = 'block';
      $('#groupEvalType').style.display = 'block';
      if ($('#groupEvalRepeat')) $('#groupEvalRepeat').style.display = 'block';
      $('#groupCategorySelect').style.display = 'none';
    } else {
      $('#groupEvalDate').style.display = 'none';
      $('#groupEvalType').style.display = 'none';
      if ($('#groupEvalRepeat')) $('#groupEvalRepeat').style.display = 'none';
      $('#groupCategorySelect').style.display = 'block';
      $('#inpCategory').innerHTML = cats.map(c => `<option value="${c.key}" ${it && it.cat === c.key ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    }

    $('#modalForm').classList.add('active');
    setTimeout(() => $('#inpTitle').focus(), 150);
  };

  if ($('#btnFabAdd')) {
    $('#btnFabAdd').onclick = () => {
      if (currentSection === 'renaico' && estadoFiltro === 'que') return openCosaForm();
      if (currentSection === 'instituto' && institutoSubView === 'notas') return openNotaForm();
      return openAddTaskModal();
    };
  }

  /* ===== Notas importantes con lista de tareas interactivas ===== */
  const NOTA_COLORES = ['#e11d48', '#eab308', '#10b981', '#3b82f6', '#8b5cf6'];
  let notasData = (() => { try { const v = JSON.parse(localStorage.getItem(KEY_NOTAS) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } })();
  let notaEdit = null, notaColor = NOTA_COLORES[1], notaTareasTemp = [];
  const saveNotas = () => { try { localStorage.setItem(KEY_NOTAS, JSON.stringify(notasData)); } catch (e) { alert('Almacenamiento lleno.'); } };

  window.toggleNotaTask = function (notaId, idx, ev) {
    if (ev) ev.stopPropagation();
    const n = notasData.find(x => x.id === notaId);
    if (!n || !Array.isArray(n.tareas) || !n.tareas[idx]) return;
    vibrar();
    n.tareas[idx].hecho = !n.tareas[idx].hecho;
    saveNotas();
    renderNotas();
  };

  function renderNotas() {
    const box = $('#notasArea'); if (!box) return;
    const q = norm(searchQuery);
    const l = notasData.filter(n => !q || norm(n.title).includes(q) || norm(n.text).includes(q) || (n.tareas || []).some(t => norm(t.texto).includes(q)))
      .sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || (b.ts || 0) - (a.ts || 0));
    if (!l.length) {
      box.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:.86rem;padding:34px 12px;line-height:1.6;">' + (q ? 'Sin resultados.' : 'Aún no tienes notas importantes.<br><small>Toca “Agregar nota” para guardar lo que no puedes olvidar.</small>') + '</div>';
      return;
    }
    box.innerHTML = l.map(n => {
      const tareas = Array.isArray(n.tareas) ? n.tareas : [];
      const tareasHtml = tareas.length ? `<div class="nota-checklist">${tareas.map((t, idx) => `
        <div class="nota-chk-row ${t.hecho ? 'done' : ''}" onclick="toggleNotaTask('${n.id}', ${idx}, event)">
          <button type="button" class="task-checkbox ${t.hecho ? 'checked' : ''}" tabindex="-1">${t.hecho ? '✓' : ''}</button>
          <span>${esc(t.texto)}</span>
        </div>
      `).join('')}</div>` : '';
      return `
        <div class="nota" id="nota_${n.id}">
          <span class="nota-bar" style="background:${esc(n.color || NOTA_COLORES[1])}"></span>
          <div class="nota-body" onclick="this.parentNode.classList.toggle('open')">
            <div class="nota-t">
              ${n.pin ? '<span class="pin-dot" title="Fijada"></span>' : ''}
              <span>${esc(n.title)}</span>
            </div>
            ${n.text ? `<div class="nota-x">${esc(n.text)}</div>` : ''}
            ${tareasHtml}
            <div class="nota-d">${new Date(n.ts || Date.now()).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}</div>
          </div>
          <div class="nota-act">
            <button class="${n.pin ? 'on' : ''}" aria-label="Fijar" title="Fijar arriba" onclick="toggleNotaPin('${n.id}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="${n.pin ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>
            </button>
            <button aria-label="Editar" title="Editar nota" onclick="openNotaForm('${n.id}')">✎</button>
          </div>
        </div>`;
    }).join('');
  }

  window.toggleNotaPin = function (id) {
    const n = notasData.find(x => x.id === id);
    if (!n) return;
    n.pin = !n.pin;
    saveNotas();
    renderNotas();
  };

  window.selectNotaColor = function (c) {
    notaColor = c;
    pintarColoresNota();
  };

  function pintarColoresNota() {
    if (!$('#notaColores')) return;
    $('#notaColores').innerHTML = NOTA_COLORES.map(c => `<button type="button" class="${c === notaColor ? 'on' : ''}" style="background:${c}" onclick="selectNotaColor('${c}')" aria-label="Color"></button>`).join('');
  }

  function renderNotaTareasEditor() {
    const box = $('#notaTareasList');
    if (!box) return;
    box.innerHTML = notaTareasTemp.map((t, i) => `
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
        <input type="checkbox" ${t.hecho ? 'checked' : ''} onchange="notaTareasTemp[${i}].hecho=this.checked" style="width:18px;height:18px;accent-color:var(--emerald)">
        <input type="text" class="form-input" style="padding:6px 10px;font-size:.82rem;" value="${esc(t.texto)}" oninput="notaTareasTemp[${i}].texto=this.value" placeholder="Paso o tarea...">
        <button type="button" class="mini-btn" onclick="removeNotaTarea(${i})" aria-label="Quitar">✕</button>
      </div>
    `).join('');
  }
  window.notaTareasTemp = notaTareasTemp;
  window.addNotaTarea = function () {
    notaTareasTemp.push({ texto: '', hecho: false });
    renderNotaTareasEditor();
  };
  window.removeNotaTarea = function (i) {
    notaTareasTemp.splice(i, 1);
    renderNotaTareasEditor();
  };

  window.openNotaForm = function (id) {
    const n = id ? notasData.find(x => x.id === id) : null;
    notaEdit = n ? n.id : null;
    notaColor = n ? (n.color || NOTA_COLORES[1]) : NOTA_COLORES[1];
    notaTareasTemp = n && Array.isArray(n.tareas) ? n.tareas.map(t => ({ ...t })) : [];
    window.notaTareasTemp = notaTareasTemp;
    $('#notaFormTitle').textContent = n ? 'Editar nota' : 'Nueva nota importante';
    $('#notaTitulo').value = n ? n.title : '';
    $('#notaTexto').value = n ? (n.text || '') : '';
    $('#notaFijar').checked = !!(n && n.pin);
    $('#btnDelNota').style.display = n ? '' : 'none';
    pintarColoresNota();
    renderNotaTareasEditor();
    $('#modalNota').classList.add('active');
  };

  if ($('#btnSaveNota')) {
    $('#btnSaveNota').onclick = () => {
      const title = $('#notaTitulo').value.trim();
      if (!title) return alert('Escribe un título.');
      const tareasLimpias = notaTareasTemp.map(t => ({ texto: String(t.texto || '').trim(), hecho: !!t.hecho })).filter(t => t.texto);
      const d = { title, text: $('#notaTexto').value.trim(), color: notaColor, pin: $('#notaFijar').checked, tareas: tareasLimpias };
      const n = notaEdit ? notasData.find(x => x.id === notaEdit) : null;
      if (n) Object.assign(n, d);
      else notasData.push({ id: 'n' + Date.now().toString(36), ts: Date.now(), ...d });
      saveNotas(); closeModals(); renderNotas(); toast('Nota guardada');
    };
  }

  if ($('#btnDelNota')) {
    $('#btnDelNota').onclick = () => {
      const idx = notasData.findIndex(x => x.id === notaEdit);
      if (idx === -1) return;
      const backup = notasData[idx];
      notasData.splice(idx, 1);
      saveNotas();
      closeModals();
      renderNotas();
      toast('Nota eliminada', () => {
        notasData.splice(idx, 0, backup);
        saveNotas();
        renderNotas();
      });
    };
  }

  if ($('#btnSaveTask')) {
    $('#btnSaveTask').onclick = () => {
      const title = $('#inpTitle').value.trim();
      if (!title) return alert('Ingresa un título');
      vibrar();
      const isInstCal = currentSection === 'instituto' && esCal();

      if (isInstCal) {
        const evalDate = $('#inpEvalDate').value;
        const evalTime = $('#inpEvalTime') ? $('#inpEvalTime').value : '08:30';
        const kind = $('#inpEvalType').value;
        if (!evalDate) return alert('Selecciona una fecha');

        if (editingId) {
          const it = calItems.find(x => x.id === editingId);
          if (it) {
            it.title = title;
            it.summary = $('#inpSummary').value.trim();
            it.detail = $('#inpDetail').value.trim();
            it.evalDate = evalDate;
            it.evalTime = evalTime;
            it.kind = kind;
            it.repeat = evalRepeat;
          }
        } else {
          calItems.unshift({
            id: 'cal_' + Date.now().toString(36),
            title,
            evalDate,
            evalTime,
            kind,
            repeat: evalRepeat,
            summary: $('#inpSummary').value.trim(),
            detail: $('#inpDetail').value.trim(),
            checked: false
          });
        }
      } else {
        const catKey = $('#inpCategory').value;
        if (editingId) {
          const it = (appData[currentSection] || []).find(x => x.id === editingId);
          if (it) {
            it.title = title;
            it.summary = $('#inpSummary').value.trim();
            it.detail = $('#inpDetail').value.trim();
            it.cat = catKey;
          }
        } else {
          appData[currentSection].unshift({
            id: 'usr_' + Date.now().toString(36),
            cat: catKey,
            title,
            summary: $('#inpSummary').value.trim(),
            detail: $('#inpDetail').value.trim(),
            checked: false
          });
        }
      }
      saveAll(); closeModals(); render(); toast('Guardado'); editingId = null;
    };
  }

  function renderCatManager() {
    const cats = catData[currentSection] || [];
    $('#catMgrTitle').textContent = 'Categorías · ' + (currentSection === 'renaico' ? 'Traslado' : 'Instituto');
    $('#catMgrList').innerHTML = cats.length ? cats.map(c => `
      <div class="catm-row">
        <div class="catm-info">
          <div class="catm-name">${esc(c.name)}</div>
          <div class="catm-meta">${(appData[currentSection] || []).filter(x => x.cat === c.key).length} elementos</div>
        </div>
        <button class="mini-btn" onclick="openCategoryForm('${c.key}')">✎</button>
        <button class="mini-btn" onclick="confirmDeleteCat('${c.key}')">✕</button>
      </div>`).join('') : '<div style="font-size:.8rem;color:var(--muted);text-align:center;padding:12px;">Sin categorías.</div>';
  }

  if ($('#btnCatManager')) {
    $('#btnCatManager').onclick = () => {
      if (currentSection === 'renaico') {
        openModoBolso();
      } else {
        renderCatManager();
        $('#modalCatManager').classList.add('active');
      }
    };
  }
  if ($('#btnMenuCats')) {
    $('#btnMenuCats').onclick = () => {
      renderCatManager();
      $('#modalCatManager').classList.add('active');
    };
  }

  window.openCategoryForm = function (key) {
    editingCatKey = key || null;
    const c = editingCatKey ? (catData[currentSection] || []).find(x => x.key === editingCatKey) : null;
    $('#catFormTitle').textContent = c ? 'Editar Categoría' : 'Nueva Categoría';
    $('#inpCatName').value = c ? c.name : '';
    $('#inpCatPacking').checked = c ? !!c.packing : true;
    $('#groupPackingCheckbox').style.display = currentSection === 'renaico' ? 'block' : 'none';
    $('#modalCategory').classList.add('active');
  };

  if ($('#btnAddCategory')) $('#btnAddCategory').onclick = () => openCategoryForm();

  if ($('#btnSaveCategory')) {
    $('#btnSaveCategory').onclick = () => {
      const name = $('#inpCatName').value.trim();
      if (!name) return alert('Ingresa un nombre');
      vibrar();
      const packing = currentSection === 'renaico' && $('#inpCatPacking').checked;
      const c = editingCatKey ? (catData[currentSection] || []).find(x => x.key === editingCatKey) : null;
      if (c) { c.name = name; c.packing = packing; }
      else { const nc = { key: 'cat_' + Date.now().toString(36), name, packing }; catData[currentSection].push(nc); openCats[nc.key] = true; }
      saveAll(); $('#modalCategory').classList.remove('active'); render(); renderCatManager(); toast('Categoría guardada'); editingCatKey = null;
    };
  }

  window.confirmDeleteCat = function (key) {
    const cats = catData[currentSection] || [];
    const idx = cats.findIndex(c => c.key === key);
    if (idx === -1) return;
    const catBackup = cats[idx];
    const itemsBackup = (appData[currentSection] || []).filter(x => x.cat === key);
    catData[currentSection] = cats.filter(c => c.key !== key);
    appData[currentSection] = (appData[currentSection] || []).filter(x => x.cat !== key);
    saveAll();
    render();
    renderCatManager();
    toast('Categoría eliminada', () => {
      catData[currentSection].splice(idx, 0, catBackup);
      appData[currentSection].push(...itemsBackup);
      saveAll();
      render();
      renderCatManager();
    });
  };

  if ($('#btnResetPacking')) {
    $('#btnResetPacking').onclick = () => {
      const prevChecked = (appData.renaico || []).filter(it => it.checked).map(it => it.id);
      if (!prevChecked.length) return toast('Ya está todo desmarcado');
      appData.renaico.forEach(it => {
        const c = (catData.renaico || []).find(x => x.key === it.cat);
        if (c && c.packing) it.checked = false;
      });
      saveAll();
      render();
      toast('Equipaje reiniciado', () => {
        appData.renaico.forEach(it => { if (prevChecked.includes(it.id)) it.checked = true; });
        saveAll();
        render();
      });
    };
  }

  if ($('#calPrev')) $('#calPrev').onclick = () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } updateCalendarUI(); };
  if ($('#calNext')) $('#calNext').onclick = () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } updateCalendarUI(); };

  if ($('#searchInput')) {
    $('#searchInput').addEventListener('input', e => {
      searchQuery = e.target.value;
      $('#searchBoxContainer').classList.toggle('has-val', searchQuery.length > 0);
      render();
    });
  }
  if ($('#btnSearchClear')) {
    $('#btnSearchClear').onclick = () => {
      $('#searchInput').value = '';
      searchQuery = '';
      $('#searchBoxContainer').classList.remove('has-val');
      render();
    };
  }

  window.closeModals = function () {
    $$('.modal-overlay').forEach(m => m.classList.remove('active'));
    selectedDetailId = null;
  };
  document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) closeModals();
    if (e.target.closest('[data-close]')) closeModals();
  });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModals(); closeModoBolso(); } });

  if ($('#btnExport')) {
    $('#btnExport').onclick = () => {
      MiEspacio.descargar(MiEspacio.exportar(/^estacion_/), 'estacion-respaldo-' + MiEspacio.fechaArchivo() + '.json');
      toast('Respaldo descargado');
    };
  }
  if ($('#btnImport')) $('#btnImport').onclick = () => $('#fileInput').click();
  if ($('#fileInput')) {
    $('#fileInput').onchange = async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      try {
        const datos = await MiEspacio.leerArchivo(f, /^estacion_/);
        MiEspacio.aplicar(datos);
        toast('Datos cargados');
        setTimeout(() => location.reload(), 600);
      } catch (er) { alert('No se pudo cargar: ' + er.message); }
    };
  }
  addEventListener('pageshow', e => { if (e.persisted) location.reload(); });

  function checkInstitutoHash() {
    if (PAGE !== 'instituto') return;
    if (location.hash === '#notas') switchInstitutoSub('notas');
    else if (location.hash === '#cal') switchInstitutoSub('cal');
    else if (location.hash === '#apuntes') switchInstitutoSub('apuntes');
  }
  addEventListener('hashchange', checkInstitutoHash);

  applyTheme((function () {
    var t = localStorage.getItem('app_tema') || 'auto';
    return (t === 'oscuro' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)) ? 'dark' : 'light';
  })());
  setFont(localStorage.getItem('app_fuente') || localStorage.getItem(KEY_FONT) || 'fraunces', true);
  setTema(temaId, true);
  switchSection(PAGE);
  if (PAGE === 'instituto') {
    if (location.hash === '#notas') switchInstitutoSub('notas');
    else switchInstitutoSub('prox');
  }
  cargarFotosCosas();
  window.__listo = true;
})();
