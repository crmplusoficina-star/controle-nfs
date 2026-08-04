# Controle de NFs

Backoffice administrativo do ecossistema Ferramentaria. Este repositório concentra notas fiscais, fornecedores, documentos, estoque, ferramentas, cautelas, inventários, pessoas, usuários, assinaturas, histórico e auditoria.

## Relação com a Ferramentaria

Este aplicativo e o repositório `ferramentaria` utilizam o mesmo projeto Supabase e o mesmo histórico real. Não existe uma segunda base de estoque.

## Execução

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Produção

Configure as variáveis de `.env.example` no provedor de hospedagem. Nunca publique `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY` ou credenciais do R2 no navegador.

## Escopo desta separação

- O módulo gamificado foi removido deste repositório.
- Nenhuma migration é executada automaticamente.
- Os arquivos SQL existentes foram preservados para referência do backoffice.
- O login por matrícula foi mantido por compatibilidade com a base atual e aceita apenas perfis `Administrador` e `Operador`.

## Próxima etapa recomendada

Substituir o login compatível por Supabase Auth e mover retirada/devolução para funções transacionais no banco, com RLS e auditoria.
