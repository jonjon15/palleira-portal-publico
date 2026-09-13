-- 018 — O anúncio de Pal lembra desde quando o Pal está no cofre
--
-- A trava da migração 006 exige um tempo mínimo dentro do cofre antes de
-- resgatar, contado pelo `imported_at`. Só que anunciar TIRA o Pal do cofre
-- e cancelar coloca de volta — e o insert de volta não passava a data
-- original, então o banco carimbava `now()` e a contagem recomeçava do zero.
--
-- Efeito real, relatado pelo Santos em 12/09/2026: guardou o Shadowbeak às
-- 19:58, anunciou às 20:02, cancelou às 01:16 — cinco horas e dezoito
-- minutos de cofre cumpridos — e o site disse "libera em cerca de 3h",
-- porque o cancelamento tinha zerado o relógio.
--
-- Ele entendeu a regra do jeito certo: o tempo conta de quando o Pal entrou
-- no cofre, não de quando o anúncio foi cancelado. O anúncio é uma vitrine,
-- não uma saída do cofre.
--
-- A coluna guarda essa data enquanto o Pal está anunciado, para o
-- cancelamento devolver o Pal com a data que ele já tinha.
--
-- Nula para anúncio criado antes desta migração: nesse caso o cancelamento
-- cai no comportamento antigo (`now()`), que é o que existe hoje — nunca
-- pior do que está.
--
-- Idempotente.

begin;

alter table listings
  add column if not exists pal_imported_at timestamptz;

commit;
