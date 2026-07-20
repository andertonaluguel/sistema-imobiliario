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

  // Categorias de despesa (iguais à versão anterior)
  CATEGORIAS: ['Manutenção', 'Pintura', 'IPTU', 'Condomínio', 'Reforma', 'Seguro', 'Outro'],
  DESPESA_STATUS: ['Aberto', 'Orçamento', 'Concluído'],
};
