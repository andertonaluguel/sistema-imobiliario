/*
 * Dados e adaptadores do ambiente demonstrativo.
 *
 * Este arquivo substitui exclusivamente as camadas Supabase/offline durante a
 * captura de materiais comerciais. A interface continua sendo renderizada
 * pelos modulos reais do aplicativo.
 */

const DEMO_CAPTURE = true;
let _actingOwnerId = null;

function _demoClone(value){
  if(typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function _demoDateInMonth(month, day){
  const parts=String(month).split('-');
  const lastDay=new Date(Number(parts[0]),Number(parts[1]),0).getDate();
  return month+'-'+String(Math.min(Math.max(1,day),lastDay)).padStart(2,'0');
}

function _demoPayments(contractId,value,includeCurrent,count){
  const rows=[];
  const start=includeCurrent?0:1;
  for(let offset=start;offset<start+count;offset++){
    const month=addMonths(currentMonthStr(),-offset);
    rows.push({
      id:'pay-'+contractId+'-'+month,
      mes:month,
      valorPago:value,
      dataPagamento:_demoDateInMonth(month,offset%2===0?8:6),
      contractId:contractId
    });
  }
  return rows;
}

function _demoEnergy(contractId,includeCurrent,count,baseKwh){
  const rows=[];
  const start=includeCurrent?0:1;
  let previous=3820;
  for(let offset=start;offset<start+count;offset++){
    const month=addMonths(currentMonthStr(),-offset);
    const kwh=baseKwh+(offset%3)*7;
    const value=Number((kwh*0.92+18.4).toFixed(2));
    rows.push({
      id:'energy-'+contractId+'-'+month,
      mes:month,
      contractId:contractId,
      valor:value,
      kwh:kwh,
      leituraAnterior:previous,
      leituraAtual:previous+kwh,
      tarifaKwh:0.92,
      acrescimos:18.4,
      descontos:0,
      ajusteDescricao:'Taxas da distribuidora',
      valorCalculado:value,
      valorManual:false,
      vencimento:_demoDateInMonth(month,12),
      fotoPath:'',
      pago:offset>0 || includeCurrent,
      dataPagamento:(offset>0 || includeCurrent)?_demoDateInMonth(month,10):''
    });
    previous+=kwh;
  }
  return rows;
}

function _demoContract(id,houseId,tenantId,value,dueDay,startMonthsAgo){
  const startMonth=addMonths(currentMonthStr(),-startMonthsAgo);
  return {
    id:id,
    houseId:houseId,
    tenantId:tenantId,
    inicio:_demoDateInMonth(startMonth,1),
    fim:'',
    valor:value,
    diaVencimento:dueDay,
    modalidade:'fixo',
    ativo:true,
    proporcionalDias:0,
    proporcionalValor:0,
    proporcionalPago:false,
    proporcionalDataPagamento:''
  };
}

function _demoBuildFixture(){
  const current=currentMonthStr();
  const previous=addMonths(current,-1);
  const year=Number(current.slice(0,4));
  // Os históricos cobrem todo o contrato demonstrativo. Assim, somente o
  // mês propositalmente pendente aparece como alerta — sem simular uma dívida
  // acumulada que o material comercial não precisa sugerir.
  const contract1=_demoContract('contract-jardim','house-jardim','tenant-ana',1600,10,9);
  const contract2=_demoContract('contract-ipe','house-ipe','tenant-lucas',1850,5,9);
  const contract3=_demoContract('contract-central','house-central','tenant-bruna',1750,28,6);

  const tenants=[
    {id:'tenant-ana',nome:'Ana Martins',telefone:'(11) 90000-0101',email:'ana.demo@exemplo.com',documento:'***.***.***-**',emergenciaNome:'Contato cadastrado'},
    {id:'tenant-lucas',nome:'Lucas Ribeiro',telefone:'(11) 90000-0102',email:'lucas.demo@exemplo.com',documento:'***.***.***-**',emergenciaNome:'Contato cadastrado'},
    {id:'tenant-bruna',nome:'Bruna Alves',telefone:'(11) 90000-0103',email:'bruna.demo@exemplo.com',documento:'***.***.***-**',emergenciaNome:'Contato cadastrado'}
  ];

  const houses=[
    {
      id:'house-jardim',nome:'Casa Jardim',endereco:'Rua das Palmeiras, 120',status:'alugada',
      aluguelValor:1600,diaVencimento:10,ultimaVistoria:_demoDateInMonth(addMonths(current,-2),18),
      tenantId:'tenant-ana',contratoInicio:contract1.inicio,contratoFim:'',quartos:2,banheiros:1,
      cozinha:true,sala:true,garagem:true,quintal:true,areaServico:true,publicado:false,
      descricaoPublica:'',energiaAtiva:true,energiaDiaVencimento:12,
      statusHistorico:[{data:contract1.inicio,status:'alugada',tenantId:'tenant-ana'}],contracts:[contract1],
      pagamentos:_demoPayments(contract1.id,1600,true,10),
      despesas:[
        {id:'expense-jardim-1',descricao:'Revisão preventiva do telhado',categoria:'Manutenção',valor:420,data:_demoDateInMonth(addMonths(current,-2),14),prestador:'Equipe cadastrada',status:'Concluído'},
        {id:'expense-jardim-2',descricao:'Limpeza da caixa-d’água',categoria:'Manutenção',valor:180,data:_demoDateInMonth(addMonths(current,-5),9),prestador:'Equipe cadastrada',status:'Concluído'}
      ],
      aluguelHistorico:[{id:'rent-history-jardim',data:_demoDateInMonth(addMonths(current,-8),1),valor:1600}],
      energias:_demoEnergy(contract1.id,true,8,176)
    },
    {
      id:'house-ipe',nome:'Casa Ipe',endereco:'Avenida do Parque, 45',status:'alugada',
      aluguelValor:1850,diaVencimento:5,ultimaVistoria:_demoDateInMonth(addMonths(current,-4),22),
      tenantId:'tenant-lucas',contratoInicio:contract2.inicio,contratoFim:'',quartos:3,banheiros:2,
      cozinha:true,sala:true,garagem:true,quintal:false,areaServico:true,publicado:false,
      descricaoPublica:'',energiaAtiva:true,energiaDiaVencimento:10,
      statusHistorico:[{data:contract2.inicio,status:'alugada',tenantId:'tenant-lucas'}],contracts:[contract2],
      pagamentos:_demoPayments(contract2.id,1850,false,9),
      despesas:[
        {id:'expense-ipe-1',descricao:'Troca de reparo hidráulico',categoria:'Manutenção',valor:265,data:_demoDateInMonth(current,16),prestador:'Equipe cadastrada',status:'Concluído'}
      ],
      aluguelHistorico:[],energias:_demoEnergy(contract2.id,false,7,204)
    },
    {
      id:'house-vila',nome:'Casa Vila Nova',endereco:'Rua das Acacias, 318',status:'vaga',
      aluguelValor:1450,diaVencimento:8,ultimaVistoria:_demoDateInMonth(previous,25),tenantId:'',
      contratoInicio:'',contratoFim:'',quartos:2,banheiros:1,cozinha:true,sala:true,garagem:true,
      quintal:true,areaServico:true,publicado:true,
      descricaoPublica:'Casa arejada, com quintal e garagem, pronta para receber novos moradores.',
      energiaAtiva:true,energiaDiaVencimento:10,
      statusHistorico:[{data:_demoDateInMonth(previous,20),status:'vaga',tenantId:''}],contracts:[],pagamentos:[],
      despesas:[{id:'expense-vila-1',descricao:'Pintura para nova locação',categoria:'Pintura',valor:980,data:_demoDateInMonth(previous,21),prestador:'Equipe cadastrada',status:'Concluído'}],
      aluguelHistorico:[],energias:[]
    },
    {
      id:'house-horizonte',nome:'Casa Horizonte',endereco:'Alameda das Flores, 77',status:'manutencao',
      aluguelValor:2100,diaVencimento:7,ultimaVistoria:_demoDateInMonth(current,3),tenantId:'',
      contratoInicio:'',contratoFim:'',quartos:3,banheiros:2,cozinha:true,sala:true,garagem:true,
      quintal:true,areaServico:true,publicado:false,descricaoPublica:'',energiaAtiva:false,energiaDiaVencimento:10,
      statusHistorico:[{data:_demoDateInMonth(current,4),status:'manutencao',tenantId:''}],contracts:[],pagamentos:[],
      despesas:[
        {id:'expense-horizonte-1',descricao:'Reparo na instalação elétrica',categoria:'Manutenção',valor:780,data:_demoDateInMonth(current,18),prestador:'Orçamento em análise',status:'Orçamento'},
        {id:'expense-horizonte-2',descricao:'Pintura interna',categoria:'Pintura',valor:1350,data:_demoDateInMonth(current,20),prestador:'Equipe cadastrada',status:'Aberto'}
      ],aluguelHistorico:[],energias:[]
    },
    {
      id:'house-central',nome:'Casa Central',endereco:'Rua do Mercado, 205',status:'alugada',
      aluguelValor:1750,diaVencimento:28,ultimaVistoria:_demoDateInMonth(addMonths(current,-1),11),
      tenantId:'tenant-bruna',contratoInicio:contract3.inicio,contratoFim:'',quartos:2,banheiros:2,
      cozinha:true,sala:true,garagem:false,quintal:false,areaServico:true,publicado:false,
      descricaoPublica:'',energiaAtiva:true,energiaDiaVencimento:28,
      statusHistorico:[{data:contract3.inicio,status:'alugada',tenantId:'tenant-bruna'}],contracts:[contract3],
      pagamentos:_demoPayments(contract3.id,1750,false,6),despesas:[],aluguelHistorico:[],
      energias:_demoEnergy(contract3.id,false,6,148)
    }
  ];

  const interests=[
    {id:'interest-marina',nome:'Marina Costa',telefone:'(11) 90000-0201',valorMaximo:1600,quartosMin:2,banheirosMin:1,precisaGaragem:true,precisaQuintal:true,precisaCozinha:true,precisaSala:true,precisaAreaServico:false,observacoes:'Busca mudanca para o proximo mes. Prefere rua tranquila.',status:'quente',tenantId:'',createdAt:_demoDateInMonth(current,7)+'T14:00:00Z'},
    {id:'interest-caio',nome:'Caio Mendes',telefone:'(11) 90000-0202',valorMaximo:1500,quartosMin:2,banheirosMin:1,precisaGaragem:false,precisaQuintal:false,precisaCozinha:true,precisaSala:true,precisaAreaServico:true,observacoes:'Visita prevista para esta semana.',status:'visita',tenantId:'',createdAt:_demoDateInMonth(current,11)+'T10:30:00Z'},
    {id:'interest-renata',nome:'Renata Lima',telefone:'(11) 90000-0203',valorMaximo:2200,quartosMin:3,banheirosMin:2,precisaGaragem:true,precisaQuintal:false,precisaCozinha:true,precisaSala:true,precisaAreaServico:true,observacoes:'Em acompanhamento; aguarda imovel com tres quartos.',status:'conversando',tenantId:'',createdAt:_demoDateInMonth(current,15)+'T09:15:00Z'}
  ];

  const eventos=[
    {id:'event-1',titulo:'Visita - Casa Vila Nova',data:_demoDateInMonth(current,24),hora:'15:00',tipo:'visita',houseId:'house-vila',observacoes:'Contato demonstrativo'},
    {id:'event-2',titulo:'Retorno sobre manutenção',data:_demoDateInMonth(current,23),hora:'09:30',tipo:'manutencao',houseId:'house-horizonte',observacoes:'Validar orçamento'}
  ];

  const config={
    locadorNome:'Gestão Horizonte',locadorDocumento:'',energiaAtiva:true,tema:'original',onboardingConcluido:true,
    ultimoBackupExterno:_demoDateInMonth(current,10),pixChave:'',pixNome:'',pixCidade:''
  };

  const portalDocuments=[
    {id:'doc-contract-demo',houseId:'house-jardim',tenantId:'tenant-ana',tipo:'contrato',nome:'Contrato de locacao - demonstracao.pdf',mime:'application/pdf',tamanho:248320,storagePath:'',visivelInquilino:true,dados:'',url:''},
    {id:'doc-inspection-demo',houseId:'house-jardim',tenantId:'tenant-ana',tipo:'vistoria',nome:'Vistoria de entrada - demonstracao.pdf',mime:'application/pdf',tamanho:512480,storagePath:'',visivelInquilino:true,dados:'',url:''}
  ];

  return {current:current,year:year,houses:houses,tenants:tenants,interests:interests,eventos:eventos,config:config,portalDocuments:portalDocuments};
}

const DEMO_FIXTURE=_demoBuildFixture();
const DEMO_SESSION={
  access_token:'demo-read-only-token',
    user:{id:'demo-owner',email:'demonstracao@aluguel.app',user_metadata:{nome:'Gestão Horizonte'}}
};

const sb={
  auth:{
    async getSession(){return {data:{session:_demoClone(DEMO_SESSION)},error:null};},
    onAuthStateChange(){return {data:{subscription:{unsubscribe:function(){}}}};},
    async getUser(){return {data:{user:_demoClone(DEMO_SESSION.user)},error:null};},
    async signOut(){return {error:null};},
    async updateUser(){return {data:null,error:new Error('Modo demonstrativo somente leitura.')};},
    async signInWithPassword(){return {data:null,error:new Error('Modo demonstrativo somente leitura.')};}
  }
};

async function _authUserId(){return 'demo-owner';}

const offlineCache={
  async save(){return null;},
  async load(){return null;},
  async remove(){return null;}
};

function renderOfflineBanner(){return '';}
async function retryOnlineLoad(){return null;}
async function ensureDailySnapshot(){return null;}

function _demoOwnerProfile(){
  return {
    role:'owner',access:null,staff:null,
    owner:{id:'demo-owner',slug_publico:'demonstracao',nome_publico:'Imoveis Horizonte',contato_publico:''},
    commercial:{plano:'premium',status:'ativa',podeAcessar:true,termosAceitos:true,administradorPlataforma:false,
      limiteCasas:100,limiteArmazenamento:10*1024*1024*1024,armazenamentoUsado:42*1024*1024}
  };
}

function _demoTenantProfile(){
  return {role:'tenant',access:{id:'demo-access',inquilinoId:'tenant-ana',ativo:true},staff:null,owner:null,commercial:null};
}

const _demoDbReadOnly={
  async loadRole(){
    const screen=(new URLSearchParams(location.search).get('screen')||'').toLowerCase();
    return screen==='portal'?_demoTenantProfile():_demoOwnerProfile();
  },
  async loadAll(){
    return _demoClone({houses:DEMO_FIXTURE.houses,tenants:DEMO_FIXTURE.tenants,interests:DEMO_FIXTURE.interests,eventos:DEMO_FIXTURE.eventos,config:DEMO_FIXTURE.config});
  },
  async listTenantAccess(){
    return [{id:'demo-access',tenantId:'tenant-ana',email:'ana.demo@exemplo.com',ativo:true}];
  },
  async listTeam(){return [];},
  async loadTenantPortal(){
    return _demoClone({
      houses:[DEMO_FIXTURE.houses.find(function(h){return h.id==='house-jardim';})],
      tenants:[DEMO_FIXTURE.tenants.find(function(t){return t.id==='tenant-ana';})],
      config:DEMO_FIXTURE.config,
      documents:DEMO_FIXTURE.portalDocuments
    });
  },
  async loadPublicListings(){
    const house=DEMO_FIXTURE.houses.find(function(h){return h.id==='house-vila';});
    return _demoClone({
      perfil:{nome:'Imoveis Horizonte - demonstracao',contato:'',tema:'original'},
      imoveis:[{
        id:house.id,nome:house.nome,endereco:house.endereco,aluguelValor:house.aluguelValor,
        quartos:house.quartos,banheiros:house.banheiros,sala:house.sala,cozinha:house.cozinha,
        garagem:house.garagem,quintal:house.quintal,areaServico:house.areaServico,
        descricao:house.descricaoPublica,fotoUrl:''
      }]
    });
  },
  async getPhotos(){return [];},
  async getDocuments(houseId){
    return _demoClone(DEMO_FIXTURE.portalDocuments.filter(function(d){return d.houseId===houseId;}));
  }
};

const db=new Proxy(_demoDbReadOnly,{
  get:function(target,property){
    if(property in target)return target[property];
    if(typeof property==='symbol')return target[property];
    return async function(){throw new Error('Modo demonstrativo somente leitura: operacao "'+String(property)+'" bloqueada.');};
  }
});

window.__ALUGUEL_DEMO__={
  enabled:true,
  readOnly:true,
  currentMonth:DEMO_FIXTURE.current,
  fixture:function(){return _demoClone(DEMO_FIXTURE);}
};
