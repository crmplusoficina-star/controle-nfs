# Contrato do backend compartilhado

## Fonte única da verdade

O Supabase é a única fonte da verdade para ferramentas, quantidades, cautelas, transações, pessoas, usuários, filiais, assinaturas e auditorias.

## Responsabilidade deste app

O Controle de NFs pode administrar cadastros e acompanhar todos os processos. Mudanças de schema devem ser versionadas neste repositório e revisadas antes de chegar à produção.

## Integração com a Ferramentaria

A Ferramentaria deve consultar os mesmos identificadores e registrar apenas ações operacionais autorizadas. Não deve criar tabelas paralelas nem manter saldo local.
