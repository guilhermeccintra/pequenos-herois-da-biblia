# Resolução backend — F2

- Resolução: `ph-backend-f2-20261030`.
- Relatório de origem, preservado: `docs/REVIEW-initial.md`, ID `cr-20261030-phwebinitial`.
- Finding: **F2 — Checkout completion between two Stripe reads permits another payable session**.
- Disposição: **corrigido**, com regressões locais e limitações externas explicitadas abaixo.
- Escopo: apenas Checkout/RPC de reserva e testes relacionados; F1/F3/F4/F5 pertencem à resolução do coordenador.

## Evidência aceita e causa

O trecho F2 de `/tmp/ph-review-repro.mjs` foi executado isoladamente contra a implementação anterior e imprimiu:

```text
F2 REPRODUCED: second payable Checkout created after prior Checkout completed between subscription snapshot and open-session listing.
```

A sessão hospedada pode concluir fora do lease local entre a leitura de assinaturas e a consulta de sessões abertas. A consulta com `status=open` omitia a sessão recém-concluída; `checkout_session_id` persistido não era reconciliado. Uma nova reserva era então criada. A hipótese foi confirmada antes de modificar o código.

As regressões iniciais ficaram RED com quatro falhas de comportamento: conclusão nesse intervalo, sessão persistida completa com assinatura ainda pendente, conclusão durante expiração para troca de plano e rotação de uma reserva de resultado desconhecido. O teste PostgreSQL também ficou RED ao demonstrar a rotação indevida da reserva pendente. Uma regressão adicional ficou RED para o replay de criação idempotente que retorna uma sessão já completa, ainda não salva no banco.

## Alteração

Em `server/billing.mjs`, a reconciliação agora inclui sessões fechadas e consulta diretamente a sessão persistida. Sessão `complete` é reconciliada pela assinatura específica no Stripe. Sem assinatura associada ou com resultado ainda incerto, a resposta é `409 CHECKOUT_PENDING`; uma assinatura não terminal impede nova cobrança. Assinaturas efetivamente `canceled` ou `incomplete_expired` permitem uma futura contratação.

Uma sessão reaproveitável é relida antes de retornar sua URL. Outra sessão aberta só pode ser substituída depois de o Stripe confirmar que expirou. Se a expiração falhar, o servidor relê a sessão: conclusão/pagamento pendente bloqueia; resultado desconhecido permanece bloqueado; somente expiração confirmada ou assinatura terminal permite continuar. Uma nova leitura de assinaturas ocorre depois dessa reconciliação e antes da criação.

O ID da reserva entra nos metadados Stripe. Isso permite recuperar a sessão quando a chamada externa teve sucesso, mas a gravação local falhou. O retorno de uma criação idempotente é salvo e reconciliado mesmo quando a sessão já está completa. A RPC `reserve_checkout_request` conserva reservas sem sessão resolvida: não troca a chave por mudança de plano nem pelo vencimento da janela de idempotência. A função lança erro e mantém a reserva original nesses casos.

Arquivos alterados nesta resolução:

- `server/billing.mjs`.
- `supabase/migrations/202610300001_initial.sql`, apenas a função `reserve_checkout_request`.
- `tests/backend-billing.test.mjs`.
- `tests/backend-database.test.mjs`, apenas a regressão da reserva.
- Este documento.

## Validação

`node --test tests/backend-billing.test.mjs tests/backend-database.test.mjs`: **21 testes passaram**, incluindo nove cenários dedicados a F2, execução das funções reais no PostgreSQL/PGlite e migração reexecutada. Os testes exercitam a implementação real de faturamento; somente as fronteiras remotas e os interleavings do Stripe são controlados.

Após a correção, `npm test` completo também passou: **57/57 testes**, zero falhas ou testes ignorados, incluindo as correções cliente já presentes no workspace no momento da execução.

Cobertura F2: conclusão entre as duas consultas; listagem atrasada com sessão persistida completa; conclusão durante expiração; falha de expiração de resultado desconhecido; substituição após expiração confirmada; recontratação depois de cancelamento terminal; reserva desconhecida com outro plano ou janela vencida; sessão reaproveitável que conclui após a listagem; recuperação por metadados; replay idempotente que retorna sessão completa. O teste SQL confirma que a reserva original não é substituída quando a resolução falha.

## Limites e operação

Nenhuma chamada Stripe real, cobrança ou publicação foi feita nesta correção. Ainda é necessário validar o cenário com duas abas no Checkout hospedado em modo de teste, além de entrega atrasada do webhook. A segurança da substituição usa a garantia documentada do Stripe de que uma sessão expirada não pode concluir; um erro de transporte não é tratado como prova dessa expiração.

Uma criação antiga de resultado desconhecido pode permanecer bloqueada intencionalmente, inclusive após a retenção da chave de idempotência. O operador deve reconciliar o cliente, a reserva e as sessões no Stripe antes de corrigir o vínculo local; não deve apagar automaticamente a reserva ou abrir outra cobrança. Um registro anterior à inclusão dos novos metadados pode precisar dessa reconciliação manual. O código não serializa assinaturas criadas manualmente no Dashboard ou por integrações externas fora deste Checkout.

Se a migração inicial já foi aplicada em um ambiente, reexecute-a para atualizar a RPC antes de publicar o backend corrigido. Não há migração destrutiva nem mudança no contrato HTTP existente, exceto o código de erro explícito `CHECKOUT_PENDING` para pagamentos ainda não resolvidos.

Referências oficiais verificadas: [status de sessão e processamento pendente](https://docs.stripe.com/api/checkout/sessions/object), [expiração de Checkout](https://docs.stripe.com/api/checkout/sessions/expire).
