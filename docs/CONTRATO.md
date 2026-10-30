# Contrato de implementação — Pequenos Heróis

Entregar código-fonte HTML/CSS/JavaScript completo para repositório GitHub privado e Vercel, sem publicar nem criar contas. Vite vanilla JS; Supabase Auth, Postgres/RLS e Storage privado; Stripe Checkout/Billing. Público infantil 6–12 anos, conta e pagamento do responsável. Preços BRL: mensal 4700 centavos, anual 19700 centavos. Nenhum depoimento, urgência, áudio pronto ou garantia inventados.

## Conteúdo
40 histórias existentes em ../production/texts/NN.json e 160 PNGs ../production/art/NN_cover.png, NN_part1.png etc. Converter para content/stories.json: array contendo id:number, title, subtitle, reference, description, testament:'antigo'|'novo', cover:'/images/covers/NN.webp', duration:'4–7 min', parts:[{heading,paragraphs,image:'NN/part1.webp',alt}], lesson, question, prayer, audio_path:null. Assets privados em assets-private/NN/part1.webp,part2.webp,part3.webp,cover.webp. Capas públicas em public/images/covers/NN.webp. public/catalog.json sem partes/narrativa completa. public/sample.json só história1, com partes apontando para /images/sample/part1.webp etc. Hero usa arte30cover (Jesus e crianças) /images/hero.webp, secundária18cover /images/davi.webp e03cover /images/noe.webp. Metadados públicos de40histórias; conteúdo pago nunca importado pelo frontend ou copiado ao dist.

## Backend/API para frontend
Todas respostas JSON; erros {error:'mensagem em português',code:'CODE'} status adequado; Authorization: Bearer token nas rotas protegidas. Nunca aceitar user_id vindo do cliente. Cache-Control:no-store nas respostas privadas.
GET /api/account -> {user:{id,email},subscription:{status,plan,current_period_end,cancel_at_period_end}|null,hasAccess:boolean,progress:[{story_id,part,completed,favorite}]}.
GET /api/story?id=2 -> {story: objeto conteúdo com parts[].image transformadas em URLs assinadas, audio_url:string|null}. História1 pode ser pública; frontend usa sample.json. Todas demais exigem acesso pago ativo e não expirado.
POST /api/checkout body {plan:'monthly'|'annual'} -> {url}; validar IDs Stripe e valores/moeda/recorrência no servidor; reaproveitar cliente e idempotência; bloquear nova assinatura ativa.
POST /api/portal -> {url}. Retorno /conta.
POST /api/webhook assinatura Stripe, corpo bruto, eventos de assinatura/checkout/invoice; update autoritativo, idempotente e protegido contra eventos fora de ordem.
Progress via Supabase cliente tabela reading_progress: user_id,story_id,part inteiro0..3, completed:boolean, favorite:boolean. RLS só próprio usuário. Não coleta nomes/idades/dados das crianças.
Tables: stories(id integer,body jsonb); subscriptions(user_id PK, stripe_customer_id unique, stripe_subscription_id unique,status,plan,current_period_end timestamptz,cancel_at_period_end boolean); demais tabelas necessárias. Apenas service_role pode escrever stories e subscriptions. Storage bucket story-assets privado sem política pública. Sem endpoints de geração de áudio públicos.

## Env
VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY; SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_ANNUAL; APP_URL URL https da Vercel. Nenhum segredo VITE_. Demo só no dev, VITE_LOCAL_DEMO=true + import.meta.env.DEV; plugin Vite serve conteúdo local apenas em dev e nunca vai para build.

## Interface e marca
Base azul noite #142F42, azul céu #D9EEF2, amarelo sol #FFD474, branco quente #FFFCF5, verde #426B59. Headings serif arredondados/editoriais, corpo sans. Hero tipo livro ilustrado aberto com grande imagem real e hierarquia forte. Landing persuasiva para pais sem culpa: tempo juntos, repertório bíblico, conversa, rotina possível. Seções herói, histórias reais, leitura por dentro, benefícios, valores/rotina, planos, FAQ e CTA final. Plano anual economiza367reais frente12mensalidades564, equivalente16,42/mês mas cobrança197anual. Mensal47recorrente. Não prometer novas histórias mensais.
Biblioteca buscável sem acentos, filtro testamento/favoritos, progresso local para convidado e remoto para conta; leitor com3partes + reflexão, ajuste fonte, tema noite, player real só quando audio_url existe, próximo/anterior/concluir, favoritos, leitura em tela. Mostrar ausência do áudio honestamente, sem speechSynthesis. Uma história aberta como amostra. Sessão, cadastro, confirmação, login, recuperação, conta, portal, logout. URLs via History API, navegação acessível e responsiva.

## Entrega
ZIP com projeto, package-lock, README implantação passo a passo, .env.example, migração SQL, importador40histórias/160imagens, scripts narração ElevenLabs opcional e importaçãoMP3humanos, conteúdo convertido. Testes com node:test para regras acesso,preço,webhook/conteúdo; build; navegação visual desktop/mobile; revisão independente. Sem node_modules, segredos ou falsas credenciais. Não afirmar integração ao vivo testada sem contas.
