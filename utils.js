/* ============================================================
   utils.js — Funções utilitárias (datas, moeda, status, UI)
   Sem dependências. Compartilhado por todos os módulos.
   ============================================================ */

const monthNamesPt = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

/* ---------- datas ---------- */
function todayISO(){
  const d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function addDaysISO(dateStr, delta){
  const p = dateStr.split('-').map(Number);
  const d = new Date(p[0], p[1]-1, p[2]+delta);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function diffDaysInclusive(a, b){
  const pa=a.split('-').map(Number), pb=b.split('-').map(Number);
  const da=new Date(pa[0],pa[1]-1,pa[2]), db=new Date(pb[0],pb[1]-1,pb[2]);
  return Math.round((db-da)/86400000)+1;
}
function currentMonthStr(){ return todayISO().slice(0,7); }
function addMonths(mesStr, delta){
  let p = mesStr.split('-').map(Number); let y=p[0], m=p[1]+delta;
  while(m<1){ m+=12; y--; } while(m>12){ m-=12; y++; }
  return y+'-'+String(m).padStart(2,'0');
}
function monthLabel(mesStr){ const p=mesStr.split('-').map(Number); return monthNamesPt[p[1]-1]+'/'+p[0]; }

/* ---------- formatação ---------- */
function fmtMoney(n){ return (Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function fmtDateBR(iso){ if(!iso) return '—'; const p=iso.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
function esc(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ---------- status de pagamento ---------- */
// Depende do formato em memória do imóvel (h.pagamentos[], h.status, h.diaVencimento)
function paymentStatus(house, mesStr){
  if(house.status === 'manutencao') return 'manutencao';
  if(house.status !== 'alugada') return 'vaga';
  const rec = house.pagamentos.find(function(p){ return p.mes===mesStr; });
  if(rec) return 'pago';
  // meses anteriores ao início do contrato vigente não geram cobrança nem atraso
  // (a casa ainda não estava alugada a este inquilino)
  if(house.contratoInicio && mesStr < house.contratoInicio.slice(0,7)) return 'pendente';
  const p = mesStr.split('-').map(Number);
  const due = new Date(p[0], p[1]-1, house.diaVencimento||5, 23,59,59);
  return (new Date() > due) ? 'atrasado' : 'pendente';
}

/* ---------- energia solar (segunda receita, valor variável mês a mês) ---------- */
function energiaDoMes(h, mes){
  return (h.energias||[]).find(function(e){ return e.mes===mes; });
}
function energiaValorMes(h, mes){ const e = energiaDoMes(h, mes); return e ? (Number(e.valor)||0) : 0; }
function energiaKwhMes(h, mes){ const e = energiaDoMes(h, mes); return e ? (Number(e.kwh)||0) : 0; }
function energiaPagaMes(h, mes){ const e = energiaDoMes(h, mes); return !!(e && e.pago); }
// Status de cobrança da energia do mês. Como o valor é variável, um mês
// SEM lançamento não é atraso — é 'sem_registro' (nada a cobrar ainda).
//   'vaga'        casa não alugada
//   'sem_registro' valor do mês ainda não lançado
//   'pago'        lançado e recebido
//   'atrasado'    lançado, vencido e não recebido
//   'pendente'    lançado, ainda dentro do prazo
function energiaStatus(h, mes){
  if(h.status !== 'alugada') return 'vaga';
  const e = energiaDoMes(h, mes);
  if(!e) return 'sem_registro';
  if(e.pago) return 'pago';
  if(h.contratoInicio && mes < h.contratoInicio.slice(0,7)) return 'pendente';
  const p = mes.split('-').map(Number);
  const due = new Date(p[0], p[1]-1, h.diaVencimento||5, 23,59,59);
  return (new Date() > due) ? 'atrasado' : 'pendente';
}

/* histórico de status (opera no array em memória; depois é persistido) */
function recordStatusChange(h, dataEvento){
  if(!h.statusHistorico) h.statusHistorico = [];
  const data = dataEvento || todayISO();
  // descarta eventos a partir da data informada (permite ajuste retroativo)
  h.statusHistorico = h.statusHistorico.filter(function(ev){ return ev.data < data; });
  const last = h.statusHistorico[h.statusHistorico.length-1];
  if(last && last.status===h.status && (last.tenantId||'')===(h.tenantId||'')) return;
  h.statusHistorico.push({ data:data, status:h.status, tenantId:h.tenantId||'' });
}

/* ---------- toast ---------- */
function showToast(msg, type){
  const root = document.getElementById('toastRoot');
  if(!root) return;
  const el = document.createElement('div');
  el.className = 'toast' + (type==='error' ? ' toast-error' : type==='success' ? ' toast-success' : '');
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(function(){ el.classList.add('toast-out'); setTimeout(function(){ el.remove(); },300); }, 2600);
}

/* ---------- modal ---------- */
function openModal(html){
  const root = document.getElementById('modalRoot');
  root.innerHTML = '<div class="modal-overlay">'+
    '<div class="modal-box" role="dialog" aria-modal="true">'+
    '<button class="modal-x" onclick="closeModal()" aria-label="Fechar">&times;</button>'+
    html+'</div></div>';
  document.addEventListener('keydown', escListener);
  setTimeout(function(){
    const firstField = root.querySelector('input,select');
    if(firstField) firstField.focus();
  }, 10);
}
function closeModal(){
  document.getElementById('modalRoot').innerHTML = '';
  document.removeEventListener('keydown', escListener);
}
function escListener(e){ if(e.key==='Escape') closeModal(); }

/* ---------- tempo de permanência do inquilino na casa ----------
   Usa o statusHistorico (desde quando a casa está alugada para este
   inquilino). Renovar/alterar o contrato NÃO reinicia esse tempo. */
function inicioPermanenciaInquilino(h){
  if(!h || h.status!=='alugada' || !h.tenantId) return null;
  const hist = (h.statusHistorico && h.statusHistorico.length)
    ? h.statusHistorico.slice().sort(function(a,b){ return a.data.localeCompare(b.data); })
    : null;
  if(hist){
    const last = hist[hist.length-1]; // estado atual
    if(last && last.status==='alugada' && (last.tenantId||'')===(h.tenantId||'')){
      return last.data;
    }
  }
  return h.contratoInicio || null; // reserva, caso o histórico esteja vazio
}
function mesesDesde(inicioISO){
  if(!inicioISO) return null;
  const p = inicioISO.split('-').map(Number);
  const iniDia = p[2]||1;
  const ini = new Date(p[0], p[1]-1, iniDia);
  const hoje = new Date();
  let meses = (hoje.getFullYear()-ini.getFullYear())*12 + (hoje.getMonth()-(p[1]-1));
  if(hoje.getDate() < iniDia) meses--;
  return Math.max(0, meses);
}
function fmtDuracao(meses){
  if(meses==null) return null;
  if(meses<1) return 'menos de 1 mês';
  const anos = Math.floor(meses/12);
  const m = meses%12;
  const partes = [];
  if(anos>0) partes.push(anos+(anos===1?' ano':' anos'));
  if(m>0) partes.push(m+(m===1?' mês':' meses'));
  return partes.join(' e ');
}
function tempoNaCasa(h){
  const ini = inicioPermanenciaInquilino(h);
  return ini ? fmtDuracao(mesesDesde(ini)) : null;
}
