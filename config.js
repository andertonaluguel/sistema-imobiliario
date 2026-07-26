/* ============================================================
   config.js — Configuração do projeto
   Preencha com os dados do SEU projeto Supabase:
   Painel do Supabase → Project Settings → API
   - Project URL        →  SUPABASE_URL
   - publishable key     →  SUPABASE_ANON_KEY  (pode ficar no front, é pública)
   ============================================================ */
const CONFIG = {
  SUPABASE_URL: 'https://tdpoafmvqajxatxtshau.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_QkMJSs8jwHXbFirYNiPVAw_Xgt4q5Yi',

  APP_NAME: 'Aluguel',
  APP_VERSION: 'Aluguéis 1.3',
  SUPPORT_EMAIL: 'andertonaluguel@gmail.com',
  MASTER_EMAILS: ['andertonaluguel@gmail.com','andertonunito@gmail.com'],

  // Módulos vendáveis. O módulo diz O QUE a conta acessa; o plano
  // (abaixo) diz QUANTO ela pode usar. São eixos independentes.
  // A área Comercial não entra aqui: ela nunca é vendida.
  MODULOS: [
    {id:'alugueis',  chave:'alugueis',  nome:'Aluguéis',
     descricao:'Contratos, pagamentos, inquilinos e relatórios'},
    {id:'minhaCasa', chave:'minha_casa',nome:'Minha Casa',
     descricao:'Financeiro familiar — produto de entrada'},
    {id:'vitrine',   chave:'vitrine',   nome:'Vitrine',
     descricao:'Catálogo público de imóveis de terceiros'}
  ],

  // Faixas da taxa de divulgação da Vitrine, por valor do aluguel.
  // Editável aqui; nada fica fixo no meio do código.
  VITRINE_TAXAS: [
    {ateAluguel:1000,   valor:100, destaque:40, nome:'Simples'},
    {ateAluguel:2000,   valor:150, destaque:50, nome:'Padrão'},
    {ateAluguel:Infinity,valor:200,destaque:60, nome:'Alto'}
  ],
  VITRINE_DIAS_PADRAO: 60,

  // Os limites também são validados no banco. Estes valores servem para
  // apresentar o plano na interface antes de qualquer tentativa de gravação.
  PLANOS: {
    gratuito: { nome:'Gratuito', casas:1, armazenamentoBytes:50*1024*1024 },
    basico: { nome:'Básico', casas:3, armazenamentoBytes:1024*1024*1024 },
    premium: { nome:'Premium', casas:100, armazenamentoBytes:10*1024*1024*1024 }
  },

  // Categorias de despesa (iguais à versão anterior)
  CATEGORIAS: ['Manutenção', 'Pintura', 'IPTU', 'Condomínio', 'Reforma', 'Seguro', 'Outro'],
  DESPESA_STATUS: ['Aberto', 'Orçamento', 'Concluído'],
};
