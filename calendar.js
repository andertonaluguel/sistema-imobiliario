/* ============================================================
   calendar.js — Calendário mensal
   - Mostra automaticamente os dias de vencimento de cada casa
     alugada, com cor por status de pagamento (pago/atrasado/pendente).
   - Permite lembretes manuais por dia (tabela "eventos").
   ============================================================ */

const calDiasSemana = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function calPrevMes(){ state.calMes = addMonths(state.calMes||currentMonthStr(), -1); render(); }
function calNextMes(){ state.calMes = addMonths(state.calMes||currentMonthStr(),  1); render(); }
function calHoje(){ state.calMes = currentMonthStr(); render(); }

/* casas alugadas que vencem em determinado dia do mês */
function vencimentosDoDia(mesStr, dia){
  return state.houses.filter(function(h){
    return h.status==='alugada' && (h.diaVencimento||5)===dia;
  });
}

function renderCalendario(){
  const mesStr = state.calMes || currentMonthStr();
  const p = mesStr.split('-').map(Number);
  const ano = p[0], mes = p[1];
  const primeiroDiaSemana = new Date(ano, mes-1, 1).getDay();
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const hoje = todayISO();

  const heads = calDiasSemana.map(function(d){ return '<div class="cal-head">'+d+'</div>'; }).join('');
  const cells = [];
  for(let i=0;i<primeiroDiaSemana;i++){ cells.push('<div class="cal-cell empty"></div>'); }
  for(let dia=1; dia<=diasNoMes; dia++){
    const iso = mesStr+'-'+String(dia).padStart(2,'0');
    const vencs = vencimentosDoDia(mesStr, dia);
    const evs = state.eventos.filter(function(e){ return e.data===iso; });
    const dots = [];
    vencs.forEach(function(h){
      const st = paymentStatus(h, mesStr);
      const cls = st==='pago'?'brass':st==='atrasado'?'rust':'slate';
      dots.push('<span class="cal-dot '+cls+'"></span>');
    });
    if(evs.length) dots.push('<span class="cal-dot event"></span>');
    let dotsHtml = dots.slice(0,5).join('');
    if(dots.length>5) dotsHtml += '<span class="cal-more">+'+(dots.length-5)+'</span>';
    const isHoje = iso===hoje;
    cells.push('<button class="cal-cell'+(isHoje?' today':'')+'" onclick="openCalDiaModal(\''+iso+'\')">'+
      '<span class="cal-daynum">'+dia+'</span>'+
      '<span class="cal-dots">'+dotsHtml+'</span></button>');
  }

  return '<div class="page-header"><div>'+
      '<div class="eyebrow">CALENDÁRIO</div>'+
      pageTitleWithIcon(calendarIconSvg(), monthLabel(mesStr))+
      '<div class="page-sub">Vencimentos de aluguel e lembretes</div>'+
    '</div></div>'+
    '<div class="cal-bar">'+
      '<div class="cal-nav"><button onclick="calPrevMes()" aria-label="Mês anterior">←</button>'+
        '<button class="cal-today-btn" onclick="calHoje()">Hoje</button>'+
        '<button onclick="calNextMes()" aria-label="Próximo mês">→</button></div>'+
    '</div>'+
    '<div class="cal-legend">'+
      '<span><span class="cal-dot brass"></span>Pago</span>'+
      '<span><span class="cal-dot rust"></span>Atrasado</span>'+
      '<span><span class="cal-dot slate"></span>Pendente</span>'+
      '<span><span class="cal-dot event"></span>Lembrete</span>'+
    '</div>'+
    '<div class="cal-grid">'+heads+cells.join('')+'</div>';
}

/* ---------- modal do dia ---------- */
function openCalDiaModal(iso){
  const mesStr = iso.slice(0,7);
  const dia = Number(iso.slice(8,10));
  const vencs = vencimentosDoDia(mesStr, dia);
  const evs = state.eventos.filter(function(e){ return e.data===iso; });

  let html = '<h3 class="modal-title">'+fmtDateBR(iso)+'</h3>';

  if(vencs.length){
    html += '<div class="report-detail-title rdt-ico-row"><span class="rdt-ico">'+FICO.money+'</span>Vencimentos do dia</div><div class="ledger">'+
      vencs.map(function(h){
        const st = paymentStatus(h, mesStr);
        const cls = st==='pago'?'brass':st==='atrasado'?'rust':'slate';
        const lbl = st==='pago'?'PAGO':st==='atrasado'?'ATRASADO':'PENDENTE';
        const t = tenantOf(h);
        return '<div class="ledger-row" onclick="closeModal();openHouse(\''+h.id+'\')">'+
          '<span class="row-ico" style="color:'+payIcoColor(st)+'">'+payIcon(st)+'</span>'+
          '<div class="ledger-row-main">'+esc(h.nome)+
            (t?'<div class="ledger-row-sub">'+esc(t.nome)+'</div>':'')+'</div>'+
          '<span class="chip chip-'+cls+'">'+lbl+'</span>'+
          '<div class="ledger-row-value num">'+fmtMoney(h.aluguelValor)+'</div></div>';
      }).join('')+'</div>';
  }

  html += '<div class="report-detail-title rdt-ico-row" style="margin-top:14px;"><span class="rdt-ico" style="color:var(--manut)">'+FICO.bell+'</span>Lembretes</div>';
  if(evs.length){
    html += '<div class="ledger">'+evs.map(function(e){
      return '<div class="ledger-row"><span class="row-ico" style="color:var(--manut)">'+FICO.bell+'</span><div class="ledger-row-main">'+esc(e.texto||'(sem texto)')+'</div>'+
        '<button class="btn btn-danger btn-sm" onclick="deleteEvento(\''+e.id+'\',\''+iso+'\')">Excluir</button></div>';
    }).join('')+'</div>';
  } else {
    html += '<div class="empty-state">Nenhum lembrete neste dia.</div>';
  }

  html += '<label class="field" style="margin-top:10px;"><span>Novo lembrete</span>'+
    '<input id="f_evtexto" placeholder="Ex: vistoria, visita, ligar para o inquilino…"></label>'+
    '<div class="modal-actions"><span></span><div class="modal-actions-right">'+
      '<button class="btn btn-ghost" onclick="closeModal()">Fechar</button>'+
      '<button class="btn btn-primary" onclick="addEvento(\''+iso+'\')">Adicionar lembrete</button>'+
    '</div></div>';

  openModal(html);
}

async function addEvento(iso){
  const texto = document.getElementById('f_evtexto').value.trim();
  if(!texto){ showToast('Escreva o lembrete.', 'error'); return; }
  try{
    const novo = await db.insertEvent({ data:iso, texto:texto });
    state.eventos.push(novo);
    render();              // atualiza o marcador na grade
    openCalDiaModal(iso);  // reabre o dia já com o novo lembrete
  }catch(e){ console.error(e); showToast('Erro ao salvar o lembrete.', 'error'); }
}
async function deleteEvento(id, iso){
  try{
    await db.deleteEvent(id);
    state.eventos = state.eventos.filter(function(e){ return e.id!==id; });
    render();
    openCalDiaModal(iso);
  }catch(e){ console.error(e); showToast('Erro ao excluir o lembrete.', 'error'); }
}
