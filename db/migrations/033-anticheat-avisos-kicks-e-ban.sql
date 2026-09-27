-- 033 — Anticheat: 5 avisos por kick, ban depois do 3º kick
--
-- Pedido do dono em 27/09/2026, depois do caso do Fabao (lanterna Brilho
-- Noturno com dano e velocidade alterados): ele levou kick, voltou e
-- continuou — kick sozinho não segura quem insiste. A escada agora é:
--
--   5 avisos → kick 1 → 5 avisos → kick 2 → 5 avisos → kick 3 → 5 avisos → ban
--
-- Os 5 avisos antes de cada kick são para a pessoa ficar ciente; cada um
-- diz em qual aviso ela está e o que vem depois.
--
-- `kicks` começa em 0 para quem já foi kickado antes: as regras antigas
-- não avisavam desse jeito, então a contagem para o ban vale a partir de
-- agora.
--
-- Idempotente.

begin;

-- Quantos avisos desde o último kick (por tipo, como o resto da tabela).
alter table anticheat_warnings
  add column if not exists avisos integer not null default 0;

-- Quantos kicks do anticheat este jogador já levou neste tipo, e quando
-- foi banido. O ban olha a soma dos tipos: dano e stamina contam juntos.
alter table anticheat_kicks
  add column if not exists kicks integer not null default 0;
alter table anticheat_kicks
  add column if not exists banido_em timestamptz;

commit;
