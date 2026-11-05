# Narração das 365 histórias

A história 1, **A Criação do Mundo**, contém três MP3s enviados pelo responsável pelo projeto. Cada player aparece acima do título da sua parte, com controle de velocidade e sem reprodução automática. O bloco lateral “Hora de ouvir” não aparece nas histórias com áudio por parte, inclusive na tela de reflexão. Histórias sem áudio e gravações completas continuam usando o comportamento anterior.

Como a história 1 já é a amostra gratuita, somente seus três MP3s são servidos pelo próprio site em `public/audio/sample/`. Os campos `parts[].audio_url` em `public/sample.json`, `content/stories.json` e `stories.body` no Supabase apontam para esses mesmos arquivos. Não há chaves de acesso nem URLs temporárias nesses campos. Não use esta pasta para narrações das histórias pagas; elas continuam destinadas ao bucket privado `story-assets`.

| Parte | Arquivo recebido | URL no site |
| --- | --- | --- |
| 1 | A primeira luz.mp3 | `/audio/sample/part1-27167b1a.mp3` |
| 2 | Um mundo cheio de vida.mp3 | `/audio/sample/part2-e8b1752b.mp3` |
| 3 | Um jardim para cuidar.mp3 | `/audio/sample/part3-7435a3b7.mp3` |

Os MP3s são os originais, sem reconversão. O sufixo identifica os oito primeiros caracteres do SHA-256 para evitar conteúdo antigo em cache quando houver uma nova versão. Os testes conferem o hash completo e a associação de cada parte. O campo de narração completa `audio_path` permanece `null`: esses três áudios não incluem a reflexão, a pergunta ou a oração finais.

Há duas opções distintas:

- **Voz humana:** uma pessoa grava a história. O arquivo importado deve ser identificado como origem `human`. Voz humana não é IA.
- **Voz sintética da ElevenLabs:** o provedor gera a voz a partir do texto e de uma voz autorizada, identificada como origem `elevenlabs`. Pode soar natural, mas deve ser descrita como narração por IA. Nenhum áudio foi gerado ou ouvido nesta implementação.

Os dois caminhos preservam título, subtítulo, referência bíblica, as três partes com seus títulos e parágrafos, lição, pergunta e oração. Não incluem a descrição comercial do catálogo. A indicação visual “4–7 min” é uma estimativa de leitura, não uma medição de MP3.

## Preparação e revisão

Use Node.js 24, a mesma versão recomendada para o aplicativo. Os scripts usam módulos nativos, sem SDK adicional. Execute os comandos na raiz do projeto. Configure segredos somente no ambiente local do operador, no gerenciador de segredos ou em um `.env` ignorado pelo Git. Nunca use prefixo `VITE_` para chave ElevenLabs ou service role do Supabase, nem coloque os scripts em uma rota pública.

Para exportar roteiros para um narrador humano, sem enviar texto a serviços externos:

```sh
node --input-type=module <<'JS'
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { buildNarrationText } from './scripts/generate-narration.mjs';
const stories = JSON.parse(await readFile('content/stories.json', 'utf8'));
await mkdir('content/narration-texts', { recursive: true });
for (const story of stories) {
  await writeFile(`content/narration-texts/${String(story.id).padStart(2, '0')}.txt`, buildNarrationText(story) + '\n');
}
console.log(`${stories.length} roteiros exportados para content/narration-texts.`);
JS
```

Oriente uma leitura em português brasileiro, acolhedora e clara, com pausas entre as partes e espaço para a família pensar na pergunta. Preserve todas as palavras; não acrescente personagens, promessas, anúncios ou instruções. Grave um arquivo completo por história, sem cortar a oração. Exporte MP3, preferencialmente 44,1 kHz/128 kbps, nomeado `01.mp3` até `365.mp3`, mantendo os três dígitos a partir de `100.mp3`. Mantenha os arquivos e roteiros fora de `public/`.

Antes da importação, ouça o arquivo inteiro e confira pronúncia de nomes bíblicos, ordem das partes, ausência de cortes e distorção, volume e completude. A checagem automática identifica um cabeçalho MP3 plausível; ela não substitui essa revisão humana nem verifica fidelidade da fala.

## ElevenLabs opcional: simular primeiro

Escolha na sua conta uma voz com português brasileiro apropriado para a leitura e os direitos necessários. Defina `ELEVENLABS_API_KEY` e `ELEVENLABS_VOICE_ID` no ambiente. Não há chave ou voz fixa incluída no projeto.

```sh
node scripts/generate-narration.mjs --story 1
node scripts/generate-narration.mjs --story all --dry-run
```

Sem `--confirm-cost`, os comandos apenas mostram a quantidade de histórias e caracteres. Não há chamada externa, cobrança ou geração. A seleção `--story` aceita `1` a `365` ou `all`.

Depois de escolher a voz e conferir o saldo e as condições da sua conta, gere primeiro uma história:

```sh
node --env-file=.env scripts/generate-narration.mjs --story 1 --confirm-cost
```

Ouça e revise o resultado. Para continuar com as demais histórias usando a mesma voz/configuração:

```sh
node --env-file=.env scripts/generate-narration.mjs --story all --confirm-cost
```

O padrão de saída é `content/audio-generated/NN.mp3`. `--out PASTA` permite outro diretório privado. O modelo é `eleven_multilingual_v2`, com estabilidade `0.62`, similaridade `0.75`, estilo `0.12` e speaker boost. Essas configurações são ponto de partida para revisão, sem promessa de resultado. O sotaque depende da voz escolhida; `language_code` não é enviado porque não é suportado pelo modelo multilingual v2.

Cada história é enviada inteira, em uma solicitação, com menos de 10.000 caracteres:

```text
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128
xi-api-key: variável ELEVENLABS_API_KEY
Content-Type: application/json

{"text":"roteiro completo", "model_id":"eleven_multilingual_v2", "voice_settings":{...}}
```

O texto enviado sai do seu ambiente e é processado pelo provedor. Consulte as condições da conta e os controles de retenção do serviço. Não foram realizadas chamadas pagas nesta entrega; testes usam respostas simuladas, que nunca são distribuídas como áudio do produto.

Referência técnica conferida em 30/10/2026: [ElevenLabs — Create speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert). Preços, créditos, vozes e limites de conta devem ser conferidos diretamente no provedor antes de gerar.

## Retomar sem regenerar nem duplicar custos

`manifest.json` registra hash do texto/configuração, estado, tamanho e hash do MP3. O script grava `started` **antes** da chamada paga e `completed` somente após salvar a resposta. Arquivos concluídos e íntegros com a mesma configuração são ignorados numa nova execução. Arquivos existentes nunca são sobrescritos; alteração de voz/texto, arquivo removido ou resultado incerto bloqueia a regeneração automática.

Em caso de interrupção:

1. Não apague o manifesto para tentar novamente. Verifique primeiro o histórico e os créditos na conta ElevenLabs: uma solicitação pode ter sido cobrada mesmo sem resposta local.
2. Se o provedor concluiu, baixe o MP3, revise-o e coloque-o em outra pasta privada com o nome `NN.mp3`. Importe-o com `--source elevenlabs`. Não é necessário alterar o manifesto de geração para importar esse arquivo recuperado.
3. Um arquivo `.mp3.part` pode conter uma resposta salva antes de uma interrupção. Preserve-o e revise o áudio; se íntegro, copie para a pasta de recuperação com o nome `NN.mp3` e importe.
4. Só inicie nova geração paga após confirmar que ela é necessária. Use uma nova pasta `--out` e apenas `--story N --confirm-cost`, preservando o registro anterior. Essa decisão pode gerar uma nova cobrança.
5. Se existir `.generation.lock`, verifique que nenhum processo está gerando antes de removê-la manualmente. A trava protege contra duas execuções na mesma pasta; não use duas pastas para gerar a mesma seleção em paralelo.

Nunca há repetição automática de solicitações pagas, inclusive em erro HTTP ou timeout. As mensagens não exibem chaves nem corpos de erro do provedor.

## Importar MP3 revisado no Supabase

Antes de importar áudio, aplique a migração, crie o bucket **privado** `story-assets` e importe as histórias/imagens com o importador principal do projeto. Se houver restrição de MIME no bucket, permita `audio/mpeg`; o script aceita arquivos até 50 MB. Não torne o bucket público.

Defina `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no ambiente do operador. Não use a chave anônima do frontend. É possível importar apenas parte dos 365 arquivos; os restantes continuam sem áudio.

Para gravações humanas em uma pasta privada, por exemplo `content/audio-human/`:

```sh
node scripts/import-audio.mjs --dir content/audio-human --source human
node --env-file=.env scripts/import-audio.mjs --dir content/audio-human --source human --confirm-upload
```

Para os arquivos da ElevenLabs, depois de ouvir e revisar:

```sh
node scripts/import-audio.mjs --dir content/audio-generated --source elevenlabs --dry-run
node --env-file=.env scripts/import-audio.mjs --dir content/audio-generated --source elevenlabs --confirm-upload
```

Acrescente `--story 1` para importar um único arquivo. Sem `--confirm-upload`, ou com `--dry-run`, o script não usa a rede nem altera o banco. A origem fica registrada em `content/audio-import-manifest.json`; ela não transforma voz humana em IA nem certifica direitos de uso.

Cada MP3 é enviado para `story-assets/audio/NN/SHA256.mp3`, com sobrescrita desativada. Se o objeto já existe, o script confere os bytes antes de continuar. Somente após o upload confirmado, altera `stories.body.audio_path` para esse caminho. Os demais campos do corpo são preservados e a atualização compara o corpo anterior, recusando alterações concorrentes. A API existente devolve uma URL assinada; nunca grave URL pública ou assinada de curta duração como `audio_path`.

Se o upload concluir e o banco falhar, execute o mesmo comando novamente: o arquivo existente é conferido e a associação é retomada. A trava `content/.audio-import.lock` só deve ser removida depois de verificar que não há outra importação em execução. Não execute simultaneamente a importação inicial de conteúdo e a importação de áudio. Ao reimportar conteúdo depois, preserve os `audio_path` já associados; o JSON de entrega continua com `null` porque não inclui os MP3s de produção.

Uma versão revisada do áudio recebe outro hash/caminho e passa a ser a referência no banco. O arquivo anterior permanece privado para permitir recuperação; a remoção de objetos antigos é uma tarefa administrativa separada, depois de conferir referências e backups.

Referências técnicas: [Supabase — Upload](https://supabase.com/docs/reference/javascript/storage-from-upload) e [Storage privado](https://supabase.com/docs/guides/storage/buckets/fundamentals). Integrações com contas reais não foram testadas nesta entrega.

## Reconversão e testes

As histórias 1–40 em `content/stories.json` preservam exatamente os textos originais. As histórias 41–365 ampliam a coleção com o mesmo formato. `content/source-manifest.json` guarda hashes da narrativa, contagens de palavras, fontes bibliográficas e descrições de capa. O catálogo público contém somente os metadados das 365 histórias; `public/sample.json` contém somente a primeira história completa.

Para reconverter a pasta original `production` com `texts/01.json` a `40.json` e `art/NN_cover.png`, `NN_part1.png`, `NN_part2.png`, `NN_part3.png`:

```sh
python -m pip install Pillow
python scripts/prepare-content.py --source ../production --count 40
```

Esse comando reconstrói somente a edição original de 40 histórias, substituindo o acervo local; não o execute sobre a edição ampliada sem cópia de segurança. Para uma coleção completa de 365 originais, use `--count 365` e informe `testament` em cada nova história. A integração das histórias novas usa `scripts/integrate-expansion.py` e exige todos os arquivos aprovados em `production-expansion/`.

A reconversão exige os originais, que não são necessários para rodar o site: a entrega já inclui os JSONs e WebPs preparados. Ela ignora quaisquer PNGs de rascunho. Apenas redimensiona e comprime as imagens existentes, sem criar ou reinterpretar ilustrações. Capas têm 640 px/qualidade 75, interiores 1100 px/qualidade 80 e hero 1200 px com teto de 180 KB. O hero vem da capa 30, Davi da 18 e Noé da 03.

Os testes verificam integridade textual, presença/contagem/dimensões das imagens, limites de tamanho, proteção dos textos pagos no diretório público, roteiro completo, bloqueio de chamadas pagas sem confirmação, retomada sem nova geração, bloqueio de bucket público e associação idempotente do áudio com rede simulada.
