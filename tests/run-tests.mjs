import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const testsDir = dirname(fileURLToPath(import.meta.url));
const root = dirname(testsDir);
const context = vm.createContext({
  console,
  crypto: { randomUUID },
  window: { supabase: { createClient: () => ({}) } }
});

for(const file of ['config.js','utils.js','supabase.js','dashboard.js']){
  vm.runInContext(await readFile(join(root,file),'utf8'), context, { filename:file });
}

const api = vm.runInContext(`({
  dueDayForMonth,
  aluguelValorMes,
  normalizeBackupForImport,
  currentMonthStr,
  addMonths,
  computeCobrancaCasa
})`, context);

assert.equal(api.dueDayForMonth('2025-02',30), 28);
assert.equal(api.dueDayForMonth('2024-02',31), 29);
assert.equal(api.dueDayForMonth('2026-04',31), 30);
assert.equal(api.dueDayForMonth('2026-01',31), 31);

const house = {
  aluguelValor: 1500,
  aluguelHistorico: [
    { valor:1000, dataInicio:'2025-01-01' },
    { valor:1200, dataInicio:'2026-01-01' }
  ]
};
assert.equal(api.aluguelValorMes(house,'2025-12'), 1000);
assert.equal(api.aluguelValorMes(house,'2026-01'), 1200);

const currentMonth = api.currentMonthStr();
const previousMonth = api.addMonths(currentMonth,-1);
const olderMonth = api.addMonths(currentMonth,-2);
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
  const state={uiMode:'advanced',houses:[],tenants:[]};
  function isSimpleMode(){return state.uiMode==='simple';}
  function tenantOf(h){return state.tenants.find(function(t){return t.id===h.tenantId;})||null;}
`,context);
for(const file of ['houses.js','tenants.js']){
  vm.runInContext(await readFile(join(root,file),'utf8'),context,{filename:file});
}
const uiApi=vm.runInContext(`({
  setMode:function(mode){state.uiMode=mode;},
  setData:function(houses,tenants){state.houses=houses;state.tenants=tenants;},
  renderHouseCard,
  renderTenantCard
})`,context);
const overdueHouse={
  id:'overdue-house',nome:'Casa teste',endereco:'Rua teste',status:'alugada',tenantId:'tenant-test',
  diaVencimento:1,aluguelValor:1100,aluguelHistorico:[],despesas:[],statusHistorico:[],energias:[],
  contracts:[{id:'overdue-contract',inicio:previousMonth+'-01',fim:'',ativo:true,valor:1100,
    diaVencimento:1,modalidade:'entrada',proporcionalValor:0,proporcionalPago:false}],
  pagamentos:[]
};
const overdueTenant={id:'tenant-test',nome:'Inquilino teste',telefone:'',email:''};
uiApi.setData([overdueHouse],[overdueTenant]);
const advancedHouseCard=uiApi.renderHouseCard(overdueHouse);
const tenantCard=uiApi.renderTenantCard(overdueTenant);
assert.match(advancedHouseCard,/is-overdue/);
assert.match(advancedHouseCard,/ATRASADO/);
assert.match(tenantCard,/is-overdue/);
assert.match(tenantCard,/EM ATRASO/);
uiApi.setMode('simple');
const simpleHouseCard=uiApi.renderHouseCard(overdueHouse);
assert.match(simpleHouseCard,/simple-house-card/);
assert.match(simpleHouseCard,/Registrar pagamento/);
assert.doesNotMatch(simpleHouseCard,/Registrar energia/);

const backupPath = join(root,'..','backups','aluguel-backup-2026-07-20.json');
const backup = JSON.parse(await readFile(backupPath,'utf8'));
const normalized = api.normalizeBackupForImport(backup);
assert.equal(normalized.houses.length, 10);
assert.equal(normalized.tenants.length, 9);
assert.equal(normalized.payments.length, 63);
assert.equal(normalized.energy.length, 0);
assert.ok(normalized.houses.some((item) => item.dia_vencimento===30));

const malicious = structuredClone(backup);
malicious.photos = { [malicious.houses[0].id]: ['x" onerror="alert(1)'] };
assert.throws(() => api.normalizeBackupForImport(malicious), /foto inválida/i);

const invalidDue = structuredClone(backup);
invalidDue.houses[0].diaVencimento = 32;
assert.throws(() => api.normalizeBackupForImport(invalidDue), /1 a 31/i);

console.log('Testes concluídos: cobranças, modo simples, atrasos e importação segura estão corretos.');
