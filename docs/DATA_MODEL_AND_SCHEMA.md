# Proposta de Modelo de Dados e Esquema de Atributos — Prompt Engine V1

> Documento arquitetural da **Primeira Entrega**. Define como prompts acumulados ao longo de ~2 anos em formatos mistos (`JSON`, `Seções`, `Parágrafo Único`) são ingeridos em modo **100% Read-Only**, normalizados em 8 atributos canônicos, pontuados nos eixos **Raridade × Maturidade** e preparados para detecção de **Pares**, **Clusters** e **Gaps Criativos**.

---

## 1. Inventário de Fontes e Reaproveitamento

| Fonte / Projeto | Papel na Suíte | Modo de Acesso | Artefatos Reaproveitados |
| :--- | :--- | :--- | :--- |
| `D:\Meus Documentos\Imagens\Eagle.cool\Gemini Kimi + Antigravity.library` | Fonte primária (3.055 prompts ativos + miniaturas e tags reais) | Read-Only (`metadata.json` + `.info/`) | Tags nativas (`enquadramento:*`, `estilo:*`, `iluminacao:*`, `lente:*`, `peca:*`, `cor:*`, `ambiente:*`, `pose:*`, `expressao:*`) e miniaturas `_thumbnail` |
| `D:\Meus Documentos\Imagens\Eagle.cool\Google Flow + Prompts.library` | Fonte secundária para projetos nomeados (`Iberica`, `Lua's Collection`, `Eccomerce style`, `Imagen 4`) | Read-Only | Pastas de projeto hierárquicas + miniaturas reais |
| `B:\AntiGravity\Projeto Alfa` | Corpus indexado (22.285 prompts) + AST 8 blocos + estatísticas globais | Read-Only (`?mode=ro`) | `prompt_dna.sqlite` (`prompts`, `tag_stats`, `cooccurrence`), `parser_ast.py`, `ontology.py`, `domain_rules.py`, fontes locais `Geist Sans` e `Geist Mono` |
| `C:\Users\conta\Documents\antigravity\fearless-euclid` | Telemetria 3D de pose e taxonomia curada | Read-Only (`?mode=ro`) | `posematch_eagle.sqlite` (`yaw`, `pitch`, `roll`, `pose_type`, prefixos `char:`, `app:`, `arq:`, `mod:`, `opt:`) + padrão `vite-eagle-plugin.ts` (cache LRU em RAM) |
| `B:\AntiGravity\noiser-reconizer` | Motor de diff léxico, similaridade e projeção espacial | Cópia / Adaptação TS | `promptDiff.ts`, `vectorMath.ts`, `textTokens.ts`, `useCopyFeedback.ts`, estrutura Vite + Vitest + Tailwind v4 |
| `C:\Users\conta\Documents\antigravity\calm-brahmagupta` | Quantização vetorial Int8 para futura camada semântica | Cópia / Adaptação TS | `vectorQuantization.ts` (compatível com embeddings 512d em RAM/Worker) |

---

## 2. Esquema Canônico dos 8 Atributos (`DecomposedAttributes`)

Todo prompt — seja JSON estruturado (`nano_banana_g6`, `fdr_v3`, `latente_v02`), seções explícitas (`fdr_direct`, `body_mechanics_12block`, `studio_editorial_v5`, blocos numerados) ou parágrafo único (`qwen_natural` / prosa livre) — é decomposto em **8 atributos ortogonais**:

| # | Chave (`AttributeKey`) | O que captura | Origens de Extração (Prioridade) |
| :---: | :--- | :--- | :--- |
| 1 | `sujeito` | Identidade, demografia, cabelo, pele/poros, expressão/FACS, ação/pose/biomecânica, telemetria 3D (`yaw/pitch/roll`) | JSON (`subject`, `subject_details`, `subjects`, `identity`, `FACS`), seções (`[IDENTITY LOCK]`, `BODY MECHANICS:`), texto (`identity_subject` + `body_mechanics_pose`) e tags `pose:`/`expressao:`/`modelo:` |
| 2 | `cenario` | Locação física, arquitetura, época/geografia, objetos e props espaciais | JSON (`scene_description.location`, `environment`, `composition.background`), seções (`[LOCATION]:`, `Environment & props:`), texto (`environment_props`) e tags `ambiente:` |
| 3 | `luz` | Física de iluminação, direção, fonte (janela, flash direto, neon, estúdio, sol), temperatura Kelvin, sombra | JSON (`lighting`, `light`, `lighting_physics`), seções (`[LIGHTING]:`, `Lighting physics:`), texto (`lighting_physics`) e tags `iluminacao:` |
| 4 | `camera` | Dispositivo/câmera, distância focal (`24mm..135mm`), abertura, enquadramento, ângulo (`plongée`, `contra-plongée`, `3/4`, `dorsal`), oclusão em 3 planos, profundidade de campo | JSON (`camera`, `capture`, `camera_technical`, `composition.framing`), seções (`[SHOT_TYPE] & [DEVICE]:`, `Camera & sensor texture:`), texto (`camera_framing_occlusion`) e tags `enquadramento:`/`lente:`/`opt:` |
| 5 | `textura_material` | Peças de vestuário, tecidos (`linho`, `seda`, `denim`, `couro`, `nylon`), acabamento superficial, paleta de cores de peças/superfícies, textura de pele/grão | JSON (`fashion_and_texture`, `wardrobe`, `skin`, `surface`), seções (`Wardrobe & materials:`), texto (`wardrobe_materials`) e tags `peca:`/`cor:` |
| 6 | `estilo` | Linhagem visual (`Editorial`, `Candid`, `Documental`, `Arquivo`), tratamento de cor (`color_grade`, `color_logic`), perfil de filme/LUT, diretivas anti-IA | JSON (`visual_context.primary_lineage`, `color_grade`, `color_logic`, `development`), seções (`[CAPTURE QUALITY]:`), texto (`color_sensor_context`) e tags `estilo:`/`arq:`/`mod:`/`app:` |
| 7 | `projeto_cliente` | Contexto de projeto, personagem ou coleção do autor | Pastas hierárquicas Eagle (`Iberica character`, `Lua's Collection`, `Eccomerce style/...`), prefixos PoseMatch (`char:*`, `app:*`) e biblioteca de origem (`gemini_kimi`, `google_flow`) |
| 8 | `estrutura` | Metadado estrutural puro (esqueleto do prompt): `macroFormat`, `kernelDialect`, `skeletonSignature`, `filledAttributesCount`, `hasExplicitNegative`, `tokenCount`, `aspectRatio` | Detector sintático multi-formato + assinatura estrutural das chaves/camadas presentes |

### Tipos de Formato Aceitos pelo Parser (`macroFormat` × `kernelDialect`)
- **`json`**: JSON completo, JSON cercado por markdown (` ```json `), JSON *headless* (`"subject": { ... }`) ou JSON precedido de preâmbulo conversacional de agente (`"Aqui está o prompt..."`). Dialetos: `fdr_v3`, `nano_banana_g6`, `latente_v02`.
- **`sections`**: Prompts divididos em camadas ou seções explícitas (`[SHOT_TYPE] & [DEVICE]:`, `BODY MECHANICS:`, `STEP 1..4`, `[IDENTITY LOCK]`, seções numeradas `1. Camera framing/crop`). Dialetos: `fdr_direct`, `body_mechanics_12block`, `studio_editorial_v5`, `numbered_sections`.
- **`single_paragraph`**: Prosa contínua em bloco único (inglês ou português) sem chaves JSON ou cabeçalhos de seção. Dialeto: `qwen_natural`.

---

## 3. Os Dois Eixos: Raridade vs. Maturidade (e Tiers S–D)

### Eixo 1 — Raridade (`rarityScore` e `rarityPercentile`)
Mede **quão pouco explorada** é uma combinação criativa frente ao corpus histórico completo ($N = 22.285$ prompts indexados + subconjunto ativo $N_{GK} = 3.055$).

1. **Frequência Inversa de Tags Canônicas (IDF médio ponderado)**:
   $$\text{IDF}(t) = \log_2\left(\frac{N + 1}{\text{freq}(t) + 1}\right)$$
   Tags raras ou pouco frequentes nos eixos (`sujeito/pose`, `cenario`, `luz`, `camera`, `textura_material`, `estilo`) elevam a pontuação base.
2. **Ineditismo Combinatório (Co-ocorrência Par-a-Par)**:
   Mede a raridade das combinações reais presentes no prompt (ex.: `cenario × luz`, `camera × pose`, `textura × luz`) usando $\text{IDF}_{\text{par}}(t_a, t_b)$ e **PMI negativo/baixo** (combinações que ocorrem juntas muito abaixo do esperado).
3. **Bônus de Vocabulário Específico**: penaliza prompts genéricos vazios (`filledAttributesCount < 4`) e valoriza especificidade lexical que não cai em clichês dominantes.
4. **Percentil Empírico**:
   $$\text{rarityPercentile}(p) = \text{clamp}\left(1, 99, \text{round}\left(100 \times \frac{\text{rank}(R_p)}{N}\right)\right)$$
   Exibido em monoespaçada como: **`"mais raro que 97% da coleção"`**.

### Tiers Sóbrios (`S` a `D`)
Derivados exclusivamente do percentil de raridade (sem ícones de jogo, medalhas ou mascotes):

| Tier | Faixa de Percentil | Significado | Tratamento Visual |
| :---: | :---: | :--- | :--- |
| **S** | `95 – 99` | Top 5% mais raro da coleção | Único acento de cor da suíte (`#e5a93c`) |
| **A** | `80 – 94` | Alta originalidade (Top 6–20%) | Superfície neutra com borda sutil clara |
| **B** | `50 – 79` | Repertório intermediário | Cinza neutro |
| **C** | `20 – 49` | Padrão recorrente | Cinza discreto |
| **D** | `1 – 19` | Alta saturação / fórmula muito repetida | Cinza apagado |

### Eixo 2 — Maturidade (`maturityScore` 0–100)
Mede **quanto o prompt e seu molde foram reutilizados, estruturados e refinados**, independentemente da raridade do tema:

$$\text{Maturity}(p) = 0.35 \cdot S_{\text{reuso\_esqueleto}} + 0.35 \cdot S_{\text{completude\_8\_atributos}} + 0.15 \cdot S_{\text{precisao\_tecnica}} + 0.15 \cdot S_{\text{curadoria}}$$

- **`reuso_esqueleto`**: quantas vezes aquela linhagem estrutural (`skeletonSignature` / `kernelDialect`) e variação de projeto foram refinadas no histórico do autor.
- **`completude_8_atributos`**: fração dos 8 atributos preenchidos com substância (sem placeholders vazios).
- **`precisao_tecnica`**: presença de parâmetros explícitos de câmera/óptica, iluminação física, FACS/biomecânica e escudo negativo explícito (`negative_prompt` / `--no` / `restraint_rules`).
- **`curadoria`**: sinais explícitos no Eagle/PoseMatch (`eagle_tags_count`, `star`, `face_confidence`).

### Os 4 Quadrantes (`RarityQuadrant`)

| Quadrante | Regra (`Percentil × Maturidade`) | Interpretação |
| :--- | :--- | :--- |
| **`raro_maduro`** | `rarityPercentile >= 70` e `maturityScore >= 60` | **Mais Valioso**: território pouco explorado, mas com engenharia de prompt madura e replicável. |
| **`raro_imaturo`** | `rarityPercentile >= 70` e `maturityScore < 60` | **Território Virgem**: ideia ou combinação rara ainda em rascunho/prosa curta; alto potencial de lapidação. |
| **`comum_maduro`** | `rarityPercentile < 70` e `maturityScore >= 60` | **Assinatura Consolidada**: fórmula muito testada e refinada, porém já saturada na coleção. |
| **`comum_imaturo`** | `rarityPercentile < 70` e `maturityScore < 60` | **Base / Rotina**: variações rápidas e frequentes de baixo custo exploratório. |

---

## 4. Similaridade em Duas Camadas (Etapa Pares & Mapa)

1. **Camada Semântica (`semanticSim` $\in [0, 1]$)**:
   - Vetor denso normalizado sobre o conteúdo positivo dos atributos (`sujeito`, `cenario`, `luz`, `textura_material`, `estilo`) via embeddings de texto (`EmbeddingGemma-2` 512d Int8 quantizado + TF-IDF de termos de conteúdo).
   - Responde: *"Os dois prompts descrevem a mesma cena/assunto/universo visual?"*
2. **Camada Estrutural (`structuralSim` $\in [0, 1]$)**:
   - Similaridade sobre o esqueleto (`macroFormat`, `kernelDialect`, `skeletonSignature`, proporção de atributos preenchidos, estrutura de seções/chaves JSON e padrões de câmera/iluminação).
   - Responde: *"Os dois prompts usam o mesmo molde/kernel de engenharia?"*
3. **Pares Contrastantes Destacados (`DivergencePairs`)**:
   - **Mesmo Esqueleto, Assunto Diferente (`structuralSim >= 0.75` e `semanticSim <= 0.35`)**: revela templates altamente versáteis transferíveis entre projetos.
   - **Mesmo Assunto, Esqueleto Diferente (`semanticSim >= 0.72` e `structuralSim <= 0.35`)**: revela evolução de formato ao longo dos ~2 anos (ex.: uma mesma cena escrita primeiro em prosa `qwen_natural` e depois reescrita em `nano_banana_g6` ou `latente_v02`).

---

## 5. Definição Formal de Gap Criativo (`[PREENCHER: o que conta como gap para mim]`)

Um **Gap Criativo** é formalizado no modelo como uma combinação plausível de atributos com **zero ocorrências na matriz**, filtrada para eliminar ruído combinatório impossível:

$$\text{IsGap}(A_i, B_j) \iff O(A_i, B_j) = 0 \;\land\; \text{freq}(A_i) \ge \tau_{\min} \;\land\; \text{freq}(B_j) \ge \tau_{\min} \;\land\; E(A_i, B_j) \ge E_{\min} \;\land\; \text{Coherence}(A_i, B_j) = 1$$

- **Parâmetros padrão propostos (ajustáveis pelo usuário):**
  - `O(A_i, B_j) == 0`: nenhuma ocorrência na matriz da biblioteca/projeto ativo (ex.: dentro de `Gemini Kimi + Antigravity.library`, $N = 3.055$, há combinações reais com $O = 0$ como `pose:walking_stride` × `environment:bedroom_bed` com $E = 3{,}72$, ou `pose:crouching_squat` × `environment:cafe_bar_restaurant` com $E = 1{,}58$) ou zero ocorrências em tríades de grão fino no corpus completo ($N = 22.285$).
  - `minMarginalFreq` ($\tau_{\min} = 15$ por biblioteca ou $25$ global): ambos os atributos já existem com frequência real no repertório do autor (não é termo inventado fora da coleção).
  - `minExpectedCount` ($E_{\min}$ configurável; ex.: $0{,}4$ no escopo da biblioteca `Gemini Kimi` ou $5{,}0$ no corpus global): indica combinações que estatisticamente já deveriam ter ocorrido — logo sua ausência é um **vício/ponto cego real**.
  - `coherenceCheck = true`: exclui combinações fisicamente absurdas (ex.: `harsh_midday_sun` em cômodo fechado sem janela, ou tecido pesado de inverno em cena subaquática).
- **Observação `[PREENCHER]`:** Na entrega atual, o schema suporta ainda alterar o escopo do Gap entre **Global** (todo o acervo), **Por Projeto** (ex.: o que falta testar especificamente dentro de `Gemini Kimi` ou `Iberica`) e **Por Par de Atributos** (`cenario × luz`, `camera × sujeito`, `textura_material × luz`, `estilo × cenario`).

---

## 6. Esquema SQLite (`data/prompt_engine_v1.sqlite`)

```sql
CREATE TABLE prompts (
    id TEXT PRIMARY KEY,
    source_lib TEXT NOT NULL,
    title TEXT NOT NULL,
    raw_prompt TEXT NOT NULL,
    clean_prompt TEXT NOT NULL,
    macro_format TEXT NOT NULL,        -- 'json' | 'sections' | 'single_paragraph'
    kernel_dialect TEXT NOT NULL,      -- 'nano_banana_g6' | 'fdr_v3' | 'latente_v02' | 'fdr_direct' | ...
    skeleton_signature TEXT NOT NULL,
    project_name TEXT NOT NULL,
    thumbnail_url TEXT,
    btime INTEGER,
    star INTEGER DEFAULT 0,
    eagle_tags_json TEXT NOT NULL,
    -- Métricas dos 2 Eixos
    rarity_score REAL NOT NULL,
    rarity_percentile INTEGER NOT NULL,
    rarity_label TEXT NOT NULL,        -- 'mais raro que 97% da coleção'
    rarity_tier TEXT NOT NULL,         -- 'S' | 'A' | 'B' | 'C' | 'D'
    maturity_score REAL NOT NULL,
    quadrant TEXT NOT NULL,            -- 'raro_maduro' | 'raro_imaturo' | 'comum_maduro' | 'comum_imaturo'
    attributes_json TEXT NOT NULL,     -- DecomposedAttributes (8 atributos completos)
    rarity_breakdown_json TEXT NOT NULL,
    maturity_breakdown_json TEXT NOT NULL
);

CREATE TABLE prompt_attributes (
    prompt_id TEXT NOT NULL,
    attribute_key TEXT NOT NULL,       -- 'sujeito' | 'cenario' | 'luz' | 'camera' | 'textura_material' | 'estilo' | 'projeto_cliente' | 'estrutura'
    extracted_text TEXT NOT NULL,
    tags_json TEXT NOT NULL,
    is_filled INTEGER NOT NULL,
    PRIMARY KEY (prompt_id, attribute_key),
    FOREIGN KEY (prompt_id) REFERENCES prompts(id)
);

CREATE TABLE attribute_frequencies (
    axis TEXT NOT NULL,
    tag TEXT NOT NULL,
    corpus_count INTEGER NOT NULL,
    corpus_pct REAL NOT NULL,
    idf_weight REAL NOT NULL,
    PRIMARY KEY (axis, tag)
);

CREATE TABLE cooccurrence_matrix (
    axis_a TEXT NOT NULL,
    tag_a TEXT NOT NULL,
    axis_b TEXT NOT NULL,
    tag_b TEXT NOT NULL,
    observed_count INTEGER NOT NULL,
    expected_count REAL NOT NULL,
    pmi REAL,
    is_coherent INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (axis_a, tag_a, axis_b, tag_b)
);

CREATE TABLE skeleton_lineages (
    skeleton_signature TEXT PRIMARY KEY,
    macro_format TEXT NOT NULL,
    kernel_dialect TEXT NOT NULL,
    corpus_usage_count INTEGER NOT NULL,
    avg_maturity REAL NOT NULL
);

CREATE TABLE similarity_pairs (
    prompt_id_a TEXT NOT NULL,
    prompt_id_b TEXT NOT NULL,
    semantic_sim REAL NOT NULL,
    structural_sim REAL NOT NULL,
    divergence_score REAL NOT NULL,
    cluster_id INTEGER,
    PRIMARY KEY (prompt_id_a, prompt_id_b)
);
```
