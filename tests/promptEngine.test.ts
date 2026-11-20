import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { synthesizeGapPrompt } from '../src/core/gapSynthesizer'
import { diagnosePromptImmaturity, MATURE_MOLDS, refineImmaturePrompt } from '../src/core/promptRefiner'
import { decomposePrompt } from '../src/core/promptDecomposer'
import { computeTwoLayerSimilarity, diffPrompts } from '../src/core/promptDiff'
import {
  classifyQuadrant,
  computePromptMaturity,
  computePromptRarity,
  computeRarityTier,
  formatRarityLabel,
} from '../src/core/rarityEngine'
import type { CollectionPayload, GapRecord, MacroFormat, SuitePayload } from '../src/types/promptEngine'

describe('promptDecomposer (multi-formato: JSON, Seções, Parágrafo Único)', () => {
  it('decompõe prompt JSON com preâmbulo conversacional nos 8 atributos', () => {
    const raw = `Aqui está o prompt estruturado em formato JSON:
    {
      "visual_context": { "primary_lineage": "Editorial de moda controlado" },
      "subject": {
        "description": "Young woman with freckles and dark hair",
        "pose": "Seated sideways, counter-rotation over shoulder",
        "clothing": "Oversized terracotta raw linen blazer"
      },
      "camera": { "model": "Hasselblad X2D", "lens": "85mm f/2.8", "framing": "3/4 profile" },
      "lighting": "Window daylight soft shadows",
      "environment": "Brutalist concrete gallery with marble floor",
      "negative_prompt": "plastic skin, bokeh"
    }`

    const res = decomposePrompt(raw, {
      project: 'Editorial Teste',
      eagleTags: ['estilo:editorial'],
    })

    expect(res.attributes.estrutura.macroFormat).toBe('json')
    expect(res.attributes.estrutura.kernelDialect).toBe('nano_banana_g6')
    expect(res.attributes.estrutura.hasExplicitNegative).toBe(true)
    expect(res.attributes.sujeito.filled).toBe(true)
    expect(res.attributes.cenario.filled).toBe(true)
    expect(res.attributes.luz.filled).toBe(true)
    expect(res.attributes.camera.filled).toBe(true)
    expect(res.attributes.textura_material.filled).toBe(true)
    expect(res.attributes.estilo.filled).toBe(true)
    expect(res.attributes.projeto_cliente.text).toBe('Editorial Teste')
    expect(res.attributes.estrutura.filledAttributesCount).toBe(8)
  })

  it('decompõe prompt em seções (FDR Direct e Body Mechanics)', () => {
    const raw = `[SHOT_TYPE] & [DEVICE]:
low-angle 24mm captured on iPhone 15 Pro rear camera
[VISUAL DESCRIPTION]:
A woman wearing a black cotton hoodie leaning against a tiled subway wall.
[LIGHTING]:
sodium-vapor night fluorescent glare
[LOCATION]:
underground metro corridor`

    const res = decomposePrompt(raw, { sourceLib: 'gemini_kimi' })
    expect(res.attributes.estrutura.macroFormat).toBe('sections')
    expect(res.attributes.estrutura.kernelDialect).toBe('fdr_direct')
    expect(res.attributes.camera.text).toContain('24mm')
    expect(res.attributes.luz.text).toContain('sodium-vapor')
    expect(res.attributes.cenario.text).toContain('metro corridor')
    expect(res.attributes.textura_material.text).toContain('hoodie')
  })

  it('decompõe prompt em parágrafo único contínuo', () => {
    const raw =
      'Candid 35mm film portrait of a woman in a beige linen shirt sitting in a sunlit wooden cafe near a rainy window, soft diffused afternoon light, subtle archival grain.'

    const res = decomposePrompt(raw)
    expect(res.attributes.estrutura.macroFormat).toBe('single_paragraph')
    expect(res.attributes.estrutura.kernelDialect).toBe('qwen_natural')
    expect(res.attributes.sujeito.filled).toBe(true)
    expect(res.attributes.cenario.filled).toBe(true)
    expect(res.attributes.luz.filled).toBe(true)
    expect(res.attributes.camera.filled).toBe(true)
    expect(res.attributes.textura_material.filled).toBe(true)
    expect(res.attributes.estilo.filled).toBe(true)
  })
})

describe('rarityEngine (percentil, tiers sóbrios S-D e quadrantes Raridade×Maturidade)', () => {
  it('calcula tiers S–D e string monoespaçada corretamente', () => {
    expect(computeRarityTier(97)).toBe('S')
    expect(computeRarityTier(95)).toBe('S')
    expect(computeRarityTier(84)).toBe('A')
    expect(computeRarityTier(62)).toBe('B')
    expect(computeRarityTier(35)).toBe('C')
    expect(computeRarityTier(12)).toBe('D')
    expect(formatRarityLabel(97)).toBe('mais raro que 97% da coleção')
  })

  it('separa Raridade e Maturidade nos 4 quadrantes', () => {
    expect(classifyQuadrant(92, 82)).toBe('raro_maduro')
    expect(classifyQuadrant(88, 41)).toBe('raro_imaturo')
    expect(classifyQuadrant(35, 78)).toBe('comum_maduro')
    expect(classifyQuadrant(24, 30)).toBe('comum_imaturo')
  })

  it('calcula percentil empírico sobre distribuição de referência e maturidade', () => {
    const rarity = computePromptRarity({
      tagStats: [
        { axis: 'pose', tag: 'crouching_squat', corpusCount: 120, corpusPct: 0.5, idfWeight: 7.5 },
        { axis: 'lighting', tag: 'chiaroscuro_gobo_caustics', corpusCount: 400, corpusPct: 1.8, idfWeight: 5.8 },
      ],
      pairRarityBonus: 1.2,
      corpusSize: 22285,
      referenceSortedScores: [1.5, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 9.0],
    })
    expect(rarity.percentile).toBeGreaterThanOrEqual(75)
    expect(rarity.label).toMatch(/^mais raro que \d+% da coleção$/)

    const dec = decomposePrompt(
      '{"subject":{"description":"woman with pores","pose":"crouching"},"camera":{"lens":"85mm f/2.8"},"lighting":"chiaroscuro 5500K","environment":"concrete gallery","negative_prompt":"plastic skin"}'
    )
    const mat = computePromptMaturity({
      attributes: dec.attributes,
      skeletonReuseCount: 450,
      star: 4,
      eagleTagsCount: 8,
    })
    expect(mat.score).toBeGreaterThan(60)
  })
})

describe('similaridade em duas camadas (Semântica vs Estrutural) & diff', () => {
  it('detecta mesmo esqueleto com assunto diferente', () => {
    const p1 = decomposePrompt(
      '{"subject":{"description":"cyclist in black carbon jacket","pose":"leaning"},"camera":{"lens":"85mm"},"lighting":"overcast dusk","environment":"coastal mountain road"}'
    )
    const p2 = decomposePrompt(
      '{"subject":{"description":"chef in white cotton apron","pose":"chopping"},"camera":{"lens":"50mm"},"lighting":"warm tungsten kitchen","environment":"bakery counter"}'
    )
    const itemA = {
      id: 'A',
      sourceLib: 'gemini_kimi' as const,
      title: 'A',
      project: 'P1',
      folders: [],
      eagleTags: [],
      star: 0,
      btime: 0,
      thumbnailUrl: null,
      rawPrompt: '',
      cleanPrompt: p1.cleanPrompt,
      excerpt: p1.excerpt,
      attributes: p1.attributes,
      rarity: computePromptRarity({ tagStats: [], corpusSize: 100 }),
      maturity: computePromptMaturity({ attributes: p1.attributes, skeletonReuseCount: 10 }),
      quadrant: 'raro_maduro' as const,
    }
    const itemB = {
      ...itemA,
      id: 'B',
      cleanPrompt: p2.cleanPrompt,
      excerpt: p2.excerpt,
      attributes: p2.attributes,
    }

    const sim = computeTwoLayerSimilarity(itemA, itemB)
    expect(sim.structuralSim).toBeGreaterThan(0.65)
    expect(sim.semanticSim).toBeLessThan(0.35)
    expect(sim.category).toBe('same_skeleton_diff_subject')

    const d = diffPrompts('woman in linen blazer concrete hall', 'woman in silk dress concrete hall')
    expect(d.sharedTerms).toContain('woman')
    expect(d.sharedTerms).toContain('concrete')
    expect(d.spansA.some((s) => s.type === 'unique' && s.text.includes('linen'))).toBe(true)
    expect(d.spansB.some((s) => s.type === 'unique' && s.text.includes('silk'))).toBe(true)
  })
})

describe('suíte completa Etapa 3 (data/suite_google_flow.json + SQLite FTS5 + ast_cache.sqlite)', () => {
  it('contém corpus sincronizado completo, destaques, 12 clusters, 8 regiões estruturais, manchas vazias e projetos dinâmicos', () => {
    const suitePath = path.resolve(process.cwd(), 'data', 'suite_google_flow.json')
    expect(fs.existsSync(suitePath)).toBe(true)

    const suite = JSON.parse(fs.readFileSync(suitePath, 'utf-8')) as SuitePayload
    expect(suite.stats.primaryLibraryName).toBe('Google Flow + Prompts.library')
    expect(suite.stats.googleFlowSize).toBeGreaterThanOrEqual(19000)
    expect(suite.stats.geminiKimiSize).toBe(0)
    expect(suite.stats.totalCorpusSize).toBe(
      suite.stats.googleFlowSize + suite.stats.geminiKimiSize
    )
    expect(suite.stats.totalCorpusSize).toBeGreaterThanOrEqual(19000)
    expect(suite.items.length).toBeGreaterThanOrEqual(80)

    const formats = new Set(suite.items.map((i) => i.attributes.estrutura.macroFormat))
    expect(formats).toEqual(new Set(['json', 'sections', 'single_paragraph']))

    const tiers = new Set(suite.items.map((i) => i.rarity.tier))
    expect(tiers).toEqual(new Set(['S', 'A', 'B', 'C', 'D']))

    const quadrants = new Set(suite.items.map((i) => i.quadrant))
    expect(quadrants).toEqual(
      new Set(['raro_maduro', 'raro_imaturo', 'comum_maduro', 'comum_imaturo'])
    )

    // Mapa: 12 clusters semânticos, 8 estruturais + 8 manchas vazias
    expect(suite.mapData.clusters).toHaveLength(12)
    expect(suite.mapData.structuralClusters).toHaveLength(8)
    expect(suite.mapData.voidZones).toHaveLength(8)
    for (const vz of suite.mapData.voidZones) {
      expect(vz.observedCount).toBe(0)
    }

    // Pares: 3 categorias populadas
    expect(suite.pairsData.sameSkeletonDiffSubject.length).toBeGreaterThan(5)
    expect(suite.pairsData.sameSubjectDiffSkeleton.length).toBeGreaterThan(3)
    expect(suite.pairsData.nearDuplicates.length).toBeGreaterThan(3)

    // Gaps: O = 0 em projetos, tríades globais e fronteiras inéditas + bridges testadas do Eagle
    expect(suite.gapsData.projectGaps.length).toBeGreaterThan(20)
    expect(suite.gapsData.globalTriadGaps.length).toBeGreaterThan(10)
    expect((suite.gapsData.creativeFrontierGaps ?? []).length).toBeGreaterThan(20)
    for (const g of [
      ...suite.gapsData.projectGaps,
      ...suite.gapsData.globalTriadGaps,
      ...(suite.gapsData.creativeFrontierGaps ?? []),
    ]) {
      expect(g.observedCount).toBe(0)
      expect(g.isCoherent).toBe(true)
    }
    for (const fg of suite.gapsData.creativeFrontierGaps ?? []) {
      expect(fg.isFrontier).toBe(true)
    }

    const testedBridges = suite.gapsData.testedBridges ?? []
    expect(testedBridges.length).toBeGreaterThanOrEqual(14)
    for (const tb of testedBridges) {
      expect(tb.tags.length).toBeGreaterThanOrEqual(2)
      expect(tb.tags).not.toContain('softbo')
      expect(tb.tags).not.toContain('_strobe')
    }
    expect(testedBridges.some((tb) => tb.tags.includes('studio_softbox_strobe'))).toBe(true)

    // Projetos: >= 8 projetos reais do Google Flow
    expect(suite.projectsData.length).toBeGreaterThanOrEqual(8)
    expect(suite.projectsData.some((p) => p.sourceLib === 'google_flow')).toBe(true)

    for (const item of suite.items) {
      expect(['google_flow', 'gemini_kimi']).toContain(item.sourceLib)
      expect(item.thumbnailUrl).toMatch(/^\/api\/thumbnail\/(gemini_kimi|google_flow)\/[A-Za-z0-9_-]+$/)
      expect(typeof item.x).toBe('number')
      expect(typeof item.y).toBe('number')
    }
  })

  it('consulta todo o corpus sincronizado, índice FTS5 e cache AST incremental com 8 atributos', () => {
    const suitePath = path.resolve(process.cwd(), 'data', 'suite_google_flow.json')
    const suite = JSON.parse(fs.readFileSync(suitePath, 'utf-8')) as SuitePayload
    const dbPath = path.resolve(process.cwd(), 'data', 'prompt_engine_v1.sqlite')
    const astCachePath = path.resolve(process.cwd(), 'data', 'ast_cache.sqlite')
    expect(fs.existsSync(dbPath)).toBe(true)
    expect(fs.existsSync(astCachePath)).toBe(true)

    const db = new DatabaseSync(dbPath, { readOnly: true })
    try {
      const totalRow = db.prepare('SELECT COUNT(*) AS cnt FROM prompts').get() as { cnt: number }
      expect(Number(totalRow.cnt)).toBe(suite.stats.totalCorpusSize)

      const byLib = db
        .prepare('SELECT source_lib, COUNT(*) AS cnt FROM prompts GROUP BY source_lib')
        .all() as Array<{ source_lib: string; cnt: number }>
      const libMap = Object.fromEntries(byLib.map((r) => [r.source_lib, Number(r.cnt)]))
      expect(libMap.google_flow).toBe(suite.stats.googleFlowSize)
      expect(libMap.gemini_kimi ?? 0).toBe(0)

      const ftsRow = db
        .prepare(
          'SELECT COUNT(*) AS cnt FROM prompts JOIN prompts_fts ON prompts.id = prompts_fts.id WHERE prompts_fts MATCH ?'
        )
        .get('"linen"*') as { cnt: number }
      expect(Number(ftsRow.cnt)).toBeGreaterThan(50)

      const bridgesRow = db
        .prepare('SELECT COUNT(*) AS cnt FROM gap_bridges')
        .get() as { cnt: number }
      expect(Number(bridgesRow.cnt)).toBeGreaterThanOrEqual(14)

      const recentRows = db
        .prepare(
          'SELECT attributes_json, filled_attributes_count FROM prompts ORDER BY btime DESC LIMIT 10'
        )
        .all() as Array<{ attributes_json: string; filled_attributes_count: number }>
      expect(recentRows.length).toBeGreaterThan(0)
      for (const row of recentRows) {
        const attrs = JSON.parse(row.attributes_json) as Record<string, unknown>
        expect(Object.keys(attrs)).toEqual([
          'sujeito',
          'cenario',
          'luz',
          'camera',
          'textura_material',
          'estilo',
          'projeto_cliente',
          'estrutura',
        ])
        expect(Number(row.filled_attributes_count)).toBeGreaterThanOrEqual(4)
      }
    } finally {
      db.close()
    }

    const astDb = new DatabaseSync(astCachePath, { readOnly: true })
    try {
      const activeRow = astDb
        .prepare("SELECT COUNT(*) AS cnt FROM ast_cache WHERE source_lib = 'google_flow' AND status = 'active'")
        .get() as { cnt: number }
      expect(Number(activeRow.cnt)).toBe(suite.stats.totalCorpusSize)
    } finally {
      astDb.close()
    }
  })
})

describe('amostra ingerida de 50 prompts reais (data/sample_50_prompts.json)', () => {
  it('contém exatos 50 prompts válidos cobrindo formatos mistos, 8 atributos e tiers S–D', () => {
    const samplePath = path.resolve(process.cwd(), 'data', 'sample_50_prompts.json')
    expect(fs.existsSync(samplePath)).toBe(true)

    const payload = JSON.parse(fs.readFileSync(samplePath, 'utf-8')) as CollectionPayload
    expect(payload.items).toHaveLength(50)
    expect(payload.stats.sampleSize).toBe(50)
    expect(payload.stats.totalCorpusSize).toBeGreaterThan(20000)

    const formats = new Set(payload.items.map((i) => i.attributes.estrutura.macroFormat))
    expect(formats).toEqual(new Set(['json', 'sections', 'single_paragraph']))

    const tiers = new Set(payload.items.map((i) => i.rarity.tier))
    expect(tiers).toEqual(new Set(['S', 'A', 'B', 'C', 'D']))

    const quadrants = new Set(payload.items.map((i) => i.quadrant))
    expect(quadrants).toEqual(
      new Set(['raro_maduro', 'raro_imaturo', 'comum_maduro', 'comum_imaturo'])
    )

    for (const item of payload.items) {
      expect(item.rarity.label).toBe(`mais raro que ${item.rarity.percentile}% da coleção`)
      expect(item.thumbnailUrl).toMatch(/^\/api\/thumbnail\/(gemini_kimi|google_flow)\/[A-Za-z0-9_-]+$/)
      expect(Object.keys(item.attributes)).toEqual([
        'sujeito',
        'cenario',
        'luz',
        'camera',
        'textura_material',
        'estilo',
        'projeto_cliente',
        'estrutura',
      ])
    }
  })
})

describe('gapSynthesizer (Etapa 4: síntese assistida de gaps O=0 nos 3 formatos)', () => {
  it('sintetiza prompts coerentes em json, sections e single_paragraph mantendo >= 7/8 atributos na decomposição', () => {
    const suitePath = path.resolve(process.cwd(), 'data', 'suite_google_flow.json')
    const suite = JSON.parse(fs.readFileSync(suitePath, 'utf-8')) as SuitePayload
    const itemMap = new Map(suite.items.map((it) => [it.id, it]))

    const mockGap: GapRecord = {
      id: 'pgap:test:pose:crouching_squat:lighting:chiaroscuro_gobo_caustics',
      kind: 'project_2d_zero',
      scope: 'Iberica character',
      axisA: 'pose',
      tagA: 'crouching_squat',
      freqA: 112,
      axisB: 'lighting',
      tagB: 'chiaroscuro_gobo_caustics',
      freqB: 240,
      observedCount: 0,
      expectedCount: 8.4,
      lift: 0,
      isCoherent: true,
      donorAId: suite.items[0]?.id || null,
      donorBId: suite.items[1]?.id || null,
      title: 'Agachada × Chiaroscuro / gobo',
      rationale: 'Teste unitário de ponte de gap O=0.',
    }

    const donorA = mockGap.donorAId ? itemMap.get(mockGap.donorAId) || null : null
    const donorB = mockGap.donorBId ? itemMap.get(mockGap.donorBId) || null : null

    for (const fmt of ['json', 'sections', 'single_paragraph'] as MacroFormat[]) {
      const synth = synthesizeGapPrompt({
        gap: mockGap,
        donorA,
        donorB,
        format: fmt,
        aspectRatio: '3:4',
        includeNegative: true,
      })

      expect(synth.rawPrompt.length).toBeGreaterThan(120)
      if (fmt === 'json') {
        expect(() => JSON.parse(synth.rawPrompt)).not.toThrow()
      }

      const decomposed = decomposePrompt(synth.rawPrompt, { project: mockGap.scope })
      expect(decomposed.attributes.estrutura.macroFormat).toBe(fmt)
      expect(decomposed.attributes.estrutura.hasExplicitNegative).toBe(true)
      expect(decomposed.attributes.estrutura.filledAttributesCount).toBeGreaterThanOrEqual(7)
      expect(decomposed.attributes.sujeito.tags).toContain('pose_agachada')
      expect(decomposed.attributes.luz.tags).toContain('luz_chiaroscuro_gobo')
    }
  })

  it('remove vazamentos de boilerplate (IDENTITY LOCK / forbidden_terms / luz conflitante) e suporta donorC + Fronteira', () => {
    const suitePath = path.resolve(process.cwd(), 'data', 'suite_google_flow.json')
    const suite = JSON.parse(fs.readFileSync(suitePath, 'utf-8')) as SuitePayload
    const baseDonor = suite.items[0]!
    const leakyDonorA = {
      ...baseDonor,
      id: 'leaky-a',
      cleanPrompt:
        'A candid street editorial photograph. IDENTITY LOCK: identical bone structure and exact nose from reference. forbidden_terms: neon, CGI. vocabulary_register: photographic, no jargon. Sun-bleached Mediterranean poolside boardwalk.',
      rawPrompt:
        'A candid street editorial photograph. IDENTITY LOCK: identical facial anatomy. forbidden_terms: neon. Sun-bleached boardwalk.',
    }
    const nightDonorB = {
      ...baseDonor,
      id: 'night-b',
      cleanPrompt: 'Sodium-vapor streetlamps, glowing wet asphalt reflections at night.',
      rawPrompt: 'Sodium-vapor streetlamps, glowing wet asphalt reflections at night.',
    }
    const frontierDonorC = {
      ...baseDonor,
      id: 'frontier-c',
      cleanPrompt: 'Translucent frosted silk organza catching spectral edges.',
      rawPrompt: 'Translucent frosted silk organza catching spectral edges.',
    }

    const frontierGap: GapRecord = {
      id: 'gfnt:env:beach_pool_water:light:night_neon_sodium:motif:double_exposure',
      kind: 'global_frontier_zero',
      scope: 'all',
      axisA: 'environment',
      tagA: 'beach_pool_water',
      freqA: 820,
      axisB: 'lighting',
      tagB: 'night_neon_sodium',
      freqB: 640,
      axisC: 'motif',
      tagC: 'double_exposure',
      freqC: 45,
      observedCount: 0,
      expectedCount: 4.2,
      lift: 0,
      isCoherent: true,
      isFrontier: true,
      creativeCatalyst: 'double_exposure',
      donorAId: leakyDonorA.id,
      donorBId: nightDonorB.id,
      donorCId: frontierDonorC.id,
      title: 'Praia × Neon Noturno × Dupla Exposição',
      rationale: 'Teste unitário de fronteira criativa com donorC e sanitização.',
    }

    const cleanSynth = synthesizeGapPrompt({
      gap: frontierGap,
      donorA: leakyDonorA,
      donorB: nightDonorB,
      donorC: frontierDonorC,
      format: 'sections',
      aspectRatio: '3:4',
      includeNegative: true,
      preserveIdentity: false,
      exploratoryMode: true,
    })

    expect(cleanSynth.rawPrompt).not.toMatch(/IDENTITY\s+LOCK/i)
    expect(cleanSynth.rawPrompt).not.toMatch(/forbidden_terms/i)
    expect(cleanSynth.rawPrompt).not.toMatch(/vocabulary_register/i)
    expect(cleanSynth.rawPrompt).not.toMatch(/sun-bleached/i)
    expect(cleanSynth.rawPrompt).not.toMatch(/exterior daylight/i)
    expect(cleanSynth.rawPrompt).toMatch(/double[- ]exposure/i)

    const withIdentity = synthesizeGapPrompt({
      gap: frontierGap,
      donorA: leakyDonorA,
      donorB: nightDonorB,
      donorC: frontierDonorC,
      format: 'single_paragraph',
      aspectRatio: '3:4',
      includeNegative: false,
      preserveIdentity: true,
      exploratoryMode: true,
    })

    expect(withIdentity.rawPrompt).toMatch(/Preserve exact facial identity/i)
    expect(withIdentity.rawPrompt).not.toMatch(/forbidden_terms/i)
  })
})

describe('promptRefiner (Etapa 5: diagnóstico e transplante Raro + Imaturo -> Raro + Maduro)', () => {
  it('diagnostica gargalos e eleva um prompt Raro + Imaturo para Raro + Maduro nos 4 moldes consolidados', () => {
    const dbPath = path.resolve(process.cwd(), 'data', 'prompt_engine_v1.sqlite')
    const db = new DatabaseSync(dbPath, { readOnly: true })
    let rawRow: Record<string, unknown> | undefined
    try {
      rawRow = db
        .prepare("SELECT * FROM prompts WHERE quadrant = 'raro_imaturo' AND rarity_tier = 'S' LIMIT 1")
        .get() as Record<string, unknown> | undefined
    } finally {
      db.close()
    }
    expect(rawRow).toBeDefined()

    const immatureItem = {
      id: String(rawRow!.id),
      sourceLib: String(rawRow!.source_lib) as 'google_flow' | 'gemini_kimi',
      title: String(rawRow!.title),
      project: String(rawRow!.project_name),
      folders: [],
      eagleTags: JSON.parse(String(rawRow!.eagle_tags_json || '[]')),
      star: Number(rawRow!.star || 0),
      btime: 0,
      thumbnailUrl: String(rawRow!.thumbnail_url || ''),
      rawPrompt: String(rawRow!.raw_prompt || ''),
      cleanPrompt: String(rawRow!.clean_prompt || ''),
      excerpt: String(rawRow!.excerpt || ''),
      attributes: JSON.parse(String(rawRow!.attributes_json)),
      rarity: JSON.parse(String(rawRow!.rarity_breakdown_json)),
      maturity: JSON.parse(String(rawRow!.maturity_breakdown_json)),
      quadrant: 'raro_imaturo' as const,
      poseTelemetry: null,
    }

    const diagnostics = diagnosePromptImmaturity(immatureItem)
    expect(diagnostics.length).toBeGreaterThanOrEqual(1)
    expect(immatureItem.rarity.percentile).toBeGreaterThanOrEqual(70)
    expect(immatureItem.maturity.score).toBeLessThan(60)

    for (const mold of MATURE_MOLDS) {
      const refined = refineImmaturePrompt(immatureItem, mold.id, '3:4')
      expect(refined.refinedPrompt.length).toBeGreaterThan(150)
      expect(refined.afterMaturity.score).toBeGreaterThanOrEqual(75)
      expect(refined.afterQuadrant).toBe('raro_maduro')
      expect(refined.deltaMaturity).toBeGreaterThan(15)
      expect(refined.afterAttributes.estrutura.filledAttributesCount).toBeGreaterThanOrEqual(7)
    }
  })
})
