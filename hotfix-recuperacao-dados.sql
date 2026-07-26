-- Correção segura: não altera nem exclui casas, inquilinos ou pagamentos.
-- Repara somente as funções de leitura da área Comercial.

begin;

create or replace function public.listar_vendas_comerciais()
returns table(id uuid,nome text,email text,telefone text,documento text,empresa text,plano text,status text,
  pagamento_status text,valor_pago numeric,forma_pagamento text,referencia_pagamento text,observacoes text,
  expira_em timestamptz,aceito_em timestamptz,created_at timestamptz)
language plpgsql security definer set search_path=public
as $$ begin
  if not public.e_administrador_plataforma(auth.uid()) then raise exception 'Acesso negado.'; end if;
  update public.convites_proprietario c set status='expirado',updated_at=now()
    where c.status='pendente' and c.expira_em<now();
  return query select c.id,c.nome,c.email,c.telefone,c.documento,c.empresa,c.plano,c.status,c.pagamento_status,
    c.valor_pago,c.forma_pagamento,c.referencia_pagamento,c.observacoes,c.expira_em,c.aceito_em,c.created_at
  from public.convites_proprietario c order by c.created_at desc;
end $$;
revoke all on function public.listar_vendas_comerciais() from public,anon;
grant execute on function public.listar_vendas_comerciais() to authenticated;

create or replace function public.listar_administradores_plataforma()
returns table(user_id uuid,email text,created_at timestamptz)
language plpgsql security definer set search_path=public,auth
as $$ begin
  if not public.e_administrador_plataforma(auth.uid()) then raise exception 'Acesso negado.'; end if;
  return query select a.user_id,u.email::text,a.created_at
  from public.administradores_plataforma a
  join auth.users u on u.id=a.user_id
  order by a.created_at;
end $$;
revoke all on function public.listar_administradores_plataforma() from public,anon;
grant execute on function public.listar_administradores_plataforma() to authenticated;

create or replace function public.listar_auditoria_comercial()
returns table(acao text,detalhes jsonb,administrador_email text,cliente_email text,created_at timestamptz)
language plpgsql security definer set search_path=public,auth
as $$ begin
  if not public.e_administrador_plataforma(auth.uid()) then raise exception 'Acesso negado.'; end if;
  return query select a.acao,a.detalhes,ua.email::text,uc.email::text,a.created_at
  from public.auditoria_comercial a
  left join auth.users ua on ua.id=a.administrador_id
  left join auth.users uc on uc.id=a.cliente_id
  order by a.created_at desc limit 100;
end $$;
revoke all on function public.listar_auditoria_comercial() from public,anon;
grant execute on function public.listar_auditoria_comercial() to authenticated;

commit;
