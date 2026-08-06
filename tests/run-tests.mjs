import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { lintDesignSystem, TETO_CORES_CRUAS, TETO_TEXTO_MIUDO } from './lint-design-system.mjs';

const testsDir = dirname(fileURLToPath(import.meta.url));
const root = dirname(testsDir);
const sessionValues = new Map();
const context = vm.createContext({
  console,
  crypto: { randomUUID },
  canAdministerAccount: () => true,
  canManageFinance: () => true,
  canOperateProperties: () => true,
  requireAccountPermission: (allowed) => !!allowed,
  requireFinancePermission: () => true,
  requirePropertyPermission: () => true,
  requirePrimaryOwnerPermission: () => true,
  sessionStorage: {
    getItem: (key) => sessionValues.get(key)??null,
    setItem: (key,value) => sessionValues.set(key,String(value)),
    removeItem: (key) => sessionValues.delete(key)
  },
  window: { supabase: { createClient: () => ({}) } }
});

function sqlFunctionBlock(source,name){
  const escaped=String(name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const startMatch=new RegExp(
    'create\\s+or\\s+replace\\s+function\\s+public\\.'+escaped+'\\s*\\(',
    'i'
  ).exec(source);
  assert.ok(startMatch,'Função SQL ausente: '+name);
  const tail=source.slice(startMatch.index);
  const delimiterMatch=/\bas\s+(\$[A-Za-z0-9_]*\$)/i.exec(tail);
  assert.ok(delimiterMatch,'Corpo SQL sem delimitador: '+name);
  const bodyStart=delimiterMatch.index+delimiterMatch[0].length;
  const bodyEnd=tail.indexOf(delimiterMatch[1],bodyStart);
  assert.ok(bodyEnd>=0,'Corpo SQL sem fechamento: '+name);
  return tail.slice(0,bodyEnd+delimiterMatch[1].length);
}

function compactSql(value){
  return String(value).replace(/--.*$/gm,' ').replace(/\s+/g,' ').trim().toLowerCase();
}

function sqlTableBlock(source,name){
  const escaped=String(name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const startMatch=new RegExp(
    'create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.'+escaped+'\\s*\\(',
    'i'
  ).exec(source);
  assert.ok(startMatch,'Tabela SQL ausente: '+name);
  const tail=source.slice(startMatch.index);
  const endMatch=/^\s*\);\s*$/m.exec(tail);
  assert.ok(endMatch,'Definição SQL sem fechamento: '+name);
  return tail.slice(0,endMatch.index+endMatch[0].length);
}

for(const file of ['config.js','utils.js','supabase.js','dashboard.js','auth.js']){
  vm.runInContext(await readFile(join(root,file),'utf8'), context, { filename:file });
}

vm.runInContext(await readFile(join(root,'commercial.js'),'utf8'), context, { filename:'commercial.js' });
vm.runInContext(await readFile(join(root,'minha-casa.js'),'utf8'), context, { filename:'minha-casa.js' });

const api = vm.runInContext(`({
  dueDayForMonth,
  aluguelValorMes,
  normalizeBackupForImport,
  backupPayloadStorageBytes,
  currentMonthStr,
  addMonths,
  addDaysISO,
  todayISO,
  DEFAULT_PAYMENT_GRACE_DAYS,
  paymentGraceDays,
  openChargeTimeStatus,
  chargeForMonth,
  paymentStatus,
  energiaStatus,
  chargeStatusAt:function(due,graceDays,year,monthIndex,day,hour,minute,second,millisecond){
    return openChargeTimeStatus(
      due,
      graceDays,
      new Date(year,monthIndex,day,hour||0,minute||0,second||0,millisecond||0)
    );
  },
  computeCobrancaCasa,
  previousEnergyReading,
  normalizeAppTheme
})`, context);

assert.equal(api.normalizeAppTheme('aurora'),'aurora');
assert.equal(api.normalizeAppTheme('desconhecido'),'original');
/* Parte 2: Roxo é um tema válido; o seletor do usuário oferece só dois
   (Padrão/Roxo); os demais seguem válidos para render, mas não escolhíveis. */
assert.equal(api.normalizeAppTheme('roxo'),'roxo');
assert.equal(vm.runInContext("normalizeUserTheme('roxo')",context),'roxo');
assert.equal(vm.runInContext("normalizeUserTheme('aurora')",context),'original');
assert.equal(vm.runInContext('USER_THEME_CHOICES.length',context),2);
assert.ok(vm.runInContext("USER_THEME_CHOICES.every(function(t){return t.id==='original'||t.id==='roxo';})",context));

const commercialApi = vm.runInContext(`({
  commercialPlanLabel,
  commercialStatusLabel,
  commercialAccessAllowed
})`, context);
assert.equal(commercialApi.commercialPlanLabel('gratuito'),'Gratuito');
assert.equal(commercialApi.commercialPlanLabel('basico'),'Básico');
assert.equal(commercialApi.commercialPlanLabel('premium'),'Premium');
assert.equal(vm.runInContext(`commercialPlan('gratuito').casas`,context),1);
assert.equal(vm.runInContext(`commercialPlan('basico').casas`,context),3);
assert.equal(vm.runInContext(`commercialPlan('premium').casas`,context),100);
assert.equal(commercialApi.commercialStatusLabel('suspensa'),'Suspensa');
assert.equal(commercialApi.commercialAccessAllowed({podeAcessar:true}),true);
assert.equal(commercialApi.commercialAccessAllowed({podeAcessar:false,administradorPlataforma:false}),false);
assert.equal(commercialApi.commercialAccessAllowed({podeAcessar:false,administradorPlataforma:true}),true);

const authApi = vm.runInContext(`({
  setAccess:saveAuthAccessType,
  matches:authAccessMatchesProfile,
  label:authAccessLabel
})`,context);
authApi.setAccess('tenant');
assert.equal(authApi.label(),'Inquilino');
assert.equal(authApi.matches({role:'tenant'}),true);
assert.equal(authApi.matches({role:'pending'}),true);
assert.equal(authApi.matches({role:'owner'}),false);
authApi.setAccess('admin');
assert.equal(authApi.label(),'Administrador');
assert.equal(authApi.matches({role:'owner'}),true);
assert.equal(authApi.matches({role:'tenant'}),false);

authApi.setAccess('tenant');
vm.runInContext(`function logoSvg(){return '<svg aria-hidden="true"></svg>';}`,context);
const tenantSignupHtml=vm.runInContext(`authView='signup';renderAuthScreen()`,context);
assert.match(tenantSignupHtml,/Criar acesso de inquilino/);
assert.doesNotMatch(
  tenantSignupHtml,
  /plano\s+(?:Gratuito|Básico|Premium)|plan-comparison|plan-compare-card/i,
  'O cadastro de inquilino não pode oferecer ou comparar planos.'
);
authApi.setAccess('admin');
vm.runInContext(`authView='login'`,context);

async function loadRoleWithMock(rows,commercial){
  context.__roleRows=structuredClone(rows||{});
  context.__roleCommercial=structuredClone(commercial||{
    administradorPlataforma:false,
    proprietarioId:null,
    podeAcessar:false
  });
  return vm.runInContext(`(async function(){
    sb.auth={
      getSession:async function(){
        return {data:{session:{user:{id:'role-user'}}}};
      }
    };
    sb.rpc=async function(name){
      if(name!=='acesso_comercial_atual')throw new Error('RPC inesperado: '+name);
      return {data:globalThis.__roleCommercial,error:null};
    };
    sb.from=function(table){
      return {
        select:function(){return this;},
        eq:function(){return this;},
        maybeSingle:async function(){
          return {data:Object.hasOwn(globalThis.__roleRows,table)?globalThis.__roleRows[table]:null,error:null};
        }
      };
    };
    return db.loadRole();
  })()`,context);
}

const tenantRole=await loadRoleWithMock({
  acessos_inquilino:{user_id:'role-user',proprietario_id:'owner-a',inquilino_id:'tenant-a',ativo:true},
  acessos_colaborador:null,
  proprietarios:null
});
assert.equal(tenantRole.role,'tenant');
assert.equal(tenantRole.access.inquilino_id,'tenant-a');
assert.equal(tenantRole.commercial,undefined);

const inactiveTenantRole=await loadRoleWithMock({
  acessos_inquilino:{user_id:'role-user',proprietario_id:'owner-a',inquilino_id:'tenant-a',ativo:false},
  acessos_colaborador:null,
  proprietarios:null
});
assert.equal(inactiveTenantRole.role,'pending');

const ownerRole=await loadRoleWithMock({
  acessos_inquilino:null,
  acessos_colaborador:null,
  proprietarios:{user_id:'role-user',nome:'Cliente proprietário'}
},{administradorPlataforma:false,proprietarioId:'role-user',podeAcessar:true});
assert.equal(ownerRole.role,'owner');
assert.equal(ownerRole.owner.user_id,'role-user');

await assert.rejects(
  loadRoleWithMock({
    acessos_inquilino:{user_id:'role-user',proprietario_id:'owner-a',inquilino_id:'tenant-a',ativo:true},
    acessos_colaborador:null,
    proprietarios:{user_id:'role-user',nome:'Perfil conflitante'}
  }),
  function(error){return error&&error.code==='ROLE_CONFLICT';},
  'Perfil simultâneo de proprietário e inquilino deve falhar fechado.'
);

await assert.rejects(
  loadRoleWithMock({
    acessos_inquilino:{user_id:'role-user',proprietario_id:'owner-a',inquilino_id:'tenant-a',ativo:false},
    acessos_colaborador:{user_id:'role-user',proprietario_id:'owner-b',ativo:true},
    proprietarios:null
  }),
  function(error){return error&&error.code==='ROLE_CONFLICT';},
  'Acesso de inquilino suspenso também deve impedir um segundo papel.'
);

const myHomeApi = vm.runInContext(`({
  normalize:window.MinhaCasaUI._normalizePayload
})`,context);
const normalizedHome=myHomeApi.normalize({
  active:true,
  members:[{id:'m1',name:'Anderton',active:true}],
  categories:[{id:'c1',name:'Mercado',type:'saida',active:true}],
  recurring:[{id:'r1',name:'Internet',amount:100,dayOfMonth:31,categoryId:'c1',memberId:'m1'}],
  transactions:[{id:'t1',type:'saida',amount:'12,50',date:'2026-07-25',categoryId:'c1',memberId:'m1'}],
  suggestions:[{id:'s1',type:'entrada',amount:900,date:'2026-07-25',categoryId:'c1',memberId:'m1',status:'pending'}]
});
assert.equal(normalizedHome.active,true);
assert.equal(normalizedHome.transactions[0].amount,12.5);
assert.equal(normalizedHome.recurring[0].dayOfMonth,28);
assert.equal(normalizedHome.suggestions.length,1);

assert.equal(api.dueDayForMonth('2025-02',30), 28);
assert.equal(api.dueDayForMonth('2024-02',31), 29);
assert.equal(api.dueDayForMonth('2026-04',31), 30);
assert.equal(api.dueDayForMonth('2026-01',31), 31);

/* A tolerância operacional é de cinco dias corridos. O vencimento e os
   cinco dias seguintes não podem ser classificados como atraso. */
assert.equal(api.DEFAULT_PAYMENT_GRACE_DAYS,5);
assert.equal(api.paymentGraceDays(null,null),5);
assert.equal(
  api.chargeStatusAt('2026-07-10',5,2026,6,10,23,59,59,999),
  'pendente',
  'No próprio vencimento a cobrança ainda está pendente.'
);
assert.equal(
  api.chargeStatusAt('2026-07-10',5,2026,6,15,23,59,59,999),
  'tolerancia',
  'O quinto dia após o vencimento ainda pertence à tolerância.'
);
assert.equal(
  api.chargeStatusAt('2026-07-10',5,2026,6,16,0,0,0,0),
  'atrasado',
  'A cobrança só entra em atraso no sexto dia após o vencimento.'
);

const house = {
  aluguelValor: 1500,
  aluguelHistorico: [
    { valor:1000, dataInicio:'2025-01-01' },
    { valor:1200, dataInicio:'2026-01-01' }
  ]
};
assert.equal(api.aluguelValorMes(house,'2025-12'), 1000);
assert.equal(api.aluguelValorMes(house,'2026-01'), 1200);
assert.equal(api.previousEnergyReading({energias:[
  {mes:'2026-04',leituraAtual:245},{mes:'2026-05',leituraAtual:310}
]},'2026-06'),310);
assert.equal(api.previousEnergyReading({energias:[]},'2026-06'),null);

const currentMonth = api.currentMonthStr();
const previousMonth = api.addMonths(currentMonth,-1);
const olderMonth = api.addMonths(currentMonth,-2);
const turnoverChargeHouse={
  cobrancas:[{
    id:'charge-old-contract',
    mes:currentMonth,
    competencia:currentMonth,
    tipo:'aluguel',
    contractId:'contract-old',
    valorPrevisto:1000
  }]
};
assert.equal(
  api.chargeForMonth(turnoverChargeHouse,currentMonth,'aluguel','contract-new'),
  null,
  'Contrato explícito nunca pode reutilizar a cobrança de outro inquilino no mesmo mês.'
);
assert.equal(
  api.chargeForMonth(turnoverChargeHouse,currentMonth,'aluguel','contract-old').id,
  'charge-old-contract'
);
const cobranca = api.computeCobrancaCasa({
  id:'house-test', status:'alugada', diaVencimento:1,
  contratoInicio:olderMonth+'-01',
  contracts:[{ id:'contract-test', inicio:olderMonth+'-01', fim:'', ativo:true,
    valor:1100, diaVencimento:1, modalidade:'entrada', proporcionalValor:0, proporcionalPago:false }],
  pagamentos:[{ mes:currentMonth, contractId:'contract-test', valorPago:1200, dataPagamento:currentMonth+'-01' }],
  energias:[],
  aluguelValor:1200,
  aluguelHistorico:[
    { valor:1000, dataInicio:olderMonth+'-01' },
    { valor:1200, dataInicio:previousMonth+'-01' }
  ]
});
assert.equal(cobranca.aluguelTotal, 2200);

vm.runInContext(`
  const state={uiMode:'advanced',permissionRole:'administrador',houses:[],tenants:[],interests:[],team:[],owners:[],
    eventos:[],photoCache:{},documentCache:{},commercialAccess:{limiteArmazenamento:1000000,armazenamentoUsado:0},
    config:{energiaAtiva:true,pixChave:'12345678909',pixNome:'João da Silva',pixCidade:'São Paulo'}};
  function isSimpleMode(){return state.uiMode==='simple';}
  function canManageFinance(){return state.permissionRole==='administrador'||state.permissionRole==='financeiro';}
  function canOperateProperties(){return state.permissionRole==='administrador'||state.permissionRole==='operacional';}
  function canAdministerAccount(){return state.permissionRole==='administrador';}
  function canViewSensitiveTenantData(){return canOperateProperties();}
  function maskSensitiveDocument(value){
    const raw=String(value||'').trim(),digits=raw.replace(/\\D/g,'');
    return !raw?'':digits.length>=4?'•••••••'+digits.slice(-4):'Documento protegido';
  }
  function requireAccountPermission(allowed){return !!allowed;}
  function requireFinancePermission(){return canManageFinance();}
  function requirePropertyPermission(){return canOperateProperties();}
  function tenantOf(h){return state.tenants.find(function(t){return t.id===h.tenantId;})||null;}
`,context);
vm.runInContext(await readFile(join(root,'features.js'),'utf8'),context,{filename:'features.js'});
for(const file of ['houses.js','maintenance.js','pending.js','owners.js','tenants.js','interests.js','contracts.js','photos.js','documents.js']){
  vm.runInContext(await readFile(join(root,file),'utf8'),context,{filename:file});
}
for(const file of ['energy.js','finance.js','portal.js','calendar.js']){
  vm.runInContext(await readFile(join(root,file),'utf8'),context,{filename:file});
}
const uiApi=vm.runInContext(`({
  setMode:function(mode){state.uiMode=mode;},
  setPermissionRole:function(role){state.permissionRole=role;},
  setData:function(houses,tenants,interests){state.houses=houses;state.tenants=tenants;state.interests=interests||[];},
  setOwners:function(owners){state.owners=owners||[];},
  computeOwnerStatement,
  housesOfOwnerClient,
  housesWithoutOwnerClient,
  renderProprietariosView,
  setArtifacts:function(photos,documents,events){
    state.photoCache=photos||{};state.documentCache=documents||{};state.eventos=events||[];
  },
  setCommercial:function(accounts,invites){state.commercialAccounts=accounts;state.commercialInvites=invites;},
  renderHouseCard,
  renderMaintenanceTab,
  captureMaintenanceModal:function(houseId,callId){
    const originalModal=openModal,originalToggle=toggleMaintenanceExpenseFields;
    let html='';
    openModal=function(value){html=value;};
    toggleMaintenanceExpenseFields=function(){};
    try{openMaintenanceModal(houseId,callId||'');}
    finally{openModal=originalModal;toggleMaintenanceExpenseFields=originalToggle;}
    return html;
  },
  maintenanceCategoryLabel,
  maintenancePriorityLabel,
  maintenanceStatusLabel,
  renderTenantCard,
  captureTenantModal:function(tenantId){
    const originalModal=openModal;
    let html='';
    openModal=function(value){html=value;};
    try{openEditTenantModal(tenantId);}
    finally{openModal=originalModal;}
    return html;
  },
  renderInterestCard,
  captureInterestModal:function(interestId){
    const originalModal=openModal;
    let html='';
    openModal=function(value){html=value;};
    try{openEditInterestModal(interestId);}
    finally{openModal=originalModal;}
    return html;
  },
  renderFotosTab,
  renderDocumentsTab,
  captureCalendarDay:function(iso){
    const originalModal=openModal;
    let html='';
    openModal=function(value){html=value;};
    try{openCalDiaModal(iso);}
    finally{openModal=originalModal;}
    return html;
  },
  renderContractsTab,
  contractProrataPaymentSnapshot,
  captureProrataModal:function(houseId,contractId){
    const originalModal=openModal;
    let html='';
    openModal=function(value){html=value;};
    try{openProrataPaymentModal(houseId,contractId);}
    finally{openModal=originalModal;}
    return html;
  },
  houseAttentionSignals,
  sortedHousesForView,
  tenantMatchesSearch,
  interestMatchesHouse,
  matchingHousesForInterest,
  matchingInterestsForHouse,
  computeEnergyAnomalias,
  computeEnergyMonth,
  computeMonthlyFinance,
  computeOverview,
  financeRowStatus,
  financeStatusMeta,
  setFinanceModeForTest:function(mode){state.financeMode=mode;},
  setFinanceMonthForTest:function(month){state.financeMonth=month;},
  renderFinanceOverview,
  renderFinanceReceipts,
  renderFinanceExpenses,
  renderPagamentosTab,
  captureFinanceReceiptChooser:function(){
    const originalModal=openModal,originalToast=showToast;
    const result={html:'',toast:''};
    openModal=function(html){result.html=html;};
    showToast=function(message){result.toast=message;};
    try{openFinanceReceiptChooser();}
    finally{openModal=originalModal;showToast=originalToast;}
    return result;
  },
  computePortalEmAberto,
  computePortalPixCobranca,
  computeOcupacao12,
  computeCommercialSnapshot,
  vencimentosDoDia
})`,context);
const overdueHouse={
  id:'overdue-house',nome:'Casa teste',endereco:'Rua teste',status:'alugada',tenantId:'tenant-test',
  diaVencimento:1,aluguelValor:1100,aluguelHistorico:[],despesas:[],statusHistorico:[],energias:[],
  contracts:[{id:'overdue-contract',inicio:previousMonth+'-01',fim:'',ativo:true,valor:1100,
    diaVencimento:1,modalidade:'entrada',proporcionalValor:0,proporcionalPago:false}],
  pagamentos:[]
};
const overdueTenant={
  id:'tenant-test',nome:'Inquilino teste',telefone:'11999990000',
  email:'inquilino@example.com',documento:'123.456.789-00',emergenciaNome:'Contato 11988887777'
};
uiApi.setData([overdueHouse],[overdueTenant]);
const advancedHouseCard=uiApi.renderHouseCard(overdueHouse);
const tenantCard=uiApi.renderTenantCard(overdueTenant);
assert.match(advancedHouseCard,/is-overdue/);
assert.match(advancedHouseCard,/ATRASADO/);

uiApi.setPermissionRole('financeiro');
const financialHouseCard=uiApi.renderHouseCard(Object.assign({},overdueHouse,{
  energias:[{
    mes:currentMonth,contractId:'overdue-contract',valor:100,kwh:80,
    leituraAnterior:100,leituraAtual:180
  }]
}));
assert.match(financialHouseCard,/Registrar aluguel|Registrar outra parcela|Ver recebimentos/);
assert.match(financialHouseCard,/Ver energia/);
assert.doesNotMatch(financialHouseCard,/Vincular inquilino|Registrar energia/);
const financialTenantCard=uiApi.renderTenantCard(overdueTenant);
assert.match(financialTenantCard,/>Ver</);
assert.doesNotMatch(financialTenantCard,/WhatsApp|>Gerenciar</);
const financialTenantModal=uiApi.captureTenantModal('tenant-test');
assert.match(financialTenantModal,/Consultar inquilino|somente consultar/i);
assert.match(financialTenantModal,/•••••••8900/);
assert.doesNotMatch(financialTenantModal,/123\.456\.789-00/);
assert.equal(
  uiApi.tenantMatchesSearch(overdueTenant,'12345678900'),
  false,
  'Financeiro não pode localizar inquilino por CPF.'
);

uiApi.setPermissionRole('operacional');
const operationalHouseCard=uiApi.renderHouseCard(overdueHouse);
assert.doesNotMatch(operationalHouseCard,/Registrar aluguel|Registrar outra parcela|Ver recebimentos/);
assert.match(operationalHouseCard,/Registrar energia/);
assert.match(uiApi.renderTenantCard(overdueTenant),/WhatsApp|>Gerenciar</);
assert.match(uiApi.captureTenantModal('tenant-test'),/123\.456\.789-00/);
assert.equal(uiApi.tenantMatchesSearch(overdueTenant,'12345678900'),true);
assert.equal(uiApi.tenantMatchesSearch(overdueTenant,'789'),false);

uiApi.setPermissionRole('leitura');
const readOnlyHouseCard=uiApi.renderHouseCard(overdueHouse);
assert.doesNotMatch(
  readOnlyHouseCard,
  /Registrar aluguel|Registrar outra parcela|Registrar energia|Vincular inquilino/
);
assert.doesNotMatch(uiApi.renderTenantCard(overdueTenant),/WhatsApp|>Gerenciar</);

const roleContractHouse={
  id:'role-contract-house',status:'alugada',
  cobrancas:[],recebimentos:[],
  contracts:[{
    id:'role-contract',tenantId:'tenant-test',inicio:previousMonth+'-10',fim:'',
    ativo:true,valor:1100,diaVencimento:5,modalidade:'fixo',
    proporcionalDias:20,proporcionalValor:700,proporcionalPago:false
  }]
};
uiApi.setData([roleContractHouse],[overdueTenant]);
uiApi.setPermissionRole('financeiro');
const financialContractHtml=uiApi.renderContractsTab(roleContractHouse);
assert.match(financialContractHtml,/Registrar ajuste/);
assert.doesNotMatch(financialContractHtml,/Editar condições|Registrar saída|Corrigir vínculo/);
roleContractHouse.cobrancas=[{
  id:'role-adjustment-charge',contractId:'role-contract',mes:previousMonth,
  competencia:previousMonth,tipo:'ajuste',valorPrevisto:700,
  vencimento:previousMonth+'-10',toleranciaDias:5,
  origemTipo:'contrato_ajuste',origemId:'role-contract',totalRecebido:250
}];
roleContractHouse.recebimentos=[{
  id:'role-adjustment-receipt',cobrancaId:'role-adjustment-charge',
  valor:250,dataPagamento:previousMonth+'-12',forma:'PIX',observacao:'1ª parcela'
}];
const partialAdjustment=uiApi.contractProrataPaymentSnapshot(
  roleContractHouse,roleContractHouse.contracts[0]
);
assert.equal(partialAdjustment.received,250);
assert.equal(partialAdjustment.remaining,450);
assert.equal(partialAdjustment.status,'parcial_atrasado');
const partialContractHtml=uiApi.renderContractsTab(roleContractHouse);
assert.match(partialContractHtml,/Registrar outra parcela/);
assert.match(partialContractHtml,/saldo[\s\S]*450,00/i);
const partialAdjustmentModal=uiApi.captureProrataModal('role-contract-house','role-contract');
assert.match(partialAdjustmentModal,/PAGAMENTO PARCIAL/);
assert.match(partialAdjustmentModal,/Previsto[\s\S]*700,00/);
assert.match(partialAdjustmentModal,/Recebido[\s\S]*250,00/);
assert.match(partialAdjustmentModal,/Saldo[\s\S]*450,00/);
assert.match(partialAdjustmentModal,/1ª parcela/);
uiApi.setPermissionRole('operacional');
const operationalContractHtml=uiApi.renderContractsTab(roleContractHouse);
assert.doesNotMatch(operationalContractHtml,/Registrar ajuste/);
assert.match(operationalContractHtml,/Editar condições|Registrar saída|Corrigir vínculo/);
uiApi.setPermissionRole('leitura');
const readOnlyContractHtml=uiApi.renderContractsTab(roleContractHouse);
assert.doesNotMatch(
  readOnlyContractHtml,
  /Registrar ajuste|Editar condições|Registrar saída|Corrigir vínculo|Arquivar contrato/
);

const emptyFinanceMonth={rows:[],expenses:0};
uiApi.setPermissionRole('leitura');
assert.doesNotMatch(uiApi.renderFinanceReceipts(currentMonth,emptyFinanceMonth),/Registrar recebimento/);
assert.doesNotMatch(uiApi.renderFinanceExpenses(currentMonth,emptyFinanceMonth),/Registrar despesa/);
uiApi.setPermissionRole('financeiro');
assert.match(uiApi.renderFinanceReceipts(currentMonth,emptyFinanceMonth),/Registrar recebimento/);
assert.match(uiApi.renderFinanceExpenses(currentMonth,emptyFinanceMonth),/Registrar despesa/);
uiApi.setPermissionRole('administrador');

function overviewHouse(id,received){
  const contractId='contract-'+id;
  const chargeId='charge-'+id;
  return {
    id:id,nome:'Casa '+id,status:'alugada',tenantId:'',energiaAtiva:false,
    diaVencimento:5,aluguelValor:1000,aluguelHistorico:[],despesas:[],
    statusHistorico:[],energias:[],pagamentos:[],
    contracts:[{
      id:contractId,inicio:currentMonth+'-01',fim:'',ativo:true,valor:1000,
      diaVencimento:5,modalidade:'entrada',proporcionalValor:0,proporcionalPago:false
    }],
    cobrancas:[{
      id:chargeId,mes:currentMonth,competencia:currentMonth,tipo:'aluguel',
      contractId:contractId,valorPrevisto:1000,vencimento:currentMonth+'-05',
      toleranciaDias:5
    }],
    recebimentos:[{
      id:'receipt-'+id,cobrancaId:chargeId,valor:received,dataPagamento:currentMonth+'-05'
    }]
  };
}
uiApi.setData([overviewHouse('credito',1500),overviewHouse('pendente',500)],[],[]);
assert.equal(
  uiApi.computeOverview().faltaReceber,
  500,
  'Crédito de um imóvel não pode ocultar a pendência de outro no painel.'
);

const maintenanceToday=api.todayISO();
const maintenanceHtml=uiApi.renderMaintenanceTab({
  id:'maintenance-house',
  despesas:[{
    id:'maintenance-expense',descricao:'Troca de torneira',
    categoria:'Manutenção',valor:180,data:maintenanceToday,status:'Concluído'
  }],
  chamados:[
    {
      id:'maintenance-open',titulo:'Vazamento na pia',categoria:'hidraulica',
      prioridade:'urgente',status:'aberto',createdAt:maintenanceToday+'T10:00:00Z'
    },
    {
      id:'maintenance-done',titulo:'Tomada reparada',categoria:'eletrica',
      prioridade:'normal',status:'resolvido',despesaId:'maintenance-expense',
      createdAt:maintenanceToday+'T09:00:00Z'
    }
  ]
});
assert.match(maintenanceHtml,/Vazamento na pia/);
assert.match(maintenanceHtml,/URGENTE|Urgente/);
assert.match(maintenanceHtml,/Despesa vinculada: R\$\s*180,00/);
assert.doesNotMatch(maintenanceHtml,/Excluir/);
uiApi.setPermissionRole('financeiro');
assert.doesNotMatch(
  uiApi.renderMaintenanceTab({
    id:'maintenance-house',despesas:[],chamados:[]
  }),
  /Novo chamado/
);
uiApi.setPermissionRole('operacional');
assert.match(
  uiApi.renderMaintenanceTab({
    id:'maintenance-house',despesas:[],chamados:[]
  }),
  /Novo chamado/
);
uiApi.setData([{
  id:'maintenance-house',tenantId:'',despesas:[],chamados:[{
    id:'maintenance-open',titulo:'Vazamento na pia',descricao:'',categoria:'hidraulica',
    prioridade:'normal',status:'aberto',resposta:'',abertoPor:'proprietario'
  }]
}],[]);
const operationalMaintenanceModal=uiApi.captureMaintenanceModal('maintenance-house','maintenance-open');
assert.match(operationalMaintenanceModal,/Salvar chamado/);
assert.doesNotMatch(operationalMaintenanceModal,/Registrar também uma despesa/);
uiApi.setPermissionRole('administrador');
assert.match(
  uiApi.captureMaintenanceModal('maintenance-house','maintenance-open'),
  /Registrar também uma despesa/
);
assert.equal(uiApi.maintenanceCategoryLabel('eletrica'),'Elétrica');
assert.equal(uiApi.maintenancePriorityLabel('alta'),'Alta');
/* §14 renomeou as situações para o feminino ("manutenção"), mantendo os
   MESMOS valores gravados — nenhum registro antigo precisou mudar. */
assert.equal(uiApi.maintenanceStatusLabel('cancelado'),'Cancelada');
assert.equal(uiApi.maintenanceStatusLabel('resolvido'),'Concluída');
assert.equal(uiApi.maintenanceStatusLabel('aberto'),'Aberta');
assert.equal(uiApi.maintenanceStatusLabel('aguardando_orcamento'),'Aguardando orçamento');
assert.equal(uiApi.maintenanceStatusLabel('aprovado'),'Aprovada');
/* A situação legada continua sendo exibida para não invalidar o histórico. */
assert.equal(uiApi.maintenanceStatusLabel('aguardando_peca'),'Aguardando peça');
assert.match(tenantCard,/is-overdue/);
assert.match(tenantCard,/EM ATRASO/);
uiApi.setMode('simple');
const simpleHouseCard=uiApi.renderHouseCard(overdueHouse);
assert.match(simpleHouseCard,/simple-house-card/);
assert.match(simpleHouseCard,/Registrar pagamento/);
assert.doesNotMatch(simpleHouseCard,/Registrar energia/);

const vacantHouse={id:'vacant',nome:'Casa vaga',status:'vaga',aluguelValor:900,quartos:2,banheiros:1,sala:true,cozinha:true,garagem:true,quintal:true,areaServico:false};
const compatible={id:'interest-a',nome:'Interessado A',telefone:'11977776666',observacoes:'Prefere rua calma',status:'quente',valorMaximo:1000,quartosMin:2,banheirosMin:1,precisaSala:true,precisaCozinha:true,precisaGaragem:true,precisaQuintal:false,precisaAreaServico:false};
const needsLaundry={...compatible,id:'interest-b',nome:'Interessado B',precisaAreaServico:true};
uiApi.setData([vacantHouse],[],[compatible,needsLaundry]);
uiApi.setMode('advanced');
assert.equal(uiApi.houseAttentionSignals(vacantHouse).vacancy,true);
assert.match(uiApi.renderHouseCard(vacantHouse),/Vincular inquilino/);
uiApi.setData([vacantHouse,overdueHouse],[overdueTenant],[]);
assert.equal(uiApi.sortedHousesForView([vacantHouse,overdueHouse])[0].id,'overdue-house');
assert.equal(uiApi.tenantMatchesSearch({...overdueTenant,documento:'123.456.789-00'},'12345678900'),true);
assert.equal(uiApi.tenantMatchesSearch({...overdueTenant,documento:'123.456.789-00'},'789'),false);
const contractsHtml=uiApi.renderContractsTab(overdueHouse);
assert.match(contractsHtml,/Contrato atual/);
assert.match(contractsHtml,/Registrar saída/);
assert.match(contractsHtml,/Corrigir vínculo/);
assert.doesNotMatch(contractsHtml,/Cadastro errado/);
uiApi.setData([vacantHouse],[],[compatible,needsLaundry]);
assert.equal(uiApi.interestMatchesHouse(compatible,vacantHouse),true);
assert.equal(uiApi.interestMatchesHouse(needsLaundry,vacantHouse),false);
assert.equal(uiApi.matchingHousesForInterest(compatible).length,1);
assert.equal(
  uiApi.matchingInterestsForHouse(vacantHouse)[0].status,
  'quente',
  'Prioridade zero de "quente" não pode cair no fallback da ordenação.'
);

/* Pessoas, arquivos, fotos e agenda seguem a mesma matriz: consulta continua
   disponível, mas ações operacionais somem e documento pessoal fica protegido. */
const privacyHouse={
  id:'privacy-house',nome:'Casa privacidade',status:'vaga',tenantId:'',
  contracts:[],energias:[],pagamentos:[],cobrancas:[],recebimentos:[],
  aluguelValor:900,quartos:2,banheiros:1,sala:true,cozinha:true,garagem:true,
  quintal:false,areaServico:false
};
const personalDocument={
  id:'personal-document',nome:'CPF completo de Maria.pdf',tipo:'documento',
  mime:'application/pdf',tamanho:1234,dados:'data:application/pdf;base64,JVBERi0x',
  visivelInquilino:false
};
const contractDocument={
  id:'contract-document',nome:'Contrato de locação.pdf',tipo:'contrato',
  mime:'application/pdf',tamanho:2345,dados:'data:application/pdf;base64,JVBERi0x',
  visivelInquilino:false
};
const storedPhoto={
  id:'photo-a',dados:'data:image/jpeg;base64,AA==',tamanho:1200
};
uiApi.setData([privacyHouse],[],[compatible]);
uiApi.setArtifacts(
  {'privacy-house':[storedPhoto]},
  {'privacy-house':[personalDocument,contractDocument]},
  [{id:'event-a',data:currentMonth+'-12',texto:'Vistoria de entrada'}]
);

uiApi.setPermissionRole('financeiro');
uiApi.setArtifacts(
  {'privacy-house':[storedPhoto]},
  {'privacy-house':[
    {...personalDocument,restrito:true},
    {...contractDocument,restrito:true}
  ]},
  [{id:'event-a',data:currentMonth+'-12',texto:'Vistoria de entrada'}]
);
assert.doesNotMatch(uiApi.renderInterestCard(compatible),/WhatsApp|Transformar em inquilino|>Editar</);
assert.match(uiApi.captureInterestModal('interest-a'),/Consultar interessado|somente consultar/i);
assert.doesNotMatch(uiApi.renderFotosTab(privacyHouse),/Adicionar fotos|Remover foto/);
const financialDocuments=uiApi.renderDocumentsTab(privacyHouse);
assert.doesNotMatch(financialDocuments,/Adicionar documento|No portal|aria-label="Excluir"/);
assert.match(financialDocuments,/Arquivo protegido/);
assert.doesNotMatch(financialDocuments,/CPF completo de Maria\.pdf/);
assert.doesNotMatch(financialDocuments,/Contrato de locação\.pdf/);
const financialCalendar=uiApi.captureCalendarDay(currentMonth+'-12');
assert.match(financialCalendar,/Vistoria de entrada/);
assert.doesNotMatch(financialCalendar,/Adicionar lembrete|>Excluir</);

uiApi.setPermissionRole('operacional');
uiApi.setArtifacts(
  {'privacy-house':[storedPhoto]},
  {'privacy-house':[personalDocument,contractDocument]},
  [{id:'event-a',data:currentMonth+'-12',texto:'Vistoria de entrada'}]
);
assert.match(uiApi.renderInterestCard(compatible),/WhatsApp|Transformar em inquilino|>Editar</);
assert.match(uiApi.renderFotosTab(privacyHouse),/Adicionar fotos|Remover foto/);
const operationalDocuments=uiApi.renderDocumentsTab(privacyHouse);
assert.match(operationalDocuments,/Adicionar documento|No portal|aria-label="Excluir"/);
assert.match(operationalDocuments,/CPF completo de Maria\.pdf/);
assert.match(uiApi.captureCalendarDay(currentMonth+'-12'),/Adicionar lembrete|>Excluir</);
uiApi.setPermissionRole('administrador');

/* Correções críticas de 2026-07-28. */
const portalContract={
  id:'portal-contract',inicio:olderMonth+'-10',fim:'',ativo:true,valor:1200,
  diaVencimento:5,modalidade:'fixo',proporcionalValor:360,proporcionalPago:false
};
const portalHouse={
  id:'portal-house',nome:'Casa portal',status:'alugada',tenantId:'tenant-test',
  diaVencimento:5,aluguelValor:1200,aluguelHistorico:[],despesas:[],statusHistorico:[],
  createdAt:olderMonth+'-01T12:00:00Z',contracts:[portalContract],pagamentos:[],
  energias:[{id:'energy-current',mes:currentMonth,contractId:'portal-contract',
    valor:180,kwh:100,pago:false,vencimento:currentMonth+'-31'}]
};
uiApi.setData([portalHouse],[overdueTenant],[]);
assert.equal(
  uiApi.computePortalPixCobranca(
    portalHouse.id,portalContract.inicio.slice(0,7),portalContract.id,'ajuste'
  ).valor,
  360,
  'PIX do ajuste inicial deve usar o proporcional, não o aluguel cheio.'
);
assert.ok(
  uiApi.computePortalEmAberto().itens.some(function(item){return item.tipo==='energia';}),
  'Energia lançada e ainda no prazo também compõe "Em aberto agora".'
);

const energyHouse={
  id:'energy-house',nome:'Casa energia',status:'alugada',energiaAtiva:true,
  contracts:[
    {id:'contract-old',inicio:api.addMonths(currentMonth,-8)+'-01',fim:api.addMonths(currentMonth,-4)+'-28',ativo:false,valor:900,diaVencimento:5,modalidade:'entrada'},
    {id:'contract-new',inicio:api.addMonths(currentMonth,-3)+'-01',fim:'',ativo:true,valor:1000,diaVencimento:5,modalidade:'entrada'}
  ],
  energias:[
    {mes:currentMonth,contractId:'contract-new',kwh:200,valor:200},
    {mes:api.addMonths(currentMonth,-1),contractId:'contract-new',kwh:100,valor:100},
    {mes:api.addMonths(currentMonth,-2),contractId:'contract-new',kwh:100,valor:100},
    {mes:api.addMonths(currentMonth,-3),contractId:'contract-new',kwh:100,valor:100},
    {mes:api.addMonths(currentMonth,-4),contractId:'contract-old',kwh:500,valor:500}
  ]
};
uiApi.setData([energyHouse],[],[]);
const energyAlerts=uiApi.computeEnergyAnomalias(currentMonth);
assert.equal(energyAlerts.length,1);
assert.equal(energyAlerts[0].media,100);
assert.equal(energyAlerts[0].meses,3);

/* ============================================================
   FINANCEIRO V2 — regras operacionais aprovadas
   ============================================================ */
const today=api.todayISO();
const dueTomorrow=api.addDaysISO(today,1);
const dueInsideGrace=api.addDaysISO(today,-5);
const dueAfterGrace=api.addDaysISO(today,-6);
const openCharge=function(due,received,receipts){
  return {
    expected:1000,
    received:received||0,
    due:due,
    graceDays:5,
    receipts:receipts||[]
  };
};

assert.equal(uiApi.financeRowStatus([],0,0),'sem_cobranca');
assert.equal(
  uiApi.financeRowStatus([openCharge(dueTomorrow,0)],1000,0),
  'a_vencer'
);
assert.equal(
  uiApi.financeRowStatus([openCharge(dueInsideGrace,0)],1000,0),
  'tolerancia',
  'Cobrança sem pagamento no quinto dia de tolerância não está atrasada.'
);
assert.equal(
  uiApi.financeRowStatus([openCharge(dueAfterGrace,0)],1000,0),
  'atrasado',
  'Cobrança sem pagamento passa a atraso somente depois da tolerância.'
);
assert.equal(
  uiApi.financeRowStatus([openCharge(dueAfterGrace,400)],1000,400),
  'pagamento_parcial_em_atraso'
);
assert.equal(
  uiApi.financeRowStatus(
    [openCharge(today,1000,[{dataPagamento:today}])],
    1000,
    1000
  ),
  'pago'
);
assert.equal(
  uiApi.financeRowStatus(
    [openCharge(dueAfterGrace,1000,[{dataPagamento:today}])],
    1000,
    1000
  ),
  'pago_atraso'
);
assert.equal(
  uiApi.financeRowStatus([openCharge(today,1100)],1000,1100),
  'credito'
);

for(const [status,label] of [
  ['pago','Pago'],
  ['pagamento_parcial','Pagamento parcial'],
  ['a_vencer','A vencer'],
  ['tolerancia','Em tolerância'],
  ['atrasado','Em atraso'],
  ['pago_atraso','Pago com atraso'],
  ['sem_cobranca','Sem cobrança'],
  ['credito','Crédito a favor']
]){
  assert.equal(uiApi.financeStatusMeta(status).label,label);
}

function paidHouseWithDue(id,due,receipts){
  const contractId='contract-'+id;
  const chargeId='charge-'+id;
  return {
    id:id,nome:'Casa paga '+id,status:'alugada',tenantId:'',energiaAtiva:false,
    diaVencimento:5,aluguelValor:1000,aluguelHistorico:[],despesas:[],
    statusHistorico:[],energias:[],pagamentos:[],
    contracts:[{
      id:contractId,inicio:currentMonth+'-01',fim:'',ativo:true,valor:1000,
      diaVencimento:5,modalidade:'entrada',proporcionalValor:0,proporcionalPago:false
    }],
    cobrancas:[{
      id:chargeId,mes:currentMonth,competencia:currentMonth,tipo:'aluguel',
      contractId:contractId,valorPrevisto:1000,vencimento:due,toleranciaDias:5
    }],
    recebimentos:receipts.map(function(receipt,index){
      return {
        id:'receipt-'+id+'-'+index,cobrancaId:chargeId,
        valor:receipt.valor,dataPagamento:receipt.dataPagamento
      };
    })
  };
}
const paidLateHouse=paidHouseWithDue('late',dueAfterGrace,[
  {valor:400,dataPagamento:dueAfterGrace},
  {valor:600,dataPagamento:today}
]);
const paidWithinGraceHouse=paidHouseWithDue('grace',dueInsideGrace,[
  {valor:1000,dataPagamento:today}
]);
assert.equal(
  api.paymentStatus(paidLateHouse,currentMonth,'contract-late'),
  'pago_atraso',
  'A data da parcela que quita a cobrança define o pagamento com atraso.'
);
assert.equal(
  api.paymentStatus(paidWithinGraceHouse,currentMonth,'contract-grace'),
  'pago',
  'Pagamento no quinto dia de tolerância continua em dia.'
);
uiApi.setData([paidLateHouse],[],[]);
assert.match(uiApi.renderHouseCard(paidLateHouse),/PAGO COM ATRASO/);
assert.match(uiApi.renderPagamentosTab(paidLateHouse),/PAGO COM ATRASO/);

const financeCompetence=previousMonth;
const financeDue=financeCompetence+'-05';
function financeHouseWithReceipts(receipts,archivedCharge){
  return {
    id:'finance-house',
    nome:'Casa financeira',
    status:'vaga',
    energiaAtiva:false,
    contracts:[],
    pagamentos:[],
    energias:[],
    despesas:[],
    cobrancas:[{
      id:'charge-rent',
      mes:financeCompetence,
      tipo:'aluguel',
      valorPrevisto:1000,
      vencimento:financeDue,
      toleranciaDias:5,
      arquivadoEm:archivedCharge?today+'T12:00:00Z':null
    }],
    recebimentos:receipts
  };
}

const twoInstallments=[
  {id:'receipt-1',cobrancaId:'charge-rent',valor:400,dataPagamento:currentMonth+'-02'},
  {id:'receipt-2',cobrancaId:'charge-rent',valor:350,dataPagamento:currentMonth+'-03'},
  {id:'receipt-archived',cobrancaId:'charge-rent',valor:999,dataPagamento:currentMonth+'-03',
    arquivadoEm:currentMonth+'-04T12:00:00Z'}
];
uiApi.setData([financeHouseWithReceipts(twoInstallments,false)],[],[]);
uiApi.setFinanceModeForTest('competencia');
let financeInfo=uiApi.computeMonthlyFinance(financeCompetence);
assert.equal(financeInfo.expected,1000);
assert.equal(financeInfo.receivedCompetence,750);
assert.equal(financeInfo.pending,250);
assert.equal(financeInfo.rows[0].status,'pagamento_parcial_em_atraso');

const completedInstallments=twoInstallments.concat({
  id:'receipt-3',
  cobrancaId:'charge-rent',
  valor:250,
  dataPagamento:currentMonth+'-04'
});
uiApi.setData([financeHouseWithReceipts(completedInstallments,false)],[],[]);
financeInfo=uiApi.computeMonthlyFinance(financeCompetence);
assert.equal(
  financeInfo.receivedCompetence,
  1000,
  'Uma cobrança aceita vários recebimentos e soma somente os não arquivados.'
);
assert.equal(
  financeInfo.expected,
  1000,
  'Atraso não cria multa nem juros automáticos sobre o valor previsto.'
);
assert.equal(financeInfo.rows[0].status,'pago_atraso');

uiApi.setFinanceModeForTest('caixa');
const competenceSeenAsCash=uiApi.computeMonthlyFinance(financeCompetence);
const cashMonth=uiApi.computeMonthlyFinance(currentMonth);
assert.equal(competenceSeenAsCash.receivedCompetence,1000);
assert.equal(competenceSeenAsCash.received,0);
assert.equal(cashMonth.receivedCash,1000);
assert.equal(cashMonth.received,1000);
uiApi.setFinanceMonthForTest(currentMonth);
const cashOverviewHtml=uiApi.renderFinanceOverview(currentMonth,cashMonth);
assert.match(cashOverviewHtml,/Entradas no mês/);
assert.match(cashOverviewHtml,/Saídas no mês/);
assert.match(cashOverviewHtml,/Resultado do caixa/);
assert.doesNotMatch(
  cashOverviewHtml,
  /Previsto × recebido|Pendências por vencimento|A receber|Pago com atraso|Em atraso|A vencer/,
  'O modo caixa não deve exibir gráfico, pendência ou status de competência.'
);
const cashReceiptsHtml=uiApi.renderFinanceReceipts(currentMonth,cashMonth);
assert.doesNotMatch(
  cashReceiptsHtml,
  /Cobranças em aberto|Pago com atraso|Em atraso|Em tolerância|A vencer/,
  'Recebimentos no modo caixa mostram movimentos, sem painel de cobranças.'
);

uiApi.setData([financeHouseWithReceipts(completedInstallments,true)],[],[]);
assert.equal(
  uiApi.computeMonthlyFinance(financeCompetence).expected,
  0,
  'Cobrança arquivada deixa os totais ativos sem ser apagada.'
);
uiApi.setFinanceModeForTest('competencia');

const selectorSyntheticHouse={
  id:'selector-synthetic',nome:'Casa sintética',status:'alugada',energiaAtiva:false,
  diaVencimento:5,aluguelValor:1000,aluguelHistorico:[],despesas:[],energias:[],pagamentos:[],
  contracts:[{
    id:'selector-contract-a',inicio:currentMonth+'-01',fim:'',ativo:true,valor:1000,
    diaVencimento:5,modalidade:'entrada',proporcionalValor:0,proporcionalPago:false
  }],
  cobrancas:[{
    id:'selector-old-charge',mes:previousMonth,competencia:previousMonth,tipo:'aluguel',
    contractId:'selector-contract-a',valorPrevisto:1000,vencimento:previousMonth+'-05',
    toleranciaDias:5
  }],
  recebimentos:[{
    id:'selector-old-receipt',cobrancaId:'selector-old-charge',valor:1000,
    dataPagamento:previousMonth+'-05'
  }]
};
const selectorStoredHouse={
  id:'selector-stored',nome:'Casa persistida',status:'alugada',energiaAtiva:false,
  diaVencimento:5,aluguelValor:1200,aluguelHistorico:[],despesas:[],energias:[],pagamentos:[],
  contracts:[{
    id:'selector-contract-b',inicio:currentMonth+'-01',fim:'',ativo:true,valor:1200,
    diaVencimento:5,modalidade:'entrada',proporcionalValor:0,proporcionalPago:false
  }],
  cobrancas:[{
    id:'selector-current-charge',mes:currentMonth,competencia:currentMonth,tipo:'aluguel',
    contractId:'selector-contract-b',valorPrevisto:1200,vencimento:currentMonth+'-05',
    toleranciaDias:5
  }],
  recebimentos:[]
};
uiApi.setData([selectorSyntheticHouse,selectorStoredHouse],[],[]);
uiApi.setFinanceMonthForTest(currentMonth);
const chooserResult=uiApi.captureFinanceReceiptChooser();
assert.equal(chooserResult.toast,'');
assert.equal(
  (chooserResult.html.match(/selector-synthetic/g)||[]).length,
  1,
  'Cobrança sintética do mês continua disponível mesmo havendo cobrança persistida antiga.'
);
assert.equal(
  (chooserResult.html.match(/selector-stored/g)||[]).length,
  1,
  'Cobrança persistida e sua equivalente sintética não podem aparecer duplicadas.'
);

const energyContract={
  id:'energy-stage-contract',
  inicio:api.addMonths(currentMonth,-1)+'-01',
  fim:'',
  ativo:true,
  valor:1000,
  diaVencimento:5,
  modalidade:'entrada'
};
function energyStageHouse(entry,charge,receipts){
  return {
    id:'energy-stage-house',
    nome:'Casa por etapas',
    status:'alugada',
    energiaAtiva:true,
    contracts:[energyContract],
    pagamentos:[],
    energias:entry?[entry]:[],
    cobrancas:charge?[charge]:[],
    recebimentos:receipts||[]
  };
}
function computedEnergyStage(houseValue){
  uiApi.setData([houseValue],[],[]);
  return uiApi.computeEnergyMonth(currentMonth).rows[0].stage.id;
}
const energyEntry={
  id:'energy-entry',
  mes:currentMonth,
  contractId:energyContract.id,
  leituraAnterior:100,
  leituraAtual:180,
  kwh:80,
  valor:160
};
const energyCharge={
  id:'energy-charge',
  mes:currentMonth,
  tipo:'energia',
  contractId:energyContract.id,
  origemId:energyEntry.id,
  valorPrevisto:160,
  vencimento:currentMonth+'-05',
  toleranciaDias:5
};
assert.equal(computedEnergyStage(energyStageHouse(null,null,[])),'leitura_pendente');
assert.equal(
  computedEnergyStage(energyStageHouse({...energyEntry,valor:0},null,[])),
  'leitura_registrada'
);
assert.equal(computedEnergyStage(energyStageHouse(energyEntry,null,[])),'valor_calculado');
assert.equal(computedEnergyStage(energyStageHouse(energyEntry,energyCharge,[])),'cobranca_gerada');

/* "Parcial em atraso" depende do vencimento já ter passado, e o vencimento
   original desta cobrança é dia 5 do mês corrente com 5 dias de tolerância.
   Do dia 1 ao 10 de cada mês isso ainda não venceu — a asserção passava 20
   dias por mês e reprovava nos outros 10, sem nada ter mudado no código.
   Aqui a cobrança tem vencimento fixo no passado, que é o que o teste
   realmente quer dizer. */
const energyChargeVencida=Object.assign({},energyCharge,{
  vencimento:api.addMonths(currentMonth,-1)+'-05',
  toleranciaDias:0
});
assert.equal(
  computedEnergyStage(energyStageHouse(energyEntry,energyChargeVencida,[
    {id:'energy-receipt-1',cobrancaId:'energy-charge',valor:60,dataPagamento:today}
  ])),
  'pagamento_parcial_em_atraso'
);
assert.equal(
  computedEnergyStage(energyStageHouse(energyEntry,energyCharge,[
    {id:'energy-receipt-1',cobrancaId:'energy-charge',valor:60,dataPagamento:today},
    {id:'energy-receipt-2',cobrancaId:'energy-charge',valor:100,dataPagamento:today}
  ])),
  'valor_recebido'
);

const oldPortfolioHouse={
  id:'old-portfolio',createdAt:api.addMonths(currentMonth,-11)+'-01',
  contracts:[{id:'old-p-contract',inicio:api.addMonths(currentMonth,-11)+'-01',
    fim:'',ativo:true,valor:1000,diaVencimento:5,modalidade:'entrada'}]
};
const newPortfolioHouse={
  id:'new-portfolio',createdAt:currentMonth+'-01',
  contracts:[{id:'new-p-contract',inicio:currentMonth+'-01',
    fim:'',ativo:true,valor:1000,diaVencimento:5,modalidade:'entrada'}]
};
uiApi.setData([oldPortfolioHouse,newPortfolioHouse],[],[]);
const occupancy=uiApi.computeOcupacao12();
assert.equal(occupancy[0].total,1,'Casa ainda não cadastrada não entra no denominador histórico.');
assert.equal(occupancy[occupancy.length-1].total,2);

const historicalMonth=api.addMonths(currentMonth,-2);
const historicalHouse={
  id:'historical-house',status:'vaga',diaVencimento:28,
  contracts:[{id:'historical-contract',inicio:api.addMonths(historicalMonth,-1)+'-01',
    fim:historicalMonth+'-28',ativo:false,valor:975,diaVencimento:7,modalidade:'entrada'}],
  pagamentos:[]
};
uiApi.setData([historicalHouse],[],[]);
assert.equal(
  uiApi.vencimentosDoDia(historicalMonth,7).length,
  1,
  'Calendário histórico deve usar o contrato daquele mês, não o status atual da casa.'
);

uiApi.setCommercial([
  {userId:'paid',status:'ativa',plano:'basico',valorPago:99,isPlatformAdmin:false},
  {userId:'free',status:'ativa',plano:'gratuito',valorPago:0,isPlatformAdmin:false}
],[
  {id:'sale-1',status:'aceito',pagamentoStatus:'confirmado',valorPago:99},
  {id:'sale-2',status:'aguardando_pagamento',pagamentoStatus:'pendente',valorPago:149}
]);
const commercialSnapshot=uiApi.computeCommercialSnapshot();
assert.equal(commercialSnapshot.pagantes,1);
assert.equal(commercialSnapshot.valorInicialConfirmado,99);
assert.equal(commercialSnapshot.valorAguardando,149);
assert.equal(Object.hasOwn(commercialSnapshot,'recorrente'),false);

const pixCode=vm.runInContext('generatePixPayload(950)',context);
assert.match(pixCode,/^000201/);
assert.match(pixCode,/BR\.GOV\.BCB\.PIX/);
assert.match(pixCode,/6304[0-9A-F]{4}$/);
assert.equal(vm.runInContext("pixCrc16('123456789')",context),'29B1');

/* Exportação de exemplo, com dados fictícios, versionada junto do código.
   Antes esta linha apontava para ../backups/, uma exportação REAL que o
   .gitignore corretamente mantém fora do repositório — e por isso a suíte
   só rodava nesta máquina. Trocada por um exemplo de mesma forma e mesmas
   contagens (versão 3, sem `contracts`, 10 imóveis, 9 inquilinos, 63
   pagamentos), que é o que destrava rodar os testes em qualquer lugar. */
const backupPath = join(testsDir,'fixtures','exportacao-exemplo-v3.json');
const backup = JSON.parse(await readFile(backupPath,'utf8'));
const normalized = api.normalizeBackupForImport(backup);
assert.equal(normalized.houses.length, 10);
assert.equal(normalized.tenants.length, 9);
assert.equal(normalized.payments.length, 63);
assert.equal(normalized.energy.length, 0);
assert.ok(normalized.houses.some((item) => item.dia_vencimento===30));
assert.ok(normalized.houses.every((item) => !Object.hasOwn(item,'poco_agua')));
assert.ok(normalized.houses.every((item) => Object.hasOwn(item,'cozinha') && Object.hasOwn(item,'area_servico')));
assert.ok(normalized.houses.every((item) => Object.hasOwn(item,'publicado') && Object.hasOwn(item,'descricao_publica')));

/* --- Backup V8: a fundação completa da Vitrine precisa ir e voltar --- */
const vitrineBackup = JSON.parse(await readFile(join(testsDir,'fixtures','exportacao-vitrine-v8.json'),'utf8'));
const normalizedVitrine = api.normalizeBackupForImport(vitrineBackup);
assert.equal(normalizedVitrine.vitrine.imoveis.length,1);
assert.equal(normalizedVitrine.vitrine.imoveis[0].area_util_m2,74.5);
assert.equal(normalizedVitrine.vitrine.imoveis[0].total_andares,8);
assert.equal(normalizedVitrine.vitrine.imoveis[0].aceita_estudante,null,
  'Não informado precisa continuar nulo no backup, sem virar não.');
assert.deepEqual(Array.from(normalizedVitrine.vitrine.imoveis[0].garantias_aceitas),['caucao','seguro_fianca']);
assert.equal(normalizedVitrine.vitrine.documentacao[0].observacao_privada,'Conferida em cartório');
assert.equal(normalizedVitrine.vitrine.anunciantes[0].proprietario_cliente_id,normalizedVitrine.owners[0].id,
  'O vínculo do anunciante precisa acompanhar o novo ID gerado para o proprietário na importação.');

/* --- Coluna esquecida no backup apaga dado sem avisar ---
   A restauração deleta tudo da conta e reinsere com LISTA EXPLÍCITA de
   colunas. `imoveis.tipo` e `inquilinos.rg` nasceram depois da rotina,
   ficaram fora dela, e eram perdidos em silêncio a cada restauração.
   Estes testes cobrem o caminho inteiro: o normalizador precisa levar o
   campo, e o SQL precisa recebê-lo, inseri-lo e atualizá-lo. */
assert.ok(
  normalized.houses.every((item) => Object.hasOwn(item,'tipo')),
  'O backup normalizado precisa levar o tipo do imóvel.'
);
assert.ok(
  normalized.tenants.every((item) => Object.hasOwn(item,'rg')),
  'O backup normalizado precisa levar o RG do inquilino.'
);
const tipoRoundtrip = api.normalizeBackupForImport({
  version:7,
  houses:[{id:'11111111-1111-4111-8111-111111111111',nome:'Casa',tipo:'apartamento',diaVencimento:5},
          {id:'22222222-2222-4222-8222-222222222222',nome:'Outra',tipo:'inventado',diaVencimento:5}],
  tenants:[{id:'33333333-3333-4333-8333-333333333333',nome:'Fulano',rg:'1234567 SSP-PE'}]
});
assert.equal(tipoRoundtrip.houses[0].tipo,'apartamento','O tipo válido atravessa o backup intacto.');
assert.equal(tipoRoundtrip.houses[1].tipo,'casa','Tipo desconhecido cai em "casa" em vez de quebrar a restauração.');
assert.equal(tipoRoundtrip.tenants[0].rg,'1234567 SSP-PE','O RG atravessa o backup intacto.');

/* --- Importar o mesmo arquivo duas vezes duplicava a carteira ---
   A importação ADICIONA registros, e a única proteção era uma frase na
   tela pedindo para não repetir. Agora a exportação carrega um
   identificador e o banco recusa a segunda vez — mas só no modo
   "adicionar": substituir é idempotente por natureza e não pode ser
   barrado. Arquivo antigo, sem identificador, continua aceito. */
const comIdentificador = api.normalizeBackupForImport({
  version:7,
  exportId:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  exportedAt:'2026-07-31T12:00:00.000Z',
  houses:[{id:'44444444-4444-4444-8444-444444444444',nome:'Casa',diaVencimento:5}],
  tenants:[]
});
assert.equal(comIdentificador.export_id,'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
assert.equal(comIdentificador.exported_at,'2026-07-31T12:00:00.000Z');

const semIdentificador = api.normalizeBackupForImport({
  version:7,
  houses:[{id:'55555555-5555-4555-8555-555555555555',nome:'Casa',diaVencimento:5}],
  tenants:[]
});
assert.equal(semIdentificador.export_id,null,
  'Backup antigo continua importável: sem identificador, apenas sem a proteção.');

/* Identificador inventado não vira chave: só UUID. */
assert.equal(
  api.normalizeBackupForImport({version:7,exportId:'nao-e-uuid',
    houses:[{id:'66666666-6666-4666-8666-666666666666',nome:'Casa',diaVencimento:5}],tenants:[]}).export_id,
  null
);
/* A data é gravada na ÚLTIMA instrução da restauração: uma data torta ali
   derrubaria a transação com tudo já inserido. */
assert.equal(
  api.normalizeBackupForImport({version:7,exportedAt:'ontem de manhã',
    houses:[{id:'77777777-7777-4777-8777-777777777777',nome:'Casa',diaVencimento:5}],tenants:[]}).exported_at,
  null,
  'Data de exportação ilegível vira null em vez de quebrar a restauração no fim.'
);
assert.equal(normalized.config.tema,'original');
assert.equal(normalized.config.pix_chave,'');

const sevenPhotoBackup=structuredClone(backup);
sevenPhotoBackup.photos={
  [sevenPhotoBackup.houses[0].id]:Array(7).fill('data:image/jpeg;base64,AA==')
};
const normalizedSevenPhotos=api.normalizeBackupForImport(sevenPhotoBackup);
assert.equal(
  normalizedSevenPhotos.photos.length,
  7,
  'A importação deve preservar mais de seis fotos quando houver armazenamento.'
);
assert.equal(
  api.backupPayloadStorageBytes({photos:normalizedSevenPhotos.photos,documents:[]}),
  7,
  'O controle de armazenamento deve somar os bytes decodificados das fotos.'
);
assert.equal(
  api.backupPayloadStorageBytes({photos:[{tamanho:7}],documents:[{tamanho:9}]}),
  16,
  'Fotos e documentos devem compartilhar o mesmo limite de armazenamento.'
);

const malicious = structuredClone(backup);
malicious.photos = { [malicious.houses[0].id]: ['x" onerror="alert(1)'] };
assert.throws(() => api.normalizeBackupForImport(malicious), /foto inválida/i);

const invalidDue = structuredClone(backup);
invalidDue.houses[0].diaVencimento = 32;
assert.throws(() => api.normalizeBackupForImport(invalidDue), /1 a 31/i);

const appSource = await readFile(join(root,'app.js'),'utf8');
const backupSource = await readFile(join(root,'backup.js'),'utf8');
const authSource = await readFile(join(root,'auth.js'),'utf8');
const configSource = await readFile(join(root,'config.js'),'utf8');
const utilsSource = await readFile(join(root,'utils.js'),'utf8');
const commercialSource = await readFile(join(root,'commercial.js'),'utf8');
const dashboardSource = await readFile(join(root,'dashboard.js'),'utf8');
const financeSource = await readFile(join(root,'finance.js'),'utf8');
const energySource = await readFile(join(root,'energy.js'),'utf8');
const maintenanceSource = await readFile(join(root,'maintenance.js'),'utf8');
const housesSource = await readFile(join(root,'houses.js'),'utf8');
const photosSource = await readFile(join(root,'photos.js'),'utf8');
const documentsSource = await readFile(join(root,'documents.js'),'utf8');
const calendarSource = await readFile(join(root,'calendar.js'),'utf8');
const tenantsSource = await readFile(join(root,'tenants.js'),'utf8');
const contractsSource = await readFile(join(root,'contracts.js'),'utf8');
const interestsSource = await readFile(join(root,'interests.js'),'utf8');
const crmSource = await readFile(join(root,'crm.js'),'utf8');
const crmCssSource = await readFile(join(root,'crm.css'),'utf8');
const styleSource = await readFile(join(root,'style.css'),'utf8');
const tokensCssSource = await readFile(join(root,'tokens.css'),'utf8');
const rentalUiCssSource = await readFile(join(root,'aluguel-ui.css'),'utf8');
const migrationSource = await readFile(join(root,'migracao-descricao-temas.sql'),'utf8');
const commercialMigrationSource = await readFile(join(root,'migracao-versao-comercial-v1.sql'),'utf8');
const accessMigrationSource = await readFile(join(root,'migracao-tipos-acesso.sql'),'utf8');
const separationMigrationSource = await readFile(join(root,'migracao-separacao-inquilinos-clientes.sql'),'utf8');
const myHomeSource = await readFile(join(root,'minha-casa.js'),'utf8');
const myHomeCssSource = await readFile(join(root,'minha-casa.css'),'utf8');
const myHomeMigrationSource = await readFile(join(root,'migracao-minha-casa.sql'),'utf8');
const contractRemovalMigrationSource = await readFile(join(root,'migracao-exclusao-contratos.sql'),'utf8');
const supabaseSource = await readFile(join(root,'supabase.js'),'utf8');
const indexSource = await readFile(join(root,'index.html'),'utf8');
const buildSource = await readFile(join(root,'build.mjs'),'utf8');
const serviceWorkerSource = await readFile(join(root,'service-worker.js'),'utf8');
const financeMigrationSource = await readFile(join(root,'migracao-financeiro-v2.sql'),'utf8');
const backupV7MigrationSource = await readFile(join(root,'migracao-backup-v7.sql'),'utf8');
const inspectionsSource = await readFile(join(root,'migracao-vistoria-e-chamados.sql'),'utf8');
const phase0CorrectionSource = await readFile(
  join(root,'migracao-correcao-manutencao-limpeza.sql'),'utf8'
);
const vitrineFoundationSource = await readFile(join(root,'migracao-vitrine-fundacao.sql'),'utf8');
const vitrineSeoMarcaSource = await readFile(join(root,'migracao-vitrine-seo-marca.sql'),'utf8');
const vitrineRetentionAgendaSource = await readFile(join(root,'migracao-vitrine-retencao-agenda.sql'),'utf8');
const crmQualityMigrationSource = await readFile(join(root,'migracao-crm-qualidade.sql'),'utf8');

/* --- O catálogo de migrações não pode envelhecer ---
   diagnostico_migracoes() responde "quais arquivos este banco já recebeu"
   procurando no esquema a evidência de cada um. Isso só vale enquanto o
   catálogo listar TODOS os arquivos que existem. Um arquivo novo que
   ninguém acrescente ali some do diagnóstico em silêncio — que é
   exatamente o problema que a função veio resolver. */
const controleVersaoSource = await readFile(join(root,'migracao-controle-versao.sql'),'utf8');
const arquivosDeMigracao = (await readdir(root))
  .filter((nome) => /^migracao-.*\.sql$/.test(nome))
  .sort();
const naoCatalogados = arquivosDeMigracao.filter((nome) => !controleVersaoSource.includes("'"+nome+"'"));
assert.deepEqual(
  naoCatalogados, [],
  'Estes arquivos de migração não estão no catálogo de migracao-controle-versao.sql: '+
  naoCatalogados.join(', ')+'. Sem entrar lá, o diagnóstico não consegue dizer se o banco os recebeu.'
);
assert.match(controleVersaoSource,/create table if not exists public\.migracoes_aplicadas/);
assert.match(controleVersaoSource,/create or replace function public\.registrar_migracao/);
assert.match(controleVersaoSource,/create or replace function public\.diagnostico_migracoes/);
/* A revisão do backup é detectada pelo CORPO da função: o arquivo é o
   mesmo de antes, e só olhar se a função existe não distingue a versão
   que preserva o tipo e o RG da versão que os apagava. */
assert.match(controleVersaoSource,/'corpo_funcao','importar_backup_atomico_v7','tipo=excluded\.tipo'/);
assert.match(controleVersaoSource,/e_administrador_plataforma\(auth\.uid\(\)\)/,
  'O diagnóstico descreve o esquema inteiro: só Mestre pode executá-lo.');

/* O outro lado do mesmo caminho: o SQL da restauração precisa aceitar,
   inserir e atualizar as colunas que o backup carrega. Não basta o
   normalizador levar o campo — a rotina apaga tudo e reinsere por lista
   explícita, então uma coluna que falte aqui some no pior dia do cliente. */
for(const [tabela,coluna] of [['imoveis','tipo'],['imoveis','proprietario_cliente_id'],['inquilinos','rg']]){
  const bloco = backupV7MigrationSource
    .split('insert into public.'+tabela+'(')[1] || '';
  const corpo = bloco.slice(0, bloco.indexOf('where public.'+tabela+'.user_id'));
  assert.ok(corpo,'Não encontrei o insert de '+tabela+' na restauração.');
  /* A lista de colunas é só o trecho até o primeiro ")": procurar a palavra
     no bloco inteiro deixaria um comentário satisfazer o teste. */
  const listaColunas = corpo.slice(0, corpo.indexOf(')'));
  assert.match(listaColunas,new RegExp('(^|,)\\s*'+coluna+'\\s*(,|$)','m'),
    tabela+'.'+coluna+' precisa estar na lista de colunas da restauração.');
  assert.match(corpo,new RegExp(coluna+'\\s+(text|uuid|numeric|integer|boolean|date|timestamptz)'),
    tabela+'.'+coluna+' precisa ser lido do payload no jsonb_to_recordset.');
  assert.match(corpo,new RegExp(coluna+'=excluded\\.'+coluna),
    tabela+'.'+coluna+' precisa entrar no "on conflict do update".');
}

/* --- A recusa do arquivo repetido vale só no modo "adicionar" ---
   Substituir o banco pelo mesmo retrato duas vezes é legítimo — é o que
   se faz quando a primeira restauração não foi a esperada. Barrar isso
   trocaria um risco de duplicidade por um risco de não conseguir
   restaurar, que é muito pior. */
assert.match(backupV7MigrationSource,/create table if not exists public\.backups_importados/);
assert.match(backupV7MigrationSource,/if not p_substituir and v_export is not null then/,
  'A recusa por repetição não pode valer no modo substituir.');
assert.match(backupV7MigrationSource,/insert into public\.backups_importados/);
/* O registro é a última instrução: se algo falhar no meio, a transação é
   desfeita e o arquivo continua importável. */
const trechoFinal = backupV7MigrationSource.slice(
  backupV7MigrationSource.indexOf('insert into public.backups_importados')
);
assert.match(trechoFinal,/set_config\('app\.restaurando_backup','0',true\)/,
  'O registro da exportação vem depois de tudo, não antes.');

/* Novo chamado com despesa usa um UUID anterior à primeira requisição.
   Os dois pontos de perda de resposta precisam ser repetíveis sem criar
   outro chamado, outra despesa ou tentar reabrir o registro já vinculado. */
const maintenanceRetryContext=vm.createContext({
  console:{log(){},warn(){},error(){}},
  crypto:{randomUUID},
  canAdministerAccount:()=>true,
  requirePropertyPermission:()=>true
});
vm.runInContext(
  await readFile(join(root,'utils.js'),'utf8'),
  maintenanceRetryContext,
  {filename:'utils-maintenance-retry.js'}
);
vm.runInContext(`
  var __fields={
    maintenanceTitle:{value:'Trocar torneira'},
    maintenanceDescription:{value:'Vazamento'},
    maintenanceCategory:{value:'hidraulica'},
    maintenancePriority:{value:'normal'},
    maintenanceStatus:{value:'resolvido'},
    maintenanceResponse:{value:'Reparo concluído'},
    maintenanceCreateExpense:{checked:true},
    maintenanceExpenseValue:{value:'150'},
    maintenanceExpenseDate:{value:'2026-07-29'},
    maintenanceExpenseProvider:{value:'Prestador'},
    maintenanceExpenseCategory:{value:'Manutenção'},
    maintenanceSaveButton:{disabled:false,textContent:'Salvar',onclick:null}
  };
  var document={getElementById:function(id){return __fields[id]||null;}};
  var state={houses:[],tenants:[]};
  var __mode='',__dbCall=null,__insertAttempts=0,__updateAttempts=0;
  var __resolveAttempts=0,__expenseCreations=0,__closed=0;
  function showToast(){}
  function closeModal(){__closed+=1;}
  function render(){}
  function __copy(value){return value?Object.assign({},value):null;}
  function __reset(mode){
    __mode=mode;__dbCall=null;__insertAttempts=0;__updateAttempts=0;
    __resolveAttempts=0;__expenseCreations=0;__closed=0;
    __fields.maintenanceSaveButton.onclick=null;
    __fields.maintenanceSaveButton.disabled=false;
    state.houses=[{
      id:'house-retry',tenantId:'tenant-retry',
      chamados:[],despesas:[]
    }];
  }
  var db={
    async insertMaintenanceCall(houseId,item){
      __insertAttempts+=1;
      __dbCall=Object.assign({},item,{
        id:item.id,houseId:houseId,status:'aberto',
        despesaId:'',resolvidoEm:''
      });
      if(__mode==='insert'&&__insertAttempts===1){
        throw new Error('Resposta do INSERT perdida');
      }
      return __copy(__dbCall);
    },
    async getMaintenanceCall(id){
      return __dbCall&&__dbCall.id===id?__copy(__dbCall):null;
    },
    async updateMaintenanceCall(item){
      __updateAttempts+=1;
      if(__dbCall&&__dbCall.despesaId){
        throw new Error('Tentativa indevida de reabrir chamado vinculado');
      }
      __dbCall=__copy(item);
      return __copy(__dbCall);
    },
    async resolveMaintenanceCallWithExpense(item,expense){
      __resolveAttempts+=1;
      if(!__dbCall.despesaId){
        __expenseCreations+=1;
        __dbCall=Object.assign({},__dbCall,{
          status:'resolvido',resposta:item.resposta,
          despesaId:'expense-retry',resolvidoEm:'2026-07-29T12:00:00Z'
        });
      }
      if(__mode==='resolve'&&__resolveAttempts===1){
        throw new Error('Resposta da resolução perdida');
      }
      return {
        call:__copy(__dbCall),
        expenseId:__dbCall.despesaId,
        expense:{
          id:__dbCall.despesaId,descricao:'Manutenção: Trocar torneira',
          categoria:'Manutenção',valor:Number(expense.valor),data:expense.data,
          prestador:expense.prestador,status:'Concluído'
        }
      };
    }
  };
`,maintenanceRetryContext);
vm.runInContext(maintenanceSource,maintenanceRetryContext,{filename:'maintenance-retry.js'});

/* §14: a despesa nunca é lançada sem confirmação explícita. Sem ela, o
   fluxo apenas mostra o resumo do que seria criado e não grava nada. */
vm.runInContext(`__reset('insert');
  globalThis.__lastModal='';
  openModal=function(html){globalThis.__lastModal=html;};
`,maintenanceRetryContext);
await vm.runInContext(`saveMaintenanceCall('house-retry','')`,maintenanceRetryContext);
const gateResult=JSON.parse(vm.runInContext(`JSON.stringify({
  modal:globalThis.__lastModal,
  insertAttempts:__insertAttempts,
  expenseCreations:__expenseCreations
})`,maintenanceRetryContext));
assert.equal(gateResult.expenseCreations,0,'Sem confirmação, nenhuma despesa é criada.');
assert.equal(gateResult.insertAttempts,0,'Sem confirmação, nada é gravado.');
assert.match(gateResult.modal,/Registrar esta despesa\?/);
assert.match(gateResult.modal,/Concluir sem despesa/,'Dá para concluir a manutenção sem lançar despesa.');

vm.runInContext(`__reset('insert')`,maintenanceRetryContext);
await vm.runInContext(`saveMaintenanceCall('house-retry','','confirmado')`,maintenanceRetryContext);
await vm.runInContext(`__fields.maintenanceSaveButton.onclick()`,maintenanceRetryContext);
const insertRetryResult=JSON.parse(vm.runInContext(`JSON.stringify({
  insertAttempts:__insertAttempts,
  updateAttempts:__updateAttempts,
  resolveAttempts:__resolveAttempts,
  expenseCreations:__expenseCreations,
  calls:state.houses[0].chamados,
  expenses:state.houses[0].despesas
})`,maintenanceRetryContext));
assert.equal(insertRetryResult.insertAttempts,1);
assert.equal(insertRetryResult.updateAttempts,1);
assert.equal(insertRetryResult.resolveAttempts,1);
assert.equal(insertRetryResult.expenseCreations,1);
assert.equal(insertRetryResult.calls.length,1);
assert.equal(insertRetryResult.calls[0].status,'resolvido');
assert.equal(insertRetryResult.expenses.length,1);

vm.runInContext(`__reset('resolve')`,maintenanceRetryContext);
await vm.runInContext(`saveMaintenanceCall('house-retry','','confirmado')`,maintenanceRetryContext);
await vm.runInContext(`__fields.maintenanceSaveButton.onclick()`,maintenanceRetryContext);
const resolutionRetryResult=JSON.parse(vm.runInContext(`JSON.stringify({
  insertAttempts:__insertAttempts,
  updateAttempts:__updateAttempts,
  resolveAttempts:__resolveAttempts,
  expenseCreations:__expenseCreations,
  calls:state.houses[0].chamados,
  expenses:state.houses[0].despesas
})`,maintenanceRetryContext));
assert.equal(resolutionRetryResult.insertAttempts,1);
assert.equal(resolutionRetryResult.updateAttempts,0);
assert.equal(resolutionRetryResult.resolveAttempts,2);
assert.equal(resolutionRetryResult.expenseCreations,1);
assert.equal(resolutionRetryResult.calls.length,1);
assert.equal(resolutionRetryResult.calls[0].despesaId,'expense-retry');
assert.equal(resolutionRetryResult.expenses.length,1);

/* O ajuste inicial usa a mesma estrutura de competência/caixa dos demais
   lançamentos: uma cobrança e vários recebimentos, sem regravar os marcadores
   legados do contrato. */
const prorataSaveStart=contractsSource.indexOf('async function saveProrataPayment');
const prorataSaveEnd=contractsSource.indexOf('function renderContractCard',prorataSaveStart);
assert.ok(prorataSaveStart>=0&&prorataSaveEnd>prorataSaveStart,'Fluxo do ajuste inicial ausente.');
const prorataSaveSource=contractsSource.slice(prorataSaveStart,prorataSaveEnd);
assert.match(prorataSaveSource,/db\.upsertCharge/);
assert.match(prorataSaveSource,/db\.insertReceipt/);
assert.match(prorataSaveSource,/origemTipo:'contrato_ajuste'/);
assert.doesNotMatch(prorataSaveSource,/saveContractProrata|proporcionalPago|proporcionalDataPagamento/);

const prorataTestFields={
  f_prorata_value:{value:'300'},
  f_prorata_data:{value:'2026-07-15'},
  f_prorata_method:{value:'PIX'},
  f_prorata_note:{value:'2ª parcela'},
  f_prorata_origin:{value:'11111111-1111-4111-8111-111111111111'}
};
let prorataDocumentReads=0;
const prorataFlowContext=vm.createContext({
  console,
  __fields:prorataTestFields,
  __documentReads:0,
  document:{
    getElementById:function(id){
      prorataDocumentReads++;
      return prorataTestFields[id]||null;
    }
  }
});
vm.runInContext(await readFile(join(root,'utils.js'),'utf8'),prorataFlowContext,{filename:'utils-prorata.js'});
vm.runInContext(`
  const state={
    houses:[{
      id:'house-adjustment',nome:'Casa ajuste',tenantId:'tenant-adjustment',
      cobrancas:[{
        id:'charge-adjustment',contractId:'contract-adjustment',
        mes:'2026-07',competencia:'2026-07',tipo:'ajuste',
        valorPrevisto:700,vencimento:'2026-07-10',toleranciaDias:5,
        origemTipo:'contrato_ajuste',origemId:'contract-adjustment',
        totalRecebido:200
      }],
      recebimentos:[{
        id:'receipt-first',cobrancaId:'charge-adjustment',valor:200,
        dataPagamento:'2026-07-12',forma:'Dinheiro',observacao:'1ª parcela'
      }],
      contracts:[{
        id:'contract-adjustment',tenantId:'tenant-adjustment',
        inicio:'2026-07-10',fim:'',ativo:true,valor:1200,
        diaVencimento:5,modalidade:'fixo',
        proporcionalDias:25,proporcionalValor:700,
        proporcionalPago:false,proporcionalDataPagamento:''
      }]
    }],
    tenants:[{id:'tenant-adjustment',nome:'Inquilino ajuste'}]
  };
  let __allowFinance=true;
  let __guardCalls=0;
  let __closeCount=0;
  let __renderCount=0;
  let __lastToast={message:'',tone:''};
  const __dbCalls=[];
  function requireFinancePermission(){__guardCalls++;return __allowFinance;}
  function canManageFinance(){return __allowFinance;}
  function canOperateProperties(){return false;}
  function closeModal(){__closeCount++;}
  function render(){__renderCount++;}
  function showToast(message,tone){__lastToast={message:message,tone:tone};}
  function financeV2Unavailable(){return false;}
  function esc(value){return String(value==null?'':value);}
  function openModal(){}
  const db={
    upsertCharge:async function(houseId,item){
      __dbCalls.push({kind:'charge',houseId:houseId,item:Object.assign({},item)});
      return Object.assign({},item,{id:item.id||'charge-adjustment',totalRecebido:200});
    },
    insertReceipt:async function(item){
      __dbCalls.push({kind:'receipt',item:Object.assign({},item)});
      return Object.assign({id:'receipt-'+__dbCalls.length},item);
    }
  };
`,prorataFlowContext,{filename:'prorata-flow-setup.js'});
vm.runInContext(contractsSource,prorataFlowContext,{filename:'contracts-prorata-flow.js'});
await vm.runInContext(
  `saveProrataPayment('house-adjustment','contract-adjustment')`,
  prorataFlowContext
);
const savedProrataFlow=JSON.parse(vm.runInContext(`JSON.stringify({
  calls:__dbCalls,
  house:state.houses[0],
  closeCount:__closeCount,
  renderCount:__renderCount,
  toast:__lastToast,
  guardCalls:__guardCalls,
  documentReads:0
})`,prorataFlowContext));
assert.deepEqual(savedProrataFlow.calls.map(function(call){return call.kind;}),['receipt']);
assert.equal(savedProrataFlow.calls[0].item.valor,300);
assert.equal(savedProrataFlow.calls[0].item.competenciaCaixa,'2026-07');
assert.equal(savedProrataFlow.calls[0].item.origemId,'11111111-1111-4111-8111-111111111111');
assert.equal(savedProrataFlow.house.recebimentos.length,2);
assert.equal(savedProrataFlow.house.cobrancas.length,1);
assert.equal(savedProrataFlow.house.cobrancas[0].totalRecebido,500);
assert.equal(savedProrataFlow.house.cobrancas[0].saldoAberto,200);
assert.equal(savedProrataFlow.house.contracts[0].proporcionalPago,false);
assert.equal(savedProrataFlow.house.contracts[0].proporcionalDataPagamento,'');
assert.equal(savedProrataFlow.closeCount,1);
assert.equal(savedProrataFlow.renderCount,1);
assert.match(savedProrataFlow.toast.message,/Saldo do ajuste:[\s\S]*200,00/i);

vm.runInContext(`globalThis.__fields.f_prorata_value.value='250'`,prorataFlowContext);
await vm.runInContext(
  `saveProrataPayment('house-adjustment','contract-adjustment')`,
  prorataFlowContext
);
const overBalanceResult=JSON.parse(vm.runInContext(`JSON.stringify({
  calls:__dbCalls.length,
  toast:__lastToast,
  documentReads:0
})`,prorataFlowContext));
assert.equal(overBalanceResult.calls,1,'Valor acima do saldo não pode chegar ao banco.');
assert.match(overBalanceResult.toast.message,/não pode ultrapassar o saldo/i);

vm.runInContext(`
  globalThis.__fields.f_prorata_value.value='200';
  globalThis.__fields.f_prorata_data.value='2026-07-20';
  globalThis.__fields.f_prorata_note.value='3ª parcela';
  globalThis.__fields.f_prorata_origin.value='22222222-2222-4222-8222-222222222222';
`,prorataFlowContext);
await vm.runInContext(
  `saveProrataPayment('house-adjustment','contract-adjustment')`,
  prorataFlowContext
);
const settledProrataFlow=JSON.parse(vm.runInContext(`JSON.stringify({
  calls:__dbCalls.length,
  receipts:state.houses[0].recebimentos.length,
  total:state.houses[0].cobrancas[0].totalRecebido,
  balance:state.houses[0].cobrancas[0].saldoAberto,
  status:contractProrataPaymentSnapshot(
    state.houses[0],state.houses[0].contracts[0]
  ).status,
  legacyPaid:state.houses[0].contracts[0].proporcionalPago,
  toast:__lastToast
})`,prorataFlowContext));
assert.equal(settledProrataFlow.calls,2);
assert.equal(settledProrataFlow.receipts,3);
assert.equal(settledProrataFlow.total,700);
assert.equal(settledProrataFlow.balance,0);
assert.equal(settledProrataFlow.status,'pago_atraso');
assert.equal(settledProrataFlow.legacyPaid,false);
assert.match(settledProrataFlow.toast.message,/quitado/i);

vm.runInContext(`__allowFinance=false`,prorataFlowContext);
const readsBeforeDenied=prorataDocumentReads;
await vm.runInContext(
  `saveProrataPayment('house-adjustment','contract-adjustment')`,
  prorataFlowContext
);
assert.equal(vm.runInContext(`__dbCalls.length`,prorataFlowContext),2);
assert.equal(
  prorataDocumentReads,
  readsBeforeDenied,
  'Sem permissão financeira o handler deve parar antes de ler o formulário.'
);

/* A interface espelha a mesma matriz de papéis do banco e falha fechada
   quando recebe um papel desconhecido. O titular continua sendo o único
   perfil que administra a equipe, embora administrador tenha as demais
   permissões da conta. */
const roleHelpersStart=appSource.indexOf('function currentAccountRoleKey');
const roleHelpersEnd=appSource.indexOf('function openMenuModal',roleHelpersStart);
assert.ok(roleHelpersStart>=0&&roleHelpersEnd>roleHelpersStart,'Helpers globais de papel ausentes em app.js.');
const roleUiContext=vm.createContext({
  state:{role:'owner',isPlatformAdmin:false,isPrimaryOwner:false,staffProfile:null},
  showToast:function(){}
});
vm.runInContext(appSource.slice(roleHelpersStart,roleHelpersEnd),roleUiContext,{filename:'app-role-helpers.js'});
const roleUiApi=vm.runInContext(`({
  key:currentAccountRoleKey,
  admin:canAdministerAccount,
  finance:canManageFinance,
  properties:canOperateProperties,
  sensitive:canViewSensitiveTenantData,
  mask:maskSensitiveDocument,
  restore:canRestoreArchivedEntity
})`,roleUiContext);
function setRoleUiState(values){
  Object.assign(roleUiContext.state,{
    role:'owner',
    isPlatformAdmin:false,
    isPrimaryOwner:false,
    staffProfile:null
  },values||{});
}
setRoleUiState({isPrimaryOwner:true});
assert.deepEqual(
  [roleUiApi.key(),roleUiApi.admin(),roleUiApi.finance(),roleUiApi.properties()],
  ['administrador',true,true,true]
);
setRoleUiState({staffProfile:{papel:'administrador'}});
assert.deepEqual([roleUiApi.admin(),roleUiApi.finance(),roleUiApi.properties()],[true,true,true]);
setRoleUiState({staffProfile:{papel:'financeiro'}});
assert.deepEqual([roleUiApi.admin(),roleUiApi.finance(),roleUiApi.properties()],[false,true,false]);
assert.equal(roleUiApi.sensitive(),false);
assert.equal(roleUiApi.mask('123.456.789-00'),'•••••••8900');
assert.equal(roleUiApi.restore('despesa'),true);
assert.equal(roleUiApi.restore('imovel'),false);
setRoleUiState({staffProfile:{papel:'operacional'}});
assert.deepEqual([roleUiApi.admin(),roleUiApi.finance(),roleUiApi.properties()],[false,false,true]);
assert.equal(roleUiApi.sensitive(),true);
assert.equal(roleUiApi.restore('contrato'),true);
assert.equal(roleUiApi.restore('recebimento'),false);
setRoleUiState({staffProfile:{papel:'leitura'}});
assert.deepEqual([roleUiApi.admin(),roleUiApi.finance(),roleUiApi.properties()],[false,false,false]);
setRoleUiState({staffProfile:{papel:'papel_invalido'}});
assert.deepEqual(
  [roleUiApi.key(),roleUiApi.admin(),roleUiApi.finance(),roleUiApi.properties()],
  ['leitura',false,false,false],
  'Papel desconhecido deve ficar somente em consulta.'
);
assert.match(appSource,/Somente o proprietário principal administra a equipe/i);
assert.doesNotMatch(
  appSource,
  /Administrador:<\/b>\s*operação,\s*equipe/i,
  'Administrador colaborador não pode ser descrito como gestor da equipe.'
);

/* A tela de equipe existe em UM lugar só.
   Havia uma segunda versão dela em features.js, anterior aos papéis, que
   só não valia porque o app.js é carregado depois e a sobrescrevia — ou
   seja, o controle de permissão dependia da ordem das tags de script no
   index.html. Removida; este teste impede que volte. */
const featuresSource = await readFile(join(root,'features.js'),'utf8');
for(const nome of ['renderTeamRows','openTeamModal','inviteTeamMember','toggleTeamMember','cancelTeamInvite']){
  assert.doesNotMatch(
    featuresSource,
    new RegExp('function\\s+'+nome+'\\s*\\('),
    'A equipe é definida só em app.js, com os quatro papéis. '+
    'Redefinir '+nome+' em features.js faz a permissão depender da ordem dos <script>.'
  );
}

/* Esconder o botão é UX; os handlers de gravação também precisam parar antes
   de ler formulário ou tocar no estado. Sem DOM e com os guards negados,
   todos estes atalhos devem retornar silenciosamente. */
const deniedRoleContext=vm.createContext({
  console,
  canAdministerAccount:()=>false,
  canManageFinance:()=>false,
  canOperateProperties:()=>false,
  canViewSensitiveTenantData:()=>false,
  maskSensitiveDocument:()=> 'Documento protegido',
  requireAccountPermission:()=>false,
  requireFinancePermission:()=>false,
  requirePropertyPermission:()=>false
});
for(const [filename,source] of [
  ['dashboard.js',dashboardSource],
  ['houses.js',housesSource],
  ['contracts.js',contractsSource],
  ['energy.js',energySource],
  ['maintenance.js',maintenanceSource],
  ['finance.js',financeSource],
  ['tenants.js',tenantsSource],
  ['interests.js',interestsSource],
  ['photos.js',photosSource],
  ['documents.js',documentsSource],
  ['calendar.js',calendarSource]
]){
  vm.runInContext(source,deniedRoleContext,{filename});
}
await vm.runInContext(`Promise.all([
  savePayment('h1','2026-07','c1'),
  saveEnergia('h1','2026-07','c1'),
  saveEnergyReceipt('h1','2026-07','c1'),
  archiveEnergyEntry('h1','2026-07','c1'),
  saveExpense('h1',''),
  saveReajuste('h1',''),
  registrarVistoria('h1'),
  addHouse(),
  saveHouseEdit('h1'),
  archiveHouse('h1'),
  saveProrataPayment('h1','c1',true),
  saveCorrectContractLink('h1','c1'),
  saveContractEdit('h1','c1'),
  finishContractAndVacate('h1','c1'),
  archiveContract('h1','c1'),
  saveMaintenanceCall('h1',''),
  saveNewTenant(),
  configureTenantPortal('t1',true),
  saveTenantEdit('t1'),
  finishLegacyTenantStay('h1'),
  archiveTenant('t1'),
  assignTenantToHouse('t1','h1'),
  saveAssignTenant('h1'),
  saveAssignHouse('t1'),
  saveNewInterest(),
  saveInterestEdit('i1'),
  deleteInterest('i1'),
  saveConvertInterest('i1'),
  handlePhotoFiles('h1',[]),
  deletePhoto('h1','p1'),
  saveDocumentUpload('h1'),
  toggleDocumentPortal('h1','d1',true),
  deleteDocumentHandler('h1','d1'),
  addEvento('2026-07-10'),
  deleteEvento('e1','2026-07-10')
])`,deniedRoleContext);
vm.runInContext(`
  openAlertPaymentChooser('h1');
  openDashboardQuickAction('aluguel');
  openDashboardQuickAction('manutencao');
  openDashboardMaintenanceRecord('h1');
  openFirstEnergyModal();
  openSelectedEnergyModal();
  openFinanceReceiptChooser();
  openFinanceExpenseChooser();
  openAddTenantModal();
  openTenantPortalAccess('t1');
  openTenantRemovalChoice('t1');
  openTenantExitModal('t1');
  openArchiveTenantModal('t1');
  openAssignTenantModal('h1');
  openAssignHouseModal('t1');
  openAddInterestModal();
  confirmDeleteInterest('i1');
  openConvertInterestModal('i1');
  triggerPhotoUpload('h1');
  openDocumentUploadModal('h1');
  confirmDeleteDocument('h1','d1');
`,deniedRoleContext);

/* Fotos não têm limite fixo por imóvel: quantidade e restauração obedecem
   aos bytes disponíveis na conta. */
assert.doesNotMatch(
  supabaseSource,
  /photos\s*\[\s*oldHouseId\s*\][\s\S]{0,100}\.slice\s*\(\s*0\s*,\s*6\s*\)/i
);
assert.match(supabaseSource,/await\s+assertBackupStorageAvailable\s*\(\s*payload\s*,/);
assert.match(supabaseSource,/backupPayloadStorageBytes[\s\S]*payload&&payload\.photos[\s\S]*payload&&payload\.documents/);
assert.match(supabaseSource,/nome:r\.nome\|\|''\s*,\s*tamanho:Number\(r\.tamanho\)\|\|0/);
assert.match(supabaseSource,/tamanho:Number\(row\.tamanho\)\|\|item\.file\.blob\.size\|\|0/);
const addPhotosSource=supabaseSource.slice(
  supabaseSource.indexOf('async addPhotos(imovelId, files, startOrder, vinculo)'),
  supabaseSource.indexOf('async deletePhoto(fotoId)')
);
assert.match(addPhotosSource,/insert\(rows\)\.select\(\)/);
assert.match(addPhotosSource,/delete\(\)\.eq\('imovel_id',imovelId\)[\s\S]*\.in\('storage_path'/);
assert.match(addPhotosSource,/removeStoragePaths\(prepared\.map/);
assert.match(photosSource,/Number\(item\.tamanho\)/);
assert.match(photosSource,/Number\(photo\.tamanho\)/);

/* ============================================================
   FINANCEIRO V2 — contrato estático de banco e interface
   ============================================================ */
assert.match(financeMigrationSource,/^\s*begin\s*;/im);
assert.match(compactSql(financeMigrationSource),/\bcommit\s*;$/i);
assert.doesNotMatch(
  financeMigrationSource,
  /\bdrop\s+table\b|\btruncate\s+(?:table\s+)?public\./i
);

const financeChargesTable=sqlTableBlock(financeMigrationSource,'financeiro_cobrancas');
const financeReceiptsTable=sqlTableBlock(financeMigrationSource,'financeiro_recebimentos');
assert.match(financeChargesTable,/\bcompetencia\s+text\s+not\s+null/i);
assert.match(financeChargesTable,/\btolerancia_dias\s+integer\s+not\s+null\s+default\s+5/i);
assert.match(
  financeChargesTable,
  /check\s*\(\s*tipo\s+in\s*\(\s*'aluguel'\s*,\s*'energia'\s*,\s*'ajuste'\s*,\s*'outro'\s*\)\s*\)/i
);
assert.match(financeReceiptsTable,/\bcobranca_id\s+uuid\s+not\s+null/i);
assert.match(financeReceiptsTable,/\bvalor\s+numeric\(\s*12\s*,\s*2\s*\)\s+not\s+null/i);
assert.match(financeReceiptsTable,/\bdata_pagamento\s+date\s+not\s+null/i);
assert.match(financeReceiptsTable,/\bcompetencia_caixa\s+text\s+not\s+null/i);
assert.doesNotMatch(
  financeReceiptsTable,
  /\bunique\s*\(\s*(?:user_id\s*,\s*)?cobranca_id\s*\)/i,
  'Uma cobrança precisa aceitar mais de um recebimento.'
);
assert.match(
  financeReceiptsTable,
  /foreign\s+key\s*\(\s*cobranca_id\s*,\s*user_id\s*\)[\s\S]*references\s+public\.financeiro_cobrancas\s*\(\s*id\s*,\s*user_id\s*\)/i,
  'Recebimento e cobrança precisam pertencer à mesma conta.'
);

/* Multa e juros não fazem parte do modelo atual e nunca são calculados
   silenciosamente por atraso. */
assert.doesNotMatch(
  financeChargesTable+'\n'+financeReceiptsTable,
  /\b(?:multa|juros?|taxa_juros|percentual_multa)\b/i
);
assert.doesNotMatch(
  financeSource,
  /(?:multa|juros?)\s*(?:\+|\*|=)|(?:\+|\*)\s*(?:multa|juros?)/i
);

const prepareFinanceEntry=sqlFunctionBlock(
  financeMigrationSource,
  'financeiro_preparar_lancamento'
);
assert.match(
  prepareFinanceEntry,
  /new\.competencia_caixa\s*:=\s*substring\s*\(\s*new\.data_pagamento::text\s*,\s*1\s*,\s*7\s*\)/i,
  'A competência de caixa padrão deve vir da data real do recebimento.'
);
assert.match(prepareFinanceEntry,/new\.user_id\s*:=\s*v_owner/i);
assert.match(
  prepareFinanceEntry,
  /c\.id\s*=\s*new\.cobranca_id[\s\S]*c\.arquivado_em\s+is\s+null/i
);

const financeSummaryStart=financeMigrationSource.search(
  /create\s+or\s+replace\s+view\s+public\.financeiro_cobrancas_resumo/i
);
const financeSummaryEnd=financeMigrationSource.indexOf(
  'where c.arquivado_em is null;',
  financeSummaryStart
);
assert.ok(
  financeSummaryStart>=0&&financeSummaryEnd>financeSummaryStart,
  'A visão resumida de cobranças deve existir.'
);
const financeSummaryView=financeMigrationSource.slice(
  financeSummaryStart,
  financeSummaryEnd+'where c.arquivado_em is null;'.length
);
for(const status of [
  'pago',
  'pagamento_parcial',
  'pagamento_parcial_em_atraso',
  'a_vencer',
  'em_tolerancia',
  'em_atraso',
  'pago_com_atraso',
  'sem_cobranca',
  'credito_a_favor'
]){
  assert.match(
    financeSummaryView,
    new RegExp("'"+status+"'","i"),
    'Situação financeira ausente na visão: '+status
  );
}
assert.match(
  financeSummaryView,
  /current_date\s*>\s*\(?\s*c\.vencimento\s*\+\s*c\.tolerancia_dias\s*\)?[\s\S]{0,100}then\s+'em_atraso'/i,
  'Atraso precisa começar somente depois do prazo de tolerância.'
);
assert.match(
  financeSummaryView,
  /current_date\s*>\s*c\.vencimento[\s\S]{0,180}then\s+'em_tolerancia'/i,
  'O intervalo após o vencimento deve aparecer explicitamente como tolerância.'
);
assert.match(financeSummaryView,/sum\s*\(\s*x\.valor\s*\)/i);
assert.match(financeSummaryView,/x\.arquivado_em\s+is\s+null/i);

/* Energia continua individual e passa por leitura, cálculo, cobrança e
   recebimento. Nenhuma ação em lote foi liberada nesta etapa. */
for(const stage of [
  'leitura_pendente',
  'leitura_registrada',
  'valor_calculado',
  'cobranca_gerada',
  'pagamento_parcial',
  'valor_recebido'
]){
  assert.match(energySource,new RegExp("'"+stage+"'"));
}
assert.doesNotMatch(energySource,/function\s+\w*(?:lote|batch)\w*\s*\(/i);
assert.doesNotMatch(
  energySource,
  /<button[^>]*>[^<]*(?:lançamento|leitura|energia)\s+em\s+lote/i
);
assert.doesNotMatch(supabaseSource,/async\s+\w*(?:energia|energy)\w*(?:lote|batch)\w*\s*\(/i);

/* Arquivar mantém o registro recuperável e restaura dependências na ordem
   segura, em vez de apagar cadastros operacionais. */
const archiveColumnsStart=financeMigrationSource.indexOf('do $archive_columns$');
const archiveColumnsEnd=financeMigrationSource.indexOf(
  '$archive_columns$;',
  archiveColumnsStart+1
);
assert.ok(archiveColumnsStart>=0&&archiveColumnsEnd>archiveColumnsStart);
const archiveColumnsBlock=financeMigrationSource.slice(
  archiveColumnsStart,
  archiveColumnsEnd+'$archive_columns$;'.length
);
for(const entityTable of [
  'imoveis','inquilinos','contratos','pagamentos','energia','despesas'
]){
  assert.match(archiveColumnsBlock,new RegExp("'"+entityTable+"'"));
}
for(const archiveField of ['arquivado_em','arquivado_por','motivo_arquivamento']){
  assert.match(archiveColumnsBlock,new RegExp(archiveField));
}
assert.match(financeChargesTable,/arquivado_em\s+timestamptz/i);
assert.match(financeReceiptsTable,/arquivado_em\s+timestamptz/i);

const changeArchiveBlock=sqlFunctionBlock(
  financeMigrationSource,
  'alterar_arquivamento_aluguel'
);
for(const entity of [
  'imovel','inquilino','contrato','cobranca','recebimento','pagamento','despesa'
]){
  assert.match(changeArchiveBlock,new RegExp("'"+entity+"'"));
}
assert.match(
  changeArchiveBlock,
  /arquivado_em\s*=\s*case\s+when\s+p_arquivar\s+then\s+now\(\)\s+else\s+null\s+end/i
);
assert.doesNotMatch(changeArchiveBlock,/\bdelete\s+from\b/i);
assert.match(
  changeArchiveBlock,
  /Restaure primeiro o imovel e o inquilino deste contrato/i
);
assert.match(changeArchiveBlock,/Restaure primeiro o imovel desta cobranca/i);
assert.match(changeArchiveBlock,/Restaure primeiro a cobranca deste recebimento/i);
assert.match(changeArchiveBlock,/app\.alterando_arquivamento/i);

const protectArchiveBlock=sqlFunctionBlock(
  financeMigrationSource,
  'proteger_arquivamento_direto'
);
assert.match(protectArchiveBlock,/new\.arquivado_em\s+is\s+distinct\s+from\s+old\.arquivado_em/i);
assert.match(protectArchiveBlock,/Use a acao Arquivar ou Restaurar/i);
assert.match(financeMigrationSource,/revoke\s+truncate\s+on\s+public\.imoveis/i);

const rentGenerationBlock=sqlFunctionBlock(
  financeMigrationSource,
  'gerar_cobrancas_aluguel_mes'
);
assert.match(rentGenerationBlock,/valor_inicial_revisar/i);
assert.match(rentGenerationBlock,/Confira o valor inicial dos contratos pendentes/i);
const contractPeriodBlock=sqlFunctionBlock(
  financeMigrationSource,
  'validar_periodo_contrato'
);
assert.match(contractPeriodBlock,/from\s+public\.imoveis[\s\S]*for\s+update/i);
assert.match(contractPeriodBlock,/periodo informado se sobrepoe/i);

const energyLegacySyncBlock=sqlFunctionBlock(
  financeMigrationSource,
  'financeiro_sincronizar_energia_legada'
);
assert.match(
  energyLegacySyncBlock,
  /app\.restaurando_backup[\s\S]*insert\s+into\s+public\.financeiro_recebimentos/i
);
const prorataLegacySyncBlock=sqlFunctionBlock(
  financeMigrationSource,
  'financeiro_sincronizar_ajuste_contrato'
);
assert.match(
  prorataLegacySyncBlock,
  /app\.restaurando_backup[\s\S]*insert\s+into\s+public\.financeiro_recebimentos/i
);

assert.match(supabaseSource,/importar_backup_atomico_v7/);
assert.doesNotMatch(supabaseSource,/importar_backup_atomico_v6/);
assert.match(backupV7MigrationSource,/create\s+or\s+replace\s+function\s+public\.importar_backup_atomico_v7/i);
assert.match(
  backupV7MigrationSource,
  /p_substituir[\s\S]*public\.convites_inquilino[\s\S]*restauracao bloqueada/i
);
assert.match(
  supabaseSource,
  /sb\.from\('convites_inquilino'\)\.select\('id'\)\.limit\(1\)/
);
for(const legacyRpc of [
  'importar_backup_atomico',
  'importar_backup_atomico_v2',
  'importar_backup_atomico_v3',
  'importar_backup_atomico_v4',
  'importar_backup_atomico_v5',
  'importar_backup_atomico_v6'
]){
  assert.match(
    backupV7MigrationSource,
    new RegExp("'"+legacyRpc+"'"),
    'A migração V7 deve revogar a RPC antiga: '+legacyRpc
  );
}
assert.match(
  backupV7MigrationSource,
  /revoke all on function public\.%I\(jsonb,boolean\) from public,anon,authenticated/i
);
assert.match(
  backupV7MigrationSource,
  /sum\s*\(\s*octet_length\s*\(\s*decode\s*\(\s*split_part\s*\(\s*item->>'dados'/i
);
assert.match(
  backupV7MigrationSource,
  /insert into public\.fotos[\s\S]*octet_length\s*\(\s*decode\s*\(\s*split_part\s*\(\s*x\.dados/i
);
assert.match(
  backupV7MigrationSource,
  /insert into public\.documentos[\s\S]*octet_length\s*\(\s*decode\s*\(\s*split_part\s*\(\s*x\.dados/i
);
assert.doesNotMatch(
  backupV7MigrationSource,
  /sum\s*\(\s*\(item->>'tamanho'\)::numeric\s*\)/i
);
assert.match(backupSource,/function\s+requireBackupPermission\s*\(/);
for(const protectedFunction of [
  'doExportBackup',
  'triggerImport',
  'handleImportFile',
  'confirmImport',
  'applyImport',
  'ensureDailySnapshot',
  'confirmRestore',
  'doRestore'
]){
  assert.match(
    backupSource,
    new RegExp(
      '(?:async\\s+)?function\\s+'+protectedFunction+
      '\\s*\\([^)]*\\)\\s*\\{\\s*if\\(!requireBackupPermission\\(\\)\\)return;'
    ),
    'O fluxo de backup deve exigir permissão administrativa: '+protectedFunction
  );
}
assert.doesNotMatch(
  backupSource,
  /function\s+openBackupsModal\s*\(/,
  'A central de backup efetiva deve ter uma única implementação em app.js.'
);
assert.match(
  appSource,
  /ainda não inclui vistorias, fotos de chamados, convites nem acessos do Portal/i
);
assert.doesNotMatch(backupV7MigrationSource,/\bmin\s*\(\s*c\.id\s*\)/i);
assert.match(backupV7MigrationSource,/array_agg\s*\(\s*c\.id\s+order\s+by/i);
assert.match(backupV7MigrationSource,/app\.restaurando_backup/i);
assert.match(backupV7MigrationSource,/contratos ativos com periodos sobrepostos/i);
assert.doesNotMatch(supabaseSource,/documentos[\s\S]{0,200}\.slice\(\s*0\s*,\s*100\s*\)/i);
assert.match(supabaseSource,/_backupDecimal\(en\.tarifaKwh,'Tarifa de energia',4\)/);

const listArchivedBlock=sqlFunctionBlock(
  financeMigrationSource,
  'listar_arquivados_aluguel'
);
for(const entity of ['imovel','inquilino','contrato','cobranca','recebimento']){
  assert.match(listArchivedBlock,new RegExp("'"+entity+"'"));
}
assert.match(listArchivedBlock,/arquivado_em\s+is\s+not\s+null/i);

/* A interface usa o mesmo arquivamento recuperável do banco. Itens ativos
   saem da memória, e a restauração fica centralizada no Backup. */
assert.match(appSource,/function\s+openArchivedItemsModal\s*\(/);
assert.match(appSource,/await\s+db\.listArchived\s*\(\s*\)/);
assert.match(appSource,/await\s+db\.restoreEntity\s*\(\s*normalized\s*,\s*id\s*\)/);
assert.match(appSource,/Motivo:\s*['"]?\s*\+/);
assert.match(appSource,/archivedDateLabel\s*\(\s*item\.arquivadoEm\s*\)/);
assert.match(appSource,/Restaure primeiro o imóvel e o inquilino/i);
assert.match(appSource,/db\.wipeAll\s*\(\s*\)/);

for(const [source,entity] of [
  [housesSource,'imovel'],
  [tenantsSource,'inquilino'],
  [contractsSource,'contrato'],
  [housesSource,'despesa'],
  [housesSource,'energia']
]){
  assert.match(
    source,
    new RegExp("db\\.archiveEntity\\(\\s*'"+entity+"'"),
    'A interface deve arquivar com o identificador exato: '+entity
  );
}
assert.doesNotMatch(housesSource,/await\s+db\.deleteHouse\s*\(/);
assert.doesNotMatch(housesSource,/await\s+db\.deleteExpense\s*\(/);
assert.doesNotMatch(housesSource,/await\s+db\.deleteEnergia\s*\(/);
assert.doesNotMatch(tenantsSource,/await\s+db\.deleteTenantMistake\s*\(/);
assert.doesNotMatch(contractsSource,/await\s+db\.deleteContractMistake\s*\(/);
assert.match(housesSource,/Encerre o contrato ativo antes de arquivar o imóvel/i);
assert.match(tenantsSource,/Encerre o contrato ativo antes de arquivar o inquilino/i);
assert.match(contractsSource,/Encerre o contrato antes de arquivá-lo/i);

/* Papéis são globais na conta: o colaborador autorizado enxerga todos os
   imóveis daquele proprietário, mas nunca atravessa para outra conta. */
const currentStaffRoleBlock=sqlFunctionBlock(
  financeMigrationSource,
  'papel_colaborador_atual'
);
assert.match(currentStaffRoleBlock,/from\s+public\.acessos_colaborador/i);
assert.match(currentStaffRoleBlock,/a\.user_id\s*=\s*p_user_id/i);
assert.doesNotMatch(currentStaffRoleBlock,/\bimovel_id\b/i);

const canReadAccountBlock=sqlFunctionBlock(financeMigrationSource,'pode_ler_conta');
assert.match(
  canReadAccountBlock,
  /usuario_proprietario_id\s*\(\s*p_user_id\s*\)\s*=\s*p_proprietario_id/i
);
assert.doesNotMatch(canReadAccountBlock,/\bimovel_id\b/i);
const canManageFinanceBlock=sqlFunctionBlock(
  financeMigrationSource,
  'pode_gerenciar_financeiro'
);
assert.match(canManageFinanceBlock,/\('administrador','financeiro'\)/i);
const canOperatePropertiesBlock=sqlFunctionBlock(
  financeMigrationSource,
  'pode_operar_imoveis'
);
assert.match(canOperatePropertiesBlock,/\('administrador','operacional'\)/i);
assert.doesNotMatch(canOperatePropertiesBlock,/\bimovel_id\b/i);

/* Máscara na interface não é fronteira de segurança. CPF, contato de
   emergência, conteúdo e caminho de documento pessoal também precisam sair
   recortados pelo servidor, e snapshots não podem reabrir esse acesso. */
const tenantPrivacyBlock=sqlFunctionBlock(
  financeMigrationSource,
  'listar_inquilinos_aluguel'
);
assert.match(tenantPrivacyBlock,/v_sensivel[\s\S]*\('administrador','operacional'\)/i);
assert.match(
  tenantPrivacyBlock,
  /regexp_replace\(t\.documento,'\\D','','g'\)[\s\S]*right\(/i
);
assert.match(tenantPrivacyBlock,/emergencia_nome[\s\S]*case when v_sensivel/i);

const documentPrivacyBlock=sqlFunctionBlock(
  financeMigrationSource,
  'listar_documentos_imovel'
);
assert.match(
  documentPrivacyBlock,
  /nome[\s\S]*case when not v_sensivel[\s\S]*storage_path[\s\S]*case when not v_sensivel[\s\S]*then ''/i
);
assert.doesNotMatch(
  documentPrivacyBlock,
  /not v_sensivel and d\.tipo='documento'/i
);
assert.match(documentPrivacyBlock,/'restrito',not v_sensivel/i);
assert.match(
  financeMigrationSource,
  /revoke\s+select\s+on\s+public\.inquilinos\s+from\s+authenticated/i
);
assert.match(
  financeMigrationSource,
  /revoke\s+select\s+on\s+public\.documentos\s+from\s+authenticated/i
);
assert.match(
  financeMigrationSource,
  /create\s+policy\s+backups_admin_gerenciar[\s\S]{0,500}papel_colaborador_atual\(auth\.uid\(\)\)='administrador'/i
);
assert.match(
  financeMigrationSource,
  /create\s+trigger\s+validar_papel_portal_inquilino[\s\S]{0,180}public\.convites_inquilino/i
);

const storageReadPrivacyBlock=sqlFunctionBlock(
  financeMigrationSource,
  'pode_ler_arquivo_operacional'
);
assert.match(
  storageReadPrivacyBlock,
  /v_papel in \('administrador','operacional'\)[\s\S]*v_papel not in \('financeiro','leitura'\)/i
);
assert.doesNotMatch(storageReadPrivacyBlock,/from public\.documentos/i);
const inspectionStorageReadBlock=sqlFunctionBlock(
  inspectionsSource,
  'pode_ler_arquivo_operacional'
);
assert.doesNotMatch(inspectionStorageReadBlock,/from public\.documentos/i);
for(const operationalFileTable of [
  'public.fotos','public.energia','public.chamado_fotos','public.vistoria_fotos'
]){
  const operationalFilePattern=new RegExp(
    'from\\s+'+operationalFileTable.replace('.','\\.')
  );
  assert.match(
    storageReadPrivacyBlock,
    operationalFilePattern,
    'A leitura operacional deve reconhecer '+operationalFileTable+'.'
  );
  assert.match(
    inspectionStorageReadBlock,
    operationalFilePattern,
    'Reexecutar Vistoria deve preservar '+operationalFileTable+'.'
  );
}
assert.match(supabaseSource,/sb\.rpc\('listar_inquilinos_aluguel'/);
assert.match(supabaseSource,/sb\.rpc\('listar_documentos_imovel'/);
assert.match(supabaseSource,/sb\.rpc\('listar_documentos_portal'/);
assert.match(supabaseSource,/sb\.rpc\('listar_documentos_backup'/);
assert.doesNotMatch(supabaseSource,/fetchAllRows\('inquilinos'/);
assert.doesNotMatch(supabaseSource,/fetchAllRows\('documentos'/);

for(const table of ['financeiro_cobrancas','financeiro_recebimentos']){
  assert.match(
    financeMigrationSource,
    new RegExp(
      'alter\\s+table\\s+public\\.'+table+
      '\\s+enable\\s+row\\s+level\\s+security\\s*;[\\s\\S]{0,100}'+
      'alter\\s+table\\s+public\\.'+table+
      '\\s+force\\s+row\\s+level\\s+security',
      'i'
    )
  );
  assert.match(
    financeMigrationSource,
    new RegExp(
      'create\\s+policy\\s+'+table+
      '_ler[\\s\\S]{0,220}pode_ler_conta\\s*\\(\\s*user_id\\s*,\\s*auth\\.uid\\(\\)\\s*\\)',
      'i'
    )
  );
}

assert.equal(
  vm.runInContext('CONFIG.APP_VERSION',context),
  'Aluguéis 1.3',
  'A versão aprovada desta entrega deve continuar identificada como Aluguéis 1.3.'
);
assert.match(appSource,/CONFIG\.APP_VERSION/);
assert.match(buildSource,/createHash\(['"]sha256['"]\)/);

assert.doesNotMatch(dashboardSource,/Novo cliente|Clientes quentes/i);
assert.match(dashboardSource,/Novo interessado/);
assert.doesNotMatch(appSource,/inquilino,\s*cliente\s+ou telefone/i);
assert.match(appSource,/inquilino,\s*interessado\s+ou telefone/i);
assert.doesNotMatch(interestsSource,/Novo cliente|Clientes quentes/i);
assert.match(commercialSource,/Clientes proprietários/);
assert.match(commercialSource,/Moradores ficam na aba Inquilinos e nunca recebem plano/);
assert.doesNotMatch(tenantsSource,/Inquilino · sem plano|nenhuma possui plano do aplicativo/i);
assert.match(tenantsSource,/Acesso individual/);

const mobileNavStart=appSource.indexOf('function renderMobileNav(){');
const mobileNavEnd=appSource.indexOf('\nfunction openMoreAreasMenu(){',mobileNavStart);
assert.ok(mobileNavStart>=0&&mobileNavEnd>mobileNavStart,'renderMobileNav deve existir.');
const mobileNavState={view:'dashboard',simple:false};
const mobileNavContext=vm.createContext({
  state:mobileNavState,
  isSimpleMode:function(){return mobileNavState.simple;},
  rentalNavActive:function(view){return mobileNavState.view===view;},
  temModulo:function(nome){return mobileNavState.modulos?!!mobileNavState.modulos[nome]:true;},
  esc:function(value){return String(value);}
});
vm.runInContext(appSource.slice(mobileNavStart,mobileNavEnd),mobileNavContext);
const advancedMobileNav=vm.runInContext('renderMobileNav()',mobileNavContext);
assert.equal(
  (advancedMobileNav.match(/class="mobile-nav-item/g)||[]).length,
  5,
  'A navegação móvel avançada deve ter exatamente cinco itens.'
);
assert.match(advancedMobileNav,/--mobile-items:5/);
assert.match(advancedMobileNav,/<span>Mais<\/span>/);
assert.doesNotMatch(advancedMobileNav,/<span>Comercial<\/span>/);
mobileNavState.simple=true;
const simpleMobileNav=vm.runInContext('renderMobileNav()',mobileNavContext);
assert.equal((simpleMobileNav.match(/class="mobile-nav-item/g)||[]).length,2);

for(const selector of [
  '.rental-app',
  '.rent-tabs',
  '.rent-tab',
  '.rent-product-switcher',
  '.rent-product-switch',
  '.rent-more-grid',
  '.rent-dashboard-stats',
  '.rent-occupancy-row',
  '.rent-tenant-card',
  '.commercial-role-note',
  '.mobile-nav-item i'
]){
  assert.ok(
    rentalUiCssSource.includes(selector),
    'O acabamento visual integrado deve definir '+selector+'.'
  );
}
assert.match(styleSource,/grid-template-columns:repeat\(var\(--mobile-items/);
assert.match(indexSource,/href="aluguel-ui\.css"/);
assert.match(buildSource,/'aluguel-ui\.css'/);
assert.match(serviceWorkerSource,/\.\/aluguel-ui\.css/);

assert.doesNotMatch(appSource,/Clientes quentes/);
assert.doesNotMatch(authSource,/auth-plan-strip/);
assert.match(authSource,/account_type:authAccessType/);
assert.match(authSource,/Como você quer entrar\?/);
assert.doesNotMatch(commercialSource,/name="com_plan"|Planos mensais/);
assert.doesNotMatch(commercialSource,/renderCommercialSales\(sales\)\+renderPlatformAdmins\(\)/);
assert.match(migrationSource,/drop column if exists poco_agua/);
assert.match(migrationSource,/tema in \('original','aurora','oceano','citrico'\)/);
assert.match(commercialMigrationSource,/when 'premium' then 100 when 'basico' then 3 else 1/);
assert.match(commercialMigrationSource,/validar_limite_imoveis_trigger/);
assert.match(commercialMigrationSource,/owner_active_rows/);
assert.match(commercialMigrationSource,/importar_backup_atomico_v6/);
assert.match(commercialMigrationSource,/create table if not exists public\.acessos_colaborador/);
assert.match(commercialMigrationSource,/usuario_proprietario_id/);
assert.match(commercialMigrationSource,/listar_imoveis_publicos/);
assert.match(commercialMigrationSource,/public_listing_files_select/);
assert.match(accessMigrationSource,/if v_account_type='tenant' then return new/);
assert.match(accessMigrationSource,/Este e-mail pertence a um administrador em uso/);
assert.match(accessMigrationSource,/andertonaluguel@gmail\.com/);
assert.match(accessMigrationSource,/andertonunito@gmail\.com/);
assert.match(accessMigrationSource,/Este e-mail e reservado para uma conta Mestre/);
assert.match(accessMigrationSource,/then public\.usuario_proprietario_id\(auth\.uid\(\)\)/);

assert.match(separationMigrationSource,/\bbegin;/i);
assert.match(
  separationMigrationSource.trim(),
  /commit;\s*-- Fim da separacao definitiva entre inquilinos e clientes\.\s*$/i
);

const exclusivityNameMatch=/create\s+or\s+replace\s+function\s+public\.(validar_(?:papel_exclusivo|exclusividade_perfil_usuario))\s*\(\s*\)\s*returns\s+trigger/i.exec(separationMigrationSource);
assert.ok(exclusivityNameMatch,'A migração deve instalar o validador de papéis exclusivos.');
const exclusivityFunctionName=exclusivityNameMatch[1];
const exclusivityBlock=sqlFunctionBlock(separationMigrationSource,exclusivityFunctionName);
for(const table of ['proprietarios','assinaturas','acessos_inquilino','acessos_colaborador']){
  assert.match(
    exclusivityBlock,
    new RegExp("(?:public\\."+table+"|tg_table_name\\s*=\\s*'"+table+"'|'"+table+"')",'i')
  );
  assert.match(
    separationMigrationSource,
    new RegExp(
      'before\\s+insert\\s+or\\s+update(?:\\s+of\\s+user_id)?\\s+on\\s+public\\.'+table+
      '[\\s\\S]{0,240}execute\\s+function\\s+public\\.'+exclusivityFunctionName+'\\s*\\(',
      'i'
    ),
    'O papel em '+table+' deve passar pelo validador exclusivo.'
  );
}
assert.match(exclusivityBlock,/raise\s+exception/i);
assert.match(exclusivityBlock,/pg_advisory_xact_lock/i);

const ownerResolutionCompact=compactSql(
  sqlFunctionBlock(separationMigrationSource,'usuario_proprietario_id')
);
const tenantFailClosedIndex=ownerResolutionCompact.indexOf(
  'from public.acessos_inquilino a where a.user_id=p_user_id'
);
const directOwnerIndex=ownerResolutionCompact.indexOf(
  'from public.proprietarios p where p.user_id=p_user_id'
);
assert.ok(
  tenantFailClosedIndex>=0&&directOwnerIndex>tenantFailClosedIndex,
  'O acesso de inquilino deve ser negado antes de mapear um proprietário.'
);
assert.match(
  ownerResolutionCompact,
  /when exists\( select 1 from public\.acessos_inquilino[\s\S]*?then null::uuid/
);
assert.match(ownerResolutionCompact,/else null::uuid/);

const currentCommercialAccessCompact=compactSql(
  sqlFunctionBlock(separationMigrationSource,'acesso_comercial_atual')
);
assert.match(
  currentCommercialAccessCompact,
  /'plano', case when s\.owner_id is null then null else a\.plano end/
);
assert.match(
  currentCommercialAccessCompact,
  /'limitecasas', case[\s\S]*?when s\.owner_id is null then 0/
);

const tenantReservationBlock=sqlFunctionBlock(
  separationMigrationSource,
  'email_reservado_inquilino'
);
assert.match(tenantReservationBlock,/public\.convites_inquilino/i);
assert.match(tenantReservationBlock,/public\.acessos_inquilino/i);
assert.match(tenantReservationBlock,/raw_user_meta_data[\s\S]*account_type[\s\S]*tenant/i);
assert.doesNotMatch(
  tenantReservationBlock,
  /\ba\.ativo\b|\bc\.status\b/i,
  'Inquilinos suspensos e convites ainda pendentes também devem bloquear uma venda.'
);

const activateOwnerCompact=compactSql(
  sqlFunctionBlock(separationMigrationSource,'ativar_convite_proprietario')
);
assert.ok(
  activateOwnerCompact.indexOf('public.email_reservado_inquilino(v_user_email)')>=0&&
    activateOwnerCompact.indexOf('public.email_reservado_inquilino(v_user_email)')<
      activateOwnerCompact.indexOf('insert into public.proprietarios'),
  'A ativação comercial deve rejeitar inquilino antes de criar proprietário.'
);
assert.match(activateOwnerCompact,/public\.email_reservado_colaborador\(v_user_email\)/);

const createSaleCompact=compactSql(
  sqlFunctionBlock(separationMigrationSource,'criar_venda_cliente')
);
assert.ok(
  createSaleCompact.indexOf('public.email_reservado_inquilino(v_email)')>=0&&
    createSaleCompact.indexOf('public.email_reservado_inquilino(v_email)')<
      createSaleCompact.indexOf('insert into public.convites_proprietario'),
  'Uma nova venda deve rejeitar todo e-mail já reservado para inquilino.'
);
assert.match(createSaleCompact,/public\.email_reservado_colaborador\(v_email\)/);

const createStaffInviteCompact=compactSql(
  sqlFunctionBlock(separationMigrationSource,'criar_convite_colaborador')
);
assert.ok(
  createStaffInviteCompact.indexOf('public.email_reservado_inquilino(v_email)')>=0&&
    createStaffInviteCompact.indexOf('public.email_reservado_inquilino(v_email)')<
      createStaffInviteCompact.indexOf('insert into public.convites_colaborador'),
  'Um convite de administrador da equipe também deve rejeitar e-mail de inquilino.'
);

const updateCommercialCompact=compactSql(
  sqlFunctionBlock(separationMigrationSource,'atualizar_cliente_comercial')
);
assert.match(updateCommercialCompact,/public\.email_reservado_inquilino\(v_email\)/);
assert.match(updateCommercialCompact,/from public\.acessos_inquilino/);
assert.match(updateCommercialCompact,/public\.email_reservado_colaborador\(v_email\)/);
assert.match(updateCommercialCompact,/from public\.acessos_colaborador/);

const listCommercialCompact=compactSql(
  sqlFunctionBlock(separationMigrationSource,'listar_clientes_comerciais')
);
assert.match(listCommercialCompact,/not exists\( select 1 from public\.acessos_inquilino/);
assert.match(listCommercialCompact,/not exists\( select 1 from public\.acessos_colaborador/);
assert.match(listCommercialCompact,/raw_user_meta_data->>'account_type'[\s\S]*<>'tenant'/);

const newUserCompact=compactSql(
  sqlFunctionBlock(separationMigrationSource,'processar_novo_usuario_aluguel')
);
const masterPriorityIndex=newUserCompact.indexOf('if lower(new.email)=any');
const tenantInvitePriorityIndex=newUserCompact.indexOf('insert into public.acessos_inquilino');
const ownerInvitePriorityIndex=newUserCompact.indexOf('perform public.ativar_convite_proprietario');
const staffInvitePriorityIndex=newUserCompact.indexOf('insert into public.acessos_colaborador');
const pendingTenantPriorityIndex=newUserCompact.indexOf("if v_account_type='tenant' then");
const freeOwnerPriorityIndex=newUserCompact.lastIndexOf('insert into public.proprietarios');
const freePlanPriorityIndex=newUserCompact.lastIndexOf('insert into public.assinaturas');
assert.ok(
  masterPriorityIndex>=0&&
    masterPriorityIndex<tenantInvitePriorityIndex&&
    tenantInvitePriorityIndex<ownerInvitePriorityIndex&&
    ownerInvitePriorityIndex<staffInvitePriorityIndex&&
    staffInvitePriorityIndex<pendingTenantPriorityIndex&&
    pendingTenantPriorityIndex<freeOwnerPriorityIndex&&
    freeOwnerPriorityIndex<freePlanPriorityIndex,
  'A prioridade deve ser Mestre > Inquilino > Cliente proprietário > Administrador da equipe > pendente > Gratuito.'
);
const pendingTenantEnd=newUserCompact.indexOf('end if;',pendingTenantPriorityIndex);
const pendingTenantBranch=newUserCompact.slice(
  pendingTenantPriorityIndex,
  pendingTenantEnd+'end if;'.length
);
assert.match(pendingTenantBranch,/return new/);
assert.doesNotMatch(pendingTenantBranch,/insert into public\.(?:proprietarios|assinaturas)/);
assert.match(newUserCompact,/if v_total>1 then raise exception/);

const repairTag='$reparo_gabriel_nicolas$';
const repairStart=separationMigrationSource.indexOf('do '+repairTag);
const repairEnd=separationMigrationSource.indexOf(
  repairTag+';',
  repairStart+repairTag.length
);
assert.ok(repairStart>=0&&repairEnd>repairStart,'O reparo protegido de Gabriel/Nicolas deve existir.');
const targetRepairSource=separationMigrationSource.slice(
  repairStart,
  repairEnd+repairTag.length+1
);
assert.match(targetRepairSource,/gabrielsousa__@outlook\.com/i);
assert.match(targetRepairSource,/conta_proprietaria_gratuita_vazia/i);
assert.match(targetRepairSource,/delete\s+from\s+public\.assinaturas/i);
assert.match(targetRepairSource,/delete\s+from\s+public\.proprietarios/i);
assert.doesNotMatch(
  targetRepairSource,
  /delete\s+from\s+(?:auth\.users|public\.inquilinos|public\.acessos_inquilino)/i
);
assert.match(targetRepairSource,/update\s+public\.inquilinos/i);
assert.match(targetRepairSource,/insert\s+into\s+public\.convites_inquilino/i);
assert.match(targetRepairSource,/insert\s+into\s+public\.acessos_inquilino/i);
assert.match(targetRepairSource,/on\s+conflict/i);
assert.match(targetRepairSource,/raw_user_meta_data[\s\S]*account_type[\s\S]*tenant/i);
assert.match(targetRepairSource,/public\.auditoria_comercial/i);

const backupGuardCompact=compactSql(
  sqlFunctionBlock(separationMigrationSource,'backup_possui_dados_operacionais')
);
assert.match(backupGuardCompact,/p_dados is null/);
assert.match(backupGuardCompact,/jsonb_typeof\(p_dados\)<>'object'/);
for(const backupCollection of [
  'houses','tenants','contracts','payments','energy','expenses','history',
  'adjustments','interests','eventos','events','photos','documents'
]){
  assert.ok(
    backupGuardCompact.includes("'"+backupCollection+"'"),
    'O reparo deve reconhecer a coleção de backup '+backupCollection+'.'
  );
}
assert.match(backupGuardCompact,/jsonb_typeof\(p_dados->colecao\.chave\)<>'array'/);
assert.match(backupGuardCompact,/jsonb_typeof\(p_dados->mapa\.chave\)<>'object'/);
const targetRepairCompact=compactSql(targetRepairSource);
const emptyBackupDeleteIndex=targetRepairCompact.indexOf('delete from public.backups');
const subscriptionDeleteIndex=targetRepairCompact.indexOf('delete from public.assinaturas');
assert.ok(
  emptyBackupDeleteIndex>=0&&emptyBackupDeleteIndex<subscriptionDeleteIndex,
  'Somente snapshots comprovadamente vazios devem ser removidos antes do perfil Gratuito.'
);
assert.match(
  targetRepairCompact,
  /delete from public\.backups b where b\.user_id=v_auth_user and not public\.backup_possui_dados_operacionais\(b\.dados\)/
);

assert.match(
  separationMigrationSource,
  /join\s+public\.acessos_inquilino[\s\S]*raise\s+exception[\s\S]*join\s+public\.acessos_colaborador/i
);
assert.match(configSource,/MASTER_EMAILS:\s*\['andertonaluguel@gmail\.com','andertonunito@gmail\.com'\]/);
assert.match(appSource,/E-mail protegido/);
assert.match(appSource,/O e-mail da conta Mestre é protegido/);
assert.ok(
  supabaseSource.indexOf('if(commercial.administradorPlataforma)') <
    supabaseSource.indexOf('const roleResults=await Promise.all'),
  'A conta Mestre deve ser reconhecida antes da resolução exclusiva dos demais papéis.'
);
assert.match(supabaseSource,/assignedRoles>1/);
assert.match(supabaseSource,/conflict\.code='ROLE_CONFLICT'/);
assert.match(appSource,/state\.view==='minhaCasa'/);
/* Minha Casa deixou de ser exclusiva do Mestre: agora é um módulo
   vendável, e o acesso passa pela licença da conta. */
assert.match(appSource,/Esta conta não possui o módulo Minha Casa/);
assert.match(appSource,/resetMinhaCasaUI/);
assert.match(indexSource,/minha-casa\.css/);
assert.match(indexSource,/minha-casa\.js/);
assert.match(buildSource,/'minha-casa\.css'/);
assert.match(buildSource,/'minha-casa\.js'/);
assert.match(serviceWorkerSource,/\.\/minha-casa\.css/);
assert.match(serviceWorkerSource,/\.\/minha-casa\.js/);
assert.match(myHomeSource,/max="28"/);
assert.match(myHomeSource,/A confirmar/);
assert.match(myHomeSource,/R\$ ••••/);
/* A paleta --mh-* saiu de minha-casa.css para tokens.css em
   2026-07-27. O lima segue sendo a cor do módulo; mudou o endereço. */
assert.match(tokensCssSource,/--mh-lime:#E7F77B/);
assert.match(myHomeMigrationSource,/create policy minha_casa_so_mestre/);
assert.match(myHomeMigrationSource,/p\.data_pagamento between v_ativacao and v_ate/);
assert.match(myHomeMigrationSource,/e\.data_pagamento between v_ativacao and v_ate/);
assert.match(myHomeMigrationSource,/minha_casa_aceitar_sugestao/);
assert.match(myHomeMigrationSource,/minha_casa_ignorar_sugestao/);
assert.match(myHomeMigrationSource,/dia_mes between 1 and 28/);
assert.match(myHomeMigrationSource,/check\(tipo in \('entrada','saida','ambos'\)\)/);
assert.match(myHomeMigrationSource,/o\.data_vencimento>=greatest\(o\.conta_inicio,v_ativacao\)/);
assert.match(myHomeMigrationSource.trim(),/commit;\s*-- Fim da migracao Minha Casa\.$/);
assert.match(contractRemovalMigrationSource,/prever_exclusao_contrato/);
assert.match(contractRemovalMigrationSource,/excluir_contrato_por_engano/);
assert.match(contractRemovalMigrationSource,/prever_exclusao_inquilino/);
assert.match(contractRemovalMigrationSource,/excluir_inquilino_por_engano/);
assert.match(contractRemovalMigrationSource,/Digite EXCLUIR/);
assert.match(contractRemovalMigrationSource,/create or replace function public\.iniciar_contrato_gestao/);
assert.match(contractRemovalMigrationSource,/s\.status='pendente'/);
assert.match(contractRemovalMigrationSource,/pendingSuggestionsDeleted/);
assert.match(supabaseSource,/async loadMyHome\(\)/);
assert.match(supabaseSource,/async previewContractRemoval\(contractId\)/);
assert.match(supabaseSource,/async deleteTenantMistake\(tenantId,confirmation\)/);

/* ============================================================
   MÓDULOS VENDÁVEIS, MULTI-FAMÍLIA E VITRINE
   ============================================================ */
const modulesMigrationSource = await readFile(join(root,'migracao-modulos.sql'),'utf8');
const multiFamilyMigrationSource = await readFile(join(root,'migracao-minha-casa-multifamilia.sql'),'utf8');
const vitrineMigrationSource = await readFile(join(root,'migracao-vitrine.sql'),'utf8');
const vitrineSource = await readFile(join(root,'vitrine.js'),'utf8');
const vitrineCssSource = await readFile(join(root,'vitrine.css'),'utf8');

/* --- Fase A: a licença de módulo --- */
assert.match(modulesMigrationSource,/create table if not exists public\.licencas_modulo/);
assert.match(modulesMigrationSource,/modulo in \('alugueis','minha_casa','vitrine'\)/);
/* e_mestre() vem primeiro: a conta Mestre nunca perde acesso. */
const temModuloBlock=sqlFunctionBlock(modulesMigrationSource,'tem_modulo');
assert.ok(
  compactSql(temModuloBlock).indexOf('e_mestre(p_user_id)') <
    compactSql(temModuloBlock).indexOf('licencas_modulo'),
  'tem_modulo deve liberar a conta Mestre antes de consultar a tabela.'
);
/* O funcionário herda a licença do patrão. */
assert.match(temModuloBlock,/usuario_proprietario_id\(p_user_id\)/);
/* Nenhuma conta ativa pode ficar sem o módulo Aluguéis. */
assert.match(modulesMigrationSource,/insert into public\.licencas_modulo[\s\S]{0,400}from public\.assinaturas a/);
assert.match(modulesMigrationSource,/MIGRACAO INCOMPLETA/);
/* O login passa a devolver os módulos, sem remover nada do que já existia. */
assert.match(modulesMigrationSource,/'modulos',public\.modulos_da_conta\(s\.uid\)/);
assert.match(modulesMigrationSource,/'limiteCasas'/);
assert.match(modulesMigrationSource,/'termosAceitos'/);
/* Só a conta Mestre concede módulo. */
assert.match(modulesMigrationSource,/Somente a conta Mestre pode conceder modulos/);

/* --- Fase B: Minha Casa deixa de ser preso ao e-mail --- */
assert.match(multiFamilyMigrationSource,/add column if not exists proprietario_id/);
/* A família existente ganha dono em vez de ser recriada: os dados ficam. */
assert.match(multiFamilyMigrationSource,/update public\.minha_casa_familias[\s\S]{0,300}familia-anderton/);
assert.doesNotMatch(multiFamilyMigrationSource,/drop table[\s\S]{0,40}minha_casa/i);
assert.doesNotMatch(multiFamilyMigrationSource,/delete from public\.minha_casa_lancamentos/i);
/* Trava de dados órfãos antes de qualquer coisa irreversível. */
assert.match(multiFamilyMigrationSource,/familia\(s\) sem dono/);
/* O resolvedor e o porteiro passam a olhar a licença, não o e-mail. */
const familiaAtualBlock=sqlFunctionBlock(multiFamilyMigrationSource,'minha_casa_familia_atual_id');
assert.match(familiaAtualBlock,/tem_modulo\('minha_casa'/);
assert.doesNotMatch(familiaAtualBlock,/e_mestre/);
const exigirBlock=sqlFunctionBlock(multiFamilyMigrationSource,'minha_casa_exigir_mestre');
assert.match(exigirBlock,/tem_modulo\('minha_casa'/);
assert.doesNotMatch(exigirBlock,/e_mestre/);
/* Uma família por conta, e conta nova ganha família própria. */
assert.match(multiFamilyMigrationSource,/create unique index if not exists minha_casa_familias_proprietario_idx/);
assert.match(multiFamilyMigrationSource,/create or replace function public\.minha_casa_criar_familia/);

/* --- Fase C: a Vitrine é separada do Financeiro --- */
assert.match(vitrineMigrationSource,/create table if not exists public\.vitrine_imoveis/);
assert.match(vitrineMigrationSource,/create table if not exists public\.vitrine_anunciantes/);
assert.match(vitrineMigrationSource,/create table if not exists public\.vitrine_leads/);
assert.match(vitrineMigrationSource,/create table if not exists public\.vitrine_taxas/);
/* NUNCA pode escrever na tabela de imóveis do módulo Aluguéis. */
assert.doesNotMatch(vitrineMigrationSource,/(insert into|update|delete from)\s+public\.imoveis/i);
assert.doesNotMatch(vitrineMigrationSource,/alter table public\.imoveis/i);
/* A leitura pública só devolve anúncio no ar e dentro do prazo da taxa. */
const publicaBlock=sqlFunctionBlock(vitrineMigrationSource,'listar_vitrine_publica');
assert.match(publicaBlock,/i\.status\s*=\s*'ativo'/);
assert.match(publicaBlock,/expira_em\s*>=\s*current_date/);
/* Dados do anunciante nunca vazam para a página pública. */
assert.doesNotMatch(publicaBlock,/vitrine_anunciantes/);
assert.doesNotMatch(publicaBlock,/documento/);
/* Escrita exige o módulo E acesso operacional (dono ou funcionário). */
const podeOperarBlock=sqlFunctionBlock(vitrineMigrationSource,'vitrine_pode_operar');
assert.match(podeOperarBlock,/tem_modulo\('vitrine'/);
assert.match(podeOperarBlock,/e_acesso_operacional/);
/* Lead exige consentimento e tem freio de spam. */
assert.match(vitrineMigrationSource,/E necessario autorizar o contato/);
assert.match(vitrineMigrationSource,/Muitos contatos seguidos/);
/* Anúncio vencido sai do ar sozinho. */
assert.match(vitrineMigrationSource,/create or replace function public\.vitrine_expirar_vencidos/);

/* --- Front-end dos módulos --- */
assert.match(configSource,/MODULOS:/);
assert.match(configSource,/VITRINE_TAXAS:/);
/* Retrocompatibilidade: sem a chave "modulos", o app não tranca ninguém. */
assert.match(appSource,/function modulosDaConta\(\)/);
assert.match(appSource,/legado:true/);
assert.match(appSource,/function viewInicial\(\)/);
assert.match(appSource,/function renderSemModulo\(\)/);
/* Comercial continua preso à conta Mestre: nunca é vendido. Agora ele
   aparece no grupo "Aplicativos" da barra lateral, ainda restrito ao
   administrador da plataforma. */
assert.match(appSource,/state\.isPlatformAdmin\) items\.push\(\['comercial'/);
assert.doesNotMatch(appSource,/temModulo\('comercial'\)/);

/* --- Parte 1: casca estrutural (barra lateral + cabeçalho enxuto) --- */
/* A barra lateral estrutural substitui o antigo switcher de produtos e o
   menu do topo; o cabeçalho fica só com a busca. */
assert.match(appSource,/function renderAppSidebar\(\)/);
assert.match(appSource,/class="app-sidebar/);
assert.match(appSource,/class="app-nav-item/);
assert.match(appSource,/<span class="app-nav-kicker">Aplicativos<\/span>/);
assert.doesNotMatch(appSource,/function renderTopBar\(/);
assert.doesNotMatch(appSource,/rent-product-switch/);
assert.match(rentalUiCssSource,/\.app-sidebar\{/);
assert.match(rentalUiCssSource,/\.app-nav-item\{/);
assert.match(rentalUiCssSource,/\.topbar\.app-topbar\{/);
/* Fim do piscar: a casca é reaproveitada e só o conteúdo central troca. */
assert.match(appSource,/function shellSignature\(\)/);
assert.match(appSource,/viewRoot\.innerHTML=renderMainContent/);
/* "Casas" virou "Imóveis" só no rótulo de navegação (Parte 1). */
assert.match(appSource,/\['casas','Imóveis','irCasas\(\)'/);
assert.doesNotMatch(appSource,/\['casas','Casas','irCasas\(\)'/);

/* Render real da barra lateral estrutural, em contexto isolado (a tela
   logada exige sessão; aqui validamos a montagem da casca por si só). */
const shellStart=appSource.indexOf('function currentAppKey(){');
const shellEnd=appSource.indexOf('\nfunction renderSemModulo(){',shellStart);
assert.ok(shellStart>=0&&shellEnd>shellStart,'Bloco da casca estrutural ausente em app.js.');
function makeShellContext(view,modulos,platformAdmin){
  const shellState={
    view:view,rentalSidebarCollapsed:false,isPlatformAdmin:!!platformAdmin,
    session:{user:{email:'dono@example.com'}},
    staffProfile:null,ownerProfile:{nome:'Ana Proprietária'},
    config:{locadorNome:'Ana'},houses:[{status:'alugada'},{status:'vaga'}],
    offlineMode:false
  };
  const mhui={currentTab:function(){return 'history';},pendingCount:function(){return 3;}};
  const ctx=vm.createContext({
    window:{MinhaCasaUI:mhui},
    MinhaCasaUI:mhui,
    state:shellState,
    CONFIG:{APP_NAME:'Aluguel'},
    modulosDaConta:function(){return modulos;},
    temModulo:function(n){return !!modulos[n];},
    isSimpleMode:function(){return false;},
    energyModuleEnabled:function(){return true;},
    rentalNavItems:function(){return [
      ['dashboard','Resumo','irHome()','&#8962;'],
      ['casas','Imóveis','irCasas()','&#9638;'],
      ['financeiro','Financeiro','irFinanceiro()','R$']
    ];},
    rentalNavActive:function(v){return shellState.view===v;},
    rentalNavOccupancy:function(){return {total:2,ocupadas:1,pct:50};},
    currentAccountTypeLabel:function(){return 'Proprietário';},
    logoSvg:function(){return '<svg></svg>';},
    esc:function(v){return String(v);}
  });
  vm.runInContext(appSource.slice(shellStart,shellEnd),ctx);
  return ctx;
}
const allMods={alugueis:true,minhaCasa:true,vitrine:true};
const rentSidebarCtx=makeShellContext('dashboard',allMods,true);
const rentSidebar=vm.runInContext('renderAppSidebar()',rentSidebarCtx);
assert.match(rentSidebar,/class="app-sidebar/);
assert.match(rentSidebar,/app-nav-kicker">Aplicativos/);
/* O app ativo usa uma classe própria (destaque dourado), distinta da
   página ativa (verde-limão): "trocar de app" ≠ "trocar de página". */
assert.match(rentSidebar,/class="app-nav-item is-app active"/);
assert.match(rentSidebar,/class="app-nav-group is-apps"/);
for(const app of ['Aluguéis','Minha Casa','Vitrine','Comercial'])
  assert.ok(rentSidebar.includes('>'+app+'</b>'),'A barra deve listar o app '+app);
assert.match(rentSidebar,/>Imóveis<\/b>/,'A página de imóveis usa "Imóveis", não "Casas".');
assert.match(rentSidebar,/app-sidebar-profile/);
assert.match(rentSidebar,/app-sidebar-toggle/);
assert.match(rentSidebar,/rental-sidebar-occupancy/,'A ocupação aparece em Aluguéis.');
const rentTopbar=vm.runInContext('renderTopbarClean()',rentSidebarCtx);
assert.match(rentTopbar,/top-search-btn/,'O cabeçalho de Aluguéis tem a busca geral.');
assert.doesNotMatch(rentTopbar,/topbar-apps/);

const homeSidebarCtx=makeShellContext('minhaCasa',allMods,false);
const homeSidebar=vm.runInContext('renderAppSidebar()',homeSidebarCtx);
for(const page of ['Resumo','Histórico','A confirmar','Contas fixas','Organizar'])
  assert.ok(homeSidebar.includes('>'+page+'</b>'),'Minha Casa deve listar a página '+page+' na barra.');
assert.doesNotMatch(homeSidebar,/rental-sidebar-occupancy/,'Ocupação é só de Aluguéis.');
assert.match(homeSidebar,/class="app-nav-item active"[^>]*data-label="Histórico"/,'A aba ativa da Minha Casa é destacada na barra.');
const homeTopbar=vm.runInContext('renderTopbarClean()',homeSidebarCtx);
assert.match(homeTopbar,/topbar-apps/,'Sem barra lateral no celular, os apps ficam acessíveis pelo cabeçalho.');
assert.doesNotMatch(homeTopbar,/top-search-btn/);

/* Permissões: só os aplicativos liberados aparecem no grupo. */
const onlyHomeCtx=makeShellContext('minhaCasa',{alugueis:false,minhaCasa:true,vitrine:false},false);
const onlyHomeSidebar=vm.runInContext('renderAppSidebar()',onlyHomeCtx);
assert.ok(onlyHomeSidebar.includes('>Minha Casa</b>'));
assert.doesNotMatch(onlyHomeSidebar,/>Aluguéis<\/b>/,'App não liberado não pode aparecer na barra.');
assert.doesNotMatch(onlyHomeSidebar,/>Vitrine<\/b>/);
assert.doesNotMatch(onlyHomeSidebar,/>Comercial<\/b>/);

/* --- Parte 2: tema Roxo + preferência de tema por usuário --- */
const tokensThemeSource=await readFile(join(root,'tokens.css'),'utf8');
assert.match(tokensThemeSource,/\[data-theme="roxo"\]\s*\{/,'tokens.css deve definir o tema Roxo.');
assert.match(tokensThemeSource,/\[data-theme="roxo"\]\s+\.rental-shell/,'Roxo deve recolorir também a casca dos Aluguéis (--rent-*).');
const temaUsuarioMigration=await readFile(join(root,'migracao-tema-usuario.sql'),'utf8');
assert.match(temaUsuarioMigration,/force row level security/i,'A preferência por usuário exige FORCE RLS.');
assert.match(temaUsuarioMigration,/tema in \('original','roxo'\)/);
assert.match(temaUsuarioMigration,/user_id = auth\.uid\(\)/,'RLS deve amarrar cada linha ao próprio usuário.');
assert.match(appSource,/function applyOwnerAppTheme\(/,'O app aplica o tema por usuário no login do proprietário.');
assert.match(appSource,/function setUserAppTheme\(/);
assert.match(appSource,/renderUserThemeSwitch\(\)/,'O menu do perfil mostra o seletor Padrão|Roxo.');
assert.match(appSource,/applyOwnerAppTheme\(\);/,'O carregamento do proprietário usa o tema por usuário.');

/* --- Parte 2B: cadastro de imóvel em 3 etapas + rename (reusa housesSource) --- */
assert.match(housesSource,/Novo imóvel/,'O cadastro vira "Novo imóvel".');
assert.doesNotMatch(housesSource,/Nova casa/,'Não deve sobrar "Nova casa".');
assert.doesNotMatch(housesSource,/Descrição da casa/);
assert.doesNotMatch(housesSource,/Publicar esta casa/);
assert.doesNotMatch(housesSource,/Editar casa/);
assert.match(housesSource,/Cadastrar imóvel/,'O passo final chama "Cadastrar imóvel".');
assert.match(housesSource,/>Identificação</);
assert.match(housesSource,/>Características</);
assert.match(housesSource,/>Serviços e divulgação</);
assert.match(housesSource,/id="f_tipo"/,'A Etapa 1 tem o tipo do imóvel.');
assert.match(housesSource,/function houseWizardNext\(/);
assert.match(housesSource,/function goHouseStep\(/);
const tipoMigration=await readFile(join(root,'migracao-imovel-tipo.sql'),'utf8');
assert.match(tipoMigration,/add column if not exists tipo/);
assert.match(tipoMigration,/tipo in \('casa','apartamento','comercial','quarto','outro'\)/);
const supabaseImovelSource=await readFile(join(root,'supabase.js'),'utf8');
assert.match(supabaseImovelSource,/_imovelTipoOff/,'O save de imóvel tolera a coluna tipo ausente.');
assert.match(supabaseImovelSource,/normalizeImovelTipo/);
assert.equal(vm.runInContext("normalizeImovelTipo('apartamento')",context),'apartamento');
assert.equal(vm.runInContext("normalizeImovelTipo('xyz')",context),'casa');
assert.equal(vm.runInContext('IMOVEL_TIPOS.length',context),5);

/* --- Parte 2C: novo/editar inquilino reorganizados + RG separado (reusa tenantsSource) --- */
assert.doesNotMatch(tenantsSource,/CPF\/RG/,'CPF e RG passam a ser campos separados.');
assert.match(tenantsSource,/id="f_rg"/,'Há campo de RG.');
assert.match(tenantsSource,/class="more-info"/,'Novo inquilino agrupa opcionais em "Mais informações".');
assert.match(tenantsSource,/function offerLinkNewTenant/,'Após cadastrar, oferece vincular a um imóvel.');
assert.match(tenantsSource,/Acesso ao Portal do Inquilino/);
assert.match(tenantsSource,/Zona de risco/);
assert.match(tenantsSource,/Salvar alterações/);
const rgMigration=await readFile(join(root,'migracao-inquilino-rg.sql'),'utf8');
assert.match(rgMigration,/add column if not exists rg/);
assert.match(supabaseImovelSource,/_inquilinoRgOff/,'O save de inquilino tolera a coluna rg ausente.');

/* --- Parte 3A: categorias entrada/saída + bandeja de emojis --- */
const mhSource=await readFile(join(root,'minha-casa.js'),'utf8');
assert.match(mhSource,/class="mh-emoji-tray"/,'Editar membro/categoria usa a bandeja de emojis.');
assert.match(mhSource,/MH_EMOJI_GROUPS/);
assert.match(mhSource,/emojiTrayHtml\('mh_member_emoji'/);
assert.match(mhSource,/emojiTrayHtml\('mh_category_emoji'/);
assert.match(mhSource,/function selectOrganizeCatTab/,'Organizar separa categorias por tipo.');
assert.match(mhSource,/Categorias de entrada/);
assert.match(mhSource,/Categorias de saída/);
const mhCss=await readFile(join(root,'minha-casa.css'),'utf8');
assert.match(mhCss,/\.mh-emoji-grid\{/);
assert.match(mhCss,/\.mh-cat-switch\{/);

/* --- Parte 3 (§12): personalizar o que aparece nos lançamentos --- */
/* "Editar opções" fica ao lado do título dos três blocos — e não como
   um cartão solto no meio das opções selecionáveis. */
assert.match(mhSource,/function blockHeading\(/);
assert.match(mhSource,/blockHeading\('Categoria','MinhaCasaUI\.openCategoryOptions\(\)'\)/);
assert.match(mhSource,/blockHeading\('Quem gastou ou recebeu','MinhaCasaUI\.openMemberOptions\(\)'\)/);
assert.match(mhSource,/blockHeading\('Forma de pagamento','MinhaCasaUI\.openPaymentOptions\(\)'\)/);
assert.match(mhSource,/Editar opções/);
/* Reaproveita o controle que já existia, em vez de criar outro campo. */
assert.match(mhSource,/saveMyHomeCategory[\s\S]{0,200}active:!item\.active/);
assert.match(mhSource,/saveMyHomeMember[\s\S]{0,200}active:!item\.active/);

const mhPay=vm.runInContext(`({
  set:window.MinhaCasaUI._setDisabledPayments,
  avail:window.MinhaCasaUI._availablePaymentMethods
})`,context);
mhPay.set(['boleto','credito']);
const formasNovas=mhPay.avail('').map(function(m){return m.id;});
assert.ok(!formasNovas.includes('boleto'),'Forma desativada some dos lançamentos NOVOS.');
assert.ok(!formasNovas.includes('credito'));
assert.ok(formasNovas.includes('pix')&&formasNovas.includes('dinheiro'));
/* A regra que protege o histórico: editar um lançamento antigo não pode
   trocar silenciosamente a forma que ele já usava. */
assert.ok(
  mhPay.avail('boleto').map(function(m){return m.id;}).includes('boleto'),
  'Lançamento antigo preserva a forma usada, mesmo desativada.'
);
mhPay.set([]);
assert.ok(
  mhPay.avail('').map(function(m){return m.id;}).includes('boleto'),
  'Reativar devolve a opção para todos os novos lançamentos.'
);
/* Nunca é possível ficar sem nenhuma forma de pagamento ativa. */
assert.match(mhSource,/Pelo menos uma forma de pagamento precisa continuar ativa/);
const formasMigration=await readFile(join(root,'migracao-minha-casa-formas-pagamento.sql'),'utf8');
assert.match(formasMigration,/force row level security/i);
assert.match(formasMigration,/minha_casa_familia_atual_id\(\)/,'A configuração vale para a família (conta e colaboradores).');
assert.match(formasMigration,/array_length\(formas_pagamento_inativas,1\) < 6/,'O banco também garante ao menos uma forma ativa.');
assert.match(supabaseImovelSource,/_myHomePayPrefsOff/,'Sem a migração aplicada, tudo segue ativo e sem erro.');

/* --- Parte 3 (§14): página de Manutenções --- */
assert.match(appSource,/function irManutencoes\(/);
assert.match(appSource,/\['manutencoes','Manutenções','irManutencoes\(\)'/);
assert.match(appSource,/state\.view==='manutencoes' \? renderManutencoesView\(\)/);
assert.match(maintenanceSource,/function renderManutencoesView\(/);
assert.match(maintenanceSource,/function archiveMaintenanceCall\(/);
assert.match(maintenanceSource,/function maintenanceDiffText\(/,'O histórico de alterações é derivado, sem tabela nova.');
const manutMigration=await readFile(join(root,'migracao-manutencoes.sql'),'utf8');
/* Expande a tabela existente em vez de criar estrutura paralela. */
assert.match(manutMigration,/alter table public\.chamados/);
assert.doesNotMatch(manutMigration,/create table if not exists public\.manutencoes/,'Não pode nascer uma tabela paralela de manutenções.');
for(const campo of ['prazo','responsavel','fornecedor','orcamento','custo_final','quem_paga',
  'observacoes','motivo_encerramento','arquivado_em','historico']){
  assert.ok(manutMigration.includes('add column if not exists '+campo),'Falta a coluna '+campo);
}
/* As situações antigas continuam válidas: nenhum registro é invalidado. */
assert.match(manutMigration,/'aguardando_peca'/);
assert.match(manutMigration,/'aguardando_orcamento','aprovado'/);
assert.match(supabaseSource,/_manutencaoCamposOff/,'Sem a migração, o chamado ainda salva.');

const manutApi=vm.runInContext(`({
  rows:renderMaintenanceRows,
  filtros:maintenanceFilters,
  limpar:limparManutFiltros,
  atrasada:maintenanceIsLate,
  aberta:maintenanceIsOpen
})`,context);
assert.equal(manutApi.aberta('aguardando_orcamento'),true);
assert.equal(manutApi.aberta('aprovado'),true);
assert.equal(manutApi.aberta('resolvido'),false);
assert.equal(manutApi.aberta('cancelado'),false);
assert.equal(manutApi.atrasada({status:'aberto',prazo:'2020-01-01'}),true);
assert.equal(manutApi.atrasada({status:'resolvido',prazo:'2020-01-01'}),false,'Manutenção concluída nunca fica "atrasada".');
assert.equal(manutApi.atrasada({status:'aberto',prazo:''}),false);

uiApi.setData([
  {id:'mh-a',nome:'Casa A',status:'vaga',contracts:[],energias:[],pagamentos:[],cobrancas:[],
   recebimentos:[],despesas:[],chamados:[
     {id:'call-open',titulo:'Pintura da sala',categoria:'pintura',prioridade:'alta',
      status:'aberto',createdAt:today+'T10:00:00Z',fornecedor:'Pinturas Silva'},
     {id:'call-done',titulo:'Troca de lâmpada',categoria:'eletrica',prioridade:'baixa',
      status:'resolvido',createdAt:today+'T09:00:00Z'},
     {id:'call-arq',titulo:'Serviço antigo',categoria:'outro',prioridade:'normal',
      status:'aberto',createdAt:today+'T08:00:00Z',arquivadoEm:today+'T12:00:00Z'}
   ]}
],[],[]);
vm.runInContext("state.manutFiltros={imovel:'',status:'',prioridade:'',busca:'',ordem:'situacao',arquivadas:false}",context);
const linhasAtivas=manutApi.rows();
assert.match(linhasAtivas,/Pintura da sala/);
assert.match(linhasAtivas,/Troca de lâmpada/);
assert.doesNotMatch(linhasAtivas,/Serviço antigo/,'Arquivada não aparece na lista ativa.');
/* Arquivamento recuperável: o registro continua existindo e volta a ser
   listado ao pedir as arquivadas. */
vm.runInContext("state.manutFiltros.arquivadas=true",context);
assert.match(manutApi.rows(),/Serviço antigo/,'A arquivada é recuperável e continua consultável.');
vm.runInContext("state.manutFiltros.arquivadas=false;state.manutFiltros.busca='pinturas'",context);
const busca=manutApi.rows();
assert.match(busca,/Pintura da sala/,'A busca encontra pelo fornecedor.');
assert.doesNotMatch(busca,/Troca de lâmpada/);
vm.runInContext("state.manutFiltros.busca='';state.manutFiltros.status='resolvido'",context);
assert.doesNotMatch(manutApi.rows(),/Pintura da sala/,'O filtro por situação isola a situação escolhida.');
vm.runInContext("state.manutFiltros={imovel:'',status:'',prioridade:'',busca:'',ordem:'situacao',arquivadas:false}",context);

/* Integração com a Central de Pendências: aberta entra, concluída sai,
   e a arquivada não vira pendência. */
const pendManut=vm.runInContext('computePendencias()',context)
  .filter(function(p){return p.tipo==='manutencao';});
assert.equal(pendManut.length,1,'Só a manutenção aberta e não arquivada vira pendência.');
assert.match(pendManut[0].motivo,/Aberta/);
assert.match(pendManut[0].acaoJs,/openMaintenanceModal/,'A pendência leva ao registro de origem.');

/* --- Parte 3B: Central de Pendências (calculada, nunca armazenada) --- */
const pendingSource=await readFile(join(root,'pending.js'),'utf8');
/* Nenhuma pendência pode ser gravada: se aparecer escrita no banco, a
   regra "some quando a causa é resolvida" deixa de valer sozinha. */
assert.doesNotMatch(pendingSource,/db\.(insert|update|save|delete)/,'Pendência é calculada, nunca persistida.');
assert.doesNotMatch(pendingSource,/await |async function/,'O cálculo é síncrono sobre os dados já carregados.');
/* A página é real e está publicada/cacheada como os demais módulos. */
assert.match(indexSource,/src="pending\.js"/);
assert.match(buildSource,/'pending\.js'/);
assert.match(serviceWorkerSource,/\.\/pending\.js/);
assert.match(appSource,/function irPendencias\(/);
assert.match(appSource,/\['pendencias','Pendências','irPendencias\(\)'/);
assert.match(appSource,/state\.view==='pendencias' \? renderPendenciasView\(\)/);

const pendApi=vm.runInContext(`({
  compute:computePendencias,
  filtrar:pendenciasFiltradas
})`,context);
const pendContract={id:'pend-contract',inicio:previousMonth+'-01',fim:'',ativo:true,valor:1100,
  diaVencimento:1,modalidade:'entrada',proporcionalValor:0,proporcionalPago:false};
function pendHouseBase(over){
  return Object.assign({
    id:'pend-house',nome:'Casa pendência',endereco:'Rua teste',status:'alugada',tenantId:'tenant-test',
    diaVencimento:1,aluguelValor:1100,aluguelHistorico:[],despesas:[],statusHistorico:[],
    energias:[],pagamentos:[],cobrancas:[],recebimentos:[],chamados:[],
    contracts:[pendContract]
  },over||{});
}
vm.runInContext("state.pendFiltros={tipo:'',prioridade:'',imovel:'',situacao:''}",context);
uiApi.setData([
  pendHouseBase(),
  pendHouseBase({id:'pend-parado',nome:'Casa parada',status:'manutencao',tenantId:'',contracts:[]}),
  pendHouseBase({id:'pend-manut',nome:'Casa com chamado',chamados:[{
    id:'chamado-aberto',titulo:'Vazamento na pia',categoria:'hidraulica',
    prioridade:'urgente',status:'aberto',createdAt:today+'T09:00:00Z'
  }]})
],[overdueTenant],[]);
const pendencias=pendApi.compute();
const tipos=pendencias.map(function(p){return p.tipo;});
assert.ok(tipos.includes('pagamento'),'Aluguel vencido vira pendência de pagamento.');
assert.ok(tipos.includes('energia'),'Energia do mês não lançada vira pendência.');
assert.ok(tipos.includes('manutencao'),'Chamado aberto vira pendência de manutenção.');
assert.ok(tipos.includes('imovel'),'Imóvel parado em manutenção aparece na central.');
const atrasoPend=pendencias.find(function(p){return p.tipo==='pagamento';});
assert.equal(atrasoPend.situacao,'atrasado');
assert.equal(atrasoPend.prioridade,'alta');
assert.ok(atrasoPend.acaoJs,'Toda pendência leva ao registro de origem.');
assert.ok(atrasoPend.valor>0,'A cobrança em aberto mostra o valor.');

/* A REGRA CENTRAL: resolvida a causa real, a pendência some sozinha —
   sem ninguém precisar "dar baixa" nela. */
uiApi.setData([pendHouseBase({id:'pend-manut',nome:'Casa com chamado',chamados:[{
  id:'chamado-aberto',titulo:'Vazamento na pia',categoria:'hidraulica',
  prioridade:'urgente',status:'resolvido',createdAt:today+'T09:00:00Z'
}]})],[overdueTenant],[]);
assert.equal(
  pendApi.compute().filter(function(p){return p.tipo==='manutencao';}).length,
  0,
  'Manutenção concluída deixa de ser pendência automaticamente.'
);
/* Energia lançada no mês também encerra a pendência correspondente. */
uiApi.setData([pendHouseBase({energias:[{
  id:'energia-mes',mes:currentMonth,contractId:'pend-contract',valor:120,kwh:90,
  leituraAnterior:100,leituraAtual:190
}]})],[overdueTenant],[]);
assert.equal(
  pendApi.compute().filter(function(p){return p.tipo==='energia';}).length,
  0,
  'Leitura lançada encerra a pendência de energia.'
);

/* Filtros de tela. */
uiApi.setData([pendHouseBase(),pendHouseBase({id:'pend-parado',nome:'Casa parada',status:'manutencao',tenantId:'',contracts:[]})],[overdueTenant],[]);
vm.runInContext("state.pendFiltros={tipo:'imovel',prioridade:'',imovel:'',situacao:''}",context);
const somenteImovel=pendApi.filtrar();
assert.ok(somenteImovel.length>0);
assert.ok(somenteImovel.every(function(p){return p.tipo==='imovel';}),'O filtro por tipo isola o tipo escolhido.');
vm.runInContext("state.pendFiltros={tipo:'',prioridade:'',imovel:'pend-parado',situacao:''}",context);
assert.ok(pendApi.filtrar().every(function(p){return p.houseId==='pend-parado';}),'O filtro por imóvel isola o imóvel.');
vm.runInContext("state.pendFiltros={tipo:'',prioridade:'',imovel:'',situacao:''}",context);

/* --- Front-end da Vitrine --- */
assert.match(vitrineSource,/function renderVitrineView\(\)/);
assert.match(vitrineSource,/function renderVitrinePublicaPage\(\)/);
assert.match(vitrineSource,/async function bootVitrinePublica/);
/* O código do imóvel vai junto na mensagem do WhatsApp. */
assert.match(vitrineSource,/Vi o imóvel #'\+i\.codigo/);
/* Pino no endereço exato (decisão 3), sem círculo aproximado. */
assert.match(vitrineSource,/L\.marker\(\[i\.latitude,i\.longitude\]\)/);
assert.doesNotMatch(vitrineSource,/L\.circle/);
/* Os filtros vão para a URL, para mandar link já filtrado. */
assert.match(vitrineSource,/function gravarFiltrosNaUrl\(novaEntrada\)/);
/* Filtrar usa replaceState; abrir imóvel e trocar de cidade usam
   pushState, senão o Voltar do navegador joga a pessoa para fora do
   site em vez de devolvê-la à lista. */
assert.match(vitrineSource,/history\.pushState\(\{vitrine:true\}/);
assert.match(vitrineSource,/addEventListener\('popstate'/);
/* A vitrine pública não segue o tema do proprietário: é a sua marca. */
assert.match(vitrineSource,/applyAppTheme\('original'\)/);
/* Nenhuma cor inventada: a aba usa o dourado que já existe. */
assert.match(vitrineCssSource,/\.rent-product-switch\.vitrine/);
/* O cabecalho tem que ser FILHO DIRETO de .rental-app: o estilo dele usa
   o seletor `.rental-app > .page-header`. Um <section> em volta tirava o
   arredondamento e o respiro que as outras abas tem. */
assert.doesNotMatch(vitrineSource,/<section class="vitrine-page">/);
assert.match(vitrineSource,/<div class="page-header vitrine-header">/);
/* As doze areas da Vitrine sairam das abas horizontais — quebravam em
   duas linhas — e foram para a barra lateral do app, como as outras
   areas. A navegacao horizontal nao pode voltar por descuido. */
assert.doesNotMatch(vitrineSource,/<nav class="rent-tabs vitrine-nav"/,
  'As areas da Vitrine ficam na barra lateral, nao em abas horizontais.');
assert.match(vitrineSource,/function vitrineNavItems\(\)/,
  'A barra lateral precisa da lista de areas da Vitrine.');
assert.match(appSource,/appKey==='vitrine'&&typeof vitrineNavItems==='function'/,
  'sidebarPageGroup precisa montar as areas da Vitrine.');
/* Cada area precisa continuar alcancavel: a lista da barra tem de
   cobrir todas as abas que renderVitrineView sabe desenhar. */
['painel','anuncios','cidades','anunciantes','leads','parceiros','crm',
 'retencao','visitas','qualidade','taxas','divulgacao'].forEach(function(area){
  assert.ok(vitrineSource.includes("['"+area+"',"),
    'A area '+area+' precisa estar na barra lateral da Vitrine.');
});
/* Nada de recriar componente que ja existe. */
assert.doesNotMatch(vitrineCssSource,/\.vitrine-tabs\{/);

/* --- Site da corretora: cidades, alugar/vender e terreno --- */
assert.match(vitrineSource,/\['terreno','Terreno'\]/,'Terreno entra como tipo.');
assert.match(vitrineSource,/function vitrineEhTerreno\(/);
assert.match(vitrineSource,/VITRINE_FINALIDADES/);
assert.match(vitrineSource,/function renderVitrineCidadesPublicas\(/,'A entrada do site é por cidade.');
assert.match(vitrineSource,/function escolherVitrineCidade\(/);
assert.match(vitrineSource,/function setVitrinePubFinalidade\(/,'Alugar e Comprar são abas separadas.');
assert.match(vitrineSource,/function renderVitrineCidades\(/,'Há cadastro de cidades na área interna.');
assert.match(vitrineCssSource,/\.vitrine-cidades-grid\{/);
assert.match(vitrineCssSource,/\.vitrine-finalidade\{/);
const corretoraMigration=await readFile(join(root,'migracao-vitrine-corretora.sql'),'utf8');
assert.match(corretoraMigration,/create table if not exists public\.vitrine_cidades/);
assert.match(corretoraMigration,/force row level security/i,'A tabela de cidades precisa de FORCE RLS.');
assert.match(corretoraMigration,/finalidade in \('alugar','vender','ambos'\)/);
assert.match(corretoraMigration,/'casa','apartamento','kitnet','sobrado','comercial','terreno'/);
assert.match(corretoraMigration,/add column if not exists preco_venda/);
/* Anúncio deixa de vencer: a rotina de expirar vira inofensiva. */
assert.match(corretoraMigration,/create or replace function public\.vitrine_expirar_vencidos/);
assert.doesNotMatch(corretoraMigration,/unaccent_imune/,'Não pode sobrar função inventada no SQL.');
/* As cidades da região são semeadas com a grafia correta. */
for(const cidade of ['Lajedo','Jupi','Calçado','São Bento do Una','Ibirajuba']){
  assert.ok(corretoraMigration.includes("'"+cidade+"'"),'Falta semear a cidade '+cidade);
}

const vitApi=vm.runInContext(`({
  slug:vitrineCidadeSlug
})`,context);
assert.equal(vitApi.slug('Calçado'),'calcado');
assert.equal(vitApi.slug('São Bento do Una'),'sao-bento-do-una');
assert.equal(vitApi.slug('Ibirajuba'),'ibirajuba');

/* --- Bloco 1: a venda tem de valer também na página de detalhe ---
   A Vitrine não estava carregada no contexto: carregamos aqui, com o
   estado que a página pública usa, para exercitar o render de verdade. */
vm.runInContext(`
  state.vitrine={anunciantes:[],imoveis:[],leads:[],taxas:[],cidades:[],carregado:true};
  state.vitrineFiltros={busca:'',tipo:'',quartos:0,faixa:'',bairro:'',ordem:'destaque',extras:[]};
  state.vitrinePublic={perfil:null,imoveis:[],cidades:[]};
  state.vitrinePubCidade='';
  state.vitrinePubFinalidade='alugar';
  state.vitrineDetalheId=null;
  state.vitrineTab='painel';
  if(typeof houseIconSvg!=='function') globalThis.houseIconSvg=function(){return '<svg></svg>';};
  if(typeof vitrineIconSvg!=='function') globalThis.vitrineIconSvg=function(){return '<svg></svg>';};
  if(typeof pageTitleWithIcon!=='function') globalThis.pageTitleWithIcon=function(a,b){return '<h1>'+b+'</h1>';};
  if(typeof showToast!=='function') globalThis.showToast=function(){};
  if(typeof openModal!=='function') globalThis.openModal=function(){};
  if(typeof closeModal!=='function') globalThis.closeModal=function(){};
  if(typeof render!=='function') globalThis.render=function(){};
  if(typeof fmtDateBR!=='function') globalThis.fmtDateBR=function(v){return String(v||'');};
`,context);
vm.runInContext(vitrineSource,context,{filename:'vitrine.js'});

const vitDet=vm.runInContext(`({
  detalhe:renderVitrineDetalhe,
  faixas:vitrineFaixasPreco,
  setFinalidade:function(f){state.vitrinePubFinalidade=f;}
})`,context);
const perfilFake={nome:'Corretora',contato:'11999990000'};
const baseAnuncio={
  id:'v1',codigo:'A-1',titulo:'Casa boa',tipo:'casa',fotoUrls:[],
  quartos:3,banheiros:2,vagas:1,areaM2:120,aluguel:0,condominio:0,iptu:0,
  precoVenda:180000,finalidade:'vender',caucao:'',contratoMinimoMeses:12,
  bairro:'Centro',cidade:'Lajedo',descricao:'',pontosInteresse:[]
};
vitDet.setFinalidade('vender');
const htmlVenda=vitDet.detalhe(baseAnuncio,perfilFake);
assert.match(htmlVenda,/VALOR DE VENDA/,'Anúncio de venda mostra o valor de venda no destaque.');
assert.doesNotMatch(htmlVenda,/VALOR DO ALUGUEL/,'Anúncio só de venda não pode falar em aluguel.');
assert.doesNotMatch(htmlVenda,/Quanto custa por mês/,'Custo mensal não se aplica a um anúncio de venda.');
assert.doesNotMatch(htmlVenda,/Regras da locação/,'Regras de locação não se aplicam a um anúncio de venda.');
assert.match(htmlVenda,/À VENDA/);

/* O bug original: aluguel zerado exibido como "R$ 0,00 / mês". */
assert.doesNotMatch(htmlVenda,/R\$\s*0,00\s*<small>\s*\/ mês/,'Nunca mostrar R$ 0,00 por mês num anúncio de venda.');

const htmlAluguel=vitDet.detalhe(Object.assign({},baseAnuncio,{
  finalidade:'alugar',aluguel:1100,precoVenda:0
}),perfilFake);
assert.match(htmlAluguel,/VALOR DO ALUGUEL/);
assert.match(htmlAluguel,/Quanto custa por mês/);
assert.match(htmlAluguel,/Regras da locação/);
assert.match(htmlAluguel,/PARA ALUGAR/);

/* Imóvel que serve aos dois fins mostra os dois preços. */
const htmlAmbos=vitDet.detalhe(Object.assign({},baseAnuncio,{
  finalidade:'ambos',aluguel:1100,precoVenda:180000
}),perfilFake);
assert.match(htmlAmbos,/VALOR DO ALUGUEL/);
assert.match(htmlAmbos,/VALOR DE VENDA/);
assert.match(htmlAmbos,/ALUGAR OU COMPRAR/);

/* Terreno: área e dimensões no lugar de quartos e banheiros. */
const htmlTerreno=vitDet.detalhe(Object.assign({},baseAnuncio,{
  tipo:'terreno',finalidade:'vender',areaM2:250,frenteM:10,fundoM:25,
  murado:true,esquina:true,topografia:'plano'
}),perfilFake);
assert.match(htmlTerreno,/O que o terreno tem/);
assert.match(htmlTerreno,/10×25/);
assert.match(htmlTerreno,/Plano/);
assert.doesNotMatch(htmlTerreno,/quartos<\/span>/,'Terreno não mostra quartos.');
assert.doesNotMatch(htmlTerreno,/aceita pet/,'Terreno não mostra "aceita pet".');

/* Faixa de preço acompanha a aba: era o filtro que jogava todo imóvel
   à venda no mesmo balde "acima de R$ 2.000". */
vitDet.setFinalidade('vender');
const faixasVenda=vitDet.faixas().map(function(o){return o[1];}).join(' ');
assert.match(faixasVenda,/50 mil/);
assert.match(faixasVenda,/200 mil/);
vitDet.setFinalidade('alugar');
const faixasAluguel=vitDet.faixas().map(function(o){return o[1];}).join(' ');
assert.match(faixasAluguel,/R\$ 800/);
assert.doesNotMatch(faixasAluguel,/mil/);
assert.doesNotMatch(vitrineSource,/IMÓVEIS PARA ALUGAR/,'O cabeçalho do site não pode ser só de aluguel.');

/* --- Bloco 3: contexto do lead, busca, parecidos --- */
assert.match(vitrineSource,/function vitrineMensagemComContexto\(/,'O lead precisa dizer de onde veio.');
assert.match(vitrineSource,/Quer comprar.*Quer alugar|Quer comprar/,'O lead diz se a pessoa quer alugar ou comprar.');
assert.match(vitrineSource,/function vitrineParecidos\(/);
assert.match(vitrineSource,/\+' '\+\(i\.cidade\|\|''\)/,'A busca considera a cidade.');
/* Desde os filtros finos, terreno zera também banheiros e vagas —
   a asserção completa está no bloco dos filtros finos, mais abaixo. */
assert.match(vitrineSource,/campo==='tipo'&&valor==='terreno'\)\{ f\.quartos=0/,
  'Trocar para terreno tem de zerar o filtro de quartos escondido.');

const ctxLead=vm.runInContext(`(function(){
  state.vitrinePublic={perfil:{},cidades:[],imoveis:[
    {id:'x1',codigo:'A-9',titulo:'Casa',cidade:'Lajedo',cidadeId:'c1',tipo:'casa',
     finalidade:'ambos',aluguel:900,precoVenda:150000,fotoUrls:[],bairro:'Centro'},
    {id:'x2',codigo:'A-8',titulo:'Casa vizinha',cidade:'Lajedo',cidadeId:'c1',tipo:'casa',
     finalidade:'ambos',aluguel:950,precoVenda:160000,fotoUrls:[],bairro:'Centro'},
    {id:'x3',codigo:'T-1',titulo:'Terreno',cidade:'Jupi',cidadeId:'c2',tipo:'terreno',
     finalidade:'vender',aluguel:0,precoVenda:60000,fotoUrls:[],bairro:''}
  ]};
  state.vitrinePubFinalidade='vender';
  return {
    msg:vitrineMensagemComContexto('x1','Posso visitar sábado?'),
    msgVazia:vitrineMensagemComContexto('x1',''),
    parecidos:vitrineParecidos({id:'x1',cidadeId:'c1',tipo:'casa',aluguel:900,precoVenda:150000},3)
  };
})()`,context);
assert.match(ctxLead.msg,/Quer comprar/,'A mensagem do lead registra a intenção.');
assert.match(ctxLead.msg,/Lajedo/,'A mensagem do lead registra a cidade.');
assert.match(ctxLead.msg,/#A-9/);
assert.match(ctxLead.msg,/Posso visitar sábado\?/,'O texto da pessoa é preservado.');
assert.match(ctxLead.msgVazia,/Quer comprar/,'Sem texto, o contexto sozinho já vale.');
assert.equal(ctxLead.parecidos.length,1,'Parecidos só da mesma cidade.');
assert.equal(ctxLead.parecidos[0].id,'x2');

/* --- Extrato do proprietário-cliente ---
   A prestação de contas é o argumento comercial para captar dono de imóvel
   novo, então os números precisam estar certos por construção. Duas regras
   valem a pena travar: a taxa incide sobre o RECEBIDO (cobrar administração
   de aluguel que não entrou seria cobrar por receita que não existe), e um
   imóvel sem dono declarado não entra em extrato nenhum. */
uiApi.setOwners([
  {id:'own-1',nome:'Dona Ana',taxaAdministracao:10,telefone:'',pixChave:'ana@pix'},
  {id:'own-2',nome:'Seu Bento',taxaAdministracao:0,telefone:''}
]);
const mesExtrato=api.currentMonthStr();
const casaDaAna={
  id:'casa-ana',nome:'Casa da Ana',status:'alugada',proprietarioClienteId:'own-1',
  diaVencimento:5,aluguelValor:1000,
  contracts:[{id:'ct-ana',inicio:api.addMonths(mesExtrato,-3)+'-01',fim:'',ativo:true,
    valor:1000,diaVencimento:5,modalidade:'entrada'}],
  pagamentos:[],energias:[],despesas:[{id:'d1',data:mesExtrato+'-10',valor:150,descricao:'Torneira'}],
  cobrancas:[{id:'cb-ana',mes:mesExtrato,tipo:'aluguel',contractId:'ct-ana',
    valorPrevisto:1000,vencimento:mesExtrato+'-05'}],
  recebimentos:[{id:'rc-ana',cobrancaId:'cb-ana',valor:600,dataPagamento:mesExtrato+'-06'}]
};
const casaSemDono={
  id:'casa-orfa',nome:'Casa sem dono',status:'alugada',proprietarioClienteId:'',
  diaVencimento:5,aluguelValor:800,
  contracts:[{id:'ct-orfa',inicio:api.addMonths(mesExtrato,-3)+'-01',fim:'',ativo:true,
    valor:800,diaVencimento:5,modalidade:'entrada'}],
  pagamentos:[],energias:[],despesas:[],
  cobrancas:[{id:'cb-orfa',mes:mesExtrato,tipo:'aluguel',contractId:'ct-orfa',
    valorPrevisto:800,vencimento:mesExtrato+'-05'}],
  recebimentos:[{id:'rc-orfa',cobrancaId:'cb-orfa',valor:800,dataPagamento:mesExtrato+'-06'}]
};
uiApi.setData([casaDaAna,casaSemDono],[],[]);

const extratoAna=uiApi.computeOwnerStatement('own-1',mesExtrato,mesExtrato);
assert.equal(extratoAna.previsto,1000);
assert.equal(extratoAna.recebido,600,'Só o que entrou conta como recebido.');
assert.equal(extratoAna.pendente,400);
assert.equal(extratoAna.despesas,150);
assert.equal(extratoAna.taxa,60,'A taxa de 10% incide sobre os R$ 600 recebidos, não sobre os R$ 1.000 previstos.');
assert.equal(extratoAna.repasse,390,'Repasse = recebido − taxa − despesas.');
assert.equal(extratoAna.linhas.length,1,'A casa sem dono não pode entrar no extrato da Ana.');

const extratoBento=uiApi.computeOwnerStatement('own-2',mesExtrato,mesExtrato);
assert.equal(extratoBento.linhas.length,0,'Proprietário sem imóvel tem extrato vazio, não erro.');
assert.equal(extratoBento.repasse,0);

assert.equal(uiApi.housesWithoutOwnerClient().length,1,
  'A tela precisa saber quantas casas ainda não têm dono declarado.');
assert.equal(uiApi.housesOfOwnerClient('own-1').length,1);

/* Período aberto por engano não pode varrer anos de histórico. */
const extratoLongo=uiApi.computeOwnerStatement('own-1',api.addMonths(mesExtrato,-60),mesExtrato);
assert.ok(extratoLongo.meses.length<=24,'O extrato tem teto de 24 meses.');

/* --- Bloco 4: o que a rodada de julho/2026 consertou --- */

/* Ordenar por preço na aba Comprar usava sempre `aluguel`. Num terreno à
   venda o aluguel é zero, então a aba Comprar saía em ordem aleatória. */
const ordemVenda=vm.runInContext(`(function(){
  state.vitrinePublic={perfil:{},cidades:[],imoveis:[
    {id:'a',codigo:'A',titulo:'Caro',cidade:'Lajedo',cidadeId:'',tipo:'terreno',
     finalidade:'vender',aluguel:0,precoVenda:200000,quartos:0,fotoUrls:[],bairro:'',destaque:false},
    {id:'b',codigo:'B',titulo:'Barato',cidade:'Lajedo',cidadeId:'',tipo:'terreno',
     finalidade:'vender',aluguel:0,precoVenda:50000,quartos:0,fotoUrls:[],bairro:'',destaque:false}
  ]};
  state.vitrinePubCidade='';
  state.vitrinePubFinalidade='vender';
  state.vitrineFiltros={busca:'',tipo:'',quartos:0,faixa:'',bairro:'',ordem:'menor',extras:[]};
  /* Volta como texto: array criado dentro do vm tem outro protótipo e
     deepStrictEqual reprovaria mesmo com o conteúdo certo. */
  return vitrineImoveisFiltrados().map(function(x){return x.id;}).join(',');
})()`,context);
assert.equal(ordemVenda,'b,a',
  'Na aba Comprar, "menor preço" ordena pelo preço de venda, não pelo aluguel.');

/* O texto pronto de divulgação tem de levar o link DAQUELE anúncio: é o
   que faz a prévia do WhatsApp mostrar foto, título e preço. */
assert.match(vitrineSource,/function vitrineUrlImovel\(/);
assert.match(vitrineSource,/\/imovel\/'\+encodeURIComponent\(i\.id\)/,
  'O link do anúncio usa rota estável com o ID, não parâmetro cosmético.');
assert.match(vitrineSource,/const url=vitrineUrlImovel\(i\);/,
  'copiarTextoVitrine usa o link do imóvel, não o da vitrine inteira.');

/* A mensagem que a pessoa escreveu ficava gravada e nunca aparecia. */
assert.match(vitrineSource,/vitrine-lead-msg/,'A mensagem do lead aparece no painel.');
assert.match(vitrineSource,/const msg=String\(l\.mensagem\|\|''\)\.trim\(\);/);

/* Clique no WhatsApp vira lead, não só contador. */
assert.match(vitrineSource,/db\.registrarVitrineCliqueWhatsapp\(/);
assert.match(supabaseSource,/vitrine_registrar_clique_whatsapp/);

/* Galeria clicável e compartilhamento. */
assert.match(vitrineSource,/function abrirVitrineLightbox\(/);
assert.match(vitrineSource,/function passarVitrineFoto\(/);
assert.match(vitrineSource,/ontouchend="vitrineToqueFim\(event\)"/,'A galeria passa foto com o dedo.');
assert.match(vitrineSource,/navigator\.share/);

/* Rodapé e privacidade: o formulário pede consentimento LGPD e precisa
   ter para onde apontar. */
assert.match(vitrineSource,/function renderVitrineRodape\(/);
assert.match(vitrineSource,/function renderVitrinePrivacidade\(/);
assert.match(vitrineCssSource,/\.vitrine-rodape\{/);

/* A narrativa de taxa vencida saiu: o anúncio não expira mais sozinho. */
assert.doesNotMatch(vitrineSource,/Taxa a vencer/,'A expiração foi desligada no banco; a tela não pode falar dela.');
assert.doesNotMatch(vitrineSource,/db\.expireVitrine\(\)/,'Chamar a rotina de expiração a cada carga é ida ao servidor à toa.');

/* Pontos de interesse: a coluna existia e não havia onde preencher. */
assert.match(vitrineSource,/function vitrinePoiDeTexto\(/);
assert.match(vitrineSource,/id="vit_poi"/);

/* --- Ponte entre a gestão e a Vitrine ---
   As duas tabelas de imóvel continuam separadas de propósito (a corretora
   anuncia casa de terceiro que não administra), mas a casa que ela
   administra deixa de ser digitada duas vezes. */
assert.match(vitrineSource,/function publicarImovelNaVitrine\(/);
assert.match(vitrineSource,/function vitrineAnuncioDoImovel\(/);
assert.match(vitrineSource,/function atualizarAnuncioDoImovel\(/);
assert.match(housesSource,/renderVitrinePublicacaoImovel\(h\)/,
  'A ficha do imóvel precisa mostrar o estado do anúncio.');
/* O mapeamento de tipo existe porque os dois cadastros têm domínios
   diferentes: "quarto" da gestão não existe na Vitrine. */
const tipoPonte=vm.runInContext(`(function(){
  return ['casa','apartamento','comercial','quarto','outro']
    .map(function(t){return t+'->'+vitrineTipoDoImovel(t);}).join(' ');
})()`,context);
assert.equal(tipoPonte,'casa->casa apartamento->apartamento comercial->comercial quarto->kitnet outro->casa');

/* "Atualizar valores" só toca preço e situação: título, descrição, fotos e
   destaque são trabalho editorial do anúncio e não podem ser sobrescritos
   pela ficha do imóvel. */
const blocoAtualizar=vitrineSource.slice(
  vitrineSource.indexOf('async function atualizarAnuncioDoImovel'),
  vitrineSource.indexOf('function renderVitrinePublicacaoImovel')
);
assert.match(blocoAtualizar,/aluguel:Number\(h\.aluguelValor\)/);
assert.match(blocoAtualizar,/status:novoStatus/);
for(const campo of ['titulo','descricao','destaque']){
  assert.doesNotMatch(blocoAtualizar,new RegExp(campo+'\\s*:'),
    'Atualizar valores não pode sobrescrever "'+campo+'": é conteúdo do anúncio.');
}

/* --- Lead do site vira interessado ---
   Eram dois cadastros de contato paralelos: quem chegava pelo anúncio
   nunca entrava no casamento com as casas vagas. */
assert.match(vitrineSource,/function converterLeadEmInteressado\(/);
assert.match(interestsSource,/function openAddInterestModal\(prefill,origemLeadId\)/);
assert.match(interestsSource,/db\.setVitrineLeadInteressado\(/);
/* A conversão não é automática: a lista inclui quem só clicou no WhatsApp,
   e empurrar todos para o funil encheria a tela de lixo. */
assert.doesNotMatch(vitrineSource,/registrarVitrineCliqueWhatsapp[\s\S]{0,200}insertInterest/);
/* O vínculo com o lead é acessório e não pode derrubar o cadastro. */
const blocoSalvar=interestsSource.slice(
  interestsSource.indexOf('async function saveNewInterest'),
  interestsSource.indexOf('function openEditInterestModal')
);
assert.match(blocoSalvar,/try\{[\s\S]*setVitrineLeadInteressado[\s\S]*\}catch/,
  'Falhar ao marcar o lead não pode desfazer o interessado já cadastrado.');

/* --- Histórico de alterações ---
   O registro existia no banco desde o Financeiro v2 e nenhuma tela o
   consumia. */
assert.match(appSource,/async function openAuditModal\(/);
assert.match(appSource,/db\.listFinancialAudit\(/);
assert.match(appSource,/openAuditModal\(\)">Histórico de alterações/);
/* Só administrador: o log descreve a operação inteira da conta. */
const blocoAuditoria=appSource.slice(
  appSource.indexOf('async function openAuditModal'),
  appSource.indexOf('async function openArchivedItemsModal')
);
assert.match(blocoAuditoria,/if\(!canAdministerAccount\(\)\)\{/,
  'O histórico de alterações é restrito ao administrador da conta.');
/* A lista da equipe só chega ao proprietário primário — a RPC não a
   devolve para um colaborador administrador. Sem lista, chamar um id
   desconhecido de "alguém que saiu" seria inventar; mostramos a função,
   que é o que o próprio registro garante. */
assert.match(appSource,/function auditAtorNome\(atorId,papel\)/);
assert.match(appSource,/if\(!\(state\.team\|\|\[\]\)\.length\)\{[\s\S]{0,140}Alguém da equipe/,
  'Sem a lista da equipe, o histórico não pode afirmar que a pessoa saiu.');

/* A ficha do imóvel pede os dados da Vitrine a cada render enquanto eles
   não chegam. Sem trava, são várias cargas paralelas do mesmo dado. */
assert.match(vitrineSource,/let _vitrineCarregando=false;/);
assert.match(vitrineSource,/if\(_vitrineCarregando\) return;/);
assert.match(vitrineSource,/finally\{\s*_vitrineCarregando=false;/);

/* Publicar um imóvel cujo proprietário já está cadastrado não pode
   esbarrar em "cadastre o anunciante primeiro": é pedir para digitar de
   novo um nome que o aplicativo já tem. */
assert.match(vitrineSource,/async function garantirAnuncianteDoProprietario\(/);
assert.match(vitrineSource,/anuncianteId:anunciante\?anunciante\.id:''/);

/* --- Um cadastro de dono, não dois ---
   O "anunciante" nasceu com a Vitrine, antes do cadastro de proprietários
   da gestão, e por um tempo a mesma pessoa apareceu em duas listas. Agora
   quem manda é `proprietarios_clientes`; `vitrine_anunciantes` continua
   sendo o alvo da chave estrangeira do anúncio, mas virou espelho criado
   sozinho. Ninguém edita anunciante — edita-se o proprietário. */
assert.doesNotMatch(vitrineSource,/function salvarVitrineAnunciante\(/,
  'O formulário paralelo de anunciante não pode voltar a existir.');
assert.doesNotMatch(vitrineSource,/id="vit_an_nome"/,
  'O cadastro de dono é o de Proprietários, em owners.js.');
assert.match(vitrineSource,/function openVitrineAnuncianteModal\(id\)\{[\s\S]{0,220}openOwnerModal\(/,
  'Atalhos antigos precisam cair no cadastro único.');
assert.match(vitrineSource,/Cadastre o proprietário primeiro/);
assert.match(vitrineSource,/function vitrineDonoDoAnuncio\(/);
/* O nome exibido vem do proprietário: é lá que ele é atualizado, e o
   espelho pode estar com um nome antigo. */
assert.match(vitrineSource,/ownerClientName\(a\.proprietarioClienteId\)/);
/* O select do formulário guarda o id do proprietário, e a tradução para o
   anunciante acontece ao salvar. */
assert.match(vitrineSource,/proprietarioClienteId:v\('vit_anunciante'\)\|\|''/);
assert.match(vitrineSource,/const espelho=await garantirAnuncianteDoProprietario\(dados\.proprietarioClienteId\)/);

/* --- Vitrine com equipe: o user_id gravado é o do PROPRIETÁRIO ---
   As tabelas nasceram com `default auth.uid()` e policy que compara com
   usuario_proprietario_id. Para o dono os dois valores coincidem; para um
   colaborador não, e todo insert falhava. */
const migVitrineEquipe=await readFile(join(root,'migracao-vitrine-equipe.sql'),'utf8');
assert.match(migVitrineEquipe,/alter column user_id set default public\.usuario_proprietario_id\(auth\.uid\(\)\)/);
assert.match(migVitrineEquipe,/create policy vitrine_dono on public\.vitrine_cidades/,
  'A policy de vitrine_cidades comparava com auth.uid() e escondia a cidade do dono.');
assert.match(migVitrineEquipe,/create or replace function public\.vitrine_registrar_clique_whatsapp/);
/* Atribuir não é permitir: nenhuma migração da Vitrine pode redefinir as
   funções de papel nem criar policy fora do próprio módulo. */
assert.doesNotMatch(migVitrineEquipe,/create or replace function public\.(pode_operar_imoveis|pode_ler_conta|papel_colaborador_atual)/);
assert.doesNotMatch(migVitrineEquipe,/create policy \w+ on public\.(?!vitrine_)/);
/* O firewall continua valendo: a Vitrine nunca escreve em public.imoveis. */
assert.doesNotMatch(migVitrineEquipe,/(insert into|update)\s+public\.imoveis/i);

const migVitrineFotos=await readFile(join(root,'migracao-vitrine-fotos.sql'),'utf8');
assert.match(migVitrineFotos,/add column if not exists thumb_path text/);
/* A redefinição tem de partir da versão da corretora, senão some cidade,
   finalidade e preço de venda. O arquivo se recusa a rodar sem ela. */
assert.match(migVitrineFotos,/Rode antes o arquivo migracao-vitrine-corretora\.sql/);
assert.match(migVitrineFotos,/'cidades',coalesce\(\(/,'listar_vitrine_publica não pode perder as cidades.');
assert.match(migVitrineFotos,/'finalidade',i\.finalidade/);
assert.match(migVitrineFotos,/'precoVenda',i\.preco_venda/);
assert.match(migVitrineFotos,/f\.storage_path = p_path or f\.thumb_path = p_path/,
  'Sem isto a miniatura existe no bucket e devolve 403 para o visitante.');
assert.doesNotMatch(migVitrineFotos,/(insert into|update)\s+public\.imoveis/i);

/* --- Bloco 3, item 1: meta tags geradas no SERVIDOR ---
   O robô do WhatsApp não roda JavaScript. Aqui simulamos a requisição
   dele contra a Edge Function e conferimos o HTML que ele receberia. */
const edgeMod=await import('../netlify/edge-functions/vitrine-preview.js');
assert.equal(edgeMod.config.path,'/*');
const payloadVitrine={
  perfil:{nome:'Corretora do Anderton',contato:'8199999',slug:'corretora'},
  cidades:[{id:'c1',nome:'Lajedo',uf:'PE',totalAlugar:2,totalVender:1}],
  imoveis:[{id:'v9',codigo:'A-9',titulo:'Casa com quintal',tipo:'casa',finalidade:'vender',
    aluguel:0,precoVenda:180000,quartos:3,banheiros:2,areaM2:120,bairro:'Centro',
    cidade:'Lajedo',descricao:'Muito bem localizada.',fotos:['user/vitrine/v9/foto.jpg']}]
};
const fetchOriginal=globalThis.fetch;
globalThis.fetch=async function(url,opts){
  const alvo=String(url);
  if(alvo.endsWith('/config.js')){
    return new Response("SUPABASE_URL: 'https://proj.supabase.co',\nSUPABASE_ANON_KEY: 'sb_publishable_x',",{status:200});
  }
  if(alvo.includes('listar_vitrine_publica')){
    return new Response(JSON.stringify(payloadVitrine),{status:200,headers:{'content-type':'application/json'}});
  }
  if(alvo.includes('listar_vitrine_sitemap_publico')){
    return new Response(JSON.stringify([{slug:'corretora',atualizadoEm:'2026-08-05T12:00:00Z',
      imoveis:[{id:'v9',titulo:'Casa com quintal',tipo:'casa',finalidade:'vender',cidadeSlug:'lajedo',atualizadoEm:'2026-08-05T12:00:00Z'}]}]),
      {status:200,headers:{'content-type':'application/json'}});
  }
  throw new Error('fetch inesperado: '+alvo);
};
const paginaBase='<!doctype html><html><head><title>Aluguel — Gestão de Casas</title></head><body></body></html>';
const contextoFalso={ next:async function(){
  return new Response(paginaBase,{status:200,headers:{'content-type':'text/html; charset=utf-8'}});
}};
try{
  const resAnuncio=await edgeMod.default(
    new Request('https://site.netlify.app/?vitrine=corretora&imovel=v9&para=vender'),contextoFalso);
  const htmlAnuncio=await resAnuncio.text();
  assert.match(htmlAnuncio,/<meta property="og:title" content="Casa com quintal — R\$ 180\.000,00/,
    'O link do anúncio chega com título e preço.');
  assert.match(htmlAnuncio,/og:image" content="https:\/\/site\.netlify\.app\/og-foto\?p=/,
    'A foto é servida pelo próprio domínio (o bucket é privado).');
  assert.match(htmlAnuncio,/twitter:card" content="summary_large_image"/);
  assert.doesNotMatch(htmlAnuncio,/Aluguel — Gestão de Casas/,'O título fixo do app é substituído.');
  assert.match(htmlAnuncio,/3 quartos · 2 banheiros · 120 m² · Centro · Lajedo/);

  const resHome=await edgeMod.default(
    new Request('https://site.netlify.app/?vitrine=corretora'),contextoFalso);
  const htmlHome=await resHome.text();
  assert.match(htmlHome,/og:title" content="Corretora do Anderton — imóveis e terrenos/);
  assert.match(htmlHome,/1 imóveis disponíveis em Lajedo/);

  const resRota=await edgeMod.default(
    new Request('https://site.netlify.app/vitrine/corretora/imovel/v9/casa-com-quintal/'),contextoFalso);
  const htmlRota=await resRota.text();
  assert.match(htmlRota,/<link rel="canonical" href="https:\/\/site\.netlify\.app\/vitrine\/corretora\/imovel\/v9\/casa-com-quintal\/">/);
  assert.match(htmlRota,/application\/ld\+json/,'A ficha entrega JSON-LD no HTML do servidor.');
  assert.match(htmlRota,/"@type":"Offer"/);

  const resFiltro=await edgeMod.default(
    new Request('https://site.netlify.app/vitrine/corretora/lajedo/comprar/casa/?busca=quintal&ordem=menor'),contextoFalso);
  const htmlFiltro=await resFiltro.text();
  assert.match(htmlFiltro,/name="robots" content="noindex,follow"/,'Busca livre não pode ser indexada.');
  assert.match(htmlFiltro,/rel="canonical" href="https:\/\/site\.netlify\.app\/vitrine\/corretora\/lajedo\/comprar\/casa\/"/);
  assert.doesNotMatch(htmlFiltro,/canonical[^>]+busca=/,'Filtro cosmético não altera o canonical.');

  const resSitemap=await edgeMod.default(new Request('https://site.netlify.app/sitemap.xml'),contextoFalso);
  const xmlSitemap=await resSitemap.text();
  assert.match(xmlSitemap,/\/vitrine\/corretora\/imovel\/v9\/casa-com-quintal\//);
  assert.match(xmlSitemap,/\/vitrine\/corretora\/lajedo\/comprar\/casa\//);
  assert.doesNotMatch(xmlSitemap,/\?busca=/);

  const resRobots=await edgeMod.default(new Request('https://site.netlify.app/robots.txt'),contextoFalso);
  assert.match(await resRobots.text(),/Sitemap: https:\/\/site\.netlify\.app\/sitemap\.xml/);

  /* O app interno nunca ganha tags nem é pré-visualizado. */
  const resApp=await edgeMod.default(new Request('https://site.netlify.app/'),contextoFalso);
  assert.equal(resApp,undefined,'Sem ?vitrine, a Edge Function não interfere.');
}finally{
  globalThis.fetch=fetchOriginal;
}
/* Nunca usar chave secreta na borda: só a publicável, que já é pública. */
const edgeSource=await readFile(join(root,'netlify','edge-functions','vitrine-preview.js'),'utf8');
assert.doesNotMatch(edgeSource,/service_role/i,'A Edge Function não pode usar a chave de serviço.');
assert.match(edgeSource,/SUPABASE_ANON_KEY/,'A borda só usa a chave publicável, que já é pública no config.js.');
assert.match(edgeSource,/arquivo_vitrine_publico/,'A foto só é servida se o banco disser que é pública.');
const netlifyTomlSource=await readFile(join(root,'netlify.toml'),'utf8');
assert.match(netlifyTomlSource,/\[\[edge_functions\]\]/);
assert.match(netlifyTomlSource,/function = "vitrine-preview"/);
assert.match(indexSource,/<base href="\/">/,'Rotas profundas precisam carregar os assets a partir da raiz.');
assert.match(indexSource,/name="robots" content="noindex,nofollow"/,
  'A área autenticada não deve ser indexada; a borda libera apenas a Vitrine pública.');
assert.match(serviceWorkerSource,/if\(\/\\\.\(\?:js\|css\|json\)\$\/\.test\(url\.pathname\)\)\{[\s\S]{0,260}fetch\(req\)/,
  'Código e estilos precisam ser rede-primeiro para uma rota nova não abrir com JavaScript antigo.');

/* --- Bloco 2: página pública no padrão novo --- */
/* O cartão precisa ser alcançável por teclado: era <article onclick>.
   Desde o carrossel de fotos ele voltou a ser <article>, mas por outro
   motivo — seta dentro de botão é HTML inválido. O que a regra protege
   continua o mesmo: quem abre o anúncio é um <button> de verdade, e o
   <article> não pode ter onclick próprio. */
assert.match(vitrineSource,/<button type="button" class="vitrine-card-abrir/,
  'Quem abre o anúncio no cartão tem de ser um botão, alcançável por Tab.');
assert.doesNotMatch(vitrineSource,/<article class="vitrine-card"[^>]*onclick/,
  'O <article> do cartão não pode ser clicável: quem navega por teclado não o alcança.');
/* A capa é clique de mouse sobre a foto — nunca uma segunda parada de Tab
   para a mesma ação. */
assert.match(vitrineSource,/class="vitrine-card-capa" tabindex="-1" aria-hidden="true"/,
  'A capa do cartão duplicaria a parada de Tab do botão do corpo.');
/* Cada seta diz de qual imóvel é: numa grade de 12, "Próxima foto" doze
   vezes não informa nada a quem usa leitor de tela. */
assert.match(vitrineSource,/aria-label="Próxima foto de '\+esc\(i\.titulo\)\+'"/,
  'As setas do cartão precisam dizer a que imóvel pertencem.');
/* A grade folheia miniatura, não a foto grande: é o que segura o 4G. */
assert.match(vitrineSource,/function vitrineCardFotos\(i\)\{[\s\S]{0,220}thumbUrls/,
  'O carrossel do cartão tem de preferir a miniatura à foto grande.');
assert.match(vitrineCssSource,/@media \(pointer:coarse\)[\s\S]{0,400}\.vc-nav\{opacity:1/,
  'No celular a seta do cartão fica visível: não existe passar o mouse.');

/* --- Etapa 3: filtros ativos, comparação, favoritos e desempenho --- */
assert.match(vitrineSource,/\['area','Maior área'\]/,'A ordenação oferece maior área.');
assert.match(vitrineSource,/f\.ordem==='area'[\s\S]{0,120}areaM2/,'Maior área precisa ordenar pelo campo de área.');
assert.match(vitrineSource,/function renderVitrineFiltrosAtivos\(/,'A pessoa precisa enxergar por que a lista foi filtrada.');
assert.match(vitrineSource,/function removerVitrineFiltro\(/,'Cada filtro ativo precisa poder ser removido sozinho.');
assert.match(vitrineSource,/vitrine-filtros-mobile-bar/,'O celular precisa de uma gaveta compacta de filtros.');
assert.match(vitrineCssSource,/\.vitrine-filtros\.is-open\{display:block;\}/,
  'A gaveta móvel precisa de um estado aberto explícito.');
assert.match(vitrineSource,/vitrinePreferenciaKey\('favoritos'\)/,
  'Favoritos precisam persistir separados por vitrine.');
assert.match(vitrineSource,/atual\.length>=4/,'A comparação fica limitada a quatro imóveis.');
assert.match(vitrineSource,/state\.vitrineComparacao=\[\];state\.vitrineComparacaoAberta=false;/,
  'Trocar entre aluguel e venda não pode manter uma comparação misturada.');
assert.match(vitrineSource,/srcset="'\+esc\(foto\)\+' 640w"/,'A miniatura do cartão declara srcset.');
assert.match(vitrineSource,/width="640" height="426"/,'A imagem reserva espaço e evita salto de layout.');
assert.match(vitrineSource,/decoding="async"/,'A decodificação da grade não deve bloquear a interface.');
assert.match(vitrineSource,/vitrineScroll/,'Voltar do detalhe precisa recuperar a posição da lista.');

const etapa3=vm.runInContext(`(function(){
  state.vitrinePublic={perfil:{slug:'teste'},cidades:[],imoveis:[
    {id:'e1',codigo:'E-1',titulo:'Casa menor',tipo:'casa',finalidade:'alugar',cidadeId:'',cidade:'Lajedo',bairro:'Centro',
      aluguel:900,condominio:0,iptu:0,areaM2:60,quartos:2,banheiros:1,vagas:1,thumbUrls:['mini-1.webp'],fotoUrls:['foto-1.webp'],comodidades:[]},
    {id:'e2',codigo:'E-2',titulo:'Casa maior',tipo:'casa',finalidade:'alugar',cidadeId:'',cidade:'Lajedo',bairro:'Novo',
      aluguel:1200,condominio:100,iptu:20,areaM2:140,quartos:3,banheiros:2,vagas:2,thumbUrls:['mini-2.webp'],fotoUrls:['foto-2.webp'],comodidades:[]}
  ]};
  state.vitrinePubCidade='';state.vitrinePubFinalidade='alugar';
  state.vitrineFavoritos=['e1'];state.vitrineComparacao=['e1','e2'];state.vitrineComparacaoAberta=true;
  state.vitrineFiltros={busca:'',tipo:'casa',quartos:0,banheiros:0,suites:0,vagas:0,conservacao:'',
    faixa:'',precoMin:'',precoMax:'',areaMin:'50',areaMax:'',bairro:'',ordem:'area',extras:[]};
  return {ordem:vitrineImoveisFiltrados().map(function(i){return i.id;}),
    ativos:renderVitrineFiltrosAtivos(),card:renderVitrineCard(state.vitrinePublic.imoveis[0],0),
    comparar:renderVitrineComparacao()};
})()`,context);
assert.deepEqual(Array.from(etapa3.ordem),['e2','e1'],'Maior área ordena do maior para o menor.');
assert.match(etapa3.ativos,/Casa/);
assert.match(etapa3.ativos,/Área desde 50 m²/);
assert.match(etapa3.ativos,/Limpar tudo/);
assert.match(etapa3.card,/aria-label="Remover dos favoritos"/);
assert.match(etapa3.card,/srcset="mini-1\.webp 640w"/,'A grade usa a miniatura, não a foto original.');
assert.match(etapa3.comparar,/Total mensal/);
assert.match(etapa3.comparar,/Casa menor/);
assert.match(etapa3.comparar,/Casa maior/);

/* --- Filtros finos: banheiros, vagas, área e valor exato --- */
/* Os quatro precisam existir nos três lugares, senão o filtro entra na
   tela mas não filtra, ou filtra e some do link compartilhado. */
for(const campo of ['banheiros','vagas','precoMin','precoMax','areaMin','areaMax']){
  assert.match(vitrineSource,new RegExp('f\\.'+campo),
    `O filtro ${campo} tem de ser lido em vitrine.js.`);
}
for(const par of [['banheiros','banheiros'],['vagas','vagas'],['precoMin','precomin'],
                  ['precoMax','precomax'],['areaMin','areamin'],['areaMax','areamax']]){
  assert.match(vitrineSource,new RegExp("p\\.set\\('"+par[1]+"'"),
    `O filtro ${par[0]} tem de entrar no endereço: é o que faz o link filtrado funcionar.`);
  assert.match(vitrineSource,new RegExp("p\\.get\\('"+par[1]+"'"),
    `O filtro ${par[0]} tem de ser lido do endereço ao abrir o link.`);
}
/* limparVitrineFiltros esquecer um campo deixa filtro fantasma ligado. */
const limpar=vitrineSource.match(/function limparVitrineFiltros\(\)\{[\s\S]*?\n\}/)[0];
for(const campo of ['quartos','banheiros','vagas','precoMin','precoMax','areaMin','areaMax','faixa','extras']){
  assert.ok(limpar.includes(campo+':'),
    `"Limpar filtros" tem de zerar ${campo} — senão ele continua filtrando invisível.`);
}
/* Faixa pronta e valor digitado dizem a mesma coisa: os dois ligados ao
   mesmo tempo fazem a busca obedecer a um filtro que não está na tela. */
assert.match(vitrineSource,/campo==='faixa'&&valor\)\{ f\.precoMin='';f\.precoMax='';/,
  'Escolher a faixa pronta tem de limpar o valor digitado.');
assert.match(vitrineSource,/campo==='precoMin'\|\|campo==='precoMax'\)&&valor\) f\.faixa='';/,
  'Digitar um valor tem de desligar a faixa pronta.');
/* Terreno não tem cômodo: o painel esconde banheiros e vagas, então eles
   não podem continuar filtrando por trás. */
assert.match(vitrineSource,/campo==='tipo'&&valor==='terreno'\)\{ f\.quartos=0;f\.banheiros=0;f\.vagas=0;/,
  'Escolher terreno tem de zerar quartos, banheiros e vagas.');
/* O campo de valor não é type=number: ler o cursor de um input numérico
   dá erro em alguns navegadores, e é o cursor que devolve o foco. */
assert.doesNotMatch(vitrineSource,/vitf_[a-zA-Z]+" type="number"/,
  'Os campos de valor da Vitrine usam texto com inputmode, não type=number.');
assert.match(vitrineSource,/function renderVitrineMantendoFoco\(\)/,
  'Sem devolver o foco, o campo de filtro perde o cursor a cada letra digitada.');
assert.match(vitrineSource,/id="vitf_busca"/,
  'O campo de busca precisa de id: é por ele que o foco volta depois do render.');

/* --- Detalhes do imóvel: suítes, andar, idade, conservação, área total --- */
const migDetalhes=await readFile(join(root,'migracao-vitrine-detalhes.sql'),'utf8');
for(const col of ['suites','andar','idade_anos','area_total_m2','conservacao']){
  assert.match(migDetalhes,new RegExp('add column if not exists\\s+'+col),
    `A migração tem de criar a coluna ${col} de forma reexecutável.`);
}
assert.doesNotMatch(migDetalhes,/drop\s+(table|column)/i,
  'A migração dos detalhes só acrescenta: nada de apagar coluna ou tabela.');
/* Ela reescreve listar_vitrine_publica. Perder uma chave da versão
   anterior apagaria da página pública um campo que já funcionava — foto,
   legenda, CRECI, cidade. Este teste compara as duas listas. */
const migFotos=await readFile(join(root,'migracao-vitrine-fotos.sql'),'utf8');
const chavesAntigas=[...migFotos.matchAll(/'([a-zA-Z0-9]+)',\s*(?:i\.|case when i\.)/g)].map(m=>m[1]);
assert.ok(chavesAntigas.length>20,'Não consegui ler as chaves da função anterior — teste inválido.');
for(const chave of chavesAntigas){
  assert.ok(migDetalhes.includes("'"+chave+"'"),
    `A função pública reescrita perdeu a chave "${chave}" da versão anterior.`);
}
for(const chave of ['suites','andar','idadeAnos','areaTotalM2','conservacao']){
  assert.ok(migDetalhes.includes("'"+chave+"'"),
    `A função pública tem de devolver ${chave}, senão o campo some da vitrine.`);
}
/* Suíte é um quarto que já foi contado. Banco e tela dizem a mesma coisa. */
assert.match(migDetalhes,/suites <= quartos/,'O banco tem de recusar mais suítes que quartos.');
assert.match(vitrineSource,/Suítes não pode passar de quartos/,
  'A tela tem de explicar o limite antes de o banco devolver erro de restrição.');
/* A lista de conservação vive em dois lugares: se divergirem, a gravação
   estoura na restrição do banco. */
const consSql=migDetalhes.match(/conservacao in \(([^)]+)\)/)[1].replace(/'/g,'').split(',').map(s=>s.trim());
const consJs=[...vitrineSource.matchAll(/\['(na_planta|novo|semi_novo|reformado|bom_estado|precisa_reforma)'/g)].map(m=>m[1]);
for(const v of consJs){
  assert.ok(consSql.includes(v),`"${v}" existe no aplicativo mas o banco recusa.`);
}
assert.match(supabaseSource,/'na_planta','novo','semi_novo','reformado','bom_estado','precisa_reforma'/,
  'A gravação valida a conservação contra a mesma lista do banco.');
/* Não informado é diferente de zero: "0 ano de construção" é uma
   resposta errada, e o anúncio precisa poder calar. */
assert.match(supabaseSource,/idade_anos:\(i\.idadeAnos===''\|\|i\.idadeAnos==null\)\?null/,
  'Idade em branco tem de gravar nulo, não zero.');
assert.match(supabaseSource,/area_total_m2:\(i\.areaTotalM2===''\|\|i\.areaTotalM2==null\)\?null/,
  'Área total em branco tem de gravar nulo, não zero.');

/* --- Etapa 1: fundação de dados da Vitrine --- */
for(const col of ['area_util_m2','total_andares','ano_construcao','disponivel_em','endereco_publico_modo',
  'garantias_aceitas','indice_reajuste','custos_inclusos','situacao_ocupacao','observacao_privada',
  'pavimentacao','agua_disponivel','energia_disponivel','esgoto_disponivel','aptidoes_terreno']){
  assert.match(vitrineFoundationSource,new RegExp('add column if not exists\\s+'+col),
    `A fundação precisa criar ${col} de forma reexecutável.`);
}
for(const tabela of ['vitrine_comodidades_catalogo','vitrine_imovel_comodidades','vitrine_documentacao_imovel']){
  assert.match(vitrineFoundationSource,new RegExp('create table if not exists public\\.'+tabela));
  assert.match(vitrineFoundationSource,new RegExp("alter table public\\.%I enable row level security"),
    'As tabelas estruturadas precisam passar pelo bloco obrigatório de RLS.');
}
assert.match(vitrineFoundationSource,/create or replace function public\.listar_vitrine_publica_v2/);
assert.match(vitrineFoundationSource,/create or replace function public\.salvar_relacoes_fundacao_vitrine/,
  'Comodidades e documentos precisam ser substituídos na mesma transação.');
assert.match(vitrineFoundationSource,/create or replace function public\.importar_backup_atomico_v8/);
assert.match(vitrineFoundationSource,/'observacao_privada'/,
  'A observação privada precisa existir na persistência.');
const rpcPublicaV2=vitrineFoundationSource.slice(
  vitrineFoundationSource.indexOf('create or replace function public.listar_vitrine_publica_v2'),
  vitrineFoundationSource.indexOf('create or replace function public.importar_backup_atomico_v8')
);
assert.doesNotMatch(rpcPublicaV2,/'observacaoPrivada'|d\.observacao_privada/,
  'A RPC pública não pode expor observações privadas do anúncio ou dos documentos.');
assert.match(rpcPublicaV2,/endereco_publico_modo='oculto' then '' else i\.bairro/,
  'Endereço oculto precisa esconder até o bairro.');
assert.match(vitrineFoundationSource,/foreign key\(user_id,imovel_id\)/,
  'Os vínculos estruturados precisam provar que pertencem à mesma conta do anúncio.');
assert.match(supabaseSource,/version:8/,'Exportações e snapshots novos precisam usar o formato V8.');
assert.match(supabaseSource,/listar_vitrine_publica_v2/);
assert.match(supabaseSource,/importar_backup_atomico_v8/);
assert.match(supabaseSource,/Nenhuma alteração do anúncio foi salva/,
  'Sem a migração, a tela precisa parar em vez de descartar os campos novos.');

/* --- Etapas 4, 5 e 6: ficha premium, retenção e visitas --- */
for(const tabela of ['vitrine_buscas_salvas','vitrine_alertas_preco','vitrine_agenda_config',
  'vitrine_disponibilidade','vitrine_visitas']){
  assert.match(vitrineRetentionAgendaSource,new RegExp('create table if not exists public\\.'+tabela));
  assert.match(vitrineRetentionAgendaSource,new RegExp("revoke all on public\\.%I from anon"),
    'As tabelas novas não podem permitir acesso anônimo direto.');
}
for(const rpc of ['vitrine_salvar_busca','vitrine_cancelar_busca','vitrine_salvar_alerta_preco',
  'vitrine_cancelar_alerta_preco','vitrine_solicitar_visita','vitrine_cancelar_visita',
  'vitrine_reagendar_visita','salvar_agenda_vitrine','listar_vitrine_publica_v3']){
  assert.match(vitrineRetentionAgendaSource,new RegExp('create or replace function public\\.'+rpc+'\\b'));
}
assert.match(vitrineRetentionAgendaSource,/status in \('solicitada','confirmada','reagendada'\)/,
  'Solicitação e confirmação precisam ser estados distintos e bloquear conflitos ativos.');
assert.match(vitrineRetentionAgendaSource,/exception when unique_violation[\s\S]{0,120}horario acabou de ser ocupado/,
  'Uma corrida pelo mesmo horário precisa retornar orientação clara.');
const publicaV3=sqlFunctionBlock(vitrineRetentionAgendaSource,'listar_vitrine_publica_v3');
assert.doesNotMatch(publicaV3,/telefone|destino|token_|observacao_privada/i,
  'A leitura pública da agenda só pode expor disponibilidade, nunca contatos ou tokens.');
assert.doesNotMatch(vitrineRetentionAgendaSource,/service_role/i,
  'A implementação não pode embutir credencial privilegiada no SQL ou no navegador.');
assert.match(vitrineSource,/function renderVitrineComodidadesDetalhe\(/);
assert.match(vitrineSource,/function renderVitrineDocumentacaoDetalhe\(/);
assert.match(vitrineSource,/function vitrineTempoRelativo\(/);
assert.match(vitrineSource,/function renderVitrineBuscaModal\(/);
assert.match(vitrineSource,/function renderVitrineRecentes\(/);
assert.match(vitrineSource,/Mostrar apenas diferenças/);
assert.match(vitrineSource,/function renderVitrineVisitas\(/);
assert.match(vitrineSource,/function vitrineFormatDate\(/);
assert.doesNotMatch(vitrineSource,/\bformatDate\(/);
assert.match(vitrineSource,/Lembrete pendente/);
assert.match(vitrineSource,/Solicitação não é confirmação/);
assert.match(vitrineSource,/db\.solicitarVitrineVisita/);
assert.match(supabaseSource,/listar_vitrine_publica_v3/);
assert.match(supabaseSource,/async saveVitrineAgenda\(/);
assert.match(supabaseSource,/rpc\('salvar_agenda_vitrine'/);
assert.match(supabaseSource,/async solicitarVitrineVisita\(/);
for(const tabela of ['vitrine_visitas','vitrine_alertas_preco','vitrine_buscas_salvas',
  'vitrine_disponibilidade','vitrine_agenda_config']){
  assert.match(sqlFunctionBlock(phase0CorrectionSource,'apagar_dados_operacionais_conta'),new RegExp("to_regclass\\('public\\."+tabela+"'\\)[\\s\\S]{0,140}delete from public\\."+tabela,'i'),
    'Apagar tudo também precisa remover '+tabela+'.');
}

/* --- Etapas 7 e 8: CRM operacional e qualidade transversal --- */
for(const tabela of ['crm_eventos','crm_tarefas','crm_propostas','crm_interessado_imoveis','vitrine_observabilidade']){
  assert.match(crmQualityMigrationSource,new RegExp('create table if not exists public\\.'+tabela));
}
assert.match(crmQualityMigrationSource,/alter table public\.%I force row level security/);
assert.match(crmQualityMigrationSource,/revoke all on public\.%I from anon/);
for(const coluna of ['email','origem','campanha','finalidade','responsavel_id','primeira_resposta_em','proxima_acao','proxima_acao_em','motivo_perda','lead_id']){
  assert.match(crmQualityMigrationSource,new RegExp('alter table public\\.interessados add column if not exists '+coluna));
}
assert.match(crmQualityMigrationSource,/create or replace function public\.crm_salvar_interessado/);
assert.match(crmQualityMigrationSource,/regexp_replace\(i\.telefone,'\\D'/,
  'A conversão para o CRM precisa deduplicar a pessoa pelo telefone normalizado.');
assert.match(crmQualityMigrationSource,/lower\(i\.email\)=v_email/,
  'A deduplicação também precisa reconhecer o mesmo e-mail.');
assert.match(crmQualityMigrationSource,/create trigger crm_interessado_historico/,
  'Mudança de etapa, responsável e próxima ação precisa gerar histórico no banco.');
assert.match(crmQualityMigrationSource,/Primeira resposta registrada/,
  'O SLA de primeira resposta precisa entrar no histórico do CRM.');
assert.match(crmQualityMigrationSource,/Motivo de perda registrado/,
  'O motivo de perda precisa entrar no histórico do CRM.');
assert.match(crmQualityMigrationSource,/Defina um responsavel antes de avancar o interessado/,
  'O banco precisa impedir avanço no funil sem responsável.');
assert.match(crmQualityMigrationSource,/Defina a proxima acao e o prazo antes de avancar o interessado/,
  'O banco precisa impedir avanço no funil sem próxima ação ou tarefa pendente.');
assert.match(crmQualityMigrationSource,/crm_proposta_imovel_check/);
assert.match(crmQualityMigrationSource,/Proposta registra negociação|proposta/i);
const telemetryRpc=sqlFunctionBlock(crmQualityMigrationSource,'vitrine_registrar_observabilidade');
assert.doesNotMatch(telemetryRpc,/telefone|email|nome|mensagem|token/i,
  'Observabilidade pública não pode receber nem persistir dados pessoais.');
assert.match(telemetryRpc,/created_at<now\(\)-interval '90 days'/,
  'Telemetria técnica precisa ter retenção limitada.');
assert.match(sqlFunctionBlock(phase0CorrectionSource,'apagar_dados_operacionais_conta'),/vitrine_observabilidade/,
  'Apagar tudo também precisa remover a telemetria técnica da conta.');
for(const etapa of ['novo','qualificacao','contatado','visita_agendada','visita_realizada','proposta','fechado','perdido']){
  assert.match(crmSource,new RegExp("'"+etapa+"'"));
}
assert.match(crmSource,/function renderVitrineCrm\(/);
assert.match(crmSource,/function abrirCrmDetalhe\(/);
assert.match(crmSource,/function salvarCrmTarefa\(/);
assert.match(crmSource,/function salvarCrmProposta\(/);
assert.match(crmSource,/function renderVitrineQualidade\(/);
assert.match(crmSource,/etapasAtivas\.includes\(status\)/,
  'A interface precisa antecipar a regra de responsável e próxima ação do banco.');
assert.match(crmSource,/await loadVitrineData\(true\);abrirCrmDetalhe/,
  'A ficha CRM precisa atualizar histórico, tarefas e propostas sem recarregar a página.');
assert.match(interestsSource,/state\.view===['"]vitrine['"]&&typeof loadVitrineData/,
  'Cadastro e edição feitos pela Vitrine precisam atualizar o histórico imediatamente.');
assert.match(crmSource,/Proposta registra negociação; não é contrato/);
assert.match(supabaseSource,/rpc\('crm_salvar_interessado'/);
assert.match(supabaseSource,/async insertCrmTask\(/);
assert.match(supabaseSource,/async insertCrmProposal\(/);
assert.match(vitrineSource,/function abrirMapaVitrine\(/);
const abrirDetalheSource=vitrineSource.slice(vitrineSource.indexOf('function abrirVitrineDetalhe'),vitrineSource.indexOf('function fecharVitrineDetalhe'));
assert.doesNotMatch(abrirDetalheSource,/desenharMapaVitrine/,
  'Abrir a ficha não deve baixar o mapa antes do visitante pedir.');
/* --- Busca pública: lateral, Cards, Lista e Mapa --- */
assert.match(appSource,/vitrinePubModo:\s*'cards'/,
  'A busca pública precisa começar no modo Cards.');
for(const funcao of ['renderVitrineResultados','renderVitrineFiltros','renderVitrineModos',
  'renderVitrineMapaResultados','desenharMapaResultados','setVitrinePubModo']){
  assert.match(vitrineSource,new RegExp('function '+funcao+'\\('),
    `A nova busca pública precisa implementar ${funcao}.`);
}
assert.match(vitrineSource,/p\.get\('visual'\)/,
  'Cards, Lista e Mapa precisam sobreviver no link compartilhado.');
assert.match(vitrineSource,/p\.set\('visual',state\.vitrinePubModo\)/);
assert.match(vitrineSource,/state\.vitrinePubModo!=='mapa'/,
  'O mapa da busca só pode carregar quando o visitante escolher Mapa.');
assert.match(vitrineSource,/VITRINE_MAPA_TILES='https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png'/,
  'A URL dos ladrilhos precisa seguir a política atual do OpenStreetMap.');
assert.doesNotMatch(vitrineSource,/https:\/\/\{s\}\.tile\.openstreetmap\.org/,
  'O endereço antigo com subdomínios não deve voltar.');
/* A entrada precisa ter apresentacao publica, nao uma grade
   administrativa. O teste checava a frase do titulo antigo — trocar a
   copy quebrava o teste sem quebrar nada de verdade. Agora ele checa a
   ESTRUTURA: heroi, arte de fundo, busca e atalho por tipo. */
assert.match(vitrineSource,/<section class="vitrine-hero"/,
  'A entrada precisa de um heroi de apresentacao.');
assert.match(vitrineSource,/function vitrineArteCidade\(\)/,
  'O heroi tem arte de fundo propria, sem depender de foto enviada.');
assert.match(vitrineSource,/class="vh-busca"/,
  'O heroi precisa da busca: e a primeira acao de quem chega.');
assert.match(vitrineSource,/VITRINE_HERO_TIPOS/,
  'O heroi precisa do atalho por tipo de imovel.');
/* A lateral de filtros era `position:fixed; top:78px; bottom:0`. Fixed
   nao sabe onde o conteudo termina: ao rolar ate o fim ela passava por
   cima do rodape, e o top de 78px (altura do cabecalho) deixava uma
   faixa vazia quando o cabecalho saia da tela.

   Agora ela e coluna sticky do grid de resultados: gruda no topo
   enquanto ha conteudo ao lado e para onde a coluna acaba — que e onde
   o rodape comeca. As tres asserts abaixo sao a trava contra o
   `fixed` voltar por descuido. */
assert.match(vitrineCssSource,/\.vitrine-resultados\{[\s\S]{0,220}display:grid;grid-template-columns:304px minmax\(0,1fr\)/,
  'No desktop os resultados sao um grid de duas colunas: filtros e conteudo.');
assert.match(vitrineCssSource,/\.vitrine-filtros\{[\s\S]{0,120}position:sticky;[\s\S]{0,120}height:100vh/,
  'A lateral de filtros e sticky com a altura da tela, para parar no rodape.');
assert.doesNotMatch(vitrineCssSource,/\.vitrine-filtros\{[\s\S]{0,260}position:fixed;[\s\S]{0,160}top:78px/,
  'A lateral nao pode voltar a ser fixed: ela cobria o rodape no fim da pagina.');
assert.match(vitrineCssSource,/\.vitrine-filtros-scroll\{[\s\S]{0,180}overflow-y:auto/,
  'A lateral fixa precisa ter rolagem própria sem mover os resultados.');
assert.match(vitrineSource,/aria-hidden="true">×<\/span> Limpar/,
  'A ação de limpar filtros precisa permanecer visível no topo da lateral.');
assert.match(vitrineSource,/function vitrineOpcoesContagem[\s\S]{0,900}vitrine-contagem-opcoes/,
  'Quartos, banheiros, suítes e vagas precisam usar botões rápidos.');
assert.match(vitrineCssSource,/\.vitrine-grid\.is-lista\{/);
assert.match(vitrineCssSource,/\.vitrine-mapa-resultados\{/);
assert.match(vitrineCssSource,/@media\(max-width:900px\)[\s\S]{0,2600}\.vitrine-filtros\.is-open\{display:block;/,
  'No celular a lateral precisa virar uma gaveta de filtros.');
assert.match(vitrineSource,/registrarVitrineObservabilidade\(slug,'carga_publica'/);
assert.match(vitrineSource,/registrarVitrineObservabilidade\(vitrinePerfilSlug\(\),'erro_lead'/);
assert.match(vitrineSource,/Visita ['"]?\+vitrineStatusVisitaLabel\(valor\)/,
  'A situação da visita precisa alimentar o histórico e a etapa do CRM.');
assert.match(vitrineSource,/function restaurarFocoVitrinePublica\(/,
  'Modais públicos precisam devolver o foco ao controle que os abriu.');
assert.match(vitrineSource,/restaurarFocoVitrinePublica\(\)/,
  'Fechamentos por botão ou Escape precisam restaurar o foco público.');
assert.match(utilsSource,/modalPreviousFocus/);
assert.match(utilsSource,/e\.key!==['"]Tab['"]/);
for(const arquivo of ['crm.js','crm.css']){
  assert.ok(indexSource.includes(arquivo),arquivo+' precisa ser carregado pelo index.');
  assert.ok(buildSource.includes("'"+arquivo+"'"),arquivo+' precisa entrar no build fechado.');
  assert.ok(serviceWorkerSource.includes("'./"+arquivo+"'"),arquivo+' precisa funcionar offline.');
}
assert.match(crmCssSource,/var\(--r-/,'O CRM precisa usar os raios do design system.');

/* --- Etapa 2: base pública, SEO e marca --- */
for(const coluna of ['descricao_publica','cidade_sede','uf_sede','marca_tema','logo_path']){
  assert.match(vitrineSeoMarcaSource,new RegExp('add column if not exists '+coluna),
    `A identidade pública precisa persistir ${coluna}.`);
}
assert.match(vitrineSeoMarcaSource,/marca_tema in \('floresta','oceano','terracota','grafite'\)/,
  'A marca usa paletas aprovadas, não cor arbitrária.');
assert.match(vitrineSeoMarcaSource,/create or replace function public\.listar_vitrine_sitemap_publico\(\)/);
assert.match(vitrineSeoMarcaSource,/i\.status='ativo'/,
  'O sitemap só pode receber anúncios ativos.');
assert.match(vitrineSeoMarcaSource,/p\.logo_path=p_path/,
  'A borda só serve a logo que o perfil público registrou.');
assert.match(vitrineSeoMarcaSource,/create or replace function public\.salvar_logo_vitrine/);
const publicaSeo=vitrineSeoMarcaSource.slice(
  vitrineSeoMarcaSource.indexOf('create or replace function public.listar_vitrine_publica_v2'),
  vitrineSeoMarcaSource.indexOf('create or replace function public.listar_vitrine_sitemap_publico')
);
assert.doesNotMatch(publicaSeo,/observacao_privada|observacaoPrivada/,
  'Marca e SEO não podem reintroduzir observação privada na API pública.');
assert.match(vitrineSource,/function vitrineRotaPublica\(/);
assert.match(vitrineSource,/function normalizarRotaVitrinePublica\(/,
  'Links antigos precisam ser normalizados sem quebrar favoritos existentes.');
assert.match(vitrineSource,/function atualizarSeoVitrine\(/);
assert.match(vitrineSource,/function vitrineJsonLd\(/);
assert.doesNotMatch(vitrineSource,/link\.href=location\.href/,
  'Canonical não pode copiar busca, ordem e outros filtros cosméticos.');
assert.match(supabaseSource,/salvar_logo_vitrine/);
assert.match(appSource,/VITRINE_MARCA_TEMAS/);
assert.match(appSource,/handleVitrineLogoFile/);
for(const id of ['vit_total_andares','vit_ano_construcao','vit_endereco_modo','vit_disponivel_em',
  'vit_indice_reajuste','vit_obs_privada']){
  assert.ok(vitrineSource.includes('id="'+id+'"'),`O formulário administrativo precisa ter ${id}.`);
}
assert.match(vitrineSource,/function vitrineTriSelect\(/,
  'Sim, não e não informado precisam ser escolhas distintas no formulário.');
assert.match(vitrineSource,/comodidadeCodigos:marcados/);
assert.match(vitrineSource,/documentacao:VITRINE_DOCUMENTOS\.map/);
/* O campo de andar fica no HTML e só é escondido: trocar casa por
   apartamento no meio do cadastro tem de mostrá-lo sem reabrir o modal. */
assert.match(vitrineSource,/id="vit_andar_wrap"/,
  'O campo de andar precisa de um invólucro com id para ser mostrado ao trocar o tipo.');
assert.match(vitrineSource,/andarWrap\.hidden=!vitrineTemAndar\(tipo\)/,
  'Trocar o tipo tem de mostrar ou esconder o andar na hora.');
/* Foco visível e alvo de toque, como no resto do app. */
assert.match(vitrineCssSource,/\.vitrine-card:focus-visible/);
assert.match(vitrineCssSource,/pointer:coarse[\s\S]{0,240}var\(--toque\)/,
  'No celular, o que se clica na Vitrine respeita o alvo mínimo de toque.');
/* A página pública não vive dentro de .rental-shell nem de #modalRoot,
   que são os únicos lugares onde os tokens --rent-* existem. Usá-los ali
   deixaria a cor indefinida. A área interna da Vitrine pode usá-los à
   vontade — por isso a verificação é por seletor, não por posição. */
const SELETORES_PUBLICOS=/^\.(vitrine-(public|pub-top|pub-main|pub-count|pub-empty|filtros|busca|sel|chip|chips|grid|card|sem-foto|badge|endereco|preco|total|specs|detalhe|voltar|galeria|bloco|feat|sticky|contato|custo|regra|texto|poi|ou|consent|result|cidade|cidades|finalidade|parecido|parecidos)|vg-)/;
const regrasPublicasComRent=[];
for(const m of vitrineCssSource.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
  const seletores=m[1].split(',').map(function(s){return s.trim();});
  if(!seletores.some(function(s){return SELETORES_PUBLICOS.test(s);})) continue;
  if(/var\(--rent-/.test(m[2])) regrasPublicasComRent.push(seletores.join(', '));
}
assert.deepEqual(regrasPublicasComRent,[],
  'Estas regras da página pública dependem de tokens --rent-*, que não existem fora de .rental-shell: '+
  regrasPublicasComRent.join(' | '));
assert.doesNotMatch(vitrineCssSource,/\.vitrine-page\{/);
/* O app esconde .rent-tabs no celular porque a barra inferior assume —
   mas ela só cobre os Aluguéis. Sem esta regra a Vitrine ficaria presa
   no Painel no telefone. */
assert.match(vitrineCssSource,/@media\(max-width:720px\)\{[\s\S]*?\.rent-tabs\.vitrine-nav\{[\s\S]*?display:flex/);
/* Idem para a paleta --rent-*, que saiu de aluguel-ui.css. */
assert.match(tokensCssSource,/--rent-gold:#F0C76E/);

/* --- Fotos do anúncio --- */
assert.match(vitrineSource,/async function handleVitrineFotoFiles/);
assert.match(vitrineSource,/const VITRINE_MAX_FOTOS=10/);
/* Reaproveita a compressão e a validação de origem já existentes. */
assert.match(vitrineSource,/compressImage\(f,1920,0\.82\)/);
assert.match(vitrineSource,/safePhotoSrc\(f\.url\)/);
/* A primeira foto é a capa: é ela que vai no card e na prévia do link. */
assert.match(vitrineSource,/async function definirCapaVitrine/);
assert.match(vitrineSource,/CAPA/);
/* Fotos ficam em pasta própria dentro do bucket, ligadas a vitrine_fotos. */
assert.match(supabaseSource,/async addVitrineFotos\(imovelId,files,startOrder\)/);
assert.match(supabaseSource,/'\/vitrine\/'\+imovelId/);
assert.match(supabaseSource,/async deleteVitrineFoto\(fotoId\)/);
/* Ao apagar, o arquivo sai do storage antes da linha do banco. */
const deleteFotoTrecho=supabaseSource.slice(
  supabaseSource.indexOf('async deleteVitrineFoto'),
  supabaseSource.indexOf('async reorderVitrineFotos')
);
assert.ok(
  deleteFotoTrecho.indexOf('storage.from(FILE_BUCKET).remove') <
    deleteFotoTrecho.indexOf(".delete().eq('id',fotoId)"),
  'O arquivo deve sair do storage antes da linha do banco, para não virar lixo órfão.'
);
/* A vitrine pública devolve as fotos na ordem, a capa primeiro. */
assert.match(vitrineMigrationSource,/order by f\.ordem, f\.created_at/);
assert.match(indexSource,/vitrineFotoInput/);
assert.match(indexSource,/handleVitrineFotoFiles/);
assert.match(vitrineCssSource,/\.vitrine-foto\.capa/);

/* --- Ligações --- */
assert.match(indexSource,/vitrine\.js/);
assert.match(indexSource,/vitrine\.css/);
assert.match(buildSource,/'vitrine\.js'/);
assert.match(buildSource,/'vitrine\.css'/);
assert.match(serviceWorkerSource,/\.\/vitrine\.js/);
assert.match(serviceWorkerSource,/\.\/vitrine\.css/);
/* O mapa precisa dos ladrilhos liberados no CSP. */
const headersSource = await readFile(join(root,'_headers'),'utf8');
assert.match(headersSource,/img-src[^;]*https:\/\/tile\.openstreetmap\.org/);
/* Leaflet vem do cdnjs, que o CSP já confiava para o jsPDF: nenhum
   domínio novo foi aberto para scripts. */
assert.doesNotMatch(headersSource,/script-src[^;]*unpkg/);
assert.match(indexSource,/cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet/);

/* --- Métodos de dados --- */
assert.match(supabaseSource,/async loadVitrine\(\)/);
assert.match(supabaseSource,/async loadVitrinePublica\(slug\)/);
assert.match(supabaseSource,/async registrarVitrineLead\(lead\)/);
assert.match(supabaseSource,/async setModuleLicense\(/);

/* ============================================================
   CABECALHO E PAGAMENTOS DA MINHA CASA
   ============================================================ */
const paySource = await readFile(join(root,'migracao-minha-casa-pagamentos.sql'),'utf8');
const budgetSource = await readFile(join(root,'migracao-minha-casa-orcamento.sql'),'utf8');
const myHomeCssSource2 = await readFile(join(root,'minha-casa.css'),'utf8');

/* O espacador mantem Buscar e menu a direita mesmo sem a pilula do plano. */
assert.match(appSource,/class="topbar-gap"/);
assert.match(rentalUiCssSource,/\.rental-shell \.topbar-gap\{flex:1 1 auto/);

/* Colunas novas sao aditivas: nenhum lancamento existente e apagado. */
assert.match(paySource,/add column if not exists forma_pagamento/);
assert.match(paySource,/add column if not exists compra_id/);
assert.doesNotMatch(paySource,/drop table|truncate/i);
assert.doesNotMatch(paySource,/delete from public\.minha_casa_lancamentos\s*;/i);

/* Parcelar so vale no credito: nas outras formas o dinheiro sai de uma vez. */
const salvarBlock=sqlFunctionBlock(paySource,'minha_casa_salvar_lancamento');
assert.match(salvarBlock,/if v_forma<>'credito' then\s*v_parcelas:=1;/);
/* A soma das parcelas tem que bater com o total ao centavo. */
assert.match(salvarBlock,/v_primeira:=v_total-\(v_parcela\*\(v_parcelas-1\)\)/);
/* Uma parcela por mes. */
assert.match(salvarBlock,/interval '1 month'/);
/* Teto de parcelas no banco, nao so na tela. */
assert.match(salvarBlock,/No maximo 60 parcelas/);
/* A assinatura antiga sai para nao ficar ambigua com a nova. */
assert.match(paySource,/drop function if exists public\.minha_casa_salvar_lancamento\(\s*text,numeric,uuid,uuid,date,text,uuid\s*\)/);
/* Excluir a compra inteira existe, para nao sobrar meia compra. */
assert.match(paySource,/create or replace function public\.minha_casa_excluir_compra/);
/* A lista devolve os campos novos. */
const listarBlock=sqlFunctionBlock(paySource,'minha_casa_listar_lancamentos');
for(const campo of ['paymentMethod','purchaseId','installment','installments']){
  assert.match(listarBlock,new RegExp("'"+campo+"'"));
}

/* Front-end */
assert.match(myHomeSource,/var PAYMENT_METHODS=/);
assert.match(myHomeSource,/function isInstallmentPurchase/);
assert.match(myHomeSource,/function updatePaymentOptions/);
assert.match(myHomeSource,/role="tab" aria-selected="'\+active\+'" tabindex="'\+\(active\?'0':'-1'\)/);
assert.match(appSource,/barra\.getAttribute\('role'\)==='tablist'/);
assert.match(myHomeSource,/askDeletePurchase:askDeletePurchase/);
assert.match(myHomeSource,/updatePaymentOptions:updatePaymentOptions/);
/* Editar uma parcela nunca reparcelam a compra. */
assert.match(myHomeSource,/if\(paymentMethod!=='credito'\) installments=1;/);
assert.match(supabaseSource,/p_parcelas:Number\(item\.installments\)\|\|1/);
assert.match(supabaseSource,/async deleteMyHomePurchase\(purchaseId\)/);
/* Ao editar, o app manda sempre 1 parcela: quem reparcela e o cadastro novo. */
const updateTx=supabaseSource.slice(
  supabaseSource.indexOf('async updateMyHomeTransaction'),
  supabaseSource.indexOf('async deleteMyHomePurchase')
);
assert.match(updateTx,/p_parcelas:1/);
assert.match(myHomeCssSource2,/\.mh-parcela/);
assert.match(myHomeCssSource2,/\.mh-installment-hint/);

/* Orçamento/metas seguem a licença multifamília e travam vínculos
   cruzados entre categorias, metas, aportes e famílias. */
assert.match(budgetSource,/tem_modulo\('minha_casa', auth\.uid\(\)\)/);
const budgetPolicies=budgetSource.slice(
  budgetSource.indexOf('drop policy if exists minha_casa_orcamentos_familia'),
  budgetSource.indexOf('-- 4. LEITURA')
);
assert.doesNotMatch(budgetPolicies,/e_mestre\(/);
assert.match(budgetSource,/minha_casa_orcamentos_categoria_familia_fk/);
assert.match(budgetSource,/minha_casa_meta_aportes_meta_familia_fk/);
assert.match(budgetSource,/and ap\.familia_id = m\.familia_id/);
assert.match(budgetSource,/force row level security/);
/* Assinaturas completas precisam de to_regprocedure; to_regproc devolveria
   null e bloquearia a migracao mesmo quando a funcao ja existe. */
assert.match(
  budgetSource,
  /to_regprocedure\('public\.minha_casa_familia_atual_id\(\)'\)/
);
assert.doesNotMatch(
  budgetSource,
  /to_regproc\('public\.minha_casa_familia_atual_id\(\)'\)/
);

/* Vistorias/chamados respeitam dono resolvido e colaboradores. Upload
   direto de fotos permanece bloqueado até haver reserva atômica de cota. */
assert.match(inspectionsSource,/usuario_proprietario_id\(auth\.uid\(\)\)/);
assert.match(inspectionsSource,/validar_dono_registro_imovel/);
assert.match(inspectionsSource,/user_id = public\.dono_do_imovel\(imovel_id\)/);
assert.match(inspectionsSource,/c\.inicio <= current_date/);
assert.match(inspectionsSource,/inquilino_pode_acessar_foto_chamado/);
assert.match(inspectionsSource,/force row level security/);

const inspectionRoleBlock=compactSql(
  sqlFunctionBlock(inspectionsSource,'papel_vistoria_chamado_atual')
);
const inspectionReadBlock=compactSql(
  sqlFunctionBlock(inspectionsSource,'pode_ler_vistoria_chamado')
);
const inspectionWriteBlock=compactSql(
  sqlFunctionBlock(inspectionsSource,'pode_escrever_vistoria_chamado')
);
const inspectionOwnerTriggerBlock=compactSql(
  sqlFunctionBlock(inspectionsSource,'validar_dono_registro_imovel')
);
const inspectionPhotoTriggerBlock=compactSql(
  sqlFunctionBlock(inspectionsSource,'validar_dono_foto_operacional')
);
const inspectionResolveBlock=compactSql(
  sqlFunctionBlock(inspectionsSource,'resolver_chamado_com_despesa')
);
const inspectionBasicRegisterBlock=compactSql(
  sqlFunctionBlock(inspectionsSource,'registrar_vistoria_basica')
);

/* A migração funciona antes ou depois do Financeiro V2. Sem a coluna
   papel, o colaborador legado mantém o acesso administrativo; com ela,
   leitura e escrita ficam deliberadamente separadas. */
assert.match(inspectionRoleBlock,/pg_attribute/);
assert.match(inspectionRoleBlock,/attname='papel'/);
assert.match(
  inspectionReadBlock,
  /in \('administrador','financeiro','operacional','leitura'\)/
);
assert.match(
  inspectionWriteBlock,
  /in \('administrador','operacional'\)/
);
assert.doesNotMatch(inspectionWriteBlock,/'financeiro'|'leitura'/);

for(const table of ['vistorias','vistoria_fotos','chamados','chamado_fotos']){
  assert.match(
    inspectionsSource,
    new RegExp(
      'create\\s+policy\\s+'+table+
      '_ler[\\s\\S]{0,220}for\\s+select[\\s\\S]{0,220}pode_ler_vistoria_chamado',
      'i'
    )
  );
}
assert.doesNotMatch(
  inspectionsSource,
  /create\s+policy\s+(?:vistorias|vistoria_fotos|chamados|chamado_fotos)_dono[\s\S]{0,100}for\s+all/i
);
assert.match(
  inspectionsSource,
  /create\s+policy\s+chamados_inquilino_abre[\s\S]{0,420}inquilino_id\s*=\s*public\.inquilino_logado_no_imovel\(imovel_id\)[\s\S]{0,260}despesa_id\s+is\s+null/i
);
assert.match(
  inspectionOwnerTriggerBlock,
  /tg_op='insert'[\s\S]*new\.inquilino_id\s*:=\s*v_inquilino_logado[\s\S]*new\.despesa_id\s*:=\s*null/
);
assert.match(
  inspectionOwnerTriggerBlock,
  /from public\.inquilinos i join public\.contratos c[\s\S]*c\.imovel_id=new\.imovel_id/
);
assert.match(
  inspectionOwnerTriggerBlock,
  /from public\.despesas d[\s\S]*d\.user_id=v_dono[\s\S]*d\.imovel_id=new\.imovel_id/
);
assert.match(
  inspectionsSource,
  /before\s+insert\s+or\s+update\s+of\s+user_id,imovel_id,inquilino_id,despesa_id,aberto_por,status/i
);
assert.match(inspectionOwnerTriggerBlock,/app\.resolvendo_chamado/);
assert.match(
  inspectionOwnerTriggerBlock,
  /new\.created_at\s+is\s+distinct\s+from\s+old\.created_at/
);
assert.match(
  inspectionsSource,
  /before\s+insert\s+or\s+update\s+of[\s\S]{0,180}created_at[\s\S]{0,40}on\s+public\.chamados/i
);
assert.match(
  inspectionOwnerTriggerBlock,
  /new\.despesa_id is distinct from old\.despesa_id[\s\S]*not v_resolucao_controlada[\s\S]*use a acao de resolver chamado/
);
assert.match(
  inspectionOwnerTriggerBlock,
  /old\.despesa_id is not null[\s\S]*new\.status<>'resolvido'[\s\S]*nao pode ser reaberto ou cancelado/
);
assert.match(
  inspectionOwnerTriggerBlock,
  /new\.imovel_id is distinct from old\.imovel_id[\s\S]*new\.inquilino_id is distinct from old\.inquilino_id/
);
assert.match(
  inspectionOwnerTriggerBlock,
  /old\.status='resolvido'[\s\S]*new\.resolvido_em:=coalesce\(old\.resolvido_em,now\(\)\)/
);
assert.match(inspectionResolveBlock,/set_config\('app\.resolvendo_chamado','1',true\)/);

/* FKs compostas protegem toda escrita nova sem impedir a instalação
   sobre dados legados que ainda precisem de revisão. */
assert.match(
  inspectionsSource,
  /constraint\s+chamados_inquilino_dono_fk[\s\S]{0,180}foreign\s+key\s*\(inquilino_id,user_id\)[\s\S]{0,180}not\s+valid/i
);
assert.match(
  inspectionsSource,
  /constraint\s+chamados_despesa_imovel_dono_fk[\s\S]{0,200}foreign\s+key\s*\(despesa_id,imovel_id,user_id\)[\s\S]{0,200}not\s+valid/i
);
assert.match(
  inspectionsSource,
  /constraint\s+vistorias_imovel_dono_fk[\s\S]{0,180}foreign\s+key\s*\(imovel_id,user_id\)/i
);
assert.match(
  inspectionsSource,
  /constraint\s+vistorias_contrato_imovel_dono_fk[\s\S]{0,220}foreign\s+key\s*\(contrato_id,imovel_id,user_id\)/i
);
assert.match(inspectionsSource,/new\.criado_por:=coalesce\(auth\.uid\(\),v_dono\)/i);
assert.match(inspectionsSource,/chamados_resolucao_coerente_check/i);
assert.match(inspectionsSource,/revoke\s+all\s+on\s+table[\s\S]*from\s+public,anon,authenticated/i);
assert.match(inspectionsSource,/create\s+unique\s+index\s+if\s+not\s+exists\s+idx_despesas_id_imovel_user/i);
assert.match(
  inspectionsSource,
  /create\s+unique\s+index\s+if\s+not\s+exists\s+idx_chamados_despesa_unica[\s\S]{0,160}where\s+despesa_id\s+is\s+not\s+null/i
);

/* O cliente autenticado não recebe DELETE definitivo de chamados. */
assert.match(
  inspectionsSource,
  /revoke\s+delete\s+on\s+table\s+public\.chamados\s+from\s+authenticated/i
);
assert.doesNotMatch(inspectionsSource,/create\s+policy\s+chamados_excluir/i);
const inspectionDeleteGrant=/grant\s+select,insert,update,delete\s+on\s+table([^;]+);/i
  .exec(inspectionsSource);
assert.ok(inspectionDeleteGrant,'Deve existir grant de fotos/vistorias administrado por RLS.');
assert.doesNotMatch(inspectionDeleteGrant[1],/public\.chamados\b/i);

/* Sem uma operação de Storage com reserva/compensação, ninguém recebe
   INSERT direto nas fotos de vistoria/chamado e os prefixos ficam fechados. */
assert.match(inspectionPhotoTriggerBlock,/new\.enviado_por\s*:=\s*auth\.uid\(\)/);
assert.match(
  inspectionPhotoTriggerBlock,
  /storage\.objects[\s\S]*o\.name=new\.caminho/
);
assert.doesNotMatch(
  inspectionsSource,
  /create\s+policy\s+(?:chamado_fotos_inquilino_insere|chamado_fotos_inserir|vistoria_fotos_inserir)/i
);
assert.match(inspectionsSource,/drop\s+policy\s+if\s+exists\s+tenant_chamado_files_delete/i);
assert.doesNotMatch(inspectionsSource,/create\s+policy\s+tenant_chamado_files_delete/i);
assert.doesNotMatch(
  inspectionsSource,
  /create\s+policy\s+tenant_chamado_files_insert/i
);
assert.match(
  inspectionsSource,
  /create\s+policy\s+owner_files_insert[\s\S]{0,360}not\s+in\s*\('chamados','vistorias'\)/i
);
assert.match(
  inspectionsSource,
  /grant\s+select,update,delete\s+on\s+table[\s\S]{0,120}public\.vistoria_fotos,[\s\S]{0,80}public\.chamado_fotos/i
);
assert.match(
  inspectionsSource,
  /create\s+policy\s+owner_files_select[\s\S]{0,180}pode_ler_arquivo_operacional\(name\)/i
);
for(const policy of ['owner_files_insert','owner_files_update','owner_files_delete']){
  assert.match(
    inspectionsSource,
    new RegExp(
      'create\\s+policy\\s+'+policy+
      '[\\s\\S]{0,320}pode_escrever_arquivo_operacional\\(name\\)',
      'i'
    )
  );
}

/* O gatilho compartilhado continua condicional quando o Financeiro V2
   existe. INSERT usa o validador local para não bloquear abrir_chamado. */
assert.match(
  inspectionsSource,
  /do\s+\$papel_chamados\$[\s\S]*to_regprocedure\('public\.validar_papel_escrita_aluguel\(\)'\)[\s\S]*before\s+update\s+or\s+delete\s+on\s+public\.chamados/i
);

/* Manutenção permanece separada do financeiro: o chamado é opcional
   para instalações antigas, cancelar preserva o histórico e uma despesa
   só nasce ao resolver, sem duplicar vínculo existente. */
assert.match(supabaseSource,/chamados:\s*\[\]/);
assert.match(supabaseSource,/fetchOptionalRows\('chamados','created_at',false,false\)/);
assert.match(supabaseSource,/h\.chamados\.push\(rowToMaintenanceCall\(row\)\)/);
assert.match(supabaseSource,/async insertMaintenanceCall\(imovelId,item\)/);
assert.match(supabaseSource,/async updateMaintenanceCall\(item\)/);
assert.match(supabaseSource,/async getMaintenanceCall\(id\)/);
assert.match(supabaseSource,/async resolveMaintenanceCallWithExpense\(item,expense\)/);
assert.match(supabaseSource,/resolver_chamado_com_despesa/);
assert.match(supabaseSource,/return rowToMaintenanceCall\(res\.data\)/);
assert.match(maintenanceSource,/function renderMaintenanceTab\(h\)/);
assert.match(maintenanceSource,/situação para “Cancelada”/);
assert.match(maintenanceSource,/db\.resolveMaintenanceCallWithExpense/);
assert.doesNotMatch(maintenanceSource,/db\.insertExpense\(houseId,expenseData\)/);
assert.match(maintenanceSource,/status==='resolvido'&&\s*!alreadyLinked/);
assert.match(maintenanceSource,/despesaId:alreadyLinked\?existing\.despesaId/);
assert.match(maintenanceSource,/mayCreateExpense=mayOperate&&canAdministerAccount\(\)/);
assert.match(maintenanceSource,/shouldCreateExpense=canAdministerAccount\(\)&&status==='resolvido'/);
assert.match(
  maintenanceSource,
  /existing&&existing\.despesaId&&status!=='resolvido'/
);
assert.match(
  maintenanceSource,
  /id:existing\?existing\.id:newOperationId\(\)/
);
assert.match(maintenanceSource,/tenantId:existing\?existing\.tenantId:''/);
assert.match(supabaseSource,/sb\.rpc\('criar_chamado_manutencao'/);
assert.match(
  supabaseSource,
  /missingOptionalRpc\(res\.error\)[\s\S]{0,220}inquilino_id:null/
);
const createMaintenanceBlock=sqlFunctionBlock(
  phase0CorrectionSource,'criar_chamado_manutencao'
);
assert.match(createMaintenanceBlock,/pode_escrever_vistoria_chamado\(v_owner,v_ator\)/i);
assert.match(createMaintenanceBlock,/select \* into v_row from public\.chamados c where c\.id=p_id/i);
assert.match(createMaintenanceBlock,/p_id,v_owner,p_imovel_id,null/i);

/* Apagar tudo e transacional no banco. O navegador nunca remove arquivos
   antes do commit nem tenta contornar RLS com uma lista local de tabelas. */
assert.match(supabaseSource,/sb\.rpc\('apagar_dados_operacionais_conta'\)/);
const wipeAdapter=supabaseSource.slice(
  supabaseSource.indexOf('async wipeAll()'),
  supabaseSource.indexOf('\n  }\n};',supabaseSource.indexOf('async wipeAll()'))
);
assert.doesNotMatch(wipeAdapter,/\.from\([^)]*\)\.delete\(/);
assert.ok(
  wipeAdapter.indexOf("sb.rpc('apagar_dados_operacionais_conta')")<
    wipeAdapter.indexOf('removeStoragePaths(paths)'),
  'O commit do banco deve acontecer antes da limpeza de arquivos.'
);
const wipeSqlBlock=sqlFunctionBlock(
  phase0CorrectionSource,'apagar_dados_operacionais_conta'
);
assert.match(wipeSqlBlock,/v_ator<>v_owner/i);
for(const table of [
  'chamados','vistorias','financeiro_recebimentos','financeiro_cobrancas',
  'vitrine_imoveis','proprietarios_clientes','imoveis','inquilinos'
]){
  assert.match(wipeSqlBlock,new RegExp('delete\\s+from\\s+public\\.'+table+'\\b','i'));
}
assert.match(
  maintenanceSource,
  /button\.onclick=function\(\)[\s\S]{0,100}saveMaintenanceCall\(houseId,item\.id,'confirmado'\)/
);
assert.match(
  supabaseSource,
  /if\(item\.id\)\s+row\.id=item\.id/
);
assert.match(
  maintenanceSource,
  /currentCall=await db\.getMaintenanceCall\(existing\.id\)/
);
assert.match(
  maintenanceSource,
  /if\(currentCall&&currentCall\.despesaId\)\{[\s\S]{0,100}persistedCall=currentCall/
);
assert.match(
  maintenanceSource,
  /const uncertainInsert=!persistedCall&&!!retryCall/
);
assert.match(maintenanceSource,/resolution\.expense\|\|null/);
assert.match(
  supabaseSource,
  /from\('despesas'\)\.select\('\*'\)\.eq\('id',result\.despesa_id\)\.maybeSingle\(\)/
);
assert.match(supabaseSource,/expense:loadedExpense\.data\?rowToExpense/);
assert.doesNotMatch(
  maintenanceSource,
  /deleteMaintenanceCall|from\(['"]chamados['"]\)\.delete/i
);
assert.doesNotMatch(maintenanceSource,/chamado_fotos|upload.*foto/i);
assert.match(inspectionsSource,/create\s+or\s+replace\s+function\s+public\.resolver_chamado_com_despesa/i);
assert.match(
  inspectionBasicRegisterBlock,
  /from public\.imoveis i[\s\S]*for update[\s\S]*insert into public\.vistorias[\s\S]*update public\.imoveis/
);
assert.match(inspectionsSource,/grant execute on function public\.registrar_vistoria_basica\(uuid,date\)/i);
assert.match(supabaseSource,/async registerBasicInspection\(imovelId,date\)/);
assert.match(supabaseSource,/sb\.rpc\('registrar_vistoria_basica'/);
assert.match(
  housesSource,
  /async function registrarVistoria\(houseId\)[\s\S]{0,420}db\.registerBasicInspection\(houseId,date\)/
);
const basicInspectionAction=housesSource.slice(
  housesSource.indexOf('async function registrarVistoria'),
  housesSource.indexOf('/* ---------- pagamentos ---------- */')
);
assert.doesNotMatch(basicInspectionAction,/db\.updateHouse/);
assert.match(indexSource,/<script src="maintenance\.js"><\/script>/);
assert.ok(
  indexSource.indexOf('<script src="houses.js"></script>') <
    indexSource.indexOf('<script src="maintenance.js"></script>'),
  'O módulo de manutenção deve carregar depois dos componentes da ficha do imóvel.'
);

/* A tela comercial não pode inventar MRR, conversão ou faturamento
   acumulado enquanto o banco não guarda periodicidade/cobranças. */
assert.match(commercialSource,/function computeCommercialSnapshot/);
assert.doesNotMatch(commercialSource,/['"]Receita recorrente['"]/);
assert.doesNotMatch(commercialSource,/['"]Faturamento acumulado['"]/);
assert.doesNotMatch(commercialSource,/>Conversão</);

/* ============================================================
   Design system — a trava da Fase 3.
   Reprova raio fora da escala, token declarado fora do
   tokens.css, e crescimento de cor crua ou texto miúdo.
   ============================================================ */
const ds = await lintDesignSystem(root);
console.log(
  `Design system: raios 100% em token · cores cruas ${ds.cores}/${TETO_CORES_CRUAS} · ` +
  `texto <12px ${ds.miudo}/${TETO_TEXTO_MIUDO} (tetos que só podem cair)`
);

console.log('Testes concluídos: Aluguéis 1.3, Clientes proprietários, separação exclusiva de papéis, cadastro protegido, Minha Casa, exclusão segura, navegação móvel, acabamento visual, planos, equipe, anúncios, PIX, limites, cobranças, Energia, interessados, temas, descrição, backup, módulos vendáveis, Minha Casa multi-família Vitrine, cabeçalho e pagamentos da Minha Casa estão corretos.');
