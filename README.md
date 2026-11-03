# Pequenos Heróis

Webapp de histórias bíblicas ilustradas para crianças de 6 a 12 anos, com conta do responsável, landing page, biblioteca e leitura dentro do aplicativo.

**Conteúdo já incluído:** 365 histórias completas, uma para cada dia do ano; 1.460 ilustrações otimizadas (capa e três cenas por história), 365 reflexões, 365 perguntas e 365 orações. **Planos:** R$ 37,90/mês e R$ 197/ano. O anual é cobrado de uma vez; a equivalência de R$ 16,42/mês não é parcelamento.

Veja o [índice das 365 leituras](docs/INDICE-365.md) e o [registro da ampliação e das verificações](docs/AMPLIACAO-365.md).

## O que funciona nesta entrega

- Landing page ilustrada, planos, FAQ, amostra gratuita e cadastro.
- Biblioteca com busca por título/personagem/referência, filtros de testamento, favoritos, progresso e carregamento de 24 títulos por vez.
- Leitor com três partes ilustradas e reflexão, ajuste de tamanho, modo noturno e conclusão.
- Login, cadastro, confirmação de e-mail e recuperação de senha via Supabase.
- Cobrança recorrente via Stripe Checkout, Portal de assinatura e webhook com verificação de assinatura, replay e estado atual.
- Conteúdo pago protegido no servidor; banco com RLS e imagens/áudio em bucket privado.
- Player MP3 com controle de velocidade, exibido quando o áudio estiver publicado.
- Importação das 365 histórias/1.460 imagens e ferramentas de narração opcional.

**O que requer suas contas:** Supabase, Vercel e Stripe. Não foram criadas contas, feitas cobranças nem configuradas credenciais reais. Os testes locais não substituem o teste integrado com suas contas. **Os 365 áudios não estão gravados.** O projeto aceita gravações humanas e inclui uma opção de geração natural por IA com ElevenLabs; uma voz sintética não é uma gravação humana.

## Atualização da edição de 40 histórias

1. Preserve os dados e credenciais das suas contas. Substitua os arquivos do projeto por esta edição.
2. Execute `supabase/migrations/202610300002_expand_365.sql` no mesmo Supabase. Não recrie nem apague as tabelas.
3. Valide com `node scripts/import-content.mjs --dry-run` e reimporte com `npm run import:content`. Os IDs 1–40 e as narrações já publicadas são preservados.
4. Faça novo deploy do frontend e das funções da Vercel. O catálogo público e as novas capas precisam acompanhar o backend.
5. Confira os IDs 41, 100 e 365 com uma conta de teste. Os áudios continuam opcionais e não são criados pela atualização.

## 1. Veja no computador antes de configurar

Instale Node.js 24 LTS. Abra um terminal nesta pasta:

```bash
npm ci
npm run dev
```

Abra o endereço que o Vite mostrar. A configuração `.env.development` abre as 365 histórias **apenas no servidor local de desenvolvimento** e mostra uma faixa de prévia. Cadastro/cobrança não são simulados como operações reais. Não exponha o servidor de desenvolvimento na internet.

```bash
npm test
npm run build
npm run preview
```

`npm run preview` mostra a compilação de produção: só a amostra é pública, e as histórias pagas exigem as integrações reais. As funções `api/` não executam em `vite preview`; use Vercel para o teste integrado. Não basta abrir `index.html` com duplo clique.

## 2. Suba os arquivos para o GitHub

Crie um repositório **privado**, pois `content/` e `assets-private/` contêm seu produto. Coloque o conteúdo desta pasta na raiz do repositório — `package.json`, `index.html` e `vercel.json` devem ficar na raiz. Não envie o ZIP sem extrair.

Pelo terminal, depois de criar seu repositório vazio:

```bash
git init
git add .
git commit -m "Primeira versão do Pequenos Heróis"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
git push -u origin main
```

Substitua somente usuário e repositório. GitHub Desktop também funciona. `.gitignore` exclui `node_modules`, builds e arquivos de credenciais locais. **Nunca envie `.env`, `.env.local` ou chaves secretas.** Não publique a pasta `content/` ou `assets-private/` no GitHub Pages. GitHub Pages sozinho não executa este backend.

## 3. Crie o projeto no Supabase

1. Crie seu projeto e guarde sua senha de banco em local seguro.
2. No SQL Editor, execute o arquivo completo `supabase/migrations/202610300001_initial.sql`. Ele cria tabelas, políticas de acesso, funções e o bucket privado `story-assets`. Em seguida, execute `supabase/migrations/202610300002_expand_365.sql` para ampliar os IDs aceitos até 365. Se você já usa a versão de 40 histórias, basta aplicar essa segunda migração: ela preserva contas, assinaturas, favoritos e progresso.
3. Em Authentication, mantenha confirmação de e-mail e configure SMTP para enviar confirmação e recuperação em produção.
4. Na configuração de URL do Auth, cadastre a URL final da Vercel como Site URL. Cadastre também os redirecionamentos exatos `https://SEU_DOMINIO/conta` e `https://SEU_DOMINIO/definir-senha`. Se usar domínio próprio, atualize todos eles.
5. Copie a URL do projeto, a chave pública `anon`/publishable e a chave secreta de servidor `service_role`/secret. A chave secreta nunca vai no frontend.

O banco não cria cadastro individual de crianças: armazena o responsável, favoritos, progresso e assinatura. O painel de assinaturas usa o usuário autenticado, não um ID escolhido no navegador.

## 4. Importe o conteúdo incluído

Copie `.env.example` para `.env`. Preencha inicialmente `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` com os valores reais.

```bash
node scripts/import-content.mjs --dry-run
npm run import:content
```

O primeiro comando valida 365 histórias e 1.460 imagens, sem chave ou upload. O segundo envia o conteúdo para seu próprio Supabase. É reexecutável e preserva narrações já publicadas. Em caso de interrupção, resolva a causa e execute novamente. Não mova conteúdo pago para `public/`.

## 5. Configure a Stripe

Esta é a integração de pagamento escolhida nesta versão. O Checkout aceita cartão. PIX não foi implementado ou prometido para assinaturas.

1. Comece em **modo de teste**.
2. Crie o produto e dois preços recorrentes em BRL: **R$ 37,90 / 1 mês** e **R$ 197 / 1 ano**. Quantidade fixa 1, sem trial nem cobrança medida.
3. Copie cada `price_...` para `STRIPE_PRICE_MONTHLY` e `STRIPE_PRICE_ANNUAL`. Para novas compras mensais, atualize o ID de `STRIPE_PRICE_MONTHLY` no ambiente da Vercel e faça novo deploy. Esse é um ID de preço, não um link `buy.stripe.com`: o botão da landing cria uma sessão Stripe Checkout via `/api/checkout`. Assinaturas antigas no preço mensal anterior continuam reconhecidas pelo backend; alterar o preço de assinaturas já existentes requer uma migração separada no Stripe.
4. Copie a chave secreta de teste para `STRIPE_SECRET_KEY`.
5. Ative o Customer Portal para atualização do pagamento e cancelamento. Se habilitar troca de plano, restrinja aos dois preços e decida conscientemente a configuração de prorrata.
6. Após o primeiro deploy Vercel, crie uma destinação webhook **snapshot** em `https://SEU_DOMINIO/api/webhook`. A lista exata de eventos está em `docs/BACKEND.md`.
7. Copie `whsec_...` para `STRIPE_WEBHOOK_SECRET` na Vercel e faça novo deploy.

O servidor confere os valores/recorrências dos preços no Stripe. Não libere acesso por uma página de “pagamento aprovado”: o webhook é quem registra o estado confirmado. A conta pode mostrar “processando” enquanto essa confirmação chega.

## 6. Configure e publique na Vercel

1. Importe o repositório privado do GitHub.
2. Framework: **Vite**. Root directory: pasta onde está `package.json`. Build: `npm run build`. Output: `dist`. Node.js: **24.x**.
3. Em Environment Variables, preencha os valores abaixo. Para testar primeiro, use credenciais Stripe de teste. Cadastre os valores nos ambientes que pretende usar.

| Variável | Onde entra | Conteúdo |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Navegador | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Navegador | Chave pública anon/publishable |
| `VITE_BUSINESS_NAME` | Navegador | Nome do responsável/empresa do serviço |
| `VITE_SUPPORT_EMAIL` | Navegador | E-mail real de atendimento |
| `SUPABASE_URL` | Servidor | Mesma URL Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Servidor | Chave secreta de servidor |
| `APP_URL` | Servidor | Origem HTTPS final, sem caminho ou parâmetros |
| `STRIPE_SECRET_KEY` | Servidor | Chave secreta Stripe |
| `STRIPE_WEBHOOK_SECRET` | Servidor | Segredo do webhook deste ambiente |
| `STRIPE_PRICE_MONTHLY` | Servidor | Preço recorrente de R$ 37,90/mês |
| `STRIPE_PRICE_ANNUAL` | Servidor | Preço recorrente de R$ 197/ano |

4. Faça o deploy. Atualize `APP_URL` e os redirecionamentos Supabase se a URL inicial ainda não era conhecida; faça novo deploy.
5. Configure o webhook e complete a validação abaixo antes de trocar para pagamentos reais.

Variáveis `VITE_` são públicas e incorporadas no build; mudanças exigem novo deploy. Nunca dê esse prefixo a segredos. `VITE_LOCAL_DEMO` não abre conteúdo em produção: a condição também exige `import.meta.env.DEV`. Para um teste local com integrações reais, remova a flag de `.env.development` ou defina `VITE_LOCAL_DEMO=false` no ambiente local, e use `vercel dev` com as configurações necessárias.

`vercel.json` inclui rotas diretas do aplicativo, cabeçalhos de segurança e funções de 60 segundos. O CSP permite o domínio padrão `*.supabase.co`. Se configurar domínio personalizado no Supabase, acrescente somente esse domínio em `connect-src`, `img-src` e `media-src`.

## 7. Adicione a narração

Leia `docs/NARRACAO.md`.

- **Voz humana de verdade:** grave ou contrate a gravação; coloque os MP3s por ID e use o importador de áudio. Os textos completos para gravação podem ser exportados pelo script.
- **Voz de IA natural:** configure `ELEVENLABS_API_KEY` e `ELEVENLABS_VOICE_ID` localmente, escute uma amostra da voz em português brasileiro e só então autorize a geração. O script simula custos em caracteres antes de qualquer chamada, exige confirmação por flag e permite retomar.
- Gere os arquivos uma vez e publique no Storage privado. Cada reprodução do assinante usa o MP3 já pronto, sem gerar novamente por API.
- Não há voz do navegador (`speechSynthesis`), imitação de pessoa sem autorização ou gravação artificial apresentada como humana.

As chaves ElevenLabs não precisam ficar na Vercel: são usadas somente pelos scripts de produção de áudio. O serviço pode exigir plano/créditos próprios e condições para uso comercial. O player não finge que um arquivo existe.

## 8. Teste antes de abrir vendas

- Confirmação de cadastro, login, logout, senha incorreta e recuperação por e-mail.
- Uma conta sem assinatura só lê a amostra; duas contas não compartilham progresso ou favoritos.
- Compra de teste mensal e anual; ambos concedem acesso somente após webhook.
- Cancelamento, pagamento recusado, renovação e retorno do Portal.
- Nova tentativa de assinatura existente não cria cobrança duplicada.
- `/api/story?id=2` sem token/assinatura não fornece conteúdo; bucket continua privado.
- Acesso por links diretos `/biblioteca`, `/historia/18` e `/definir-senha` na Vercel.
- Narração real e expiração/renovação de URLs assinadas quando os MP3s forem publicados.
- Confira nome comercial, e-mail de suporte, textos de termos/privacidade e regras de atendimento com os dados da sua operação. São textos-base editáveis, não uma validação jurídica da empresa.
- Faça uma compra controlada real após a migração para credenciais/preços/webhook do ambiente de produção; não reutilize IDs de teste em produção.

## Onde editar

| Arquivo/pasta | Função |
| --- | --- |
| `index.html` | HTML inicial e metadados |
| `src/styles.css` | Design e responsividade, CSS legível |
| `src/landing.js` | Landing, copy, valores e FAQ |
| `src/library.js` | Biblioteca, busca visual e cartões |
| `src/reader.js` | Leitor, reflexão e player |
| `src/auth.js` / `src/main.js` | Telas e navegação/auth |
| `src/legal.js` | Termos e privacidade editáveis |
| `api/` / `server/` | Funções de pagamento/acesso |
| `content/stories.json` | Todas as histórias; manter privado |
| `assets-private/` | Ilustrações a importar; manter privado |
| `public/` | Capas/marketing, fonte, catálogo e uma amostra |
| `supabase/migrations/` | Esquema e permissões |
| `docs/` | Guias, contrato e verificação |

Para mudar preços futuramente, altere o cadastro Stripe, a validação `server/rules.mjs`, a landing e os termos de forma consistente. Não troque IDs de planos vendidos sem planejar o tratamento das assinaturas existentes.

## Tamanho e dependências

As imagens privadas são carregadas conforme a leitura. O catálogo mostra 24 cartões por vez e carrega as capas sob demanda; não baixa o acervo inteiro ao abrir a landing. A imagem principal tem cerca de 149 KB. Fontes são locais e têm licenças OFL em `public/fonts/`.

Não há mensalidade de hospedagem, banco, e-mail, voz ou taxas de pagamento incluída no código. Esses serviços pertencem às contas que você conectar. O pacote não depende dos PDFs anteriores.

## Acesso gratuito do responsável

`COMPLIMENTARY_ACCESS_EMAIL` (variável apenas de servidor) libera acesso completo à conta com e-mail verificado pelo Supabase Auth. A autorização é conferida no servidor tanto em `/api/account` quanto em `/api/story`, sem criar assinatura na Stripe, sem alterar os planos pagos e sem expor o e-mail na interface pública. O caminho `/api/checkout` rejeita novas compras dessa conta. Para revogar, remova a variável na Vercel e faça novo deploy. O acesso gratuito não depende de qualquer status de assinatura no banco.


## Meta Pixel — páginas comerciais

Pixel 1816678829421239 instalado no módulo src/meta-pixel.js. PageView é enviado ao entrar nas páginas públicas / e /planos (inclusive na navegação interna), sem duplicação por novas renderizações. ViewContent é enviado uma vez por visita à rota após rolagem real de 40 pixels com mouse, toque ou teclado. Rolagens automáticas não ativam ViewContent.

InitiateCheckout é enviado no clique do plano mensal ou anual na página comercial, antes do cadastro ou do redirecionamento à Stripe. Purchase da Meta depende da integração externa. O Pixel não inicia em acessos diretos às histórias, biblioteca, cadastro, conta ou demais páginas restritas. A configuração automática de eventos foi desativada. A CSP mantém scripts inline bloqueados e limita o acesso externo aos domínios necessários da Meta.

A imagem noscript do snippet original não foi incluída porque index.html também serve as páginas infantis e enviaria PageView nelas sem JavaScript. A página de privacidade informa o rastreamento nas páginas comerciais. Revise os requisitos de consentimento e as restrições da Meta para dados de menores de 13 anos antes de anunciar.


## Google Analytics 4 — funil de vendas e Stripe

O fluxo comercial utiliza a propriedade GA4 **G-EXNJ4MGX7V**. O módulo `src/analytics.js` carrega `gtag.js` exclusivamente nas páginas `/`, `/planos`, `/entrar` e `/cadastro`; envia um `page_view` por navegação (inclusive SPA, sem duplo disparo), `view_item` após 40px de rolagem real na oferta e `begin_checkout` ao receber uma sessão Stripe válida. Não faz rastreamento nas histórias, biblioteca nem conta.

Antes do redirecionamento, o checkout autenticado pode receber somente os identificadores técnicos GA4 `client_id` e `session_id`, validados pelo servidor e armazenados nos metadados da sessão e da assinatura da Stripe. Nenhuma informação pessoal, valor ou ID de transação é enviado pelo navegador no pedido de checkout.

Após o primeiro pagamento, o webhook Stripe `invoice.paid` (primeira fatura com `billing_reason=subscription_create`, `status=paid` e valor positivo) envia `purchase` via Measurement Protocol, com o valor real pago, BRL, identificador da fatura como `transaction_id` e IDs da sessão GA4, se disponíveis. Renovações não são contadas como novas compras neste fluxo. A atribuição só é possível para sessões Stripe criadas com os novos metadados GA4; eventos anteriores não são recriados. A segurança da assinatura e a liberação de acesso não dependem da disponibilidade do GA4.

**Ação obrigatória:** crie uma chave do Measurement Protocol no GA4: Administrador > Fluxos de dados > selecione o fluxo G-EXNJ4MGX7V > Chaves secretas da API do Measurement Protocol > Criar. No projeto Vercel, configure a variável `GA4_API_SECRET` com o valor privado da chave para o ambiente **Production**, sem prefixo `VITE_`, e faça novo deploy de produção. A chave não é a mesma que o Measurement ID e não deve ser commitada ou colada em arquivos públicos.

A CSP do site libera `www.googletagmanager.com`, `www.google-analytics.com` e `region1.google-analytics.com`. A página da Stripe é hospedada em domínio próprio e não recebe scripts do site; as compras são observadas pelo webhook autenticado. Se a chave não estiver configurada, `purchase` não será enviado ao GA4. Após configurar, teste uma nova assinatura paga compatível com o ambiente de produção e confira o GA4 em Tempo real / Monetização. Para debugar localmente, não envie conversões falsas ao fluxo de produção.
