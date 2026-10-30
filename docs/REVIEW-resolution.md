# Resolução da revisão inicial

- Report type: `receiving-code-review`
- Resolution ID: `rr-20261030-phwebfixes`
- Review chain ID: `rc-20261030-phwebapp`
- Source report ID: `cr-20261030-phwebinitial`
- Source report path: `docs/REVIEW-initial.md`
- Scope: `F1–F5; implementação delta e caminhos afetados`
- Authorization: `Solicitação do usuário para implementar e entregar o webapp completo; correções dentro desse escopo.`

## Verificação independente pelo coordenador

F1 foi verificado pela leitura do caminho anterior: a resposta assíncrona usava state.session após o await. F3 foi verificado na chamada upsert paralela sem captura imutável/ordenação. F4 foi confirmado no retorno incondicional de sample.json para id1. F5 estava expresso por allowedHosts:true. F2 foi traçado no snapshot de assinatura seguido por listagem open-only sem consulta ao ID persistido; o implementador também executou a reprodução e adicionou regressões antes da correção. São violações do contrato vigente, não mudanças de preferência de produto. O relatório inicial foi preservado.

## Disposition Ledger

| ID | Issue fingerprint | Origem | Ação | Verdict |
| --- | --- | --- | --- | --- |
| F1 | ifp-sha256:d814d0d918493f265653b61301365923e510bde272533e01e27bbb2d22f80f56 | R1 | Captura usuário/geração; recusa resposta fora da sessão; limpa leitor anterior | Fixed |
| F2 | ifp-sha256:2351b326a1660ce4ea6a228394c72925496743bb5e78fb5b44a9a55d1164fb57 | R1 | Reconcilia sessões concluídas, ID persistido, expiração e reserva incerta | Fixed |
| F3 | ifp-sha256:58f31f3243b291db66eafb5c3e8659b1b822fb9b1377ec1e53c5a1f9b3dfa0af | R1 | Fila por usuário/história com snapshot imutável e flush antes da leitura remota | Fixed |
| F4 | ifp-sha256:3a5bbe0f993f3ed15db551c2b7bcea952b9f612b5bd0b481f4935a09c8948781 | R1 e coordenador | Assinante busca história1 pela API; amostra segue pública com fallback401/403 | Fixed |
| F5 | ifp-sha256:f4d3cece15b994c49fc3519dd1b35fb1f84284192753f46269e68fea84be2bdd | R1 | Hosts padrão do Vite mais whitelist explícita terminal.local | Fixed |

## Challenges to Source Review

Nenhum achado foi descartado. A revisão não afirma que contas reais ou cobranças foram exercitadas.

## Delta e evidência

- F1: `src/account-state.js`, integração em `src/main.js`. Testes `tests/client-state.test.mjs`: troca Alice/Bob, logout e resposta antiga da mesma conta não alteram a conta atual. O retorno da API também deve conter o mesmo user.id capturado. Alterações locais feitas durante o request são preservadas.
- F3: `src/progress-sync.js`, integração em `src/services.js`. Snapshots são criados antes da espera; operações da mesma conta/história são sequenciais; uma falha não bloqueia a seguinte. A conta aguarda gravações pendentes antes de recarregar progresso. O SDK confirma que a sessão ainda corresponde ao dono da gravação; RLS permanece como proteção do servidor.
- F4: `src/story-loader.js`, integrado em `src/services.js` e `src/main.js`. Testado áudio publicado para história1, amostra anônima, fallback após expiração e bloqueio da história2.
- F5: `vite.config.js` agora usa `allowedHosts: ["terminal.local"]`; nenhum wildcard de host. O preview local já foi iniciado no host explicitamente permitido.
- F2: `server/billing.mjs`, RPC `reserve_checkout_request` e regressões em testes billing/database. Evidência completa e limitações em `docs/RESOLUCAO-BACKEND.md`.
- Verificação adicional: build completo com verificação automática de ausência de narrativas pagas/segredos de servidor, fontes locais e contagem de mídia pública; audit npm de dependências de produção retornou0 vulnerabilidades.

## Fora da revisão e limites

A seção FAQ teve correção CSS para não unir palavras ao ocultar um br e para respeitar largura de320px. A inspeção móvel anterior e a limitação da rechecagem por política de navegação estão em docs/VERIFICACAO-VISUAL.md. README e guias foram finalizados separadamente. Nenhuma credencial, conta, cobrança ou geração de voz foi criada. Testes de integração hospedada continuam necessários com as contas do usuário.

## Handoff

Solicitada uma revisão terminal de geração1 apenas do delta acima e dos caminhos afetados. Não reabrir a descoberta geral. Conferir correções F1–F5 e interfaces/API/SQL correspondentes; usar evidência dos testes atuais, sem repetir toda a suíte sem motivo.
