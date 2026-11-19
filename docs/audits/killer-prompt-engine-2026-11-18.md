# Killer: Prompt Engine V1 (`src/`)

**Tier** T2 route + T3 core (`GapsView` writes `data/gap_drafts.json`) · **Score** 48/100 · **Verdict** does not go to PR (gate closed + confirmed layout/responsive defects)
**Surface** B work (throughput × decision quality)

## Pending decision (the user's, not mine)

1. **Tokenização do Tema vs. Paleta Tailwind + Exceções de Raw Hex**: O projeto declara tokens em `src/index.css` (`--bg-canvas`, `--bg-surface`, `--tier-s..d`), mas os componentes usam classes `bg-[#101013]` e paleta Tailwind (`text-zinc-300`, `text-purple-400`) em 674 ocorrências. **Minha recomendação:** mapear os tokens de superfície e texto no `@theme` do Tailwind v4 em `src/index.css` (`--color-canvas`, `--color-surface`, `--color-tier-s..d`) e substituir os hex crus por tokens semânticos nos componentes principais.
2. **Layout Mobile do `AppSidebar` + `MapView`**: Em `390×844`, a sidebar inteira empilha `~485px` acima do conteúdo e o `<canvas>` do mapa colapsa para altura `0` (`visible: false`). **Minha recomendação:** colapsar biblioteca/cartógrafo em gaveta/acordeão no mobile e fixar altura mínima (`min-h-[340px]`) no palco do `<canvas>`.

---

## Surfaces

| File | Surface (A/B/C) | Business variable it moves | Craft (shine/alive/sober) | Brand moment / quiet on purpose | Notes |
|---|---|---|---|---|---|
| src/App.tsx | B | Navegação entre análises sem perder contexto ou estado de seleção | sober | quiet on purpose: shell escuro neutro sem decoração | Orquestra rotas virtuais e estado global do Cartógrafo |
| src/components/AppSidebar.tsx | B | Velocidade de troca de biblioteca (Flow/Kimi/Tudo) e retorno diário | alive | Selo e progresso de Cartógrafo com leitura de ocupação territorial | Empilha ~485px no mobile e mistura controle de fonte com gamificação |
| src/components/CollectionView.tsx | B | Throughput de busca FTS5 + taxa de lapidação de prompts raros | alive | Barra multi-segmento dos 5 Tiers S–D e progresso de maturação | `grid-cols-5` corta dígitos no mobile (390px) |
| src/components/GapsView.tsx | C | Criação e persistência de novos prompts inéditos (`O=0` → `gap_drafts.json`) | shine | Ritual "Território Virgem" + Score E animado na abertura do gap | Mistura B (matriz/lista) e C (gravação local em disco); row headers invadem Col 1 |
| src/components/MapView.tsx | B | Descoberta espacial de clusters densos e manchas vazias entre regiões | alive | Pulso dourado de Tier S ao selecionar cluster + pins territoriais | `<canvas>` some (`0px` altura) em 390px; rótulos sobrepostos em zoom 11% |
| src/components/PairsView.tsx | B | Decisão de qual atributo gerou divergência semântica/raridade entre A e B | alive | Destaque dourado automático no atributo de maior impacto (`Δ IDF`) | Truncamento agressivo na lista lateral de pares |
| src/components/ProjectsView.tsx | B | Priorização de coleções e fila de lapidação (`Raro + Imaturo`) | sober | quiet on purpose: grade analítica focada em cobertura e volume | Sub-abas conectam Projetos → Refinamento → Evolução Temporal |
| src/components/PromptCollectionCard.tsx | B | Reconhecimento instantâneo de raridade e maturidade ao escanear o acervo | shine | Aura dourada em repouso para Top 0.1% (`P99`) e percentil animado | `<img>` sem `onError`, hover scale na imagem e tilt apenas no hover |
| src/components/PromptInspectorDrawer.tsx | B | Leitura conjunta da imagem gerada em resolução original e dos 8 atributos | shine | Palco dividido de alta resolução com expansão 100% tela cheia | Botão de lapidação usa caractere `→` em vez de ícone Lucide |
| src/components/RefinementStudioPanel.tsx | C | Evolução estrutural de prompts raros imaturos para moldes maduros | sober | quiet on purpose: diff antes/depois objetivo | `<img>` sem `onError` na fila e card de referência |
| src/components/SchemaProposalModal.tsx | B | Clareza do contrato de 8 atributos e definição matemática de Gap (`O=0`) | sober | quiet on purpose: modal documental de referência | Travessão (`–`) no título de seção |
| src/components/TimelineEvolutionPanel.tsx | B | Identificação de deriva criativa e ingredientes adormecidos por safra | alive | Comparativo temporal de tags adormecidas vs. saturadas | Travessões (`—`/`–`) e seta textual `→` no cabeçalho |
| src/main.tsx | B | Boot limpo da aplicação React | sober | quiet on purpose: entry point técnico | Sem lógica visual própria |

---

## Screen seen

| Route / View | Width | Data state | What happened |
|---|---|---|---|
| `Mapa` (`http://localhost:5174/`) | 1270×800 (Desktop) | Real SQLite (`19.227` Flow points, 12 clusters, 8 void zones) | Hidratou sem erros. `scrollWidth - innerWidth = 0`. Rótulos de `CLUSTER 03/07/08/11/12` e badges `GAP E=...` se sobrepõem no zoom inicial `11%`. |
| `Coleção` + `PromptInspectorDrawer` | 1270×800 (Desktop) | Real SQLite (`19.227` prompts, `1.102` Tier S, `81%` raros maduros) | `scrollWidth - innerWidth = 0`. `Acervo Coletado` exibe números reais não-zero. Modal split carregou `/api/image/google_flow/...` (`200 OK`, `525.6×704px`); botão `Tela Cheia` expandiu para `1270×800`; `Esc` duplo fechou corretamente. Cards de Tier comprimem números de 4 dígitos junto à borda. |
| `Pares` | 1270×800 (Desktop) | Real SQLite (`62` pares em 3 categorias) | `scrollWidth - innerWidth = 0`. Diff lado a lado e driver de raridade renderizam bem; coluna esquerda trunca nomes (`Iberica character ↔ E...`) e formato (`SINGLE_PARA...`). |
| `Gaps` (`Global` e `Eccomerce style`) + Vault Modal | 1270×800 (Desktop) | Real SQLite (`123` gaps, `GAP DO DIA`, matriz `780×427`) | `scrollWidth - innerWidth = 0`. Em `Eccomerce style`, 19 células `O=0` douradas e 5 `O=1–3` roxas renderizaram; modal `TERRITÓRIO VIRGEM · Gap #0001` abriu com 2 imagens de doadores. **Bug visual:** rótulos de linha da matriz (`Praia / piscina / água (1950)`) vazam para cima da Coluna 1. |
| `Projetos` | 1270×800 (Desktop) | Real SQLite (`8` coleções, `1.426` Raro+Imaturo) | `scrollWidth - innerWidth = 0`. Cards e sub-abas renderizam sem imagens quebradas (`0` `naturalWidth === 0`). |
| `Mapa`, `Coleção`, `Pares`, `Gaps`, `Projetos` | 390×844 (Mobile) | Real SQLite (`19.227` Flow) | `scrollWidth - innerWidth = 0` em todas as telas, porém: (1) **Coleção:** `grid-cols-5` corta o último dígito de todos os Tiers (`1.10`, `2.98`, `5.86`); (2) **Mapa:** `<canvas>` fica `visible: false` (`0px` altura); (3) **Gaps:** subtítulo do `GAP DO DIA` trunca e cabeçalho da matriz invade Coluna 1; (4) **AppSidebar:** ocupa `~485px` verticais acima do conteúdo principal. |

---

## Not checked

- **Light theme (`--theme both`)**: Não testado; o aplicativo declara `color-scheme: dark` e é dark-only (`src/index.css:66`).
- **Dispositivo físico iOS / Safari**: Gestos de pan/zoom no `MapView` e hover/tilt em `PromptCollectionCard` foram inspecionados via Chromium desktop/mobile emulation, não em hardware iPhone real.
- **Backend offline (erro de rede simulado)**: Não executamos o fluxo derrubando o servidor Vite/SQLite durante a sessão; a análise de `catch` foi feita por leitura estática de código.
- **Telas secundárias internas de `Projetos`** (`RefinementStudioPanel` com seleção ativa e `TimelineEvolutionPanel` em runtime): auditadas por código e gates estáticos, não abertas após clique na sub-aba no navegador.

---

## Before and after

Nothing edited (modo auditoria — Regra Zero aplicada; aguardando aprovação do usuário para correção).

---

## Gate

| Detector | Result | Findings | Notes |
|---|---|---|---|
| `impeccable` (AI tell) | PASS | `0` | Nenhum padrão genérico de IA detectado |
| `audit:design` (token fallback) | FAIL | `674` | `raw-hex` (`bg-[#101013]`, `text-[#e8b84b]`) + `tailwind-palette` (`text-zinc-*`, `text-purple-*`) contornando tokens CSS de `src/index.css` |
| `copy` (copy-lint) | FAIL | `17` (`13` em `src/` + `core/`) | Travessões (`—`/`–`) em `rarityEngine.ts:70-74`, `CollectionView.tsx:302,396`, `TimelineEvolutionPanel.tsx:148,150,193`, `SchemaProposalModal.tsx:100`, `GapsView.tsx:673`, `promptRefiner.ts:223`; selos de credibilidade ("real"/"authentic") em `GapsView.tsx:1212,1700` e `gapSynthesizer.ts` |
| `noise` (chrome) | FAIL | `24` (hard) + `110` (warn) | `tile-img-no-onerror` (11 ocorrências), `arrow-glyph` (`→`/`↔` em UI), `usage-instruction` (4 ocorrências), `caption-of-what-follows` (2), `same-info-twice` (1), `highlight-at-rest` (1 falso positivo em `active: true` de objeto `dragRef`) |
| `refine-scan` | FAIL | `3` | `transition-[width]` em barras de progresso (`AppSidebar.tsx:286`, `CollectionView.tsx:290,325`) animando propriedade de layout |
| `stroke-scan` | WARN | `1` | `MapView.tsx:833` usa `ring-2 ring-white/25` no nó de miniatura selecionado |
| `tsc --noEmit` | PASS | `0` | Zero erros de tipo |
| `scrollWidth - innerWidth` (390px) | PASS (`0px`) | `0` overflow doc | Embora `0px` no documento, há cortes internos graves em `CollectionView` e `GapsView` |

Skipped: nenhum detector do `visant-killer` foi pulado (`4/4 ran`). O repositório não possui scripts próprios `audit:design`/`lint:design` em `package.json`.

---

## Findings & Confirmed Defects

### Bloco A — Defeitos Confirmados no Navegador + Código (Alta Prioridade)

1. **Cortes numéricos nos cards de Tier em Mobile e aperto no Desktop (`slop-catalog #23`)** — `src/components/CollectionView.tsx:346`
   `grid-cols-5` em todas as larguras comprime os cards para `~56px` em `390px`, cortando o último dígito de todas as contagens (`1.10`, `2.98`, `5.86`, `5.80`, `3.47`). **Fix:** `grid-cols-2 sm:grid-cols-3 md:grid-cols-5`.
2. **Invasão de texto da coluna de rótulos sobre a Coluna 1 na Matriz 2D (`slop-catalog #23`)** — `src/components/GapsView.tsx:836,839,859`
   `table-fixed` com `th` de `w-[152px]` combinada com `td className="whitespace-nowrap"` faz rótulos longos (`Praia / piscina / água (1950)`) sangrarem sobre a primeira coluna de células. **Fix:** remover `whitespace-nowrap` ou aplicar `w-[180px] truncate` com `overflow-hidden` na célula de rótulo.
3. **Mapa Espacial `<canvas>` invisível em Mobile (`390×844`)** — `src/components/MapView.tsx:748-756`
   Em telas `< lg`, `<div className="flex min-h-0 flex-1 flex-col lg:flex-row">` deixa o palco do `<canvas>` sem altura mínima (`min-h-[340px]`), fazendo o `<aside>` empurrar o canvas para `0px` (`visible: false`). **Fix:** `min-h-[360px] lg:min-h-0` no container do viewport do mapa.
4. **Sidebar mobile consome `~485px` antes do conteúdo (`slop-catalog #20` / Chrome budget)** — `src/components/AppSidebar.tsx:100`
   Em `390px`, todos os blocos da sidebar (seletor Flow/Kimi/Tudo, nav com scroll horizontal cortado, botão Schema, card de Cartógrafo) empilham antes do `<main>`. **Fix:** tornar o header mobile compacto (navegação + seletor de biblioteca) e ocultar/recolher o card detalhado do Cartógrafo em menu/drawer no `< lg`.
5. **Tags `<img>` de miniaturas sem `onError` (`slop-catalog #25` — `tile-img-no-onerror`)** — `PromptCollectionCard.tsx:126`, `GapsView.tsx:1164,1728`, `MapView.tsx:968,1003`, `PairsView.tsx:458,467,543`, `ProjectsView.tsx:278`, `RefinementStudioPanel.tsx:329,405`
   Se qualquer arquivo no Eagle estiver ausente ou corrompido, o navegador exibe ícone de imagem quebrada. **Fix:** criar/usar componente `<PromptThumb>` único com fallback `onError` neutro.
6. **Animação de propriedade de layout (`transition-[width]`) em barras de progresso (`refine-scan`)** — `AppSidebar.tsx:286`, `CollectionView.tsx:290,325`
   Animar `width` dispara layout a cada frame. **Fix:** usar `transform: scaleX(...)` com `origin-left` + `transition-transform`.
7. **Setas tipográficas (`→`, `↔`) e instruções redundantes em controles/UI (`Hard Prohibition` + `noise-scan`)** — `PromptInspectorDrawer.tsx:77-78,269`, `AppSidebar.tsx:129-130`, `PairsView.tsx:476`, `ProjectsView.tsx:62`, `GapsView.tsx:1524`, `TimelineEvolutionPanel.tsx:148`
   Botão `"Lapidar para Raro + Maduro →"` usa `→` em texto (deve usar ícone `ArrowRight` do `lucide-react`); tooltips de `AppSidebar` e `PromptInspectorDrawer` carregam `"clique para..."` em elementos com affordance óbvia.
8. **Hover com escala na imagem do card + tilt que só nasce no hover (`slop-catalog #31, #37`)** — `PromptCollectionCard.tsx:131`
   `motion-safe:group-hover:scale-[1.02]` escala a miniatura no hover (proibição: hover muda borda/sombra/cor, nunca move/escala o tile).
9. **Travessões (`—`/`–`) e selos de credibilidade no copy (`copy-lint`)** — `src/core/rarityEngine.ts:70-74` (root!), `CollectionView.tsx:302,396`, `SchemaProposalModal.tsx:100`, `TimelineEvolutionPanel.tsx:148,150,193`, `GapsView.tsx:673,1212,1700`
   Substituir travessões por dois-pontos, vírgula ou `a` em faixas textuais (ex.: `"Top 5%: raro na coleção"`), e remover adjetivos de autoafirmação ("reais", "authentic") onde os números já provam.
10. **Token Bypass (`audit:design` — 674 ocorrências de `raw-hex` + `tailwind-palette`)** — `App.tsx:96`, `AppSidebar.tsx:109`, `CollectionView.tsx`, `GapsView.tsx`, `MapView.tsx`, `PairsView.tsx`, `PromptCollectionCard.tsx`
    O app definiu CSS variables em `src/index.css:67-82`, mas continua usando `bg-[#101013]`, `bg-[#09090b]`, `text-[#e8b84b]` e `text-zinc-*` diretamente nos JSX.

### Bloco B — Pontuação (Scorecard `visant-killer`)

* **Gate:** `0/20` (3 gates oficiais fechados: `audit:design`, `copy`, `noise` + `refine-scan`).
* **Judgment:** `12/40` (`40` menos `7 × 4 = 28` por defeitos confirmados do `slop-catalog`: #23 cortes/sobreposições em CollectionView/GapsView/MapView, #25 `<img>` sem fallback, #20/#44 chrome excessivo no mobile, #17/#31/#37 scale no hover + `transition-[width]`, #15/#52 mistura de hex cru/paleta/opacidade).
* **Interrogation:** `36/40` (perguntas T2/T3 e bloco F1–F7 respondidos com evidência em `file:line`; `-4` pelos itens não executados em `Not checked`: backend offline e hardware iPhone).
* **Total:** **`48/100`** (não vai para PR até zerar defeitos do Bloco A e decidir sobre tokenização).

---

## What this round fixed in the detectors

| Rule | Was flagging | Diagnosis | Suggested Rule / Exception |
|---|---|---|---|
| `noise-scan` / `highlight-at-rest` | `MapView.tsx:590` (`active: true` dentro de `dragRef.current`) | Falso positivo: `dragRef.current` é ref de estado de ponteiro, não fábrica de item de lista | Escopar `highlight-at-rest` apenas a props JSX/objetos de config de UI, ignorando `.current = { active: true }` |
| `copy-lint` / `hyphen-as-dash` | `MapView.tsx:549,638` (`o.sx - sx`, `vz.x - wx`) | Falso positivo: operador matemático de subtração dentro de expressão JS sendo lido como hífen textual | Ignorar `-` entre identificadores/expressões dentro de JSX `{...}` |
| `copy-lint` / `em-dash` | `CollectionView.tsx:302`, `SchemaProposalModal.tsx:100` (`Tiers S–D`) | Range alfabético de Tiers (`S–D`), análogo a range numérico | Usar `"S a D"` no copy ou adicionar exceção explícita se desejado |

---

## Interrogation (Devil's Advocate)

* **Q1 (Existence — Se deletar hoje, quem reclama?)**: O card de Cartógrafo em `AppSidebar.tsx:247-286` foi adicionado por disponibilidade de estado local, mas sem sincronização real ou filtro acionável para os gaps já descobertos; se removido hoje no mobile, libera `~140px` verticais sem perda funcional. *FORCES:* no desktop pode permanecer discreto no rodapé, no mobile deve ir para menu recolhido.
* **Q5 (Decision — Que decisão isso produz?)**: Na tela `Coleção` (`CollectionView.tsx:246-259`), a barra `"Lapidação dos Raros (1.174 imaturos restantes) 81%"` entrega decisão direta ao usuário, mas não é clicável para filtrar imediatamente os `1.174` `raro_imaturo` (o usuário precisa clicar no quadrante abaixo ou ir a `Projetos`). *FORCES:* tornar a métrica de imaturos clicável para aplicar `quadrantFilter = 'raro_imaturo'`.
* **Q7 (Answer vs. Raw Material)**: Em `GapsView.tsx:836-955`, a matriz global `Cenário × Luz` (`N=19.227`) inicia com **72 de 72 células saturadas** (`min 24`), entregando zero gaps acionáveis no carregamento padrão até o usuário trocar manualmente para um projeto específico (ex.: `Eccomerce style`). *FORCES:* iniciar o escopo padrão no projeto com mais gaps `O=0` ou em um par de eixos com lacunas reais visíveis.
* **Q8 (Default)**: Em `App.tsx:36`, o app abre por padrão em `mapa` (`activeSection = 'mapa'`) com zoom calculado em `11%`, onde os rótulos dos 12 clusters se sobrepõem (`MapView.tsx:760-780`). *FORCES:* ocultar ou condensar badges de rótulos de cluster/gap quando `zoom < 0.25` para manter o mapa legível no carregamento inicial.
* **Q11/Q12 (Data truth & backend down)**: `MapView.tsx:82-90` captura erros de `/api/map-points` silenciosamente (`catch(() => setLoadingPoints(false))`), exibindo `"0 Pontos"` sem estado de erro caso a API caia. `GapsView.tsx:184-187` ignora falhas de `/api/gap-drafts`. *FORCES:* exibir estado de erro explícito com retry no `MapView` e `GapsView` em vez de zero silencioso.
* **Q16 (Pixels até o primeiro dado)**: Em `1270×800`, `CollectionView` consome `~290px` de header + barras + filtros antes da primeira linha de cards; em `390×844`, `AppSidebar` + header consomem `>780px` antes do primeiro card. *FORCES:* compactar header da sidebar no mobile.
* **Q26/Q28 (Cost & Regret)**: O maior risco de manutenção em 3 meses está nos **674 bypasses de tokens** (`bg-[#101013]`, `text-zinc-*`) espalhados por 13 componentes em vez de um design system centralizado. Qualquer ajuste de contraste ou tema exigirá grep global.

### Fixed Block (F1–F7)

* **F1 (Reuse)**: Miniaturas `<img>` são reescritas à mão em 6 arquivos (`PromptCollectionCard.tsx:126`, `GapsView.tsx:1164,1728`, `MapView.tsx:968,1003`, `PairsView.tsx:458,467,543`, `ProjectsView.tsx:278`, `RefinementStudioPanel.tsx:329,405`), a maioria sem `onError`. Unificar em um componente `PromptThumb`.
* **F2 (Design System)**: `src/index.css` define `--bg-canvas`, `--bg-surface`, `--tier-s..d`, mas nenhum componente os usa via classes Tailwind `@theme`; há mistura de `bg-[#101013]`, `bg-[#0b0b0e]`, `bg-[#09090b]` e `opacity-ladder` (`border-white/[0.04..0.25]`).
* **F3 (Responsive & Performance)**: `scrollWidth - innerWidth === 0` no documento, mas **3 quebras funcionais/visuais em `390px`**: `grid-cols-5` cortando números (`CollectionView.tsx:346`), `<canvas>` oculto com `0px` altura (`MapView.tsx:748`) e vazamento horizontal da coluna de rótulos (`GapsView.tsx:859`).
* **F4 (ICP Flow)**: Time-to-aha é alto no desktop (`Mapa` → `PromptInspectorDrawer` em tela cheia + `Gaps` com doadores reais), porém prejudicado no carregamento inicial de `GapsView` quando a matriz global mostra 0 gaps `O=0`.
* **F5 (Hide / Compact / Iconize)**:
  | Ação | Alvo | Economia vertical estimada |
  |---|---|---|
  | Recolher (Hide < lg) | Bloco de Cartógrafo + Fontes RO na `AppSidebar` no mobile | `~220px` no mobile |
  | Compactar | Subtítulo redundante em `GapsView` (`GAP DO DIA` no mobile) e `MapView` | `~44px` |
  | Iconizar | Substituir `→` e `↔` textuais por `<ArrowRight>` / `<ArrowLeftRight>` do `lucide-react` | Melhora alinhamento óptico |
  | **Manter visível** | Paleta dos 5 Tiers e barra de Lapidação dos Raros | Eixo central de decisão do produto |
* **F6 (13 Detalhes Nível Vale do Silício)**:
  * **Done (5):** Zero layout shift na grade (`aspect-[4/3]`), motion sob 300ms com `prefers-reduced-motion`, seleção clara com segundo indicador visual, um botão primário por superfície, persistência de rascunhos funcionando.
  * **Missing (8):** Atalhos de teclado (`J`/`K` ou `/` para busca), `focus-visible` consistente nos cards, fallback de erro em vez de zero silencioso em `MapView`/`GapsView`, skeleton fiel em `App.tsx`, desobstrução de rótulos sobrepostos no `MapView` (`11%` zoom), tokenização real no `@theme`, correção do `<canvas>` no mobile e `onError` em todas as imagens.
  * **Top 3 Maior Alavancagem:** (1) Corrigir responsividade de `CollectionView` (`grid-cols-5`), `GapsView` (`whitespace-nowrap` na matriz) e `MapView` (`min-h-[360px]`); (2) Unificar `<PromptThumb>` com `onError`; (3) Tratar erro explícito no fetch de `MapView` em vez de `0 Pontos`.
* **F7 (Swap Test)**: **Passa parcialmente** — o vocabulário espacial de *Território Virgem (`O=0` × `E`)*, a ponte criativa com 2 doadores reais do Eagle e a decomposição em 8 atributos fotográficos (`SUJ/CEN/LUZ/CAM/MAT/EST/PRJ/STR`) são genuínos do Prompt Engine e não pertencem a um template genérico; contudo, a camada de chrome (caixas escuras `border-white/[0.07]` + pílulas mono) ainda parece genérica e se beneficiaria de tokens consistentes.

---

## Taste proposal (the user picks line by line)

| # | Key | Before | After |
|---|---|---|---|
| T1 | `MapView.tsx:760` (zoom 11%) | Todos os 12 rótulos de cluster e 8 pins `GAP` renderizam completos e se sobrepõem no zoom inicial | Ocultar rótulos de `GAP` em `zoom < 0.22` (mantendo o círculo tracejado clicável) e abreviar rótulos de cluster sobrepostos |
| T2 | `GapsView.tsx:86` (default scope) | Abre na matriz global `Cenário × Luz` com 0 células `O=0` visíveis | Selecionar automaticamente o primeiro par/projeto com células `O=0` disponíveis no load |
| T3 | `CollectionView.tsx:266` (ação direta) | Texto `1.174 imaturos restantes` apenas informativo | Transformar em botão que aplica `quadrantFilter = 'raro_imaturo'` ao clicar |
| T4 | `PromptCollectionCard.tsx:116` (tilt) | Tilt 3D apenas no hover do mouse | Remover escala na imagem (`group-hover:scale-[1.02]`) mantendo apenas o glow/borda no hover |
