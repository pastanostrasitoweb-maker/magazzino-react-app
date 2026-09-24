-- LA CATEGORIA DEL CLIENTE VIVE SUL SUO CODICE (24/09/2026).
--
-- Il problema: la categoria commerciale stava in tre posti che non si parlano
-- (clienti_attribuzione, scheda magazzino, CRM), due dei quali chiavati sulla
-- PARTITA IVA. Ma 1.035 clienti in anagrafica hanno la partita IVA fatta di
-- zeri, e fra quelli attivi nel 2026 sono 99 su 323 senza IVA usabile: per un
-- terzo dei clienti la categoria non aveva nemmeno dove essere scritta. 96
-- clienti su 295 attivi non risultavano in nessun canale.
--
-- Qui la categoria si lega al CODICE CLIENTE (regola 18: comanda il codice).
-- Dentro ci sono solo le decisioni esplicite di una persona; chi non c'e'
-- ricade su clienti_attribuzione, e lo dice la vista v_cliente_canale.
--
-- Prima carica: il file compilato da amministrazione@ il 24/09/2026, 101 righe.
-- Le voci sono le cinque concordate con Luca piu' EXPORT e ALTRI, che
-- amministrazione ha usato: la sua risposta si applica (regola 24).
create table if not exists clienti_canale (
  codice_cliente text primary key,
  canale         text not null
                 check (canale in ('HORECA','PHARMA','GDO','BIOLOGICO','DISTRIBUTORI','EXPORT','ALTRI')),
  canale_prima   text,
  deciso_da      text not null,
  deciso_il      timestamptz not null default now(),
  fonte          text not null,
  note           text
);
comment on table clienti_canale is
  'Categoria commerciale del cliente decisa da una persona, per codice cliente. Comanda su clienti_attribuzione.';

insert into clienti_canale (codice_cliente, canale, canale_prima, deciso_da, fonte)
select v.cod, v.can, nullif(v.oggi,''), 'amministrazione',
       'file categorizzazione-clienti-2026-09-24.xlsx, risposta del 24/09/2026 12:07'
  from (values
    ('PN-000016','EXPORT',''),
    ('PN-000005','BIOLOGICO',''),
    ('CLI-1479','EXPORT',''),
    ('CLI-1327','HORECA','ALTRI'),
    ('CLI-1840','HORECA','ALTRI'),
    ('CLI-1814','PHARMA','ALTRI'),
    ('CLI-1457','DISTRIBUTORI','ALTRI'),
    ('CLI-NEW-1784821912330','PHARMA',''),
    ('CLI-2005','DISTRIBUTORI','ALTRI'),
    ('CLI-1485','GDO','PHARMA'),
    ('PN-000044','PHARMA',''),
    ('CLI-845','PHARMA','ALTRI'),
    ('PN-000045','HORECA',''),
    ('CLI-NEW-1789575165083','PHARMA',''),
    ('CLI-2119','PHARMA',''),
    ('CLI-1846','ALTRI','ALTRI'),
    ('CLI-881','PHARMA',''),
    ('PN-000064','HORECA',''),
    ('CLI-NEW-1785228639709','PHARMA',''),
    ('CLI-1486','PHARMA',''),
    ('CLI-981','PHARMA',''),
    ('CLI-2117','PHARMA',''),
    ('PN-000054','PHARMA',''),
    ('CLI-NEW-1784364337473','PHARMA',''),
    ('CLI-1190','PHARMA',''),
    ('None','HORECA',''),
    ('PN-000023','GDO',''),
    ('PH-IV-0213','PHARMA',''),
    ('PN-000062','PHARMA',''),
    ('CLI-1050','PHARMA',''),
    ('CLI-NEW-1789898216636','PHARMA',''),
    ('CLI-NEW-1789572599549','PHARMA',''),
    ('PN-000063','PHARMA',''),
    ('CLI-NEW-1789652874869','HORECA',''),
    ('CLI-NEW-1789653417994','HORECA',''),
    ('CLI-NEW-1785834873297','PHARMA',''),
    ('CLI-1318','PHARMA',''),
    ('CLI-NEW-1789655765244','HORECA',''),
    ('CLI-NEW-1787838914146','HORECA',''),
    ('PN-000092','HORECA',''),
    ('CLI-NEW-1789110462687','GDO',''),
    ('CLI-1100','PHARMA',''),
    ('CLI-NEW-1788430977840','PHARMA',''),
    ('PN-000024','HORECA',''),
    ('CLI-1072','PHARMA',''),
    ('CLI-879','PHARMA',''),
    ('CLI-2114','HORECA',''),
    ('PN-000041','PHARMA',''),
    ('CLI-NEW-1789800662749','PHARMA',''),
    ('CLI-2115','PHARMA',''),
    ('PN-000049','PHARMA',''),
    ('PN-000033','PHARMA',''),
    ('PN-000022','PHARMA',''),
    ('PN-000056','HORECA',''),
    ('CLI-NEW-1789286665596','PHARMA',''),
    ('PH-IV-0258','PHARMA',''),
    ('CLI-NEW-1788891664457','HORECA',''),
    ('CLI-NEW-1788945602625','HORECA',''),
    ('PN-000095','PHARMA',''),
    ('PN-000061','PHARMA',''),
    ('PN-000072','PHARMA',''),
    ('PH-IV-0260','HORECA',''),
    ('PN-000057','ALTRI',''),
    ('PN-000046','ALTRI',''),
    ('PN-000047','HORECA',''),
    ('PN-000028','ALTRI',''),
    ('PN-000069','ALTRI',''),
    ('PN-000043','ALTRI',''),
    ('PN-000015','ALTRI',''),
    ('PN-000026','ALTRI',''),
    ('PN-000010','ALTRI',''),
    ('PN-000058','ALTRI',''),
    ('PN-000021','ALTRI',''),
    ('PN-000020','ALTRI',''),
    ('PN-000017','ALTRI',''),
    ('PN-000089','ALTRI',''),
    ('CLI-1896','ALTRI','ALTRI'),
    ('CLI-6d3b70d36b2ebff53250636c7f347b14','PHARMA',''),
    ('CLI-1847','PHARMA','HORECA'),
    ('CLI-72ee01877261b32fe20972d31751b60f','HORECA',''),
    ('CLI-294d9774d524f56fa214d733f5c643f0','PHARMA',''),
    ('CLI-0978ec0c8f02ea3aaa4e7d9aed4c1d69','PHARMA',''),
    ('CLI-fcfeca6d8d7ee172741e98b83309e32c','HORECA',''),
    ('CLI-872e35e1ec649b5647810899932a59ff','HORECA',''),
    ('CLI-e47349aaab640821141bbdbf072a40cf','HORECA',''),
    ('CLI-1833','HORECA','HORECA'),
    ('CLI-78f30546d4ba9fbdc93a28dfa2981d00','HORECA',''),
    ('CLI-fc73d3bef526d7e16ebbb7f1984e0f8a','HORECA',''),
    ('CLI-1844','HORECA',''),
    ('CLI-ba6bb76e5a51943795f8d396f92b4988','HORECA',''),
    ('CLI-754bef8f133d89292a78b950aeef8b57','HORECA',''),
    ('PH-IV-0227','PHARMA',''),
    ('CLI-7fd6ab585c8aebd1e637463d756108fe','PHARMA',''),
    ('CLI-0e72b1c742a02d5d3307f3ae20453857','HORECA',''),
    ('CLI-8972518472998000b4a317890c99f717','HORECA',''),
    ('CLI-fa6826385b00a1c5ea93b8606c031551','HORECA',''),
    ('CLI-abfa6672e6db1d29cc961cb9918afcbb','HORECA',''),
    ('CLI-1634','HORECA','HORECA'),
    ('CLI-8174fabc7a0e6c8c6cb6a32c00e7246f','HORECA',''),
    ('PN-000125','HORECA',''),
    ('CLI-949','PHARMA','PHARMA')
  ) as v(cod, can, oggi)
on conflict (codice_cliente) do update
   set canale = excluded.canale, canale_prima = excluded.canale_prima,
       deciso_da = excluded.deciso_da, deciso_il = now(), fonte = excluded.fonte;

-- LA CATEGORIA DI UN CLIENTE, DA UN POSTO SOLO. Prima la decisione di una
-- persona, poi l'attribuzione per partita IVA (ma mai su una IVA fatta di zeri,
-- che fonde migliaia di clienti in uno). `da_dove` dice sempre quale delle due.
create or replace view v_cliente_canale as
with codici as (
  select distinct id_cliente as codice_cliente from ordini where coalesce(id_cliente,'') <> ''
  union select codice_cliente from clienti_canale
)
select c.codice_cliente,
       coalesce(cc.canale, att.gruppo) as canale,
       case when cc.canale is not null then 'decisione ' || cc.deciso_da
            when att.gruppo is not null then 'attribuzione per partita IVA'
            else 'nessuna' end as da_dove
  from codici c
  left join clienti_canale cc on cc.codice_cliente = c.codice_cliente
  left join lateral (
    select a.gruppo
      from clienti_gestionale g
      join clienti_attribuzione a
        on regexp_replace(coalesce(a.piva,''),'[^0-9]','','g') = regexp_replace(coalesce(g.piva,''),'[^0-9]','','g')
     where g.codice_cliente = replace(c.codice_cliente, 'CLI-', '')
       and regexp_replace(coalesce(g.piva,''),'[^0-9]','','g') !~ '^0*$'
     limit 1) att on true;

grant select on clienti_canale, v_cliente_canale to authenticated, service_role;
