-- 001 — UID canônico e vínculo global
--
-- Duas correções que andam juntas, medidas em 22/08/2026:
--
-- 1. **Formato do UID.** O save grava `AA7C26DC000000000000000000000000` e o
--    PalDefender devolve `AA7C26DC-00000000-00000000-00000000`. A mesma
--    pessoa em duas grafias: nenhum `join` entre `players` e `account_links`
--    encontra ninguém, e a falha é silenciosa — a tela só fica vazia.
--    Aqui os vínculos passam a guardar o formato canônico (sem hífen).
--
-- 2. **Alcance do vínculo.** O `palworld_uid` é da CONTA, não do mundo: o
--    mesmo UID aparece nos três servidores. A trava antiga era
--    `unique (server_slug, palworld_uid)`, o que permitia dois Discords
--    diferentes reivindicarem o mesmo jogador em servidores diferentes.
--    Passa a ser único na tabela inteira.
--
-- Idempotente: rodar duas vezes não muda nada na segunda.
-- Nenhum vínculo é apagado — só reescrito no formato certo.

begin;

update account_links
   set palworld_uid = upper(replace(palworld_uid, '-', ''))
 where palworld_uid <> upper(replace(palworld_uid, '-', ''));

update link_codes
   set palworld_uid = upper(replace(palworld_uid, '-', ''))
 where palworld_uid <> upper(replace(palworld_uid, '-', ''));

-- A trava antiga sai antes da conferência: é ela que permitia a duplicata.
alter table account_links
  drop constraint if exists account_links_server_slug_palworld_uid_key;

do $$
declare
  duplicados int;
begin
  select count(*) into duplicados
    from (select palworld_uid
            from account_links
           group by palworld_uid
          having count(*) > 1) t;

  if duplicados > 0 then
    -- Melhor abortar do que escolher sozinho quem fica com o personagem.
    raise exception
      'Há % personagem(ns) reivindicado(s) por mais de um Discord. Resolva à mão antes de aplicar.',
      duplicados;
  end if;

  if not exists (
    select 1 from pg_constraint c
      join pg_class t on t.oid = c.conrelid
     where t.relname = 'account_links'
       and c.conname = 'account_links_palworld_uid_key'
  ) then
    alter table account_links
      add constraint account_links_palworld_uid_key unique (palworld_uid);
    raise notice 'vínculo agora é único na comunidade inteira';
  else
    raise notice 'já migrado';
  end if;
end $$;

commit;
