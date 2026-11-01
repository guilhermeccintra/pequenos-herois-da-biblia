# Perfect Pay — implantação (Vercel + Supabase)

## 1. Antes do deploy

1. Faça backup do banco. Execute `supabase/migrations/202610310001_perfectpay.sql` no SQL Editor do Supabase **depois** das migrations originais.
2. Na Vercel, configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `PERFECTPAY_WEBHOOK_TOKEN` (token do postback recebido no campo `token`; não é código de checkout). Configure para Production e redeploy.
3. Na Perfect Pay, em Ferramentas > Webhook - Vendas, selecione os produtos mensal e anual, formato JSON nativo Perfect Pay e eventos aprovado, completo, cancelado, devolvido e chargeback. URL: `https://SEU-DOMINIO/api/webhook`.
4. A conta Supabase deve existir e ter e-mail confirmado **antes** da compra; o comprador deve utilizar o mesmo e-mail no checkout. Sem isso, o webhook responde 409 para permitir reenvio posterior.
5. Confira em um postback de teste que `plan.code` corresponde aos códigos configurados. Os códigos informados pelo usuário são códigos dos links e podem não ser iguais aos códigos de plano retornados pela API. Se diferirem, atualize `CODES` em `server/perfectpay.mjs` antes de aceitar pagamentos.

## 2. Comportamento

- Checkout abre links hospedados pela Perfect Pay, sem criar sessão de checkout no servidor. A Perfect Pay precisa preencher o e-mail da compra; associação automática é feita pelo e-mail verificado.
- Somente status 2 (aprovado) e 10 (completo) concedem acesso. Status 6, 7 e 9 revogam a venda; outros status não concedem acesso.
- Banco mantém histórico de vendas/eventos e processamento idempotente em transação. Cada cobrança aprovada precisa gerar **um código de venda distinto**; confirme esse comportamento para renovações reais.
- Prazo de acesso é calculado no banco a partir da data de aprovação + um mês/ano; sem webhook de renovação o acesso expira automaticamente. Não há garantia de refletir cancelamento de renovação antecipado até o fim do período.
- `api/portal` abre o portal geral da Perfect Pay; confirme a URL oficial de gerenciamento de assinatura do comprador para trocar por um link específico.
- `stripe` foi removida do runtime e das dependências, mas os arquivos históricos e a estrutura SQL anterior foram mantidos para rollback. Testes antigos de Stripe são legados e precisam ser migrados antes de considerar a suíte geral aprovada.

## 3. Segurança e limites de homologação

O token no JSON é comparado em tempo constante, mas não é uma assinatura criptográfica da requisição. Garanta que o token de webhook seja secreto, exclusivo e não seja exposto no frontend. Para maior segurança, consulte a venda pela API autenticada da Perfect Pay antes de conceder acesso; esta validação remota ainda não está implementada.

**Não coloque em produção sem testar**: compra mensal/anual, webhook repetido, eventos fora de ordem, reembolso, chargeback, renovação, falha de renovação, e-mail diferente, assinatura cancelada, mudança de plano e regras de entrega da Perfect Pay. Um evento com código de plano diferente é rejeitado com HTTP 422.

## 4. Testes locais

`node --test tests/perfectpay.test.mjs`

Os testes unitários não comprovam a integração real com Supabase nem o envio de postbacks reais pela Perfect Pay. Para isso são necessários deploy, credenciais e um ambiente de homologação.
