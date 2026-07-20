/* ============================================================
   config.js — Configuração do projeto
   Preencha com os dados do SEU projeto Supabase:
   Painel do Supabase → Project Settings → API
   - Project URL        →  SUPABASE_URL
   - anon public key     →  SUPABASE_ANON_KEY  (pode ficar no front, é pública)
   ============================================================ */
const CONFIG = {
  SUPABASE_URL: 'https://SEU-PROJETO.supabase.co',
  SUPABASE_ANON_KEY: 'COLE-AQUI-SUA-CHAVE-ANON-PUBLIC',

  // Categorias de despesa (iguais à versão anterior)
  CATEGORIAS: ['Manutenção', 'Pintura', 'IPTU', 'Condomínio', 'Reforma', 'Seguro', 'Outro'],
  DESPESA_STATUS: ['Aberto', 'Orçamento', 'Concluído'],
};
