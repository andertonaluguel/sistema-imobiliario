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

/* Dia de vencimento efetivo no mes.
   Ex.: dia 31 vira 30 em abril e 28/29 em fevereiro. */
function dueDayForMonth(mesStr, requestedDay){
  const p = mesStr.split('-').map(Number);
  const lastDay = new Date(p[0], p[1], 0).getDate();
  const configured = Math.min(31, Math.max(1, parseInt(requestedDay,10)||5));
  return Math.min(configured, lastDay);
}
function dueDateForMonth(mesStr, requestedDay){
  const p = mesStr.split('-').map(Number);
  return new Date(p[0], p[1]-1, dueDayForMonth(mesStr, requestedDay), 23, 59, 59);
}

/* Valor vigente do aluguel em um mes, respeitando os reajustes cadastrados. */
function aluguelValorMes(house, mesStr){
  const hist = (house.aluguelHistorico||[]).filter(function(r){
    return r && r.dataInicio && r.dataInicio.slice(0,7) <= mesStr;
  }).sort(function(a,b){ return a.dataInicio.localeCompare(b.dataInicio); });
  if(hist.length) return Number(hist[hist.length-1].valor)||0;
  return Number(house.aluguelValor)||0;
}

/* ---------- contratos e ciclos de cobrança ---------- */
function activeContract(house){
  const list=(house&&house.contracts||[]).slice().sort(function(a,b){
    return String(b.inicio||'').localeCompare(String(a.inicio||''));
  });
  return list.find(function(c){return c.ativo;})||null;
}
function contractBillingDay(contract){
  return Math.min(31,Math.max(1,parseInt(contract&&contract.diaVencimento,10)||5));
}
function contractMode(contract){ return contract&&contract.modalidade==='entrada'?'entrada':'fixo'; }
function contractProrataDays(contract){
  if(!contract||!contract.inicio||contractMode(contract)!=='fixo') return 0;
  const startDay=Number(contract.inicio.slice(8,10))||1;
  const due=contractBillingDay(contract);
  if(startDay===due) return 0;
  return due>startDay ? due-startDay : 30-startDay+due;
}
function contractProrataValue(contract){
  if(!contract) return 0;
  if(contract.proporcionalValor!=null) return Number(contract.proporcionalValor)||0;
  return Math.round(((Number(contract.valor)||0)/30)*contractProrataDays(contract)*100)/100;
}
function contractFirstFullMonth(contract){
  if(!contract||!contract.inicio) return null;
  const startMonth=contract.inicio.slice(0,7);
  if(contractMode(contract)==='entrada') return startMonth;
  const startDay=Number(contract.inicio.slice(8,10))||1;
  return contractBillingDay(contract)>startDay ? startMonth : addMonths(startMonth,1);
}
function contractDueDate(contract,mes){
  return dueDateForMonth(mes,contractBillingDay(contract));
}
function contractCoversMonth(contract,mes){
  if(!contract||!contract.inicio||!mes) return false;
  const first=contractFirstFullMonth(contract);
  if(first&&mes<first) return false;
  const due=contractDueDate(contract,mes);
  const start=new Date(contract.inicio+'T00:00:00');
  if(due<start) return false;
  if(contract.fim){
    const end=new Date(contract.fim+'T23:59:59');
    if(due>end) return false;
  }
  return true;
}
function contractForMonth(house,mes,contractId){
  const list=(house&&house.contracts||[]);
  if(contractId){
    const exact=list.find(function(c){return c.id===contractId;});
    if(exact) return exact;
  }
  const candidates=list.filter(function(c){return contractCoversMonth(c,mes);})
    .sort(function(a,b){return String(b.inicio||'').localeCompare(String(a.inicio||''));});
  if(mes===currentMonthStr()){
    const current=activeContract(house);
    if(current&&contractCoversMonth(current,mes)) return current;
  }
  return candidates[0]||null;
}
function contractOccupiesMonth(contract,mes){
  if(!contract||!contract.inicio||!mes) return false;
  const monthStart=mes+'-01';
  const monthEnd=addDaysISO(addMonths(mes,1)+'-01',-1);
  return contract.inicio<=monthEnd&&(!contract.fim||contract.fim>=monthStart);
}
function contractForEnergyMonth(house,mes,contractId){
  const list=(house&&house.contracts||[]);
  if(contractId){
    const exact=list.find(function(c){return c.id===contractId;});
    if(exact) return exact;
  }
  const candidates=list.filter(function(c){return contractOccupiesMonth(c,mes);})
    .sort(function(a,b){return String(b.inicio||'').localeCompare(String(a.inicio||''));});
  if(mes===currentMonthStr()){
    const current=activeContract(house);
    if(current&&contractOccupiesMonth(current,mes)) return current;
  }
  return candidates[0]||null;
}
function paymentForMonth(house,mes,contractId){
  const list=(house&&house.pagamentos||[]);
  const contract=contractForMonth(house,mes,contractId);
  if(contract){
    const exact=list.find(function(p){return p.mes===mes&&p.contractId===contract.id;});
    if(exact) return exact;
    const legacy=list.find(function(p){return p.mes===mes&&!p.contractId;});
    return legacy||null;
  }
  if((house&&house.contracts||[]).length) return null;
  return list.find(function(p){return p.mes===mes;})||null;
}
function contractExpectedRent(contract,mes){
  return contractCoversMonth(contract,mes)?(Number(contract.valor)||0):0;
}
function currentRentContract(house){
  return activeContract(house)||contractForMonth(house,currentMonthStr())||null;
}

/* ---------- formatação ---------- */
function fmtMoney(n){ return (Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function fmtDateBR(iso){ if(!iso) return '—'; const p=iso.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
function esc(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ---------- status de pagamento ---------- */
// Depende do formato em memória do imóvel (h.pagamentos[], h.status, h.diaVencimento)
function paymentStatus(house, mesStr, contractId){
  const contract=contractForMonth(house,mesStr,contractId);
  if(contract&&!contractCoversMonth(contract,mesStr)) return 'fora_contrato';
  if(!contract&&house.status === 'manutencao') return 'manutencao';
  if((house.contracts||[]).length && !contract) return 'fora_contrato';
  if(!(house.contracts||[]).length && house.status !== 'alugada') return 'vaga';
  const rec = paymentForMonth(house,mesStr,contractId);
  if(rec) return 'pago';
  if(contract){
    const due=contractDueDate(contract,mesStr);
    return (new Date()>due)?'atrasado':'pendente';
  }
  // meses anteriores ao início do contrato vigente não geram cobrança nem atraso
  // (a casa ainda não estava alugada a este inquilino)
  if(house.contratoInicio && mesStr < house.contratoInicio.slice(0,7)) return 'pendente';
  const due = dueDateForMonth(mesStr, house.diaVencimento||5);
  return (new Date() > due) ? 'atrasado' : 'pendente';
}

/* ---------- energia solar (segunda receita, valor variável mês a mês) ---------- */
function energyModuleEnabled(){
  return typeof state==='undefined' || !state.config || state.config.energiaAtiva!==false;
}
function houseEnergyEnabled(h){ return energyModuleEnabled() && (!h || h.energiaAtiva!==false); }
function energiaDoMes(h, mes, contractId){
  const list=h.energias||[];
  const contract=contractForEnergyMonth(h,mes,contractId);
  if(contract){
    const exact=list.find(function(e){return e.mes===mes&&e.contractId===contract.id;});
    if(exact) return exact;
    const legacy=list.find(function(e){return e.mes===mes&&!e.contractId;});
    return legacy;
  }
  if((h.contracts||[]).length) return undefined;
  return list.find(function(e){ return e.mes===mes; });
}
function energiaValorMes(h, mes, contractId){ const e = energiaDoMes(h, mes,contractId); return e ? (Number(e.valor)||0) : 0; }
function energiaKwhMes(h, mes, contractId){ const e = energiaDoMes(h, mes,contractId); return e ? (Number(e.kwh)||0) : 0; }
function energiaPagaMes(h, mes, contractId){ const e = energiaDoMes(h, mes,contractId); return !!(e && e.pago); }
function previousEnergyReading(h,mes){
  const previous=(h&&h.energias||[]).filter(function(e){
    return e.mes<mes && Number.isFinite(Number(e.leituraAtual));
  }).sort(function(a,b){return String(b.mes).localeCompare(String(a.mes));})[0];
  return previous ? Number(previous.leituraAtual)||0 : null;
}
function energyDueDate(h,e,mes){
  if(e&&e.vencimento) return new Date(e.vencimento+'T23:59:59');
  return dueDateForMonth(mes,(h&&h.energiaDiaVencimento)||(h&&h.diaVencimento)||5);
}
// Status de cobrança da energia do mês. Como o valor é variável, um mês
// SEM lançamento não é atraso — é 'sem_registro' (nada a cobrar ainda).
//   'vaga'        casa não alugada
//   'sem_registro' valor do mês ainda não lançado
//   'pago'        lançado e recebido
//   'atrasado'    lançado, vencido e não recebido
//   'pendente'    lançado, ainda dentro do prazo
function energiaStatus(h, mes, contractId){
  if(!houseEnergyEnabled(h)) return 'desativada';
  const contract=contractForEnergyMonth(h,mes,contractId);
  if(contract&&!contractOccupiesMonth(contract,mes)) return 'fora_contrato';
  if((h.contracts||[]).length&&!contract) return 'fora_contrato';
  if(!(h.contracts||[]).length&&h.status !== 'alugada') return 'vaga';
  const e = energiaDoMes(h, mes,contractId);
  if(!e) return 'sem_registro';
  if(e.pago) return 'pago';
  if(contract) return (new Date()>energyDueDate(h,e,mes))?'atrasado':'pendente';
  if(h.contratoInicio && mes < h.contratoInicio.slice(0,7)) return 'pendente';
  const due = energyDueDate(h,e,mes);
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
