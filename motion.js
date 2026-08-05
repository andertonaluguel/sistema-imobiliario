/* ============================================================
   motion.js — camada de movimento (fluidez)
   Encaixa-se no pipeline existente sem alterar dados nem lógica:
   - envolve render() e aplicarFiltroCasas() (globais)
   - anima entrada de página, contadores, gráfico, abas, FLIP de busca,
     e a abertura das seções recolhíveis (Alertas, Movimentações, Detalhe por casa)
   Carregar DEPOIS de app.js.
   A animação é sempre defensiva: se algo falhar ou o navegador não tiver
   a Web Animations API, o app continua 100% funcional, só sem os efeitos.
   ============================================================ */
(function(){
  if(typeof window==='undefined') return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var CAN = (typeof Element !== 'undefined') && !!Element.prototype.animate;  // Web Animations API
  if(!CAN) reduce = true;  // sem animate: pílula/indicador ainda funcionam (via transição CSS)

  // wrapper seguro para element.animate
  function anim(el, frames, opts){
    if(!el || reduce || !el.animate) return null;
    try{ return el.animate(frames, opts); }catch(e){ return null; }
  }

  // intensidade do movimento (expressivo por padrão)
  var CFG = { amp:26, stag:55, page:380, spring:'cubic-bezier(.34,1.5,.5,1)' };

  var navOrder = { dashboard:0, casas:1, houseDetail:1, inquilinos:2, financeiro:3, calendario:4 };
  var last = { view:null, tab:null, alerts:null, movs:null, report:null };

  function q(s){ return document.querySelector(s); }
  function qa(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); }

  /* ---------- entrada de página ---------- */
  function entrance(dir){
    if(reduce) return;
    var main = q('.main'); if(!main) return;
    var seq = [];
    Array.prototype.slice.call(main.children).forEach(function(el){
      if(el.classList.contains('stat-grid') || el.classList.contains('house-grid')){
        seq = seq.concat(Array.prototype.slice.call(el.children));
      } else seq.push(el);
    });
    var dx = (dir||0) * 18;
    seq.forEach(function(el,i){
      anim(el,
        [{opacity:0, transform:'translate('+dx+'px,'+CFG.amp+'px)'},{opacity:1, transform:'none'}],
        {duration:CFG.page, delay:Math.min(i,12)*CFG.stag, easing:CFG.spring, fill:'backwards'}
      );
    });
  }

  /* ---------- contadores (stat cards) ---------- */
  function parseNum(str){
    if(!str) return null;
    var m = str.match(/[\d.,]+/); if(!m) return null;
    var prefix = str.slice(0, m.index);
    var body = m[0];
    var decimals = /,\d{2}$/.test(body) ? 2 : 0;
    var num = parseFloat(body.replace(/\./g,'').replace(',', '.'));
    if(isNaN(num)) return null;
    return { value:num, prefix:prefix, decimals:decimals };
  }
  function countUp(){
    if(reduce) return;
    qa('.stat-value').forEach(function(el){
      var raw = el.getAttribute('data-cv') || el.textContent;
      el.setAttribute('data-cv', raw);
      var p = parseNum(raw); if(!p) return;
      var t0 = null, dur = 900;
      function fmt(v){ return p.prefix + v.toLocaleString('pt-BR',{minimumFractionDigits:p.decimals, maximumFractionDigits:p.decimals}); }
      function step(ts){
        if(!t0) t0 = ts;
        var k = Math.min(1,(ts-t0)/dur);
        var e = 1-Math.pow(1-k,3);
        el.textContent = fmt(p.value*e);
        if(k<1) requestAnimationFrame(step);
        else { el.textContent = raw; if(typeof fitStatValues==='function') fitStatValues(); }
      }
      requestAnimationFrame(step);
    });
  }

  /* ---------- gráfico cresce ---------- */
  function growBars(){
    if(reduce) return;
    qa('.chart-svg rect').forEach(function(r,i){
      anim(r, [{transform:'scaleY(0)'},{transform:'scaleY(1)'}],
        {duration:620, delay:i*32, easing:'cubic-bezier(.34,1.3,.5,1)'});
    });
  }

  /* ---------- pílula da navegação ---------- */
  function positionPill(){
    var nav = q('.topbar-nav'); if(!nav) return;
    var pill = nav.querySelector('.nav-pill');
    if(!pill){ pill = document.createElement('span'); pill.className = 'nav-pill'; nav.insertBefore(pill, nav.firstChild); }
    var active = nav.querySelector('.topbar-link.active');
    if(!active){ pill.style.opacity = '0'; return; }
    pill.style.opacity = '1';
    pill.style.top = active.offsetTop + 'px';
    pill.style.height = active.offsetHeight + 'px';
    pill.style.width = active.offsetWidth + 'px';
    pill.style.transform = 'translateX(' + active.offsetLeft + 'px)';
  }

  /* ---------- indicador das abas ---------- */
  function positionTab(){
    var tabs = q('.tabs'); if(!tabs) return;
    var ind = tabs.querySelector('.tab-ind');
    if(!ind){ ind = document.createElement('span'); ind.className = 'tab-ind'; tabs.appendChild(ind); }
    var active = tabs.querySelector('.tab.active');
    if(!active){ ind.style.opacity = '0'; return; }
    ind.style.opacity = '1';
    ind.style.width = active.offsetWidth + 'px';
    ind.style.transform = 'translateX(' + active.offsetLeft + 'px)';
  }
  function tabPanelEnter(){
    var p = q('.tab-panel'); if(!p) return;
    anim(p, [{opacity:0, transform:'translateY(10px)'},{opacity:1, transform:'none'}],
      {duration:CFG.page, easing:CFG.spring, fill:'backwards'});
  }

  /* ---------- seção recolhível: abrir com altura animada ---------- */
  function animateOpen(coll){
    if(reduce || !coll) return;
    var b = coll.querySelector('.panel-body'); if(!b) return;
    var h = b.scrollHeight;
    var prevOv = b.style.overflow; b.style.overflow = 'hidden';
    var a = anim(b, [{height:'0px'},{height:h+'px'}], {duration:CFG.page, easing:CFG.spring});
    if(a) a.onfinish = function(){ b.style.height=''; b.style.overflow=prevOv; };
    else { b.style.overflow = prevOv; }
    var rows = Array.prototype.slice.call(b.querySelectorAll('.alert-row, .ledger-row, .report-row-wrap'));
    rows.forEach(function(el,i){
      anim(el, [{opacity:0, transform:'translateX(10px)'},{opacity:1, transform:'none'}],
        {duration:CFG.page, delay:Math.min(i,10)*CFG.stag, easing:CFG.spring, fill:'backwards'});
    });
  }

  /* ---------- FLIP da grade de casas (busca/filtro) ---------- */
  function captureRects(grid){
    var map = {}, i = 0;
    if(!grid) return map;
    Array.prototype.slice.call(grid.querySelectorAll('.house-card')).forEach(function(c){
      c.setAttribute('data-flip-id', c.getAttribute('data-flip-id') || ('f'+(i++)));
      map[c.getAttribute('data-flip-id')] = c.getBoundingClientRect();
    });
    return map;
  }
  function applyFlip(grid, prev){
    if(reduce || !grid) return;
    Array.prototype.slice.call(grid.querySelectorAll('.house-card')).forEach(function(c){
      if(c.style.display === 'none') return;
      var id = c.getAttribute('data-flip-id');
      var o = prev[id], n = c.getBoundingClientRect();
      if(o){
        var dx = o.left-n.left, dy = o.top-n.top;
        if(dx || dy) anim(c, [{transform:'translate('+dx+'px,'+dy+'px)'},{transform:'none'}],
          {duration:420, easing:CFG.spring});
      } else {
        anim(c, [{opacity:0, transform:'scale(.92)'},{opacity:1, transform:'none'}],
          {duration:320, easing:CFG.spring, fill:'backwards'});
      }
    });
  }

  /* ---------- ripple (resposta ao toque) ---------- */
  function ripple(e){
    if(reduce) return;
    var sel = 'button, .house-card, .ledger-row, .alert-row, .tab, .topbar-link, .filter-chip, .stat-card, .report-row, .cal-cell, .cal-day';
    var b = e.target.closest && e.target.closest(sel);
    if(!b) return;
    try{
      var rect = b.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height) * 1.4;
      var s = document.createElement('span');
      s.className = 'alu-ripple';
      s.style.width = s.style.height = size + 'px';
      s.style.left = (e.clientX - rect.left - size/2) + 'px';
      s.style.top = (e.clientY - rect.top - size/2) + 'px';
      if(getComputedStyle(b).position === 'static') b.style.position = 'relative';
      var prevOv = b.style.overflow; b.style.overflow = 'hidden';
      b.appendChild(s);
      var a = anim(s, [{transform:'scale(0)', opacity:.22},{transform:'scale(1)', opacity:0}],
        {duration:520, easing:'ease-out'});
      if(a) a.onfinish = function(){ s.remove(); b.style.overflow = prevOv; };
      else { s.remove(); b.style.overflow = prevOv; }
    }catch(err){}
  }
  document.addEventListener('pointerdown', ripple, true);

  /* ---------- pós-render: orquestra tudo ---------- */
  function afterRenderInner(prevView){
    var firstPaint = (prevView === null && last.view === null);
    var viewChanged = state.view !== prevView;
    var tabChanged = state.view === 'houseDetail' && state.activeTab !== last.tab;
    var alertsToggled = state.alertsExpanded !== last.alerts;
    var movsToggled = state.movsExpanded !== last.movs;
    var reportToggled = state.reportListExpanded !== last.report;

    positionPill();
    positionTab();

    /* Parte 1 — fim do piscar ao navegar: a troca de página (e de aba do
       detalhe) é imediata, sem entrada deslizante/esmaecida do conteúdo.
       Continuam animados: janelas, toasts, ripple e o retorno dos botões
       (CSS/local) e a abertura das seções recolhíveis (logo abaixo). */
    if(viewChanged || tabChanged){
      /* intencionalmente vazio: nada a animar na troca de página/aba */
    }

    // abertura animada das seções recolhíveis (não no primeiro paint, para não piscar)
    if(!firstPaint && !viewChanged){
      var colls = qa('.panel-collapsible');
      if(alertsToggled && state.alertsExpanded){ animateOpen(colls[0]); }         // Painel: Alertas é o 1º
      if(movsToggled && state.movsExpanded){ animateOpen(colls[1] || colls[0]); } // Painel: Movimentações é o 2º
      if(reportToggled && state.reportListExpanded){ animateOpen(colls[0]); }     // Financeiro: Detalhe por casa
    }
  }
  function afterRender(prevView){
    if(typeof state === 'undefined') return;
    try{ afterRenderInner(prevView); }catch(e){ /* animação nunca quebra o app */ }
    last.view = state.view; last.tab = state.activeTab;
    last.alerts = state.alertsExpanded; last.movs = state.movsExpanded; last.report = state.reportListExpanded;
  }

  /* ---------- envolve render() ---------- */
  if(typeof window.render === 'function'){
    var origRender = window.render;
    window.render = function(){
      var prevView = last.view;
      origRender.apply(this, arguments);
      // medições de layout já disponíveis após o innerHTML; chamada síncrona
      // evita depender de rAF (estrangulado em abas em 2º plano)
      afterRender(prevView);
    };
  }

  /* ---------- envolve aplicarFiltroCasas() para o FLIP ---------- */
  if(typeof window.aplicarFiltroCasas === 'function'){
    var origFiltro = window.aplicarFiltroCasas;
    window.aplicarFiltroCasas = function(){
      var grid = document.getElementById('casaGrid');
      var prev = captureRects(grid);
      var r = origFiltro.apply(this, arguments);
      try{ applyFlip(grid, prev); }catch(e){}
      return r;
    };
  }

  window.addEventListener('resize', function(){ positionPill(); positionTab(); });

  // primeira pintura (caso o app já tenha renderizado antes deste script)
  setTimeout(function(){ if(typeof state !== 'undefined' && document.querySelector('.main')){ afterRender(null); } }, 0);
})();
