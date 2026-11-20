import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Award,
  BookOpen,
  Check,
  Compass,
  Copy,
  Flame,
  FolderPlus,
  Layers,
  Pencil,
  Plus,
  Share2,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { TIER_THRESHOLDS } from '../../core/rarityEngine'
import { TIER_COLOR_META } from '../utils/themeTokens'
import type {
  CartographerRank,
  CartographerState,
  FavoritePromptEntry,
  NextRankProgress,
  PersonalCollectionRecord,
} from '../../hooks/useCartographerProfile'
import { useCopyFeedback } from '../../hooks/useCopyFeedback'
import type {
  GapDraftRecord,
  RarityTier,
  SuitePayload,
} from '../../types/promptEngine'
import { CartographerRankMark } from './CartographerRankMark'
import { PromptThumb } from './PromptThumb'

type ArchiveTab = 'favorites' | 'drafts' | 'collections'
type ArchiveSort = 'rarity' | 'recent' | 'collection'

interface ProfileViewProps {
  profile: CartographerState
  rank: CartographerRank
  nextRankProgress: NextRankProgress
  activeDaysCount: number
  territoryOccupiedPct: number
  suite: SuitePayload
  drafts: GapDraftRecord[]
  loadingDrafts: boolean
  onUpdateDisplayName: (name: string) => void
  onRemoveFavorite: (promptId: string) => void
  onCreateCollection: (name: string, targetCount?: number) => PersonalCollectionRecord | null
  onDeleteCollection: (collectionId: string) => void
  onToggleItemInCollection: (collectionId: string, itemId: string) => void
  onDeleteDraft: (draftId: string) => Promise<void>
  onMarkVisited: () => void
  onInspectPromptById: (id: string, fallback?: FavoritePromptEntry) => void
  onExploreGaps: () => void
  onOpenGapDraft: (draft: GapDraftRecord) => void
}

function formatMemberSincePt(iso: string): string {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return 'nov/2026'
  return dt.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '')
}

function formatShortDate(iso: string): string {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return ''
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  profile,
  rank,
  nextRankProgress,
  activeDaysCount,
  territoryOccupiedPct,
  suite,
  drafts,
  loadingDrafts,
  onUpdateDisplayName,
  onRemoveFavorite,
  onCreateCollection,
  onDeleteCollection,
  onToggleItemInCollection,
  onDeleteDraft,
  onMarkVisited,
  onInspectPromptById,
  onExploreGaps,
  onOpenGapDraft,
}) => {
  const { copiedKey, copyText } = useCopyFeedback()

  // Captura o timestamp da última visita antes de atualizar, para sinalizar "Novo" na sessão
  const initialLastVisitRef = useRef<string | null>(profile.lastProfileVisitAt)
  useEffect(() => {
    onMarkVisited()
  }, [onMarkVisited])

  // Bloco [1] Edição inline do nome (zero layout shift)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(profile.displayName)
  const [nameSavedPulse, setNameSavedPulse] = useState(false)
  const nameInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setNameDraft(profile.displayName)
  }, [profile.displayName])

  useEffect(() => {
    if (editingName) {
      nameInputRef.current?.focus()
      nameInputRef.current?.select()
    }
  }, [editingName])

  const commitNameEdit = () => {
    const clean = nameDraft.trim() || 'Cartógrafo'
    onUpdateDisplayName(clean)
    setNameDraft(clean)
    setEditingName(false)
    setNameSavedPulse(true)
    window.setTimeout(() => setNameSavedPulse(false), 1400)
  }

  const cancelNameEdit = () => {
    setNameDraft(profile.displayName)
    setEditingName(false)
  }

  // Bloco [3] Tabs com clip-path + filtros
  const [archiveTab, setArchiveTab] = useState<ArchiveTab>('favorites')
  const [tierFilter, setTierFilter] = useState<'all' | RarityTier>('all')
  const [sortMode, setSortMode] = useState<ArchiveSort>('rarity')
  const [openPopoverItemId, setOpenPopoverItemId] = useState<string | null>(null)

  // Formulário inline de nova coleção
  const [newColName, setNewColName] = useState('')
  const [newColTarget, setNewColTarget] = useState(12)

  // Clip-path para tabs do Caderno pessoal
  const tabNavRef = useRef<HTMLDivElement | null>(null)
  const tabBtnRefs = useRef<Partial<Record<ArchiveTab, HTMLButtonElement | null>>>({})
  const [clipInset, setClipInset] = useState('inset(4px 100% 4px 4px round 9999px)')

  useLayoutEffect(() => {
    const updateClip = () => {
      const nav = tabNavRef.current
      const btn = tabBtnRefs.current[archiveTab]
      if (!nav || !btn) return
      const navRect = nav.getBoundingClientRect()
      const btnRect = btn.getBoundingClientRect()
      const left = Math.max(0, btnRect.left - navRect.left)
      const right = Math.max(0, navRect.right - btnRect.right)
      setClipInset(`inset(4px ${right}px 4px ${left}px round 9999px)`)
    }
    updateClip()
    const navEl = tabNavRef.current
    const obs =
      navEl && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateClip) : null
    if (obs && navEl) obs.observe(navEl)
    return () => obs?.disconnect()
  }, [archiveTab, profile.favorites.length, drafts.length, profile.personalCollections.length])

  // Fecha popover ao clicar fora ou apertar Escape
  useEffect(() => {
    if (!openPopoverItemId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenPopoverItemId(null)
    }
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target?.closest('[data-collection-popover]')) {
        setOpenPopoverItemId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onPointerDown)
    }
  }, [openPopoverItemId])

  // Mapa rápido de expectedCount dos gaps conhecidos para calcular Recorde de E-score
  const gapExpectedMap = useMemo(() => {
    const map = new Map<string, number>()
    const allGaps = [
      ...suite.gapsData.projectGaps,
      ...suite.gapsData.globalTriadGaps,
      ...suite.gapsData.globalUnderexplored,
    ]
    for (const g of allGaps) {
      map.set(g.id, g.expectedCount)
    }
    return map
  }, [suite.gapsData])

  // Mapa itemId -> coleções em que aparece (para ordenação e badges)
  const itemCollectionsMap = useMemo(() => {
    const map = new Map<string, PersonalCollectionRecord[]>()
    for (const col of profile.personalCollections) {
      for (const itemId of col.itemIds) {
        const list = map.get(itemId) || []
        list.push(col)
        map.set(itemId, list)
      }
    }
    return map
  }, [profile.personalCollections])

  const serialMap = useMemo(() => {
    const map = new Map<string, number>()
    profile.discoveredGapIds.forEach((id, idx) => {
      map.set(id, idx + 1)
    })
    return map
  }, [profile.discoveredGapIds])

  const filteredFavorites = useMemo(() => {
    const list = profile.favorites.filter(
      (f) => tierFilter === 'all' || f.rarityTier === tierFilter
    )
    return [...list].sort((a, b) => {
      if (sortMode === 'recent') return b.addedAt.localeCompare(a.addedAt)
      if (sortMode === 'collection') {
        const colA = itemCollectionsMap.get(a.id)?.[0]?.name || a.project
        const colB = itemCollectionsMap.get(b.id)?.[0]?.name || b.project
        return colA.localeCompare(colB, 'pt-BR') || b.rarityPercentile - a.rarityPercentile
      }
      return b.rarityPercentile - a.rarityPercentile || b.maturityScore - a.maturityScore
    })
  }, [profile.favorites, tierFilter, sortMode, itemCollectionsMap])

  const filteredDrafts = useMemo(() => {
    const list = drafts.filter((d) => tierFilter === 'all' || d.rarityTier === tierFilter)
    return [...list].sort((a, b) => {
      if (sortMode === 'recent') return b.createdAt.localeCompare(a.createdAt)
      if (sortMode === 'collection') {
        const colA = itemCollectionsMap.get(a.id)?.[0]?.name || a.scope
        const colB = itemCollectionsMap.get(b.id)?.[0]?.name || b.scope
        return colA.localeCompare(colB, 'pt-BR') || b.rarityPercentile - a.rarityPercentile
      }
      return b.rarityPercentile - a.rarityPercentile || b.maturityScore - a.maturityScore
    })
  }, [drafts, tierFilter, sortMode, itemCollectionsMap])

  // Teto estrito de <= 15% para destaque em 2 colunas (percentile >= 99)
  const featuredFavoriteIds = useMemo(() => {
    if (filteredFavorites.length < 2) return new Set<string>()
    const maxFeatured = Math.max(1, Math.floor(filteredFavorites.length * 0.15))
    const ids = new Set<string>()
    for (const item of filteredFavorites) {
      if (ids.size >= maxFeatured) break
      if (item.rarityPercentile >= 99) ids.add(item.id)
    }
    return ids
  }, [filteredFavorites])

  const featuredDraftIds = useMemo(() => {
    if (filteredDrafts.length < 2) return new Set<string>()
    const maxFeatured = Math.max(1, Math.floor(filteredDrafts.length * 0.15))
    const ids = new Set<string>()
    for (const d of filteredDrafts) {
      if (ids.size >= maxFeatured) break
      if (d.rarityPercentile >= 99) ids.add(d.id)
    }
    return ids
  }, [filteredDrafts])

  // Recordes factuais (Bloco 4)
  const highestEScoreRecord = useMemo(() => {
    let best: { expected: number; label: string; sub: string } | null = null
    for (const d of drafts) {
      const e = gapExpectedMap.get(d.gapId)
      const serial = serialMap.get(d.gapId)
      if (typeof e === 'number' && (!best || e > best.expected)) {
        best = {
          expected: e,
          label: `E=${e.toFixed(1)}`,
          sub: serial ? `Gap #${String(serial).padStart(4, '0')} · ${d.gapTitle}` : d.gapTitle,
        }
      }
    }
    return best
  }, [drafts, gapExpectedMap, serialMap])

  const rarestRecord = useMemo(() => {
    if (profile.discoveredGapIds.length > 0) {
      const firstGapId = profile.discoveredGapIds[0]
      const matchingDraft = drafts.find((d) => d.gapId === firstGapId)
      return {
        value: '#0001',
        sub: matchingDraft
          ? `Você mapeou ${matchingDraft.gapTitle}`
          : 'Primeiro território registrado no atlas',
      }
    }
    const topFav = [...profile.favorites].sort(
      (a, b) => b.rarityPercentile - a.rarityPercentile
    )[0]
    if (topFav) {
      return {
        value: `P${Math.round(topFav.rarityPercentile)} · Tier ${topFav.rarityTier}`,
        sub: `Você guardou ${topFav.semanticTitle || topFav.title}`,
      }
    }
    return null
  }, [profile.discoveredGapIds, profile.favorites, drafts])

  const handleShareProfile = () => {
    const summary = [
      `${profile.displayName} (${rank.badge} · ${rank.title})`,
      `Membro desde ${formatMemberSincePt(profile.memberSince)} · ${activeDaysCount} dias ativos`,
      `Território ocupado: ${territoryOccupiedPct.toFixed(1)}% · ${profile.discoveredGapIds.length} mapeamentos`,
      `Caderno pessoal: ${profile.favorites.length} favoritos · ${drafts.length} registros · ${profile.personalCollections.length} coleções`,
    ].join('\n')
    void copyText(summary, 'share-profile')
  }

  const handleCreateCollectionSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const created = onCreateCollection(newColName, newColTarget)
    if (created) {
      setNewColName('')
      setNewColTarget(12)
    }
  }

  // Índices rápidos para resolver itens pertencentes a uma coleção pessoal
  const favoriteById = useMemo(
    () => new Map(profile.favorites.map((f) => [f.id, f])),
    [profile.favorites]
  )
  const draftById = useMemo(() => new Map(drafts.map((d) => [d.id, d])), [drafts])

  const isEmptyArchiveForTab =
    (archiveTab === 'favorites' && profile.favorites.length === 0) ||
    (archiveTab === 'drafts' && !loadingDrafts && drafts.length === 0) ||
    (archiveTab === 'collections' && profile.personalCollections.length === 0)

  const remainingTerritoryPct = Math.max(0, 100 - territoryOccupiedPct)

  const masteryMilestones = useMemo(
    () =>
      [
        { roman: 'I', title: 'Explorador', min: 0 },
        { roman: 'III', title: 'Cartógrafo', min: 5 },
        { roman: 'V', title: 'Agrimensor', min: 14 },
        { roman: 'VII', title: 'Topógrafo', min: 28 },
        { roman: 'X', title: 'Soberano', min: 65 },
      ] as const,
    []
  )

  const masteryTrackProgress = useMemo(() => {
    const count = profile.discoveredGapIds.length
    if (count >= 65) return 1
    if (count <= 0) return 0
    return Math.min(1, count / 65)
  }, [profile.discoveredGapIds.length])

  const achievements = useMemo(
    () =>
      [
        {
          id: 'tier-s-hunter',
          title: 'Caçador Mítico (Tier S)',
          detail: 'Inspecionar ou coletar 1 carta Tier S',
          current: profile.collectedTierSIds.length,
          target: 1,
          icon: Sparkles,
        },
        {
          id: 'gap-alchemist',
          title: 'Alquimista de Lacunas',
          detail: 'Mapear 1 cruzamento inédito O = 0',
          current: profile.discoveredGapIds.length,
          target: 1,
          icon: Flame,
        },
        {
          id: 'deck-architect',
          title: 'Arquiteto de Decks',
          detail: 'Criar 1 deck personalizado no fichário',
          current: profile.personalCollections.length,
          target: 1,
          icon: Layers,
        },
        {
          id: 'codex-chronicler',
          title: 'Cronista do Códice',
          detail: 'Explorar 5 cartas individuais no acervo',
          current: profile.exploredPromptIds.length,
          target: 5,
          icon: Award,
        },
      ] as const,
    [
      profile.collectedTierSIds.length,
      profile.discoveredGapIds.length,
      profile.personalCollections.length,
      profile.exploredPromptIds.length,
    ]
  )

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-7 p-4 sm:p-6">
      {/* [1] SAVEE EDITORIAL PROFILE HEADER + GLASS REWARD PILL */}
      <section
        aria-label="Identidade do Cartógrafo"
        className="relative flex flex-col items-center rounded-[24px] border border-hairline bg-surface px-5 py-8 text-center sm:px-8 sm:py-10"
      >
        <div className="relative flex items-center justify-center">
          <div
            aria-hidden="true"
            className="h-20 w-20 rounded-full border border-hairline bg-gradient-to-br from-brand to-brand-2 shadow-xl"
          />
          <div className="absolute -right-2 -bottom-2 rounded-full border border-hairline bg-canvas p-1">
            <CartographerRankMark roman={rank.roman} title={rank.title} size="md" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {editingName ? (
            <input
              ref={nameInputRef}
              type="text"
              value={nameDraft}
              maxLength={48}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitNameEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitNameEdit()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  cancelNameEdit()
                }
              }}
              aria-label="Nome do cartógrafo"
              className="w-64 max-w-full rounded-xl border border-border-hover bg-canvas px-3 py-1 text-center text-[24px] font-medium leading-tight tracking-tight text-ink focus:outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              aria-label="Editar nome do cartógrafo"
              className="group inline-flex max-w-full items-center gap-2 rounded-xl px-2 py-0.5 text-[24px] font-medium leading-tight tracking-[-0.03em] text-ink transition-colors hover:text-ink-secondary cursor-pointer"
            >
              <span className="truncate">{profile.displayName}</span>
              <Pencil className="h-3.5 w-3.5 shrink-0 text-ink-muted [@media(hover:hover)]:opacity-0 transition-opacity [@media(hover:hover)]:group-hover:opacity-100 group-focus-visible:opacity-100" />
            </button>
          )}

          {nameSavedPulse ? (
            <span className="tabular-mono rounded-full border border-hairline bg-elevated px-2.5 py-0.5 text-[10px] text-ink-secondary">
              Salvo
            </span>
          ) : null}
        </div>

        <p className="mt-1.5 text-[14px] text-ink-tertiary">
          <span className="font-medium text-tier-s">{rank.title}</span>{' '}
          <span className="text-ink-muted">@</span>{' '}
          <span className="text-ink">Cartógrafo {rank.roman}</span> · membro desde{' '}
          {formatMemberSincePt(profile.memberSince)}
        </p>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[14px] text-ink-muted">
          <span>
            <b className="font-semibold text-ink">{profile.favorites.length}</b> Favoritos
          </span>
          <span className="h-1 w-1 rounded-full bg-ink-muted" aria-hidden="true" />
          <span>
            <b className="font-semibold text-ink">{drafts.length}</b> Registros O=0
          </span>
          <span className="h-1 w-1 rounded-full bg-ink-muted" aria-hidden="true" />
          <span>
            <b className="font-semibold text-ink">{profile.personalCollections.length}</b> Decks
          </span>
          <span className="h-1 w-1 rounded-full bg-ink-muted" aria-hidden="true" />
          <span>
            <b className="font-semibold text-ink">{activeDaysCount}</b>{' '}
            {activeDaysCount === 1 ? 'Dia ativo' : 'Dias ativos'}
          </span>
        </div>

        {/* Savee Rewards Pill com reflexo especular compositor-only */}
        <button
          type="button"
          onClick={onExploreGaps}
          className="group/reward relative mt-5 inline-flex h-[46px] items-center gap-2.5 overflow-hidden rounded-full border border-border-hover bg-elevated px-5 text-[13px] font-medium text-ink shadow-xl cursor-pointer"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-[20deg] translate-x-0 bg-gradient-to-r from-transparent via-ink/20 to-transparent opacity-0 transition-[transform,opacity] [transition-duration:var(--dur-slow)] [transition-timing-function:var(--ease-out)] group-hover/reward:translate-x-[340%] group-hover/reward:opacity-100"
          />
          <span
            aria-hidden="true"
            className="block h-5 w-5 rounded-md bg-gradient-to-br from-tier-s to-brand"
            style={{ transform: 'rotate(-8deg)' }}
          />
          <span className="relative">
            {nextRankProgress.isMaxRank
              ? `Patente Máxima Alcançada · ${rank.title}`
              : `Faltam ${nextRankProgress.remaining} mapeamentos para Cartógrafo ${nextRankProgress.nextRoman}`}
          </span>
          <ArrowRight className="relative h-4 w-4 opacity-60 transition-transform [transition-duration:var(--dur-fast)] [transition-timing-function:var(--ease-out)] group-hover/reward:translate-x-0.5" />
        </button>

        {/* Ações secundárias discretas */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="btn-secondary text-[12px]"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span>Editar nome</span>
          </button>

          <button
            type="button"
            onClick={handleShareProfile}
            className="btn-secondary text-[12px]"
          >
            {copiedKey === 'share-profile' ? (
              <Check className="h-3.5 w-3.5 text-tier-s" />
            ) : (
              <Share2 className="h-3.5 w-3.5" />
            )}
            <span>{copiedKey === 'share-profile' ? 'Resumo copiado' : 'Compartilhar perfil'}</span>
          </button>
        </div>
      </section>

      {/* [2] MASTERY PROGRESS TRACK & ACHIEVEMENTS */}
      <section aria-label="Trilha de Maestria e Conquistas" className="space-y-4">
        <div className="club-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="section-eyebrow text-tier-s">Mastery Progress Track</span>
              <h2 className="mt-0.5 text-[16px] font-medium text-ink">
                Trilha de Maestria do Cartógrafo ({profile.discoveredGapIds.length} mapeamentos)
              </h2>
            </div>
            <span className="tabular-mono text-[11px] text-ink-tertiary">
              Território ocupado: <strong className="text-tier-s">{territoryOccupiedPct.toFixed(1)}%</strong> · Restante:{' '}
              {remainingTerritoryPct.toFixed(1)}%
            </span>
          </div>

          <div className="relative mt-6 pb-1">
            {/* Linha base + progresso */}
            <div className="absolute top-4 right-6 left-6 h-1 overflow-hidden rounded-full bg-hairline">
              <div
                className="h-full w-full origin-left rounded-full bg-gradient-to-r from-brand via-brand-2 to-tier-s transition-transform [transition-duration:var(--dur-slow)] [transition-timing-function:var(--ease-out)]"
                style={{
                  transform: `scaleX(${masteryTrackProgress === 0 ? 0.02 : masteryTrackProgress})`,
                }}
              />
            </div>

            <div className="relative grid grid-cols-5 gap-2">
              {masteryMilestones.map((ms) => {
                const reached = profile.discoveredGapIds.length >= ms.min
                const isCurrent = rank.roman === ms.roman
                return (
                  <div key={ms.roman} className="flex flex-col items-center text-center">
                    <div
                      className={[
                        'relative z-10 flex h-8 w-8 items-center justify-center rounded-full border font-mono text-[11px] font-semibold transition-colors',
                        isCurrent
                          ? 'border-tier-s bg-tier-s/15 text-tier-s shadow-lg'
                          : reached
                            ? 'border-brand-2 bg-brand-2/15 text-ink'
                            : 'border-hairline bg-canvas text-ink-muted',
                      ].join(' ')}
                    >
                      {ms.roman}
                    </div>
                    <span
                      className={[
                        'mt-2 text-[11px] font-medium',
                        reached ? 'text-ink' : 'text-ink-muted',
                      ].join(' ')}
                    >
                      {ms.title}
                    </span>
                    <span className="tabular-mono text-[10px] text-ink-muted">
                      {ms.min === 0 ? 'Início' : `${ms.min} gaps`}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* 4 Conquistas (Achievements) */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {achievements.map((ach) => {
            const Icon = ach.icon
            const unlocked = ach.current >= ach.target
            const pct = Math.min(100, Math.round((ach.current / ach.target) * 100))
            return (
              <div
                key={ach.id}
                className={[
                  'flex flex-col justify-between gap-2.5 rounded-2xl border p-4 transition-colors',
                  unlocked
                    ? 'border-tier-s/60 bg-tier-s/10'
                    : 'border-hairline bg-surface',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={[
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border',
                        unlocked
                          ? 'border-tier-s/60 bg-tier-s/15 text-tier-s'
                          : 'border-hairline bg-canvas text-ink-muted',
                      ].join(' ')}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="text-[13px] font-medium text-ink">{ach.title}</div>
                      <div className="text-[11px] text-ink-muted">{ach.detail}</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between font-mono text-[10px]">
                    <span className={unlocked ? 'text-tier-s' : 'text-ink-muted'}>
                      {unlocked ? 'CONCLUÍDA' : 'EM PROGRESSO'}
                    </span>
                    <span className="tabular-mono text-ink-secondary">
                      {Math.min(ach.current, ach.target)}/{ach.target}
                    </span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-hairline">
                    <div
                      className={[
                        'h-full w-full origin-left rounded-full transition-transform [transition-duration:var(--dur-base)] [transition-timing-function:var(--ease-out)]',
                        unlocked ? 'bg-tier-s' : 'bg-brand',
                      ].join(' ')}
                      style={{
                        transform: `scaleX(${pct === 0 ? 0 : Math.max(0.05, pct / 100)})`,
                      }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* [2B] PROGRESSO DETALHADO — duas barras lado a lado */}
      <section aria-label="Progresso no atlas" className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Barra 1: Território ocupado */}
        <div className="club-card flex flex-col justify-between gap-2.5 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[16px] font-medium text-ink">Território ocupado</span>
            <span className="tabular-mono text-[12px] text-ink-tertiary">
              {profile.discoveredGapIds.length} mapeamentos
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div
              className="h-1 flex-1 overflow-hidden rounded-full bg-hairline"
              role="progressbar"
              aria-label="Percentual do território ocupado"
              aria-valuenow={Math.round(territoryOccupiedPct)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full w-full origin-left rounded-full bg-tier-s transition-transform [transition-duration:var(--dur-slow)] [transition-timing-function:var(--ease-out)]"
                style={{
                  transform: `scaleX(${territoryOccupiedPct === 0 ? 0 : Math.max(0.02, Math.min(1, territoryOccupiedPct / 100))})`,
                }}
              />
            </div>
            <span className="tabular-mono shrink-0 text-[12px] font-medium text-tier-s">
              {territoryOccupiedPct.toFixed(1)}%
            </span>
          </div>

          <p className="text-[12px] text-ink-tertiary">
            Restam <span className="tabular-mono text-ink-secondary">{remainingTerritoryPct.toFixed(1)}%</span>{' '}
            de território virgem por mapear no atlas.
          </p>
        </div>

        {/* Barra 2: Progresso de patente (apenas o próximo alvo visível) */}
        <div className="club-card flex flex-col justify-between gap-2.5 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[16px] font-medium text-ink">Progresso de patente</span>
            <span className="tabular-mono text-[12px] text-ink-tertiary">
              {nextRankProgress.isMaxRank
                ? `Patente ${rank.roman}`
                : `Próxima: Cartógrafo ${nextRankProgress.nextRoman}`}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div
              className="h-1 flex-1 overflow-hidden rounded-full bg-hairline"
              role="progressbar"
              aria-label="Progresso até a próxima patente"
              aria-valuenow={Math.round(nextRankProgress.progressRatio * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full w-full origin-left rounded-full bg-tier-s transition-transform [transition-duration:var(--dur-slow)] [transition-timing-function:var(--ease-out)]"
                style={{
                  transform: `scaleX(${nextRankProgress.progressRatio === 0 ? 0 : Math.max(0.02, nextRankProgress.progressRatio)})`,
                }}
              />
            </div>
            <span className="tabular-mono shrink-0 text-[12px] font-medium text-tier-s">
              {nextRankProgress.isMaxRank
                ? `${nextRankProgress.currentCount}`
                : `${nextRankProgress.currentCount}/${nextRankProgress.nextThreshold}`}
            </span>
          </div>

          <p className="text-[12px] text-ink-tertiary">
            {nextRankProgress.isMaxRank
              ? `Você atingiu a patente máxima registrada (${rank.title}).`
              : `Faltam ${nextRankProgress.remaining} ${
                  nextRankProgress.remaining === 1 ? 'mapeamento' : 'mapeamentos'
                } para Cartógrafo ${nextRankProgress.nextRoman}.`}
          </p>
        </div>
      </section>

      {/* [3] ACERVO PESSOAL ("Caderno pessoal") */}
      <section aria-label="Caderno pessoal" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline pb-4">
          <div>
            <h2 className="text-[20px] font-medium tracking-tight text-ink">
              Caderno pessoal
            </h2>
            <p className="mt-0.5 text-[12px] text-ink-tertiary">
              Favoritos salvos da coleção, registros de território virgem e grupos curados por você.
            </p>
          </div>

          {/* Tabs com recorte clip-path */}
          <div
            ref={tabNavRef}
            role="tablist"
            aria-label="Seções do Caderno pessoal"
            className="relative flex flex-wrap items-center gap-1 rounded-full border border-hairline bg-surface p-1"
          >
            {(
              [
                { id: 'favorites', label: `Favoritos (${profile.favorites.length})` },
                { id: 'drafts', label: `Registros (${drafts.length})` },
                { id: 'collections', label: `Coleções (${profile.personalCollections.length})` },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                ref={(el) => {
                  tabBtnRefs.current[t.id] = el
                }}
                type="button"
                role="tab"
                aria-selected={archiveTab === t.id}
                onClick={() => {
                  setArchiveTab(t.id)
                  setOpenPopoverItemId(null)
                }}
                className="lab-pressable inline-flex items-center rounded-full px-3.5 py-1.5 text-[12px] font-medium text-ink-tertiary hover:text-ink cursor-pointer"
              >
                {t.label}
              </button>
            ))}

            <div
              aria-hidden="true"
              style={{ clipPath: clipInset }}
              className="pointer-events-none absolute inset-0 flex flex-wrap items-center gap-1 p-1 transition-[clip-path] [transition-duration:var(--dur-fast)] [transition-timing-function:var(--ease-out)] motion-reduce:transition-none"
            >
              <span className="inline-flex items-center rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-canvas">
                Favoritos ({profile.favorites.length})
              </span>
              <span className="inline-flex items-center rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-canvas">
                Registros ({drafts.length})
              </span>
              <span className="inline-flex items-center rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-canvas">
                Coleções ({profile.personalCollections.length})
              </span>
            </div>
          </div>
        </div>

        {/* Barra de filtros por Tier & ordenação (apenas quando há itens) */}
        {archiveTab !== 'collections' && !isEmptyArchiveForTab ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setTierFilter('all')}
                className={[
                  'press-scale rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors cursor-pointer',
                  tierFilter === 'all'
                    ? 'border-border-hover bg-elevated text-ink'
                    : 'border-hairline bg-canvas text-ink-tertiary hover:border-border-hover',
                ].join(' ')}
              >
                Todos
              </button>
              {TIER_THRESHOLDS.map((t) => {
                const meta = TIER_COLOR_META[t.tier]
                const active = tierFilter === t.tier
                return (
                  <button
                    key={t.tier}
                    type="button"
                    onClick={() => setTierFilter(active ? 'all' : t.tier)}
                    className={[
                      'press-scale inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors cursor-pointer',
                      active
                        ? `${meta.borderClass} ${meta.bgSubtleClass} ${meta.textClass}`
                        : 'border-hairline bg-canvas text-ink-tertiary hover:border-border-hover',
                    ].join(' ')}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: meta.barColor }}
                      aria-hidden="true"
                    />
                    <span>Tier {t.tier}</span>
                  </button>
                )
              })}
            </div>

            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as ArchiveSort)}
              aria-label="Ordenar acervo pessoal"
              className="rounded-xl border border-hairline bg-canvas px-3 py-1.5 text-[12px] text-ink focus:border-border-hover focus:outline-none"
            >
              <option value="rarity">Por raridade</option>
              <option value="recent">Recentes</option>
              <option value="collection">Por coleção</option>
            </select>
          </div>
        ) : null}

        {/* Estado vazio desenhado (único botão primário da tela) */}
        {isEmptyArchiveForTab && archiveTab !== 'collections' ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-hairline bg-surface px-6 py-12 text-center">
            <div className="flex items-center gap-2 rounded-2xl border border-hairline bg-elevated p-4">
              <div className="h-14 w-11 rounded-lg border border-hairline bg-canvas p-2">
                <div className="h-1.5 w-6 rounded bg-white/15" />
                <div className="mt-1.5 h-1 w-full rounded bg-white/[0.07]" />
                <div className="mt-1 h-1 w-4/5 rounded bg-white/[0.07]" />
              </div>
              <BookOpen className="h-5 w-5 text-tier-s" />
              <div className="h-14 w-11 rounded-lg border border-dashed border-tier-s/35 bg-tier-s/[0.04] p-2">
                <div className="h-1.5 w-5 rounded bg-tier-s/40" />
                <div className="mt-1.5 h-1 w-full rounded bg-white/[0.06]" />
              </div>
            </div>

            <div className="max-w-md space-y-1">
              <h3 className="text-[16px] font-medium text-ink">
                {archiveTab === 'favorites'
                  ? 'Seu Caderno de favoritos está pronto'
                  : 'Nenhum território registrado no Caderno'}
              </h3>
              <p className="text-[12px] text-ink-tertiary">
                Mapeie um território virgem e salve aqui, ou marque prompts na Coleção para montar seu acervo.
              </p>
            </div>

            <button type="button" onClick={onExploreGaps} className="btn-primary text-[12px]">
              <Compass className="h-4 w-4" />
              <span>Explorar gaps</span>
            </button>
          </div>
        ) : archiveTab === 'favorites' ? (
          filteredFavorites.length === 0 ? (
            <div className="rounded-2xl border border-hairline bg-surface p-8 text-center text-[12px] text-ink-tertiary">
              Nenhum favorito em Tier {tierFilter}.
            </div>
          ) : (
            <div className="lab-density-grid grid grid-flow-dense grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {filteredFavorites.map((fav) => {
                const tierMeta = TIER_COLOR_META[fav.rarityTier]
                const isFeatured = featuredFavoriteIds.has(fav.id)
                const isNewSinceVisit =
                  Boolean(initialLastVisitRef.current) &&
                  fav.addedAt > (initialLastVisitRef.current || '')
                const cols = itemCollectionsMap.get(fav.id) || []
                const popoverOpen = openPopoverItemId === fav.id

                return (
                  <article
                    key={fav.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onInspectPromptById(fav.id, fav)}
                    onKeyDown={(e) => {
                      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault()
                        onInspectPromptById(fav.id, fav)
                      }
                    }}
                    className={[
                      'profile-card-hover club-card relative flex flex-col justify-between overflow-hidden text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-white/50 focus-visible:outline-offset-2',
                      isFeatured ? 'sm:col-span-2 tier-s-aura' : '',
                      tierMeta.borderClass,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <div
                      className={[
                        'relative w-full overflow-hidden border-b border-hairline bg-canvas',
                        isFeatured ? 'aspect-[16/9]' : 'aspect-[4/3]',
                      ].join(' ')}
                    >
                      <PromptThumb
                        src={fav.thumbnailUrl}
                        alt={fav.title}
                        fallbackLabel={fav.project}
                      />

                      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-center justify-between gap-2">
                        <span className="club-glass-pill tabular-mono truncate px-2.5 py-0.5 text-[10px] text-ink">
                          {fav.project}
                        </span>
                        <span className="club-glass-pill inline-flex shrink-0">
                          <span
                            className={[
                              'tabular-mono inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium',
                              tierMeta.badgeClass,
                            ].join(' ')}
                          >
                            TIER {fav.rarityTier}
                          </span>
                        </span>
                      </div>

                      {isNewSinceVisit ? (
                        <span className="tabular-mono pointer-events-none absolute bottom-3 left-3 z-10 rounded-full border border-tier-s/60 bg-canvas/90 px-2 py-0.5 text-[9px] text-tier-s">
                          Novo
                        </span>
                      ) : null}
                    </div>

                    <div className="flex flex-1 flex-col justify-between gap-3 p-4">
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="line-clamp-1 text-[16px] font-medium text-ink">
                            {fav.semanticTitle || fav.title}
                          </h3>
                          <span className={['tabular-mono shrink-0 text-[12px]', tierMeta.textClass].join(' ')}>
                            P{Math.round(fav.rarityPercentile)}
                          </span>
                        </div>
                        <p className="tabular-mono truncate text-[12px] text-ink-tertiary">
                          {fav.macroFormat.toUpperCase()} · {fav.kernelDialect} · MAT{' '}
                          {Math.round(fav.maturityScore)}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-2 border-t border-hairline pt-2.5">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: tierMeta.barColor }}
                            aria-hidden="true"
                          />
                          <span className="tabular-mono truncate text-[12px] text-ink-tertiary">
                            {cols.length > 0 ? cols[0].name : formatShortDate(fav.addedAt)}
                          </span>
                        </div>

                        {/* Ações secundárias reveladas no hover/foco (sempre visíveis em touch) */}
                        <div
                          className="profile-card-actions relative flex shrink-0 items-center gap-1"
                          data-collection-popover
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => void copyText(fav.id, `fav-copy:${fav.id}`)}
                            aria-label="Copiar identificador"
                            className="btn-ghost min-h-[28px] px-2 text-[11px]"
                          >
                            {copiedKey === `fav-copy:${fav.id}` ? (
                              <Check className="h-3.5 w-3.5 text-tier-s" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setOpenPopoverItemId((curr) => (curr === fav.id ? null : fav.id))
                            }
                            aria-label="Mover para coleção"
                            aria-expanded={popoverOpen}
                            className="btn-ghost min-h-[28px] px-2 text-[11px]"
                          >
                            <FolderPlus className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => onRemoveFavorite(fav.id)}
                            aria-label="Remover dos favoritos"
                            className="btn-ghost min-h-[28px] px-2 text-[11px] hover:text-danger"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>

                          {popoverOpen ? (
                            <div
                              style={{ ['--transform-origin' as string]: 'bottom right' }}
                              className="lab-popover absolute right-0 bottom-full z-30 mb-1.5 w-56 rounded-xl border border-hairline bg-elevated/98 p-2 shadow-2xl"
                            >
                              <div className="section-eyebrow px-2 py-1">Mover para coleção</div>
                              {profile.personalCollections.length === 0 ? (
                                <p className="px-2 py-1.5 text-[11px] text-ink-tertiary">
                                  Crie uma coleção na aba Coleções.
                                </p>
                              ) : (
                                <div className="max-h-40 space-y-0.5 overflow-y-auto">
                                  {profile.personalCollections.map((col) => {
                                    const member = col.itemIds.includes(fav.id)
                                    return (
                                      <button
                                        key={col.id}
                                        type="button"
                                        onClick={() => onToggleItemInCollection(col.id, fav.id)}
                                        className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-ink hover:bg-white/[0.08] cursor-pointer"
                                      >
                                        <span className="truncate">{col.name}</span>
                                        {member ? (
                                          <Check className="h-3.5 w-3.5 shrink-0 text-tier-s" />
                                        ) : null}
                                      </button>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )
        ) : archiveTab === 'drafts' ? (
          filteredDrafts.length === 0 ? (
            <div className="rounded-2xl border border-hairline bg-surface p-8 text-center text-[12px] text-ink-tertiary">
              {loadingDrafts
                ? 'Carregando registros do Caderno...'
                : `Nenhum registro em Tier ${tierFilter}.`}
            </div>
          ) : (
            <div className="lab-density-grid grid grid-flow-dense grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {filteredDrafts.map((draft) => {
                const tierMeta = TIER_COLOR_META[draft.rarityTier] || TIER_COLOR_META.B
                const isFeatured = featuredDraftIds.has(draft.id)
                const serial = serialMap.get(draft.gapId)
                const isNewSinceVisit =
                  Boolean(initialLastVisitRef.current) &&
                  draft.createdAt > (initialLastVisitRef.current || '')
                const popoverOpen = openPopoverItemId === draft.id

                return (
                  <article
                    key={draft.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenGapDraft(draft)}
                    onKeyDown={(e) => {
                      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault()
                        onOpenGapDraft(draft)
                      }
                    }}
                    className={[
                      'profile-card-hover club-card relative flex flex-col justify-between gap-3 p-4 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-white/50 focus-visible:outline-offset-2',
                      isFeatured ? 'sm:col-span-2 tier-s-aura' : '',
                      tierMeta.borderClass,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {serial ? (
                              <span className="tabular-mono text-[12px] font-medium text-tier-s">
                                Gap #{String(serial).padStart(4, '0')}
                              </span>
                            ) : null}
                            <span className="tabular-mono text-[12px] text-ink-tertiary">
                              {draft.scope}
                            </span>
                            {isNewSinceVisit ? (
                              <span className="tabular-mono rounded-full border border-tier-s/60 bg-tier-s/10 px-1.5 py-0.5 text-[9px] text-tier-s">
                                Novo
                              </span>
                            ) : null}
                          </div>
                          <h3 className="mt-1 line-clamp-1 text-[16px] font-medium text-ink">
                            {draft.gapTitle}
                          </h3>
                        </div>

                        <span
                          className={[
                            'tabular-mono shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                            tierMeta.badgeClass,
                          ].join(' ')}
                        >
                          TIER {draft.rarityTier} · P{Math.round(draft.rarityPercentile)}
                        </span>
                      </div>

                      <div className="club-prompt-well p-2.5">
                        <p className="line-clamp-3 font-mono text-[11px] leading-relaxed text-ink-secondary">
                          {draft.rawPrompt}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-hairline pt-2.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: tierMeta.barColor }}
                          aria-hidden="true"
                        />
                        <span className="tabular-mono text-[12px] text-ink-tertiary">
                          {draft.macroFormat.toUpperCase()} · {formatShortDate(draft.createdAt)}
                        </span>
                      </div>

                      <div
                        className="profile-card-actions relative flex items-center gap-1"
                        data-collection-popover
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => void copyText(draft.rawPrompt, `draft-copy:${draft.id}`)}
                          aria-label="Copiar prompt"
                          className="btn-ghost min-h-[28px] px-2 text-[11px]"
                        >
                          {copiedKey === `draft-copy:${draft.id}` ? (
                            <Check className="h-3.5 w-3.5 text-tier-s" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setOpenPopoverItemId((curr) => (curr === draft.id ? null : draft.id))
                          }
                          aria-label="Mover para coleção"
                          aria-expanded={popoverOpen}
                          className="btn-ghost min-h-[28px] px-2 text-[11px]"
                        >
                          <FolderPlus className="h-3.5 w-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => void onDeleteDraft(draft.id)}
                          aria-label="Remover registro"
                          className="btn-ghost min-h-[28px] px-2 text-[11px] hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>

                        {popoverOpen ? (
                          <div
                            style={{ ['--transform-origin' as string]: 'bottom right' }}
                            className="lab-popover absolute right-0 bottom-full z-30 mb-1.5 w-56 rounded-xl border border-hairline bg-elevated/98 p-2 shadow-2xl"
                          >
                            <div className="section-eyebrow px-2 py-1">Mover para coleção</div>
                            {profile.personalCollections.length === 0 ? (
                              <p className="px-2 py-1.5 text-[11px] text-ink-tertiary">
                                Nenhuma coleção criada ainda.
                              </p>
                            ) : (
                              <div className="max-h-40 space-y-0.5 overflow-y-auto">
                                {profile.personalCollections.map((col) => {
                                  const member = col.itemIds.includes(draft.id)
                                  return (
                                    <button
                                      key={col.id}
                                      type="button"
                                      onClick={() => onToggleItemInCollection(col.id, draft.id)}
                                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-ink hover:bg-white/[0.08] cursor-pointer"
                                    >
                                      <span className="truncate">{col.name}</span>
                                      {member ? (
                                        <Check className="h-3.5 w-3.5 shrink-0 text-tier-s" />
                                      ) : null}
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )
        ) : (
          /* Tab Coleções */
          <div className="space-y-4">
            <form
              onSubmit={handleCreateCollectionSubmit}
              className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-hairline bg-surface p-3.5"
            >
              <input
                type="text"
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                placeholder="Nova coleção (ex.: Golden hour editorial, Estudo denim)..."
                maxLength={60}
                className="min-w-[220px] flex-1 rounded-xl border border-hairline bg-canvas px-3 py-2 text-[12px] text-ink placeholder:text-ink-muted focus:border-border-hover focus:outline-none"
              />
              <label className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-canvas px-3 py-1.5 text-[12px] text-ink-tertiary">
                <span>Meta</span>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={newColTarget}
                  onChange={(e) => setNewColTarget(Math.max(1, Number(e.target.value) || 12))}
                  className="tabular-mono w-12 bg-transparent text-right text-ink focus:outline-none"
                />
                <span>itens</span>
              </label>
              <button
                type="submit"
                disabled={!newColName.trim()}
                className="btn-secondary text-[12px]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Criar coleção</span>
              </button>
            </form>

            {profile.personalCollections.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-hairline bg-surface px-6 py-10 text-center">
                <p className="text-[12px] text-ink-tertiary">
                  Agrupe seus favoritos e registros por tema ou pasta para acompanhar a completude de cada coleção.
                </p>
                <button type="button" onClick={onExploreGaps} className="btn-primary text-[12px]">
                  <Compass className="h-4 w-4" />
                  <span>Explorar gaps</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {profile.personalCollections.map((col) => {
                  const pct =
                    col.targetCount > 0
                      ? Math.min(100, (col.itemIds.length / col.targetCount) * 100)
                      : 0
                  const resolvedItems = col.itemIds
                    .map((id) => ({
                      id,
                      fav: favoriteById.get(id),
                      draft: draftById.get(id),
                    }))
                    .filter((x) => x.fav || x.draft)

                  return (
                    <article
                      key={col.id}
                      className="club-card flex flex-col justify-between gap-3 p-4"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            {/* Mosaico 2x2 estilo Savee Boards */}
                            <div className="grid h-14 w-14 shrink-0 grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-xl border border-hairline bg-canvas">
                              {[0, 1, 2, 3].map((slotIdx) => {
                                const entry = resolvedItems[slotIdx]
                                const thumb = entry?.fav?.thumbnailUrl
                                return thumb ? (
                                  <PromptThumb
                                    key={slotIdx}
                                    src={thumb}
                                    alt=""
                                    loading="lazy"
                                    fallbackLabel=""
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <span
                                    key={slotIdx}
                                    className="block h-full w-full bg-surface"
                                  />
                                )
                              })}
                            </div>
                            <div className="min-w-0">
                              <h3 className="truncate text-[16px] font-medium text-ink">
                                {col.name}
                              </h3>
                              <span className="tabular-mono text-[12px] text-ink-muted">
                                Criado em {formatShortDate(col.createdAt)}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onDeleteCollection(col.id)}
                            aria-label={`Remover coleção ${col.name}`}
                            className="btn-ghost min-h-[28px] px-2 text-ink-tertiary hover:text-danger"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Barra de completude do Deck */}
                        <div className="flex items-center gap-3">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hairline">
                            <div
                              className="h-full w-full origin-left rounded-full bg-tier-s transition-transform [transition-duration:var(--dur-slow)] [transition-timing-function:var(--ease-out)]"
                              style={{
                                transform: `scaleX(${pct === 0 ? 0 : Math.max(0.02, pct / 100)})`,
                              }}
                            />
                          </div>
                          <span className="tabular-mono shrink-0 text-[12px] text-ink-secondary">
                            {col.itemIds.length}/{col.targetCount} cartas
                          </span>
                        </div>
                      </div>

                      {resolvedItems.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-hairline bg-canvas p-3 text-[12px] text-ink-tertiary">
                          Use "Mover para coleção" nos cards de Favoritos ou Registros para preencher este grupo.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {resolvedItems.slice(0, 4).map(({ id, fav, draft }) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => {
                                if (fav) onInspectPromptById(fav.id, fav)
                                else if (draft) onOpenGapDraft(draft)
                              }}
                              className="flex w-full items-center justify-between gap-2 rounded-xl border border-hairline bg-canvas px-2.5 py-2 text-left text-[12px] text-ink hover:border-border-hover cursor-pointer"
                            >
                              <span className="truncate">
                                {fav ? fav.semanticTitle || fav.title : draft?.gapTitle}
                              </span>
                              <span className="tabular-mono shrink-0 text-tier-s">
                                {fav
                                  ? `Tier ${fav.rarityTier}`
                                  : `Tier ${draft?.rarityTier ?? 'B'}`}
                              </span>
                            </button>
                          ))}
                          {resolvedItems.length > 4 ? (
                            <div className="tabular-mono text-[11px] text-ink-tertiary">
                              +{resolvedItems.length - 4} itens na coleção
                            </div>
                          ) : null}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* [4] RECORDES — carimbos de expedição em linguagem de registro */}
      <section aria-label="Registros de expedição" className="space-y-3 border-t border-hairline pt-5">
        <span className="section-eyebrow">Carimbos de expedição · Recordes pessoais</span>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-dashed border-hairline bg-surface p-4">
            <div className="section-eyebrow">Maior E-score registrado</div>
            <div className="tabular-mono mt-1.5 text-[20px] font-medium text-tier-s">
              {highestEScoreRecord ? highestEScoreRecord.label : 'n/d'}
            </div>
            <p className="mt-1 truncate text-[12px] text-ink-tertiary">
              {highestEScoreRecord
                ? `Você mapeou ${highestEScoreRecord.sub}`
                : 'Você ainda não registrou um gap no Caderno.'}
            </p>
          </div>

          <div className="rounded-2xl border border-dashed border-hairline bg-surface p-4">
            <div className="section-eyebrow">Mapeamento mais raro</div>
            <div className="tabular-mono mt-1.5 text-[20px] font-medium text-ink">
              {rarestRecord ? rarestRecord.value : 'n/d'}
            </div>
            <p className="mt-1 truncate text-[12px] text-ink-tertiary">
              {rarestRecord ? rarestRecord.sub : 'Aguardando primeiro registro ou favorito.'}
            </p>
          </div>

          <div className="rounded-2xl border border-dashed border-hairline bg-surface p-4">
            <div className="section-eyebrow">Território ocupado</div>
            <div className="tabular-mono mt-1.5 text-[20px] font-medium text-ink">
              {territoryOccupiedPct.toFixed(1)}%
            </div>
            <p className="mt-1 text-[12px] text-ink-tertiary">
              Você cobriu {profile.discoveredGapIds.length}{' '}
              {profile.discoveredGapIds.length === 1 ? 'território virgem' : 'territórios virgens'}.
            </p>
          </div>

          <div className="rounded-2xl border border-dashed border-hairline bg-surface p-4">
            <div className="section-eyebrow">Dias ativos</div>
            <div className="tabular-mono mt-1.5 text-[20px] font-medium text-ink">
              {activeDaysCount}
            </div>
            <p className="mt-1 text-[12px] text-ink-tertiary">
              Você explorou o atlas em {activeDaysCount}{' '}
              {activeDaysCount === 1 ? 'dia registrado' : 'dias registrados'}.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
