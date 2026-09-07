-- Fecha o gap que a fase 2 da restauração paga deixou em aberto: um pedido
-- pago que vira `recusado` (ex.: destino colidiu com base alheia) não tem
-- estorno automático — `processar_fila.py` só marca o status, não mexe na
-- carteira.
--
-- O item 6 (admin vendo a fila, em /admin/moderacao) dá ao dono/moderador
-- um botão "Estornar" nesses casos. Esta coluna existe só para a trava:
-- sem ela, dois cliques no botão devolveriam as Paletas duas vezes.

alter table base_restore_requests
  add column if not exists estornado boolean not null default false;
