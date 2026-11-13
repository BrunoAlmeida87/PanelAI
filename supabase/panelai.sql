-- PanelAI — sincronização na nuvem (Supabase / PostgreSQL 14+).
--
-- Como usar: no painel do Supabase, abra "SQL Editor", cole este arquivo inteiro
-- e clique em "Run". Pode ser executado de novo sem perder dados.
--
-- Modelo: uma única tabela guarda os registros de todas as "casas". Cada casa é
-- identificada pelo hash do seu código secreto. O site nunca lê a tabela
-- diretamente: só chama as duas funções abaixo, que exigem o código da casa.

create table if not exists public.panelai_records (
  house      text        not null,           -- sha256 do código da casa
  collection text        not null,           -- recipes, weeks, notes, ...
  id         text        not null,
  data       jsonb,                          -- nulo quando o registro foi excluído
  deleted    boolean     not null default false,
  changed_at timestamptz not null,           -- hora da alteração no aparelho
  seq        bigint      not null,           -- ordem de chegada (cursor de leitura)
  primary key (house, collection, id)
);

create sequence if not exists public.panelai_seq;
create index if not exists panelai_records_house_seq on public.panelai_records (house, seq);

-- Ninguém acessa a tabela diretamente: RLS ligado e sem nenhuma política.
alter table public.panelai_records enable row level security;
revoke all on public.panelai_records from anon, authenticated;
revoke all on sequence public.panelai_seq from anon, authenticated;

create or replace function public.panelai_house(p_code text)
returns text
language plpgsql
immutable
as $$
begin
  if p_code is null or length(p_code) < 20 or length(p_code) > 200 then
    raise exception 'codigo_invalido';
  end if;
  return encode(sha256(convert_to(p_code, 'UTF8')), 'hex');
end;
$$;

-- Grava registros. Em conflito vence a alteração mais recente.
create or replace function public.panelai_push(p_code text, p_records jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  h text := public.panelai_house(p_code);
  n integer;
begin
  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception 'registros_invalidos';
  end if;
  if jsonb_array_length(p_records) > 500 then
    raise exception 'lote_grande_demais';
  end if;

  insert into public.panelai_records as t (house, collection, id, data, deleted, changed_at, seq)
  select
    h,
    r->>'collection',
    r->>'id',
    case when coalesce((r->>'deleted')::boolean, false) then null else r->'data' end,
    coalesce((r->>'deleted')::boolean, false),
    -- Um relógio adiantado não pode "vencer para sempre".
    least((r->>'changedAt')::timestamptz, now()),
    nextval('public.panelai_seq')
  from jsonb_array_elements(p_records) as r
  where r->>'collection' in ('ingredients', 'recipes', 'pantry', 'weeks', 'marmitas', 'movements', 'purchases', 'notes', 'settings')
    and length(coalesce(r->>'id', '')) between 1 and 200
  on conflict (house, collection, id) do update
    set data = excluded.data,
        deleted = excluded.deleted,
        changed_at = excluded.changed_at,
        seq = excluded.seq
    where t.changed_at <= excluded.changed_at;

  get diagnostics n = row_count;
  return jsonb_build_object('saved', n);
end;
$$;

-- Lê os registros alterados depois do cursor informado.
create or replace function public.panelai_pull(p_code text, p_since bigint default 0, p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  h text := public.panelai_house(p_code);
  lim integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  recs jsonb;
  last_seq bigint;
  n integer;
begin
  select coalesce(jsonb_agg(x.rec order by x.seq), '[]'::jsonb), max(x.seq), count(*)
    into recs, last_seq, n
  from (
    select t.seq,
           jsonb_build_object(
             'collection', t.collection,
             'id', t.id,
             'data', t.data,
             'deleted', t.deleted,
             'changedAt', t.changed_at
           ) as rec
    from public.panelai_records t
    where t.house = h and t.seq > coalesce(p_since, 0)
    order by t.seq
    limit lim
  ) x;

  return jsonb_build_object('records', recs, 'cursor', coalesce(last_seq, p_since, 0), 'more', n = lim);
end;
$$;

revoke all on function public.panelai_push(text, jsonb) from public;
revoke all on function public.panelai_pull(text, bigint, integer) from public;
grant execute on function public.panelai_house(text) to anon, authenticated;
grant execute on function public.panelai_push(text, jsonb) to anon, authenticated;
grant execute on function public.panelai_pull(text, bigint, integer) to anon, authenticated;
