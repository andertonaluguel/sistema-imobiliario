import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const testsDir = dirname(fileURLToPath(import.meta.url));
const root = dirname(testsDir);
const sessionValues = new Map();
const context = vm.createContext({
  console,
  crypto: { randomUUID },
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

for(const file of ['config.js','utils.js','supabase.js','dashboard.js','auth.js']){
  vm.runInContext(await readFile(join(root,file),'utf8'), context, { filename:file });
}

vm.runInContext(await readFile(join(root,'commercial.js'),'utf8'), context, { filename:'commercial.js' });
vm.runInContext(await readFile(join(root,'minha-casa.js'),'utf8'), context, { filename:'minha-casa.js' });

const api = vm.runInContext(`({
  dueDayForMonth,
  aluguelValorMes,
  normalizeBackupForImport,
  currentMonthStr,
  addMonths,
  computeCobrancaCasa,
  previousEnergyReading,
  normalizeAppTheme
})`, context);

assert.equal(api.normalizeAppTheme('aurora'),'aurora');
assert.equal(api.normalizeAppTheme('desconhecido'),'original');

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
  const state={uiMode:'advanced',houses:[],tenants:[],interests:[],team:[],config:{energiaAtiva:true,pixChave:'12345678909',pixNome:'João da Silva',pixCidade:'São Paulo'}};
  function isSimpleMode(){return state.uiMode==='simple';}
  function tenantOf(h){return state.tenants.find(function(t){return t.id===h.tenantId;})||null;}
`,context);
vm.runInContext(await readFile(join(root,'features.js'),'utf8'),context,{filename:'features.js'});
for(const file of ['houses.js','tenants.js','interests.js']){
  vm.runInContext(await readFile(join(root,file),'utf8'),context,{filename:file});
}
const uiApi=vm.runInContext(`({
  setMode:function(mode){state.uiMode=mode;},
  setData:function(houses,tenants,interests){state.houses=houses;state.tenants=tenants;state.interests=interests||[];},
  renderHouseCard,
  renderTenantCard,
  interestMatchesHouse,
  matchingHousesForInterest
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

const vacantHouse={id:'vacant',nome:'Casa vaga',status:'vaga',aluguelValor:900,quartos:2,banheiros:1,sala:true,cozinha:true,garagem:true,quintal:true,areaServico:false};
const compatible={nome:'Interessado A',status:'quente',valorMaximo:1000,quartosMin:2,banheirosMin:1,precisaSala:true,precisaCozinha:true,precisaGaragem:true,precisaQuintal:false,precisaAreaServico:false};
const needsLaundry={...compatible,nome:'Interessado B',precisaAreaServico:true};
uiApi.setData([vacantHouse],[],[compatible,needsLaundry]);
assert.equal(uiApi.interestMatchesHouse(compatible,vacantHouse),true);
assert.equal(uiApi.interestMatchesHouse(needsLaundry,vacantHouse),false);
assert.equal(uiApi.matchingHousesForInterest(compatible).length,1);

const pixCode=vm.runInContext('generatePixPayload(950)',context);
assert.match(pixCode,/^000201/);
assert.match(pixCode,/BR\.GOV\.BCB\.PIX/);
assert.match(pixCode,/6304[0-9A-F]{4}$/);
assert.equal(vm.runInContext("pixCrc16('123456789')",context),'29B1');

const backupPath = join(root,'..','backups','aluguel-backup-2026-07-20.json');
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
assert.equal(normalized.config.tema,'original');
assert.equal(normalized.config.pix_chave,'');

const malicious = structuredClone(backup);
malicious.photos = { [malicious.houses[0].id]: ['x" onerror="alert(1)'] };
assert.throws(() => api.normalizeBackupForImport(malicious), /foto inválida/i);

const invalidDue = structuredClone(backup);
invalidDue.houses[0].diaVencimento = 32;
assert.throws(() => api.normalizeBackupForImport(invalidDue), /1 a 31/i);

const appSource = await readFile(join(root,'app.js'),'utf8');
const authSource = await readFile(join(root,'auth.js'),'utf8');
const configSource = await readFile(join(root,'config.js'),'utf8');
const commercialSource = await readFile(join(root,'commercial.js'),'utf8');
const dashboardSource = await readFile(join(root,'dashboard.js'),'utf8');
const tenantsSource = await readFile(join(root,'tenants.js'),'utf8');
const interestsSource = await readFile(join(root,'interests.js'),'utf8');
const styleSource = await readFile(join(root,'style.css'),'utf8');
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
assert.match(tenantsSource,/Inquilino · sem plano/);
assert.match(tenantsSource,/nenhuma possui plano do aplicativo/);

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
assert.match(myHomeCssSource,/--mh-lime:#E7F77B/);
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
/* Comercial continua preso à conta Mestre: nunca é vendido. */
assert.match(appSource,/state\.isPlatformAdmin && \['rent-product-switch commercial'/);
assert.doesNotMatch(appSource,/temModulo\('comercial'\)/);

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
assert.match(vitrineSource,/function gravarFiltrosNaUrl\(\)/);
/* A vitrine pública não segue o tema do proprietário: é a sua marca. */
assert.match(vitrineSource,/applyAppTheme\('original'\)/);
/* Nenhuma cor inventada: a aba usa o dourado que já existe. */
assert.match(vitrineCssSource,/\.rent-product-switch\.vitrine/);
/* O cabecalho tem que ser FILHO DIRETO de .rental-app: o estilo dele usa
   o seletor `.rental-app > .page-header`. Um <section> em volta tirava o
   arredondamento e o respiro que as outras abas tem. */
assert.doesNotMatch(vitrineSource,/<section class="vitrine-page">/);
assert.match(vitrineSource,/<nav class="rent-tabs"/);
assert.match(vitrineSource,/<div class="page-header vitrine-header">/);
/* A navegacao vem antes do heroi, igual as outras abas. */
assert.ok(
  vitrineSource.indexOf('<nav class="rent-tabs"') <
    vitrineSource.indexOf('<div class="page-header vitrine-header">'),
  'As abas internas vem antes do cabecalho, como no resto do app.'
);
/* Nada de recriar componente que ja existe. */
assert.doesNotMatch(vitrineCssSource,/\.vitrine-tabs\{/);
assert.doesNotMatch(vitrineCssSource,/\.vitrine-page\{/);
assert.match(rentalUiCssSource,/--rent-gold:#F0C76E/);

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
assert.match(headersSource,/img-src[^;]*tile\.openstreetmap\.org/);
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

console.log('Testes concluídos: Aluguéis 1.3, Clientes proprietários, separação exclusiva de papéis, cadastro protegido, Minha Casa, exclusão segura, navegação móvel, acabamento visual, planos, equipe, anúncios, PIX, limites, cobranças, Energia, interessados, temas, descrição, backup, módulos vendáveis, Minha Casa multi-família Vitrine, cabeçalho e pagamentos da Minha Casa estão corretos.');
