-- 006 — Pal guardado só resgata no mesmo servidor, e só depois de um tempo
--
-- Duas fintas que davam para tentar com o cofre de Pal como ele estava: (1)
-- guardar e resgatar de volta repetidas vezes, escolhendo um servidor
-- diferente a cada resgate, inflava contadores de captura do jogo sem o
-- jogador ter capturado o Pal de novo; (2) guardar → resgatar imediatamente
-- virava um teleporte instantâneo entre servidores, sem fricção nenhuma.
--
-- A cura para os dois é a mesma: o Pal lembra de qual servidor saiu
-- (`server_slug`), e só volta para lá — nunca para outro. E só volta depois
-- de um tempo mínimo dentro do cofre (`lib/pal-cofre.ts`,
-- `COOLDOWN_RESGATE_HORAS`). O mesmo dado atravessa o mercado: quem compra
-- um Pal herda o servidor de origem de quem vendeu.
--
-- Nullable de propósito: Pal já guardado antes desta migração, ou semeado
-- por staff em `semearPalDeTeste` (que nunca passa pelo jogo), não tem
-- servidor de origem — fica sem a trava, não trava sem explicação.
--
-- Idempotente.

begin;

alter table vault_pals
  add column if not exists server_slug text;

alter table listings
  add column if not exists pal_server_slug text;

commit;
