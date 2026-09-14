-- Liga `pal_transfers` ao ritual da Câmara que a originou, para o resgate
-- saber marcar o ritual certo como concluído quando o `givepal_j` confirma.
-- Nullable e só preenchida por `resgatarPalPurificado`: toda transferência
-- que não vem da Câmara (cofre de Pals, entrega manual do staff) continua
-- com `ritual_id` nulo, sem afetar nada existente.
alter table pal_transfers
  add column if not exists ritual_id int references purification_rituals(id);

create index if not exists pal_transfers_ritual_id_idx
  on pal_transfers (ritual_id) where ritual_id is not null;
