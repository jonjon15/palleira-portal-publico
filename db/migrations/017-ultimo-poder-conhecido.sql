-- 017 — Guardar o último poder de palbox visto de cada jogador
--
-- A palbox só pode ser lida com a pessoa NO JOGO: ela vive na memória do
-- servidor, e o save que alimenta o resto do ranking guarda quantos Pals a
-- pessoa tem, mas não o HP, o IV nem o level de cada um.
--
-- O efeito na tela era um traço em quase toda linha — o dono viu 8 de 14
-- jogadores sem número nenhum em 12/09/2026, porque só quem estava
-- conectado naquele segundo tinha o que mostrar.
--
-- Aqui o número fica guardado quando a pessoa entra. Quem já jogou uma vez
-- desde hoje mantém o valor no ranking mesmo offline, com a data ao lado
-- para ninguém confundir com dado de agora. Em poucos dias de servidor no
-- ar, o traço praticamente some.
--
-- Vai na `players` (e não numa tabela nova) porque é atributo do jogador
-- naquele servidor, exatamente como `level` e `pal_count`, que já moram
-- aqui e vêm da mesma leitura.
--
-- Idempotente.

begin;

alter table players
  add column if not exists poder_hp    bigint,
  add column if not exists poder_level integer,
  add column if not exists poder_ivs   integer,
  -- Quando esse poder foi medido. É o que separa "está assim agora" de
  -- "estava assim na semana passada" na hora de mostrar na tela.
  add column if not exists poder_em    timestamptz;

commit;
