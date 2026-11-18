# Prompt Engine V1

Suíte local de inteligência e curadoria para analisar, decompor, comparar, agrupar e identificar lacunas criativas (*gaps*) sobre um acervo real de **22.282 prompts** de geração de imagem (unificando `Google Flow + Prompts.library` — `19.227` itens — e `Gemini Kimi + Antigravity.library` — `3.055` itens), operando em modo **100% Read-Only** sobre as bibliotecas Eagle e bancos externos.

---

## Principais Capacidades

- **Parser Multi-Formato & Decomposição em 8 Atributos**: interpreta prompts em **JSON** (`fdr_v3`, `nano_banana_g6`, `latente_v02`), **Seções** (`studio_editorial_v5`, `body_mechanics_12block`, `fdr_direct`, `numbered_sections`) e **Parágrafo Único** (`qwen_natural`), decompondo cada entrada em:
  1. `sujeito`
  2. `cenario`
  3. `luz`
  4. `camera`
  5. `textura_material`
  6. `estilo`
  7. `projeto_cliente`
  8. `estrutura`
  *(Consulte o esquema completo em [docs/DATA_MODEL_AND_SCHEMA.md](docs/DATA_MODEL_AND_SCHEMA.md).)*

- **Duplo Eixo — Raridade × Maturidade**:
  - **Raridade**: calculada por frequência inversa (IDF médio + bônus de co-ocorrência), expressa como percentil em fonte monoespaçada (`"mais raro que XX% da coleção"`) e convertida nos **Tiers sóbrios `S`–`D`** (`#e5a93c` reservado ao `Tier S`).
  - **Maturidade**: mede reuso do esqueleto, completude dos 8 atributos, precisão técnica (óptica/luz/FACS/negativo) e curadoria, separando os quatro quadrantes (`Raro + Maduro`, `Raro + Imaturo`, `Comum + Maduro`, `Comum + Imaturo`).

---

## As 5 Telas da Suíte

1. **Mapa** ([MapView.tsx](src/components/MapView.tsx)): `<canvas>` 2D DPR-aware plotando os **22.282 pontos** (`Flow 19.2k` | `Kimi 3.1k` | `Tudo 22.3k`) entre regiões semânticas/estruturais, manchas vazias (`O = 0`) e miniaturas flutuantes por nível de zoom (`zoom >= 0.88`), com inspeção de vizinhos e comparação direta.
2. **Coleção** ([CollectionView.tsx](src/components/CollectionView.tsx)): busca instantânea via **SQLite FTS5** (`GET /api/prompts`), contagens ao vivo por Tier (`S`–`D`), matriz de quadrantes, filtro por formato/projeto, paginação e inspetor completo ([PromptInspectorDrawer.tsx](src/components/PromptInspectorDrawer.tsx)) preservando o **Prompt Bruto Original** na íntegra.
3. **Pares** ([PairsView.tsx](src/components/PairsView.tsx)): similaridade em duas camadas (**Semântica × Estrutural**) destacando *mesmo esqueleto com assunto diferente*, *mesmo assunto com esqueleto diferente* e *quase duplicados*, com diff lado a lado exibindo apenas o que mudou.
4. **Gaps & Síntese Assistida** ([GapsView.tsx](src/components/GapsView.tsx)): matrizes 2D de co-ocorrência e tríades (`O = 0`), **Ponte Criativa** com troca de doadores reais do SQLite, sintetizador **Gap-to-Prompt** nos 3 formatos (`JSON`, `Seções`, `Parágrafo Único`), simulador de raridade ao vivo (`POST /api/decompose-preview`), exportação `.MD`/`.JSON` e caderno local em `data/gap_drafts.json`.
5. **Projetos, Território Virgem & Evolução Temporal** ([ProjectsView.tsx](src/components/ProjectsView.tsx), [RefinementStudioPanel.tsx](src/components/RefinementStudioPanel.tsx), [TimelineEvolutionPanel.tsx](src/components/TimelineEvolutionPanel.tsx)):
   - Perfil das 8 coleções/projetos, hábitos dominantes e gaps locais;
   - **Fila de Lapidação (`Raro + Imaturo → Raro + Maduro`)** com diagnóstico de gargalos e transplante de esqueleto para os 4 moldes consolidados (`Studio Editorial v5`, `Nano Banana G6`, `FDR v3 Técnico`, `FDR Direct / Body Mechanics`);
   - **Evolução Temporal & Deriva Criativa** por safra (`Base-36 ID` + `mtime.json`), comparando **Ingredientes Adormecidos** vs. **Em Saturação Recente**.

---

## Como Executar Localmente

> **Nota:** o índice SQLite compilado (`data/prompt_engine_v1.sqlite`, ~513 MB) não é versionado no Git por conta do limite de tamanho do GitHub. Gere-o localmente com o script de ingestão antes de subir a interface completa.

### Pré-requisitos
- **Node.js `>= 24`** (utiliza `node:sqlite` nativo `DatabaseSync` com `FTS5`)
- **Python `3.11+`** com `numpy` (para `npm run ingest`)

### Instalação e Uso

```bash
# 1. Instalar dependências Node
npm install

# 2. (Opcional / Recomendado) Ingerir os 22.282 prompts em modo Read-Only -> data/prompt_engine_v1.sqlite
npm run ingest

# 3. Subir a suíte em desenvolvimento (http://127.0.0.1:5178/)
npm run dev

# 4. Rodar testes automatizados (Vitest)
npm test

# 5. Validar TypeScript + build de produção
npm run build
```

---

## Estrutura do Projeto

- `src/core/` — parser multi-formato (`promptDecomposer.ts`), raridade/maturidade (`rarityEngine.ts`), similaridade/diff (`promptDiff.ts`), síntese de gaps (`gapSynthesizer.ts`), lapidação de moldes (`promptRefiner.ts`).
- `src/components/` — interface dark em React + Tailwind CSS v4 (`AppSidebar`, `MapView`, `CollectionView`, `PairsView`, `GapsView`, `ProjectsView`, `RefinementStudioPanel`, `TimelineEvolutionPanel`, `PromptInspectorDrawer`, `SchemaProposalModal`).
- `server/promptEnginePlugin.ts` — middleware Vite servindo `/api/suite`, `/api/map-points`, `/api/prompts`, `/api/prompt/:id`, `/api/gap-donors`, `/api/gap-drafts`, `/api/decompose-preview`, `/api/immature-queue`, `/api/timeline-insights` e `/api/thumbnail/:sourceLib/:itemId`.
- `scripts/ingest_google_flow.py` — pipeline Read-Only que gera `data/prompt_engine_v1.sqlite` e `data/suite_google_flow.json`.
- `tests/promptEngine.test.ts` — suíte Vitest cobrindo parser, raridade, similaridade/diff, ingestão FTS5, síntese de gaps e lapidação.
