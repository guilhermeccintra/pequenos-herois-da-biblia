# Pequenos Heróis — edição de 365 histórias

Esta edição acrescenta 325 leituras às 40 originais. A coleção reúne 365 histórias, 365 reflexões, 365 perguntas e 365 orações: uma leitura para cada dia do ano, no ritmo da família.

## Conteúdo e estrutura

| Item | Edição completa |
| --- | ---: |
| Histórias | 365 |
| Antigo Testamento | 215 |
| Novo Testamento | 150 |
| Capas | 365 |
| Cenas internas | 1.095 |
| Ilustrações distintas | 1.460 |
| Reflexões, perguntas e orações | 365 de cada |

Cada nova história tem título, subtítulo, referência bíblica, descrição para o catálogo, capa e três partes com três parágrafos e uma ilustração em cada parte. Ao final aparecem a reflexão, a pergunta para conversar e a oração. Os textos são adaptações infantis originais em português; poemas, ensinos, cartas e visões bíblicas são apresentados como tais. As referências permitem continuar a leitura na Bíblia.

As 40 histórias originais mantêm seus IDs, textos e imagens. A numeração nova começa em 41 e termina em 365, sem renumerar o conteúdo anterior. O [índice completo](INDICE-365.md) acompanha essa sequência; a busca e os filtros permitem escolher outro caminho de leitura.

## Ilustrações

As 1.300 novas imagens foram produzidas individualmente com referências da coleção original, seguindo o estilo de ilustração 3D, a luz acolhedora e o detalhamento dos cenários e tecidos. A revisão visual conferiu cena, personagens, continuidade e composição; versões que precisaram de correção foram substituídas antes da integração. Uma revisão adicional por outro revisor cobriu 24 imagens e corrigiu a continuidade visual de Pedro em uma cena.

Para o aplicativo, as novas capas foram convertidas para WebP de 640 × 427 pixels; as cenas internas, para WebP de 1.100 × 733 pixels, seguindo o padrão de entrega anterior. Cada capa ocupa menos de 120 KB e cada cena, menos de 300 KB. As imagens originais foram mantidas sem reconversão. As cópias públicas das capas não são contadas como ilustrações adicionais.

O ZIP contém todos os WebPs necessários para executar e importar a coleção. Os PNGs de produção em alta resolução, rascunhos e imagens de conferência não acompanham o pacote. Os textos-fonte das 325 novas histórias, descrições alternativas, prompts e referências estão incluídos em `production-expansion/texts/` e `content/illustration-prompts.json`. O manifesto `production-expansion/reviews/final-approved.json` registra os hashes dos PNGs aprovados antes da conversão. O script de reconversão exige esses PNGs; não é necessário executá-lo para usar esta entrega.

## Landing page e aplicativo

A landing page, os planos, as perguntas frequentes e os metadados foram atualizados para 365 histórias. A faixa inicial apresenta “365 histórias”, “365 reflexões” e “365 orações”, com a proposta de uma história para cada dia do ano.

A biblioteca exibe os totais do catálogo e carrega 24 cartões por vez. Busca, filtros, favoritos, leitor e progresso reconhecem os IDs até 365. O testamento vem do campo de cada história, permitindo que novos títulos do Antigo Testamento apareçam corretamente mesmo depois dos 40 originais.

Os textos pagos continuam fora do diretório público. Apenas o catálogo, as capas, as imagens de divulgação e a primeira história de amostra são públicos. O conteúdo completo e suas imagens internas permanecem preparados para importação no banco e no armazenamento privado.

## Atualizar uma instalação anterior

1. Preserve as credenciais e os dados da instalação existente.
2. Substitua os arquivos do projeto pela edição ampliada.
3. Aplique `supabase/migrations/202610300002_expand_365.sql` no banco existente. Ela amplia o limite de IDs sem recriar tabelas.
4. Execute `node scripts/import-content.mjs --dry-run` para validar o acervo local e `npm run import:content` com suas credenciais para enviá-lo ao Supabase.
5. Publique novamente o frontend e as funções da Vercel. Confira o acesso às histórias 41, 100 e 365, além dos favoritos e progressos anteriores.

O importador preserva narrações já publicadas. Os MP3s são opcionais e não foram produzidos nesta ampliação; o player continua aparecendo somente quando há áudio real associado. O [README](../README.md) contém os procedimentos completos.

## Verificações concluídas em 31/10/2026

- `npm test`: 65 testes aprovados, nenhuma falha. Incluem conteúdo completo, imagens distintas, integridade, biblioteca, progresso, IDs de três dígitos, migração, isolamento de dados e regras de acesso.
- `npm run build`: compilação aprovada. A verificação do pacote público confirmou 371 imagens públicas, três fontes locais, somente a primeira história como amostra e ausência de narrativas pagas e referências a segredos de servidor no build.
- `node scripts/import-content.mjs --dry-run`: 365 histórias e 1.460 imagens reconhecidas, sem rede ou credenciais; 196.611.602 bytes de imagens privadas.
- Comparação com o ZIP original: os 40 textos, as 160 imagens privadas e a amostra pública permaneceram exatamente iguais.
- Conferência técnica: todas as 1.300 novas fontes PNG têm aprovação visual vinculada ao hash atual; os 1.460 WebPs finais são distintos e respeitam os caminhos, dimensões e limites de tamanho previstos.

O resumo estruturado está em [VERIFICACAO-365.json](VERIFICACAO-365.json).

## Limites da verificação

A prévia de navegador desta edição não pôde ser aberta neste ambiente. A responsividade foi revisada no código, mas a navegação visual em desktop e celular ainda deve ser conferida na instalação. As ilustrações foram inspecionadas diretamente como imagens.

Não foi realizado deploy nem teste com contas reais do Supabase, Stripe ou Vercel. Os testes locais de autenticação, cobrança, webhook e permissões usam ambientes locais ou respostas controladas; não substituem a validação integrada descrita no README. Os documentos `REVIEW-*` e `VERIFICACAO-VISUAL.md` são registros históricos da edição original.
