/* ============================================================
   utils.js — Funções utilitárias (datas, moeda, status, UI)
   Sem dependências. Compartilhado por todos os módulos.
   ============================================================ */

const monthNamesPt = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

/* ---------- temas de cor ---------- */
const APP_THEME_OPTIONS = [
  {id:'original',nome:'Original',descricao:'Verde floresta e latão',cores:['#14322A','#B8863C','#F7F6F2']},
  {id:'roxo',nome:'Roxo',descricao:'Roxo da Minha Casa e Comercial',cores:['#2B1E4B','#7C4DCC','#F8F6FC']},
  {id:'aurora',nome:'Aurora',descricao:'Violeta vibrante e lavanda',cores:['#2B1E4B','#7C4DCC','#F8F6FC']},
  {id:'oceano',nome:'Oceano',descricao:'Azul profundo e turquesa',cores:['#083B4C','#007F83','#F2F9FA']},
  {id:'citrico',nome:'Cítrico',descricao:'Verde intenso e lima',cores:['#213B20','#527A12','#F7FAF0']}
];
/* O seletor visível ao usuário oferece só DOIS temas: Padrão e Roxo.
   Os demais (aurora/oceano/citrico) seguem válidos para render — ex.: uma
   conta antiga cujo Portal ainda usa um deles — mas não são oferecidos
   como escolha nova. Ver DESIGN-SYSTEM.md e migracao-tema-usuario.sql. */
const USER_THEME_CHOICES = [
  {id:'original',nome:'Padrão',descricao:'Verde',cores:['#14322A','#B8863C']},
  {id:'roxo',nome:'Roxo',descricao:'Roxo',cores:['#2B1E4B','#7C4DCC']}
];
/* Preferência de app por usuário: só Padrão (original) ou Roxo. */
function normalizeUserTheme(theme){ return theme==='roxo' ? 'roxo' : 'original'; }

/* ---------- tipos de imóvel (Etapa 1 do cadastro) ----------
   Campo novo; persiste no banco após a migração migracao-imovel-tipo.sql
   (o supabase.js faz feature-detect: se a coluna não existe, o cadastro
   segue normalmente sem o tipo). */
const IMOVEL_TIPOS = [
  {id:'casa',nome:'Casa'},
  {id:'apartamento',nome:'Apartamento'},
  {id:'comercial',nome:'Comercial'},
  {id:'quarto',nome:'Quarto'},
  {id:'outro',nome:'Outro'}
];
function normalizeImovelTipo(tipo){
  return IMOVEL_TIPOS.some(function(t){return t.id===tipo;}) ? tipo : 'casa';
}
function normalizeAppTheme(theme){
  return APP_THEME_OPTIONS.some(function(option){return option.id===theme;}) ? theme : 'original';
}
function applyAppTheme(theme){
  const selected=normalizeAppTheme(theme);
  if(typeof document!=='undefined'&&document.documentElement){
    document.documentElement.setAttribute('data-theme',selected);
    const option=APP_THEME_OPTIONS.find(function(item){return item.id===selected;});
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta&&option) meta.setAttribute('content',option.cores[0]);
  }
  return selected;
}

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
function newOperationId(){
  if(globalThis.crypto&&typeof globalThis.crypto.randomUUID==='function'){
    return globalThis.crypto.randomUUID();
  }
  const bytes=new Uint8Array(16);
  if(globalThis.crypto&&typeof globalThis.crypto.getRandomValues==='function'){
    globalThis.crypto.getRandomValues(bytes);
  }else{
    for(let i=0;i<bytes.length;i+=1) bytes[i]=Math.floor(Math.random()*256);
  }
  bytes[6]=(bytes[6]&15)|64;
  bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,function(value){return value.toString(16).padStart(2,'0');}).join('');
  return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
}
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
  const contract=contractForMonth(house,mesStr);
  if(contract) return contractExpectedRent(contract,mesStr);
  const hist = (house.aluguelHistorico||[]).filter(function(r){
    return r && !r.contractId && r.dataInicio && r.dataInicio.slice(0,7) <= mesStr;
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
function activeMoneyRecords(list){
  return (list||[]).filter(function(item){return !item.arquivadoEm&&!item.arquivado_em;});
}
function chargeForMonth(house,mes,type,contractId){
  const list=activeMoneyRecords(house&&house.cobrancas).filter(function(charge){
    return (charge.competencia||charge.mes)===mes&&charge.tipo===type;
  });
  if(!list.length) return null;
  if(contractId){
    const exact=list.find(function(charge){return charge.contractId===contractId;});
    /* Um mês pode conter a saída de um contrato e a entrada de outro.
       Com o contrato informado, usar "a primeira cobrança do mês" pode
       transferir recebimentos do morador anterior para o novo. */
    return exact||null;
  }
  const withoutContract=list.find(function(charge){return !charge.contractId;});
  return withoutContract||list[0]||null;
}
function receiptsForCharge(house,charge){
  if(!charge) return [];
  return activeMoneyRecords(house&&house.recebimentos).filter(function(receipt){
    return String(receipt.cobrancaId)===String(charge.id);
  });
}
function chargeReceivedTotal(house,charge){
  if(!charge) return 0;
  const receipts=receiptsForCharge(house,charge);
  const hasLoadedReceipt=(house&&house.recebimentos||[]).some(function(receipt){
    return String(receipt.cobrancaId)===String(charge.id);
  });
  if(receipts.length||hasLoadedReceipt){
    return receipts.reduce(function(sum,receipt){return sum+(Number(receipt.valor)||0);},0);
  }
  return Number(charge.totalRecebido)||0;
}
function receivedForCompetenceYear(house,year,type){
  const charges=activeMoneyRecords(house&&house.cobrancas).filter(function(charge){
    return (!type||charge.tipo===type)&&String(charge.competencia||charge.mes||'').slice(0,4)===String(year);
  });
  if(charges.length||activeMoneyRecords(house&&house.cobrancas).length){
    return charges.reduce(function(sum,charge){return sum+chargeReceivedTotal(house,charge);},0);
  }
  if(type==='energia'){
    return (house&&house.energias||[]).filter(function(entry){
      return entry.pago&&String(entry.mes||'').slice(0,4)===String(year);
    }).reduce(function(sum,entry){return sum+(Number(entry.valor)||0);},0);
  }
  return (house&&house.pagamentos||[]).filter(function(payment){
    return String(payment.mes||'').slice(0,4)===String(year);
  }).reduce(function(sum,payment){return sum+(Number(payment.valorPago)||0);},0);
}
function paymentForMonth(house,mes,contractId){
  const charge=chargeForMonth(house,mes,'aluguel',contractId);
  if(charge){
    const receipts=receiptsForCharge(house,charge);
    const total=chargeReceivedTotal(house,charge);
    if(total<=0) return null;
    const latest=receipts.slice().sort(function(a,b){
      return String(b.dataPagamento||'').localeCompare(String(a.dataPagamento||''));
    })[0];
    return {
      id:latest?latest.id:charge.id,
      mes:mes,
      contractId:charge.contractId||contractId||'',
      valorPago:total,
      dataPagamento:latest?latest.dataPagamento:(charge.ultimoPagamento||''),
      chargeId:charge.id,
      receipts:receipts,
      parcial:total+0.005<(Number(charge.valorPrevisto)||0),
      credito:Math.max(0,total-(Number(charge.valorPrevisto)||0))
    };
  }
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
function contractRentValueAt(contract,mes){
  if(!contract) return 0;
  const adjustments=(contract.reajustes||[]).filter(function(item){
    return item && item.dataInicio && item.dataInicio.slice(0,7)<=mes;
  }).sort(function(a,b){
    return String(a.dataInicio).localeCompare(String(b.dataInicio))
      || String(a.confirmadoEm||'').localeCompare(String(b.confirmadoEm||''));
  });
  if(adjustments.length) return Number(adjustments[adjustments.length-1].valor)||0;
  if(contract.valorInicial!=null) return Number(contract.valorInicial)||0;
  return Number(contract.valor)||0;
}
function contractExpectedRent(contract,mes){
  if(!contractCoversMonth(contract,mes)) return 0;
  return contractRentValueAt(contract,mes);
}
function currentRentContract(house){
  return activeContract(house)||contractForMonth(house,currentMonthStr())||null;
}
function contractProrataFinancialSnapshot(house,contract){
  const expected=Math.max(0,Math.round(contractProrataValue(contract)*100)/100);
  const charges=activeMoneyRecords(house&&house.cobrancas).filter(function(charge){
    return charge.tipo==='ajuste'&&String(charge.contractId||'')===String(contract&&contract.id||'');
  });
  const charge=charges.find(function(item){
    return item.origemTipo==='contrato_ajuste'
      &&String(item.origemId||'')===String(contract&&contract.id||'');
  })||charges[0]||null;
  const receipts=charge?receiptsForCharge(house,charge):[];
  const received=charge
    ?Math.max(0,Math.round(chargeReceivedTotal(house,charge)*100)/100)
    :0;
  const remaining=Math.max(0,Math.round((expected-received)*100)/100);
  const credit=Math.max(0,Math.round((received-expected)*100)/100);
  let status='nao_necessario';
  if(expected>0&&credit>0)status='credito';
  else if(expected>0&&remaining<=0)status=settledPaymentStatus(
    house,charge,(charge&&charge.vencimento)||(contract&&contract.inicio),
    charge&&charge.toleranciaDias!=null?charge.toleranciaDias:DEFAULT_PAYMENT_GRACE_DAYS,null
  );
  else if(received>0){
    const partialTime=openChargeTimeStatus(
      (charge&&charge.vencimento)||(contract&&contract.inicio),
      charge&&charge.toleranciaDias!=null?charge.toleranciaDias:DEFAULT_PAYMENT_GRACE_DAYS
    );
    status=partialTime==='atrasado'?'parcial_atrasado':'parcial';
  }
  else if(expected>0)status=openChargeTimeStatus(
    (charge&&charge.vencimento)||(contract&&contract.inicio),
    charge&&charge.toleranciaDias!=null?charge.toleranciaDias:DEFAULT_PAYMENT_GRACE_DAYS
  );
  return {charge:charge,receipts:receipts,expected:expected,received:received,remaining:remaining,credit:credit,status:status};
}

/* ---------- tolerância de pagamento ----------
   A operação concede cinco dias corridos após o vencimento, sem multa
   ou juros. Nesse intervalo a cobrança continua aberta, mas ainda não
   deve ser apresentada como atraso. */
const DEFAULT_PAYMENT_GRACE_DAYS = 5;
function paymentGraceDays(contract, charge){
  const value=charge&&charge.toleranciaDias!=null
    ? Number(charge.toleranciaDias)
    : contract&&contract.toleranciaDias!=null
      ? Number(contract.toleranciaDias)
      : DEFAULT_PAYMENT_GRACE_DAYS;
  return Number.isFinite(value)?Math.max(0,Math.trunc(value)):DEFAULT_PAYMENT_GRACE_DAYS;
}
function dateAtEndOfDay(value){
  const date=value instanceof Date?new Date(value.getTime()):new Date(String(value||'')+'T23:59:59');
  if(Number.isNaN(date.getTime())) return null;
  date.setHours(23,59,59,999);
  return date;
}
function dueDateWithGrace(due, days){
  const date=due instanceof Date?new Date(due.getTime()):dateAtEndOfDay(due);
  if(!date||Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate()+Math.max(0,Number(days)||0));
  date.setHours(23,59,59,999);
  return date;
}
function openChargeTimeStatus(due, graceDays, now){
  const dueDate=dateAtEndOfDay(due);
  if(!dueDate) return 'pendente';
  const current=now instanceof Date?now:new Date();
  if(current<=dueDate) return 'pendente';
  const graceEnd=dueDateWithGrace(dueDate,graceDays);
  return graceEnd&&current<=graceEnd?'tolerancia':'atrasado';
}
function settledPaymentStatus(house,charge,due,graceDays,fallbackPayment){
  let settledOn='';
  if(charge){
    const expected=Math.max(0,Number(charge.valorPrevisto)||0);
    let accumulated=0;
    receiptsForCharge(house,charge).slice().sort(function(a,b){
      return String(a.dataPagamento||'').localeCompare(String(b.dataPagamento||''));
    }).some(function(receipt){
      accumulated+=Number(receipt.valor)||0;
      if(expected>0&&accumulated+0.005>=expected){
        settledOn=receipt.dataPagamento||'';
        return true;
      }
      return false;
    });
    if(!settledOn&&charge.ultimoPagamento) settledOn=charge.ultimoPagamento;
  }
  if(!settledOn&&fallbackPayment&&fallbackPayment.dataPagamento) settledOn=fallbackPayment.dataPagamento;
  if(!settledOn) return 'pago';
  const paidAt=dateAtEndOfDay(settledOn),graceEnd=dueDateWithGrace(due,graceDays);
  return paidAt&&graceEnd&&paidAt>graceEnd?'pago_atraso':'pago';
}

/* ---------- formatação ---------- */
function fmtMoney(n){ return (Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function fmtDateBR(iso){ if(!iso) return '—'; const p=iso.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
function maskSensitiveDocument(value){
  const raw=String(value||'').trim();
  if(!raw) return '—';
  const digits=raw.replace(/\D/g,'');
  if(digits.length<5) return '••••';
  return '••••••'+digits.slice(-4);
}
/* A aspa simples entra no escape junto com a dupla.
   O app monta manipuladores dentro do próprio HTML, no formato
   onclick="abrir('...')". Hoje só entram ali identificadores gerados pelo
   sistema, então não há buraco aberto — mas basta alguém interpolar um
   nome de inquilino nessa posição para um apóstrofo fechar a string e
   virar código. Escapar aqui fecha a armadilha antes que ela exista. */
function esc(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ---------- status de pagamento ---------- */
// Depende do formato em memória do imóvel (h.pagamentos[], h.status, h.diaVencimento)
function paymentStatus(house, mesStr, contractId){
  const contract=contractForMonth(house,mesStr,contractId);
  if(contract&&!contractCoversMonth(contract,mesStr)) return 'fora_contrato';
  if(!contract&&house.status === 'manutencao') return 'manutencao';
  if((house.contracts||[]).length && !contract) return 'fora_contrato';
  if(!(house.contracts||[]).length && house.status !== 'alugada') return 'vaga';
  const charge=chargeForMonth(house,mesStr,'aluguel',contractId);
  const rec = paymentForMonth(house,mesStr,contractId);
  if(charge){
    const expected=Math.max(0,Number(charge.valorPrevisto)||0);
    const received=chargeReceivedTotal(house,charge);
    if(expected<=0) return 'sem_cobranca';
    if(received>expected+0.005) return 'credito';
    if(received+0.005>=expected){
      const due=charge.vencimento||(contract?contractDueDate(contract,mesStr):dueDateForMonth(mesStr,house.diaVencimento||5));
      return settledPaymentStatus(house,charge,due,paymentGraceDays(contract,charge));
    }
    if(received>0) return 'parcial';
  }else if(rec){
    const due=contract?contractDueDate(contract,mesStr):dueDateForMonth(mesStr,house.diaVencimento||5);
    return settledPaymentStatus(house,null,due,paymentGraceDays(contract),rec);
  }
  if(contract){
    const due=contractDueDate(contract,mesStr);
    return openChargeTimeStatus(due,paymentGraceDays(contract));
  }
  // meses anteriores ao início do contrato vigente não geram cobrança nem atraso
  // (a casa ainda não estava alugada a este inquilino)
  if(house.contratoInicio && mesStr < house.contratoInicio.slice(0,7)) return 'pendente';
  const due = dueDateForMonth(mesStr, house.diaVencimento||5);
  return openChargeTimeStatus(due,DEFAULT_PAYMENT_GRACE_DAYS);
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
function energiaPagaMes(h, mes, contractId){
  const status=energiaStatus(h,mes,contractId);
  return status==='pago'||status==='pago_atraso'||status==='credito';
}
function energiaRecebidaMes(h,mes,contractId){
  const charge=chargeForMonth(h,mes,'energia',contractId);
  if(charge) return chargeReceivedTotal(h,charge);
  const e=energiaDoMes(h,mes,contractId);
  return e&&e.pago?(Number(e.valor)||0):0;
}
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
  const charge=chargeForMonth(h,mes,'energia',contractId);
  if(charge){
    const expected=Math.max(0,Number(charge.valorPrevisto)||0);
    const received=chargeReceivedTotal(h,charge);
    if(received>expected+0.005) return 'credito';
    if(expected>0&&received+0.005>=expected){
      return settledPaymentStatus(
        h,
        charge,
        charge.vencimento||energyDueDate(h,e,mes),
        paymentGraceDays(contract,charge)
      );
    }
    if(received>0) return 'parcial';
  }else if(e.pago){
    return settledPaymentStatus(
      h,
      null,
      energyDueDate(h,e,mes),
      paymentGraceDays(contract),
      {dataPagamento:e.dataPagamento||''}
    );
  }
  if(contract) return openChargeTimeStatus(energyDueDate(h,e,mes),paymentGraceDays(contract));
  if(h.contratoInicio && mes < h.contratoInicio.slice(0,7)) return 'pendente';
  const due = energyDueDate(h,e,mes);
  return openChargeTimeStatus(due,DEFAULT_PAYMENT_GRACE_DAYS);
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
let modalPreviousFocus=null;
function openModal(html){
  const root = document.getElementById('modalRoot');
  modalPreviousFocus=document.activeElement&&document.activeElement!==document.body?document.activeElement:null;
  root.innerHTML = '<div class="modal-overlay">'+
    '<div class="modal-box" role="dialog" aria-modal="true">'+
    '<button class="modal-x" onclick="closeModal()" aria-label="Fechar">&times;</button>'+
    html+'</div></div>';
  document.addEventListener('keydown', escListener);
  setTimeout(function(){
    const dialog=root.querySelector('[role="dialog"]'),title=root.querySelector('.modal-title');
    if(dialog&&title){title.id='modalTitle';dialog.setAttribute('aria-labelledby','modalTitle');}
    const firstField = root.querySelector('input:not([type="hidden"]),select,textarea,button:not(.modal-x)');
    if(firstField) firstField.focus();else if(dialog){dialog.setAttribute('tabindex','-1');dialog.focus();}
  }, 10);
}
function closeModal(){
  document.getElementById('modalRoot').innerHTML = '';
  document.removeEventListener('keydown', escListener);
  if(modalPreviousFocus&&document.contains(modalPreviousFocus)){modalPreviousFocus.focus();}
  modalPreviousFocus=null;
}
function escListener(e){
  if(e.key==='Escape'){closeModal();return;}
  if(e.key!=='Tab')return;
  const root=document.getElementById('modalRoot'),dialog=root&&root.querySelector('[role="dialog"]');if(!dialog)return;
  const focusable=Array.from(dialog.querySelectorAll('button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'))
    .filter(function(el){return el.offsetParent!==null;});
  if(!focusable.length){e.preventDefault();dialog.focus();return;}
  const first=focusable[0],last=focusable[focusable.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
}

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
