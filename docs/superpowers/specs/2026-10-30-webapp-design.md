# Pequenos Heróis — projeto
O objetivo é vender acesso a uma biblioteca bíblica infantil ilustrada e proporcionar leitura em família dentro do aplicativo. A coleção existente contém40histórias e160ilustrações. Pais/responsáveis administram contas e assinatura. Escolhas do implementador: marca inicial Pequenos Heróis, frontend HTML/CSS/JS com Vite, backend Vercel Functions, Supabase e Stripe. O conteúdo pago fica no banco/Storage privado; uma história é amostra aberta.

## Abordagens
PDF incorporado seria rápido mas contraria a preferência por leitura nativa. Next.js forneceria SSR mas aumentaria a complexidade para quem pediu HTML/CSS/JS. A escolha técnica é Vite e funções pequenas no servidor, preservando arquivos simples e proteção real de conteúdo. Esta é uma decisão de implementação, não uma escolha previamente aprovada pelo usuário.

## Escopo e limites
Landing muito ilustrada, biblioteca40itens, leitor, progresso,favoritos,auth,assinatura,áudioMP3,setup/importação. A entrega inclui código e conteúdo, não contas criadas, pagamentos reais, domínio ou gravação de uma pessoa. Narração aceitaMP3humanos; integração ElevenLabs pode gerar voz sintética natural após configuração do usuário. Não declarar áudio disponível até existir.
Contrato detalhado e interfaces em docs/CONTRATO.md. A solicitação já autoriza a implementação completa e os arquivos paraGitHub; escolhas reversíveis são resolvidas aqui sem aprovação intermediária.
