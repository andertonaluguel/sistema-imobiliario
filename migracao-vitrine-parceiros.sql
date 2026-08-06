-- ============================================================
-- migracao-vitrine-parceiros.sql
-- A página "Anunciar": quem chega com imóvel, não atrás de um.
--
-- Por que tabela separada de `vitrine_leads`:
--   Lead de vitrine é quem quer ALUGAR um imóvel — tem imovel_id
--   obrigatório, entra no funil de visita e conta na taxa de conversão
--   do anúncio. Quem chega pela página Anunciar é o oposto: tem imóvel
--   para colocar, não tem imóvel para ver, e a conversa dele é comercial.
--   Empurrar os dois para a mesma caixa estragaria a métrica de um e
--   faria o outro se perder no meio.
--
-- Os dois caminhos gravados em `caminho` são os dois negócios:
--   'divulgar'   — põe o imóvel dele na vitrine de quem opera a conta
--   'plataforma' — quer o próprio portal e administrar o próprio estoque
--
-- Preço não mora aqui. Enquanto o modelo de cobrança não estiver
-- fechado (por anúncio, mensalidade, % do aluguel), a tabela guarda
-- só o contato e o contexto — que é o que não muda quando o preço mudar.
--
-- Segura, transacional e REEXECUTÁVEL.
-- ⚠️ NÃO aplicar em produção sem autorização do responsável.
-- ============================================================
begin;

do $$
begin
  if to_regclass('public.vitrine_leads') is null then
    raise exception 'Rode antes o arquivo migracao-vitrine.sql.';
  end if;
  if not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='proprietarios' and column_name='slug_publico') then
    raise exception 'Rode antes o arquivo migracao-vitrine-corretora.sql.';
  end if;
end
$$;

create table if not exists public.vitrine_parceiros (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.proprietarios(user_id) on delete cascade,
  caminho     text not null default 'divulgar'
              check (caminho in ('divulgar','plataforma')),
  nome        text not null,
  telefone    text not null,
  email       text not null default '',
  cidade      text not null default '',
  quantidade  text not null default '',
  mensagem    text not null default '',
  -- o mesmo vocabulário de status dos leads, para a tela não inventar
  -- um funil paralelo
  status      text not null default 'novo'
              check (status in ('novo','conversando','proposta','fechado','perdido')),
  -- de onde veio: serve para saber se a página converte ou se o
  -- contato veio de campanha
  origem      text not null default 'anunciar',
  utm_source  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint vitrine_parceiro_nome_check check (char_length(trim(nome)) between 2 and 120),
  constraint vitrine_parceiro_msg_check  check (char_length(mensagem) <= 600)
);

create index if not exists vitrine_parceiros_user_idx
  on public.vitrine_parceiros(user_id, created_at desc);

alter table public.vitrine_parceiros enable row level security;
alter table public.vitrine_parceiros force row level security;

-- O dono da conta lê e trabalha a lista. Escrita pública é só pela RPC.
drop policy if exists vitrine_parceiros_dono on public.vitrine_parceiros;
create policy vitrine_parceiros_dono on public.vitrine_parceiros
  for all to authenticated
  using (user_id = public.usuario_proprietario_id(auth.uid()))
  with check (user_id = public.usuario_proprietario_id(auth.uid()));

revoke all on table public.vitrine_parceiros from public,anon;
grant select,insert,update,delete on table public.vitrine_parceiros to authenticated;

-- ------------------------------------------------------------
-- Registro público
--
-- Anônimo grava, mas nunca escolhe a conta: `user_id` sai do slug, não
-- do que o navegador mandou. E o mesmo telefone não abre chamado novo a
-- cada clique — dentro de uma hora, o envio atualiza o que já existe.
-- Sem isso a lista vira dez linhas da mesma pessoa impaciente.
-- ------------------------------------------------------------
create or replace function public.vitrine_registrar_parceiro(
  p_slug       text,
  p_caminho    text,
  p_nome       text,
  p_telefone   text,
  p_cidade     text default '',
  p_quantidade text default '',
  p_mensagem   text default '',
  p_utm        text default ''
)
returns jsonb language plpgsql volatile security definer set search_path=public
as $$
declare
  v_owner    uuid;
  v_nome     text := trim(coalesce(p_nome,''));
  v_tel      text := regexp_replace(coalesce(p_telefone,''),'\D','','g');
  v_caminho  text := case when p_caminho='plataforma' then 'plataforma' else 'divulgar' end;
  v_id       uuid;
begin
  select user_id into v_owner from public.proprietarios where slug_publico=p_slug limit 1;
  if v_owner is null then
    raise exception 'Vitrine não encontrada.';
  end if;
  if char_length(v_nome) < 2 then
    raise exception 'Informe o nome.';
  end if;
  if char_length(v_tel) < 10 then
    raise exception 'Informe um WhatsApp válido.';
  end if;

  select id into v_id
  from public.vitrine_parceiros
  where user_id = v_owner
    and regexp_replace(telefone,'\D','','g') = v_tel
    and created_at > now() - interval '1 hour'
  limit 1;

  if v_id is not null then
    update public.vitrine_parceiros
       set caminho    = v_caminho,
           nome       = v_nome,
           cidade     = left(coalesce(trim(p_cidade),''),120),
           quantidade = left(coalesce(trim(p_quantidade),''),40),
           mensagem   = left(coalesce(trim(p_mensagem),''),600),
           updated_at = now()
     where id = v_id;
    return jsonb_build_object('ok', true, 'repetido', true);
  end if;

  insert into public.vitrine_parceiros(
      user_id, caminho, nome, telefone, cidade, quantidade, mensagem, utm_source)
  values (v_owner, v_caminho, v_nome, left(coalesce(trim(p_telefone),''),40),
          left(coalesce(trim(p_cidade),''),120), left(coalesce(trim(p_quantidade),''),40),
          left(coalesce(trim(p_mensagem),''),600), left(coalesce(trim(p_utm),''),80));

  return jsonb_build_object('ok', true);
end
$$;

revoke all on function
  public.vitrine_registrar_parceiro(text,text,text,text,text,text,text,text) from public;
grant execute on function
  public.vitrine_registrar_parceiro(text,text,text,text,text,text,text,text) to anon,authenticated;

do $$
begin
  if to_regprocedure('public.registrar_migracao(text,text)') is not null then
    perform public.registrar_migracao('migracao-vitrine-parceiros.sql',
      'Pagina Anunciar: captacao de proprietario, corretor e imobiliaria');
  end if;
end $$;

commit;
