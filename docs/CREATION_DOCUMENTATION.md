# Documentação de Criação — Prompt Engine V1

> Registro técnico completo da concepção, arquitetura, ingestão **100% Read-Only**, implementação em 5 etapas e validação do **Prompt Engine V1** — suíte local de inteligência, comparação, detecção de lacunas (*gaps*) e lapidação de prompts sobre **22.282 prompts reais** acumulados ao longo de ~2 anos.

---

## 1. Missão e Princípios de Design

- **Objetivo central:** reconhecer padrões estruturais e semânticos em um acervo misto (`JSON`, `Seções`, `Parágrafo Único`), medir o que foi pouco explorado (**Raridade**) vs. o que já foi consolidado (**Maturidade**) e transformar lacunas (`O = 0`) ou ideias raras imaturas (`Raro + Imaturo`) em novos prompts prontos para produção.
- **Proteção estrita das fontes (`100% READ_ONLY`):**
  - `D:\Meus Documentos\Imagens\Eagle.cool\Google Flow + Prompts.library` (`19.227` prompts)
  - `D:\Meus Documentos\Imagens\Eagle.cool\Gemini Kimi + Antigravity.library` (`3.055` prompts)
  - `B:\AntiGravity\Projeto Alfa\data\prompt_dna.sqlite` (`?mode=ro`)
  - `C:\Users\conta\Documents\antigravity\fearless-euclid\data\posematch_eagle.sqlite` (`?mode=ro`)
  - `C:\Users\conta\Documents\antigravity\calm-brahmagupta\.omnimage\embeddings\*.bin`
  - **Regra:** nenhuma biblioteca Eagle ou banco externo é modificado; toda persistência da suíte ocorre exclusivamente dentro de `data/` no diretório do projeto.
- **Diretriz visual:**
  - Fundo escuro neutro (`#09090b`), bordas de `1px` de baixo contraste (`rgba(255,255,255,0.07)`), cantos arredondados (`rounded-2xl`) e alta densidade para que **as imagens sejam a cor**.
  - Único acento de cor (`#e5a93c`) reservado exclusivamente ao topo da escala de raridade (**Tier S**, `P ≥ 95`), aos pontos de Gap (`O = 0`) e às ações de síntese/lapidação.
  - Tipografia em **Geist Sans** para UI e **Geist Mono** (`tabular-mono`) para prompts, percentis e métricas.

---

## 2. Linha do Tempo de Construção (Etapas 1 a 5)

### Etapa 1 — Modelo de Dados, Decomposição & Primeira Entrega
- **Esquema canônico de 8 atributos** ([DATA_MODEL_AND_SCHEMA.md](DATA_MODEL_AND_SCHEMA.md), [promptEngine.ts](file:///b:/AntiGravity/Prompt-EngineV1/src/types/promptEngine.ts)):
  `sujeito`, `cenario`, `luz`, `camera`, `textura_material`, `estilo`, `projeto_cliente` e `estrutura`.
- **Parser multi-formato** ([promptDecomposer.ts](file:///b:/AntiGravity/Prompt-EngineV1/src/core/promptDecomposer.ts)):
  - Aceita `JSON` (inclusive cercado por markdown, *headless* ou precedido de preâmbulo conversacional), `Seções` (`studio_editorial_v5`, `body_mechanics_12block`, `fdr_direct`, `numbered_sections`) e `Parágrafo Único` (`qwen_natural`).
  - Preserva o **Prompt Bruto Original (`rawPrompt`)** intacto e extrai `cleanPrompt`, `excerpt` (resumo de capa para leitura rápida) e os 8 atributos.
- **Motor de Raridade × Maturidade** ([rarityEngine.ts](file:///b:/AntiGravity/Prompt-EngineV1/src/core/rarityEngine.ts)):
  - **Raridade:** frequência inversa (IDF médio + bônus de co-ocorrência) expressa em percentil (`"mais raro que XX% da coleção"`) e Tiers sóbrios `S` (`≥ P95`), `A` (`≥ P80`), `B` (`≥ P50`), `C` (`≥ P20`), `D` (`< P20`).
  - **Maturidade:** combina reuso do esqueleto (`skeletonReuseScore`), completude (`completenessScore`), precisão técnica (`technicalPrecisionScore`) e curadoria (`curationScore`), separando os 4 quadrantes (`Raro + Maduro`, `Raro + Imaturo`, `Comum + Maduro`, `Comum + Imaturo`).
- **Amostra inicial:** 50 prompts reais em `data/sample_50_prompts.json` + primeira tela **Coleção**.

### Etapa 2 — As 5 Telas da Suíte e Similaridade em 2 Camadas
- Implementadas todas as 5 visões principais em React + Tailwind CSS v4:
  1. **Mapa** ([MapView.tsx](file:///b:/AntiGravity/Prompt-EngineV1/src/components/MapView.tsx))
  2. **Coleção** ([CollectionView.tsx](file:///b:/AntiGravity/Prompt-EngineV1/src/components/CollectionView.tsx))
  3. **Pares** ([PairsView.tsx](file:///b:/AntiGravity/Prompt-EngineV1/src/components/PairsView.tsx)) com `computeTwoLayerSimilarity` e `diffPrompts` ([promptDiff.ts](file:///b:/AntiGravity/Prompt-EngineV1/src/core/promptDiff.ts))
  4. **Gaps** ([GapsView.tsx](file:///b:/AntiGravity/Prompt-EngineV1/src/components/GapsView.tsx)) com matrizes 2D de co-ocorrência e tríades (`O = 0`)
  5. **Projetos** ([ProjectsView.tsx](file:///b:/AntiGravity/Prompt-EngineV1/src/components/ProjectsView.tsx))

### Etapa 3 — Escala Completa (`22.282` Prompts + SQLite FTS5 + `<canvas>` 2D LOD)
- **Pipeline de ingestão unificado** ([ingest_google_flow.py](file:///b:/AntiGravity/Prompt-EngineV1/scripts/ingest_google_flow.py)):
  - Unificou **19.227** prompts (`Google Flow`) + **3.055** (`Gemini Kimi`) em `data/prompt_engine_v1.sqlite` com tabela virtual **`prompts_fts` (FTS5)**, projeção semântica `24d` (`sem_vec`), `12` clusters semânticos, `8` clusters estruturais, `8` manchas vazias (`voidZones`), `62` pares em 3 categorias e `8` resumos de projeto em `data/suite_google_flow.json`.
- **Middleware de API Read-Only** ([promptEnginePlugin.ts](file:///b:/AntiGravity/Prompt-EngineV1/server/promptEnginePlugin.ts)):
  - Utiliza `node:sqlite` (`DatabaseSync` em modo `{ readOnly: true }`) para servir `/api/suite`, `/api/map-points`, `/api/prompts` (FTS5 + paginação), `/api/prompt/:id` (com 8 vizinhos mais próximos), `/api/thumbnail/:sourceLib/:itemId` (cache LRU em RAM).
- **Frontend conectado à escala de 22k:**
  - Seletor **Biblioteca Ativa** (`Flow 19.2k` | `Kimi 3.1k` | `Tudo 22.3k`) em [AppSidebar.tsx](file:///b:/AntiGravity/Prompt-EngineV1/src/components/AppSidebar.tsx) e [App.tsx](file:///b:/AntiGravity/Prompt-EngineV1/src/App.tsx).
  - `<canvas>` 2D DPR-aware em [MapView.tsx](file:///b:/AntiGravity/Prompt-EngineV1/src/components/MapView.tsx) com cards de miniatura por nível de zoom (`zoom >= 0.88`).

### Etapa 4 — Síntese Assistida de Gaps (`Gap-to-Prompt Bridge`) & Caderno Local
- **Motor de síntese** ([gapSynthesizer.ts](file:///b:/AntiGravity/Prompt-EngineV1/src/core/gapSynthesizer.ts)):
  - Cruza dois doadores reais (`Doador A` e `Doador B`) e injeta os ingredientes inéditos (`tagA × tagB [× tagC]`) nos 3 formatos da coleção (`json`, `sections`, `single_paragraph`).
- **Rotas e Laboratório em [GapsView.tsx](file:///b:/AntiGravity/Prompt-EngineV1/src/components/GapsView.tsx):**
  - `GET /api/gap-donors`: busca doadores alternativos no SQLite FTS5 com botão **`Trocar`**.
  - `POST /api/decompose-preview`: simula em tempo real `TIER`, `"mais raro que XX% da coleção"`, `MAT` e cobertura `X/8`.
  - `GET / POST / DELETE /api/gap-drafts`: salva rascunhos no caderno local [gap_drafts.json](file:///b:/AntiGravity/Prompt-EngineV1/data/gap_drafts.json), com exportação em `.MD` e `.JSON`.

### Etapa 5 — Calibração, Lapidação (`Raro + Imaturo → Raro + Maduro`) & Evolução Temporal
- **Estúdio de Lapidação** ([promptRefiner.ts](file:///b:/AntiGravity/Prompt-EngineV1/src/core/promptRefiner.ts), [RefinementStudioPanel.tsx](file:///b:/AntiGravity/Prompt-EngineV1/src/components/RefinementStudioPanel.tsx)):
  - Fila filtrável dos **1.426 prompts `Raro + Imaturo`** (`195` `Tier S`) via `GET /api/immature-queue`.
  - `diagnosePromptImmaturity` identifica gargalos (`ESQUELETO ÓRFÃO`, `SEM NEGATIVO`, `ÓPTICA`, `FÍSICA DE LUZ`, `BIOMECÂNICA`, `VAZIOS`).
  - `refineImmaturePrompt` preserva a ideia rara e transplanta para os **4 moldes consolidados** (`Studio Editorial v5`, `Nano Banana G6`, `FDR v3 Técnico`, `FDR Direct / Body Mechanics`), elevando o quadrante para **`Raro + Maduro`**.
  - Atalho direto **`Lapidar para Raro + Maduro →`** no [PromptInspectorDrawer.tsx](file:///b:/AntiGravity/Prompt-EngineV1/src/components/PromptInspectorDrawer.tsx).
- **Evolução Temporal & Deriva Criativa** ([TimelineEvolutionPanel.tsx](file:///b:/AntiGravity/Prompt-EngineV1/src/components/TimelineEvolutionPanel.tsx), `GET /api/timeline-insights`):
  - Decodifica timestamps de criação (`Base-36` dos IDs Eagle + `mtime.json`) em safras (`Dez/25–Fev/26`, `Jul/2026`, `Ago/2026`, `Out/2026`, `Nov/2026`).
  - Compara `Jul–Ago` vs. `Out–Nov` para revelar **Ingredientes Adormecidos** (ex.: `Teleobjetiva / prime` `-38,9%`, `Close-up / macro` `-25,1%`, `Linho cru` `-20,6%`) e **Em Saturação Recente** (`mobile snapshot raw` `+55,4%`, `Grande-angular / celular` `+41,1%`).

---

## 3. Verificação e Qualidade

- **Testes automatizados (`npm test` — Vitest):** `12/12` testes passando em [promptEngine.test.ts](file:///b:/AntiGravity/Prompt-EngineV1/tests/promptEngine.test.ts), cobrindo parser multi-formato, raridade/maturidade, similaridade em 2 camadas + diff, leitura FTS5 em `data/prompt_engine_v1.sqlite`, síntese de gaps e lapidação nos 4 moldes.
- **Typecheck & Build (`npm run build`):** `tsc -b && vite build` com `0` erros (`2142` módulos).
- **Repositório GitHub:** publicado na branch `main` de `https://github.com/owillfrost/Prompt-engine.git` (com `data/*.sqlite` ignorado no `.gitignore` e regenerável via `npm run ingest`).
