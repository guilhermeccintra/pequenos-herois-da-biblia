# Pequenos Heróis da Bíblia

Webapp cristão infantil em React + TypeScript + Vite. O conteúdo bíblico e os jogos são estáticos e funcionam sem API de IA. A versão inicial tem modo demonstração local e schema SQL preparado para Supabase.

## O que já funciona

- Dashboard infantil com pontos XP, progresso e missão do dia.
- Biblioteca com cinco aventuras: Noé, Davi, Daniel, Ester e José.
- Três capítulos ilustrados por história, com reflexão e referência bíblica.
- Quiz de três perguntas ao concluir cada história.
- Mapa de aventuras, medalhas, perfil local e níveis.
- Jogo da memória e caça-palavras.
- Página de planos gratuito/família (apresentação; pagamento ainda não integrado).
- Layout responsivo para celular, tablet e desktop.
- Ilustrações SVG originais incluídas em `public/illustrations`.

## Rodar localmente

Requisitos: Node.js 20 ou superior.

```bash
npm install
npm run dev
```

Abra o endereço mostrado pelo Vite (normalmente http://localhost:5173).

Para validar a versão de produção:

```bash
npm run build
npm run preview
```

## Publicar no GitHub e Vercel

1. Crie um repositório no GitHub e envie todos os arquivos desta pasta.
2. Na Vercel, importe o repositório.
3. Framework: Vite. Build command: `npm run build`. Output directory: `dist`.
4. Faça o deploy. O arquivo `vercel.json` já inclui rewrite para a aplicação.

## Preparar Supabase

1. Crie um projeto no Supabase.
2. Abra **SQL Editor** e execute `supabase/schema.sql`.
3. Em **Project Settings → API**, copie Project URL e a chave `anon`/publishable.
4. Na Vercel, adicione as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` e faça novo deploy.
5. Para desenvolvimento local, copie `.env.example` para `.env.local` e preencha as mesmas variáveis.

**Importante:** a conexão e o schema estão preparados, mas esta versão ainda não implementa cadastro/login, sincronização do progresso com as tabelas, gestão real de perfis infantis nem checkout. Sem as duas variáveis, o app usa `localStorage` no navegador. Não coloque a `service_role` key no frontend.

## Próximas etapas antes de vender

- Implementar autenticação do responsável (e-mail/senha ou magic link) e fluxo de recuperação.
- Criar/selecionar perfis infantis sob a conta do responsável; nunca criar login independente para criança.
- Sincronizar progresso e conquistas com `child_progress` e `child_achievements`.
- Implementar pagamentos por provedor externo e validar assinaturas exclusivamente no servidor/webhook; não confiar em flags do frontend.
- Criar painel parental e fluxo de exclusão/exportação de dados.
- Revisar textos, referências e traduções bíblicas com liderança/consultoria editorial antes da comercialização.
- Realizar revisão jurídica LGPD para dados de crianças, política de privacidade e consentimento verificável do responsável.

## Privacidade e segurança infantil

O MVP não inclui chat, comentários, geolocalização, publicidade ou perfil público. O nome e o progresso no modo demonstração ficam no armazenamento local do navegador. O schema usa RLS e associa perfis infantis ao responsável. Antes de lançar com contas reais, revise as políticas e teste cada operação com usuários reais de teste.

## Estrutura

```text
src/                 Aplicação React, conteúdo e configuração Supabase
public/illustrations/ Ilustrações SVG locais
supabase/schema.sql  Estrutura inicial e políticas RLS
.env.example         Variáveis de ambiente (sem segredos)
vercel.json          Rewrite SPA para Vercel
```

## Nota sobre o conteúdo

As histórias são adaptações resumidas para leitura infantil, com referências bíblicas indicadas. Não substituem a leitura do texto bíblico. Verifique a tradução bíblica que deseja adotar e as permissões de uso antes de publicar citações extensas.
