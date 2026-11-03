# Backend, pagamentos e conteúdo privado

As funções `api/*.js` executam em Node.js na Vercel. O frontend usa Supabase Auth e envia `Authorization: Bearer <access_token>`. O servidor verifica o token com `auth.getUser`; IDs de usuário, preços, descontos e permissões não vêm do navegador. Não existe bypass de assinatura em produção.

## Preparação

1. Crie um projeto Supabase. Execute `supabase/migrations/202610300001_initial.sql` no SQL Editor como proprietário do projeto. Depois execute `supabase/migrations/202610300002_expand_365.sql`. Ambas podem ser executadas novamente sem apagar dados. Em uma instalação existente, aplique a migração de expansão para aceitar as histórias 41–365.
2. Configure Supabase Auth com confirmação de email, Site URL e URLs de redirecionamento da aplicação. Configure SMTP próprio para emails de confirmação e recuperação antes de uso real.
3. Preencha as variáveis do `.env.example`. Somente `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` entram no frontend. `SUPABASE_SERVICE_ROLE_KEY`, segredos Stripe e credenciais de narração permanecem no servidor/ambiente local e nunca recebem prefixo `VITE_`.
4. Instale as dependências com `npm ci`. Valide o acervo com `node scripts/import-content.mjs --dry-run`. Importe com `node --env-file=.env.local scripts/import-content.mjs`.
5. Configure os preços, o Portal e o webhook Stripe descritos abaixo. Cadastre as variáveis de servidor na Vercel. Use Node.js 24 e limite das funções de 60 segundos; o lease de faturamento dura 120 segundos.

`APP_URL` é uma origem HTTPS, por exemplo `https://seu-dominio.vercel.app`, sem caminho/query. O importador funciona localmente; as funções também podem ser exercitadas com `vercel dev` e chaves de teste. `vite` sozinho serve o frontend e não executa funções Vercel reais.

## Stripe

Crie preços **recorrentes em BRL**, com quantidade fixa 1 e sem medição de uso:

| Variável | Valor unitário | Recorrência |
| --- | --- | --- |
| `STRIPE_PRICE_MONTHLY` | 3790 centavos | 1 mês |
| `STRIPE_PRICE_ANNUAL` | 19700 centavos | 1 ano |

O servidor verifica ID, valor, moeda, modelo de cobrança e recorrência no próprio Stripe antes de criar Checkout. Cupons, trials, variação de quantidade e Adaptive Pricing não são oferecidos. Checkout usa cartão, inclusive para a assinatura anual, e mantém a moeda BRL. Tributos automáticos estão desativados; configure o produto e os requisitos comerciais da operação antes de vender.

Configure o Customer Portal para permitir atualização da forma de pagamento e cancelamento. Se habilitar troca de plano, restrinja-a aos dois preços configurados e revise a política de prorrata no Stripe. O retorno do Portal é `/conta`. Não troque os IDs de preço após iniciar vendas sem migrar ou adaptar o reconhecimento das assinaturas existentes.

Cadastre uma **destinação webhook de eventos snapshot** em `https://SEU_DOMINIO/api/webhook`. Copie o segredo dessa destinação para `STRIPE_WEBHOOK_SECRET`. Configure os seguintes eventos:

- `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
- `customer.subscription.paused`, `customer.subscription.resumed`.
- `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`.
- `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.voided`, `invoice.marked_uncollectible`.

O SDK Stripe é fixado pelo `package-lock.json`; a versão instalada 23.1.0 usa API `2026-10-28.endive`. O período vem de `subscription.items.data[0].current_period_end`, conforme a API atual, e não do antigo campo no topo da assinatura. Não use eventos thin neste endpoint.

O retorno `/conta?pagamento=processando` é apenas navegação. Nenhum parâmetro `success`, `session_id` ou status enviado pelo navegador libera leitura. A conta consulta o estado persistido pelo webhook; a confirmação pode levar alguns segundos.

### Concorrência, replay e eventos fora de ordem

Checkout e webhook usam o mesmo lease por conta no Postgres. Depois de obter o lease, o webhook lista o estado atual das assinaturas daquele cliente no Stripe, inclusive o histórico cancelado. O payload do evento serve para identificar o cliente; não é aplicado como estado da assinatura. Assim, uma notificação atrasada de cancelamento não sobrescreve uma assinatura posterior, inclusive quando dois eventos têm o mesmo timestamp.

A aplicação seleciona a assinatura reconhecida e válida com acesso, ou a assinatura corrente mais recente quando não há acesso. Apenas o estado `active` com plano conhecido e período futuro libera conteúdo. Pagamento em atraso, trial, cancelamento efetivado, pausa, preço inválido ou período expirado bloqueiam a leitura. `cancel_at_period_end=true` mantém acesso enquanto o status e o prazo ainda forem válidos.

O banco grava o snapshot e o ID do evento na mesma transação. Repetições não alteram o estado novamente. Um worker com token expirado não pode gravar; conflito de lease responde 503 para o Stripe tentar novamente. Falhas de rede não marcam um evento como concluído. Monitore falhas na destinação Stripe e reenvie eventos após corrigir um incidente. O servidor não possui um reconciliador agendado independente.

Checkout reutiliza o cliente existente e uma sessão aberta compatível. Sessões abertas de outro plano são expiradas antes de abrir a nova. Uma assinatura já existente é detectada pelo estado atual do Stripe, mesmo que o webhook local esteja atrasado. A chave de idempotência de criação é reservada no Postgres antes da chamada externa e preservada em tentativas interrompidas.

## Banco e Storage

| Recurso | Acesso pelo navegador |
| --- | --- |
| `stories` | Nenhum; narrativa paga sai apenas pela API autorizada |
| `subscriptions` | Nenhum; `/api/account` expõe os campos necessários |
| `stripe_events` e RPCs de faturamento/importação | Nenhum; apenas `service_role` |
| `reading_progress` | SELECT/INSERT/UPDATE/DELETE somente de `auth.uid()=user_id` |
| Bucket `story-assets` | Privado; acesso por URLs assinadas pelo servidor |

O progresso armazena somente conta do responsável, história, parte 0–3, conclusão e favorito. Uma política restritiva do Storage protege `story-assets` mesmo se houver outra política permissiva para todos os buckets. Não torne esse bucket público e não mova `content/` ou `assets-private/` para `public/`.

As imagens e áudios recebem URLs assinadas por até 15 minutos, limitados ao prazo restante da assinatura. Uma URL emitida anteriormente pode continuar funcionando até seu vencimento. Arquivos já baixados não podem ser revogados. Uma sessão longa de leitura pode precisar reabrir a história para renovar as URLs. A resposta HTTP de cada rota da API é `Cache-Control: no-store`.

O bucket aceita WebP/PNG/JPEG e MP3 (`audio/mpeg`), com limite de 50 MiB por objeto. Não há políticas de upload para usuários do navegador, nem endpoint de geração de áudio. O áudio é opcional: `audio_path=null` produz `audio_url=null`; o frontend deve mostrar sua ausência.

## Importador

```bash
node scripts/import-content.mjs --dry-run
node --env-file=.env.local scripts/import-content.mjs
```

O importador valida as 365 histórias, os 1.460 WebPs, IDs, campos, caminhos e cabeçalhos WebP antes do primeiro upload. Envia apenas para um bucket existente e privado, com quatro uploads simultâneos e `upsert`. Depois grava as histórias pela RPC `import_story`. Em uma falha parcial, corrigir a causa e executar novamente é suficiente; IDs e paths são estáveis. Uma reimportação preserva atomicamente o `audio_path` já registrado pelo fluxo de narração, inclusive se o JSON local continuar com `null`.

`--content arquivo.json` e `--assets pasta` permitem indicar caminhos alternativos. MP3s são publicados pelos scripts de áudio do projeto; este importador não gera ou envia narração. Os artefatos pagos pertencem ao repositório **privado** entregue e não devem ser publicados como arquivos estáticos.

## Contrato HTTP

| Rota | Método | Resultado |
| --- | --- | --- |
| `/api/account` | GET | Usuário, assinatura, `hasAccess` e progresso próprio |
| `/api/story?id=2` | GET | `story` com imagens e `audio_url` assinados; `audio_url` também no topo |
| `/api/checkout` | POST JSON `{"plan":"monthly"}` ou `{"plan":"annual"}` | URL Checkout |
| `/api/portal` | POST | URL Customer Portal |
| `/api/webhook` | POST | Confirmação do processamento de evento Stripe autenticado |

As quatro primeiras rotas exigem Bearer token. A amostra pública é `public/sample.json`; o endpoint de histórias protege inclusive a história 1. Erros usam `{ "error": "mensagem em português", "code": "CODIGO" }`, com status 400/401/403/404/405/409/413/415/503 conforme o caso. O webhook lê o stream bruto, sem acessar o getter `req.body` da Vercel, e valida a assinatura Stripe antes de consultar o banco.

## Verificação e limites da entrega

Execute `npm test` para a suíte inteira. Os testes backend cobrem acesso expirado, preço adulterado, períodos por item, URLs assinadas, autenticação, corpo bruto e assinatura real do SDK Stripe, replay, eventos atrasados, falha de rede, checkout com estado local atrasado, importador e SQL.

Os testes `backend-database.test.mjs` executam a migração real duas vezes sobre Postgres local via PGlite. Somente a infraestrutura Supabase (`auth.users`, `auth.uid`, roles e catálogo Storage) é representada por fixtures. RLS, constraints, RPCs, tokens expirados e rollback são executados pelo motor Postgres. Isso não substitui uma validação na infraestrutura Supabase hospedada.

**Não foram feitas cobranças, criadas contas ou publicadas funções. Não houve teste de integração ao vivo com Supabase, Vercel ou Stripe.** Antes de abrir vendas, valide em modo de teste: confirmação/recuperação de email; assinaturas mensal e anual; webhook repetido e fora de ordem; pagamento recusado; renovação; cancelamento ao fim do período; isolamento entre dois responsáveis; conteúdo e bucket inacessíveis sem assinatura; criação/retorno do Portal; áudio real quando publicado. Confirme também que a compilação não inclui narrativas ou mídias privadas.

Referências oficiais consultadas:

- [Stripe: listagem de assinaturas](https://docs.stripe.com/api/subscriptions/list).
- [Stripe: criação de Checkout](https://docs.stripe.com/api/checkout/sessions/create).
- [Stripe: webhooks e verificação do corpo bruto](https://docs.stripe.com/webhooks?lang=node).
- [Stripe: períodos movidos para os itens](https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end).
- [Supabase: downloads e URLs assinadas](https://supabase.com/docs/guides/storage/serving/downloads).
