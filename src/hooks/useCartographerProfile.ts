import { useCallback, useMemo, useState } from 'react'
import type {
  GapDraftRecord,
  KernelDialect,
  MacroFormat,
  PromptItem,
  RarityTier,
} from '../types/promptEngine'

const STORAGE_KEY = 'prompt_engine_cartographer_v1'

export interface FavoritePromptEntry {
  id: string
  title: string
  semanticTitle?: string
  project: string
  sourceLib: PromptItem['sourceLib']
  thumbnailUrl: string | null
  rarityTier: RarityTier
  rarityPercentile: number
  rarityLabel: string
  maturityScore: number
  macroFormat: MacroFormat
  kernelDialect: KernelDialect
  addedAt: string
}

export interface PersonalCollectionRecord {
  id: string
  name: string
  targetCount: number
  itemIds: string[]
  createdAt: string
}

export type LabPaletteId = 'obsidian' | 'nocturnal_violet'

export interface LabPreferences {
  theme: 'dark'
  palette: LabPaletteId
  density: 'comfortable' | 'compact'
  reducedMotion: 'system' | 'reduce'
}

export interface NextRankProgress {
  currentCount: number
  minForCurrent: number
  nextThreshold: number
  remaining: number
  nextRoman: string | null
  nextTitle: string | null
  progressRatio: number
  isMaxRank: boolean
}

export interface CartographerState {
  discoveredGapIds: string[]
  discoveredGapsByDay: Record<string, string[]>
  exploredPromptIds: string[]
  collectedTierSIds: string[]
  soundEnabled: boolean
  completedDailyMissionDates: string[]
  displayName: string
  memberSince: string
  activeDateKeys: string[]
  favorites: FavoritePromptEntry[]
  personalCollections: PersonalCollectionRecord[]
  lastProfileVisitAt: string | null
  preferences: LabPreferences
}

export interface CartographerRank {
  level: number
  roman: string
  title: string
  badge: string
  nextThreshold: number
}

export interface GapDiscoveryResult {
  serialNumber: number
  isNew: boolean
  totalDiscovered: number
  todayCount: number
}

const DEFAULT_PREFERENCES: LabPreferences = {
  theme: 'dark',
  palette: 'obsidian',
  density: 'comfortable',
  reducedMotion: 'system',
}

function getLocalDateKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function createFreshState(): CartographerState {
  const today = getLocalDateKey()
  return {
    discoveredGapIds: [],
    discoveredGapsByDay: {},
    exploredPromptIds: [],
    collectedTierSIds: [],
    soundEnabled: true,
    completedDailyMissionDates: [],
    displayName: 'Cartógrafo',
    memberSince: new Date().toISOString(),
    activeDateKeys: [today],
    favorites: [],
    personalCollections: [],
    lastProfileVisitAt: null,
    preferences: { ...DEFAULT_PREFERENCES },
  }
}

function loadInitialState(): CartographerState {
  const fallback = createFreshState()
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      persistState(fallback)
      return fallback
    }
    const parsed = JSON.parse(raw) as Partial<CartographerState>
    const today = getLocalDateKey()
    const rawActiveDates = Array.isArray(parsed.activeDateKeys) ? parsed.activeDateKeys : []
    const activeDateKeys = rawActiveDates.includes(today)
      ? rawActiveDates
      : [...rawActiveDates, today]

    const rawPrefs =
      parsed.preferences && typeof parsed.preferences === 'object' ? parsed.preferences : undefined
    const preferences: LabPreferences = {
      theme: 'dark',
      palette: rawPrefs?.palette === 'nocturnal_violet' ? 'nocturnal_violet' : 'obsidian',
      density: rawPrefs?.density === 'compact' ? 'compact' : 'comfortable',
      reducedMotion: rawPrefs?.reducedMotion === 'reduce' ? 'reduce' : 'system',
    }

    const memberSince =
      typeof parsed.memberSince === 'string' && parsed.memberSince.trim()
        ? parsed.memberSince
        : fallback.memberSince

    const hydrated: CartographerState = {
      discoveredGapIds: Array.isArray(parsed.discoveredGapIds) ? parsed.discoveredGapIds : [],
      discoveredGapsByDay:
        parsed.discoveredGapsByDay && typeof parsed.discoveredGapsByDay === 'object'
          ? parsed.discoveredGapsByDay
          : {},
      exploredPromptIds: Array.isArray(parsed.exploredPromptIds) ? parsed.exploredPromptIds : [],
      collectedTierSIds: Array.isArray(parsed.collectedTierSIds) ? parsed.collectedTierSIds : [],
      soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : true,
      completedDailyMissionDates: Array.isArray(parsed.completedDailyMissionDates)
        ? parsed.completedDailyMissionDates
        : [],
      displayName:
        typeof parsed.displayName === 'string' && parsed.displayName.trim()
          ? parsed.displayName.trim()
          : 'Cartógrafo',
      memberSince,
      activeDateKeys,
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      personalCollections: Array.isArray(parsed.personalCollections)
        ? parsed.personalCollections
        : [],
      lastProfileVisitAt:
        typeof parsed.lastProfileVisitAt === 'string' && parsed.lastProfileVisitAt
          ? parsed.lastProfileVisitAt
          : null,
      preferences,
    }

    // Garante persistência imediata caso memberSince/today tenham sido semeados
    if (!parsed.memberSince || !rawActiveDates.includes(today)) {
      persistState(hydrated)
    }
    return hydrated
  } catch {
    return fallback
  }
}

function persistState(state: CartographerState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignora cota excedida ou storage indisponível
  }
}

const RANK_LADDER: ReadonlyArray<{
  minCount: number
  level: number
  roman: string
  title: string
  nextThreshold: number
}> = [
  { minCount: 65, level: 10, roman: 'X', title: 'Cartógrafo Soberano do Atlas', nextThreshold: 100 },
  { minCount: 50, level: 9, roman: 'IX', title: 'Mestre de Território Virgem', nextThreshold: 65 },
  { minCount: 38, level: 8, roman: 'VIII', title: 'Geógrafo de Fronteiras', nextThreshold: 50 },
  { minCount: 28, level: 7, roman: 'VII', title: 'Topógrafo de Alta Raridade', nextThreshold: 38 },
  { minCount: 20, level: 6, roman: 'VI', title: 'Analista de Zonas Vazias', nextThreshold: 28 },
  { minCount: 14, level: 5, roman: 'V', title: 'Agrimensor Semântico', nextThreshold: 20 },
  { minCount: 9, level: 4, roman: 'IV', title: 'Cartógrafo de Campo', nextThreshold: 14 },
  { minCount: 5, level: 3, roman: 'III', title: 'Cartógrafo Semântico', nextThreshold: 9 },
  { minCount: 2, level: 2, roman: 'II', title: 'Rastreador de Lacunas', nextThreshold: 5 },
  { minCount: 0, level: 1, roman: 'I', title: 'Explorador de Campo', nextThreshold: 2 },
]

export function computeCartographerRank(discoveredCount: number): CartographerRank {
  const tier =
    RANK_LADDER.find((r) => discoveredCount >= r.minCount) ?? RANK_LADDER[RANK_LADDER.length - 1]
  return {
    level: tier.level,
    roman: tier.roman,
    title: tier.title,
    badge: `CARTÓGRAFO ${tier.roman}`,
    nextThreshold: tier.nextThreshold,
  }
}

export function computeNextRankProgress(discoveredCount: number): NextRankProgress {
  const idx = RANK_LADDER.findIndex((r) => discoveredCount >= r.minCount)
  const currentIdx = idx >= 0 ? idx : RANK_LADDER.length - 1
  const currentTier = RANK_LADDER[currentIdx]
  const nextTier = currentIdx > 0 ? RANK_LADDER[currentIdx - 1] : null

  if (!nextTier) {
    return {
      currentCount: discoveredCount,
      minForCurrent: currentTier.minCount,
      nextThreshold: currentTier.minCount,
      remaining: 0,
      nextRoman: null,
      nextTitle: null,
      progressRatio: 1,
      isMaxRank: true,
    }
  }

  const span = Math.max(1, nextTier.minCount - currentTier.minCount)
  const progressInTier = Math.max(0, discoveredCount - currentTier.minCount)
  return {
    currentCount: discoveredCount,
    minForCurrent: currentTier.minCount,
    nextThreshold: nextTier.minCount,
    remaining: Math.max(0, nextTier.minCount - discoveredCount),
    nextRoman: nextTier.roman,
    nextTitle: nextTier.title,
    progressRatio: Math.min(1, progressInTier / span),
    isMaxRank: false,
  }
}

function appendActiveDate(prevDates: string[], dateKey: string): string[] {
  return prevDates.includes(dateKey) ? prevDates : [...prevDates, dateKey]
}

export function useCartographerProfile() {
  const [state, setState] = useState<CartographerState>(loadInitialState)

  const recordGapDiscovery = useCallback((gapId: string): GapDiscoveryResult => {
    const today = getLocalDateKey()
    let result: GapDiscoveryResult = {
      serialNumber: 1,
      isNew: false,
      totalDiscovered: 1,
      todayCount: 1,
    }

    setState((prev) => {
      const existingIdx = prev.discoveredGapIds.indexOf(gapId)
      const isNew = existingIdx === -1
      const nextDiscovered = isNew ? [...prev.discoveredGapIds, gapId] : prev.discoveredGapIds
      const serialNumber = isNew ? nextDiscovered.length : existingIdx + 1

      const prevToday = prev.discoveredGapsByDay[today] || []
      const nextToday = prevToday.includes(gapId) ? prevToday : [...prevToday, gapId]

      result = {
        serialNumber,
        isNew,
        totalDiscovered: nextDiscovered.length,
        todayCount: nextToday.length,
      }

      if (!isNew && prevToday.includes(gapId) && prev.activeDateKeys.includes(today)) {
        return prev
      }

      const next: CartographerState = {
        ...prev,
        discoveredGapIds: nextDiscovered,
        discoveredGapsByDay: {
          ...prev.discoveredGapsByDay,
          [today]: nextToday,
        },
        activeDateKeys: appendActiveDate(prev.activeDateKeys, today),
      }
      persistState(next)
      return next
    })

    return result
  }, [])

  const getGapSerialNumber = useCallback(
    (gapId: string): number | null => {
      const idx = state.discoveredGapIds.indexOf(gapId)
      return idx >= 0 ? idx + 1 : null
    },
    [state.discoveredGapIds]
  )

  const recordPromptExplored = useCallback((item: Pick<PromptItem, 'id' | 'rarity'>) => {
    const today = getLocalDateKey()
    setState((prev) => {
      const hasPrompt = prev.exploredPromptIds.includes(item.id)
      const isTierS = item.rarity.tier === 'S'
      const hasTierS = !isTierS || prev.collectedTierSIds.includes(item.id)
      const hasToday = prev.activeDateKeys.includes(today)
      if (hasPrompt && hasTierS && hasToday) return prev

      const next: CartographerState = {
        ...prev,
        exploredPromptIds: hasPrompt
          ? prev.exploredPromptIds
          : [...prev.exploredPromptIds, item.id],
        collectedTierSIds: hasTierS
          ? prev.collectedTierSIds
          : [...prev.collectedTierSIds, item.id],
        activeDateKeys: appendActiveDate(prev.activeDateKeys, today),
      }
      persistState(next)
      return next
    })
  }, [])

  const toggleSound = useCallback(() => {
    setState((prev) => {
      const next: CartographerState = {
        ...prev,
        soundEnabled: !prev.soundEnabled,
      }
      persistState(next)
      return next
    })
  }, [])

  const markDailyMissionCompleted = useCallback((dateKey = getLocalDateKey()) => {
    setState((prev) => {
      if (prev.completedDailyMissionDates.includes(dateKey) && prev.activeDateKeys.includes(dateKey)) {
        return prev
      }
      const next: CartographerState = {
        ...prev,
        completedDailyMissionDates: prev.completedDailyMissionDates.includes(dateKey)
          ? prev.completedDailyMissionDates
          : [...prev.completedDailyMissionDates, dateKey],
        activeDateKeys: appendActiveDate(prev.activeDateKeys, dateKey),
      }
      persistState(next)
      return next
    })
  }, [])

  const updateDisplayName = useCallback((name: string) => {
    const clean = name.trim().slice(0, 48) || 'Cartógrafo'
    setState((prev) => {
      if (prev.displayName === clean) return prev
      const next: CartographerState = {
        ...prev,
        displayName: clean,
      }
      persistState(next)
      return next
    })
  }, [])

  const toggleFavorite = useCallback((item: PromptItem, semanticTitle?: string) => {
    const today = getLocalDateKey()
    setState((prev) => {
      const exists = prev.favorites.some((f) => f.id === item.id)
      let nextFavorites: FavoritePromptEntry[]
      let nextCollections = prev.personalCollections

      if (exists) {
        nextFavorites = prev.favorites.filter((f) => f.id !== item.id)
      } else {
        const entry: FavoritePromptEntry = {
          id: item.id,
          title: item.title,
          semanticTitle,
          project: item.project,
          sourceLib: item.sourceLib,
          thumbnailUrl: item.thumbnailUrl,
          rarityTier: item.rarity.tier,
          rarityPercentile: item.rarity.percentile,
          rarityLabel: item.rarity.label,
          maturityScore: item.maturity.score,
          macroFormat: item.attributes.estrutura.macroFormat,
          kernelDialect: item.attributes.estrutura.kernelDialect,
          addedAt: new Date().toISOString(),
        }
        nextFavorites = [entry, ...prev.favorites]
      }

      if (exists) {
        nextCollections = prev.personalCollections.map((col) =>
          col.itemIds.includes(item.id)
            ? { ...col, itemIds: col.itemIds.filter((id) => id !== item.id) }
            : col
        )
      }

      const next: CartographerState = {
        ...prev,
        favorites: nextFavorites,
        personalCollections: nextCollections,
        activeDateKeys: appendActiveDate(prev.activeDateKeys, today),
      }
      persistState(next)
      return next
    })
  }, [])

  const removeFavoriteById = useCallback((promptId: string) => {
    setState((prev) => {
      const nextFavorites = prev.favorites.filter((f) => f.id !== promptId)
      if (nextFavorites.length === prev.favorites.length) return prev
      const next: CartographerState = {
        ...prev,
        favorites: nextFavorites,
        personalCollections: prev.personalCollections.map((col) =>
          col.itemIds.includes(promptId)
            ? { ...col, itemIds: col.itemIds.filter((id) => id !== promptId) }
            : col
        ),
      }
      persistState(next)
      return next
    })
  }, [])

  const favoriteIdSet = useMemo(() => new Set(state.favorites.map((f) => f.id)), [state.favorites])

  const isFavorite = useCallback((promptId: string) => favoriteIdSet.has(promptId), [favoriteIdSet])

  const createCollection = useCallback(
    (name: string, targetCount = 12): PersonalCollectionRecord | null => {
      const clean = name.trim().slice(0, 60)
      if (!clean) return null
      const safeTarget = Math.max(1, Math.min(200, Math.round(targetCount || 12)))
      const record: PersonalCollectionRecord = {
        id: `col_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: clean,
        targetCount: safeTarget,
        itemIds: [],
        createdAt: new Date().toISOString(),
      }
      setState((prev) => {
        const next: CartographerState = {
          ...prev,
          personalCollections: [record, ...prev.personalCollections],
        }
        persistState(next)
        return next
      })
      return record
    },
    []
  )

  const deleteCollection = useCallback((collectionId: string) => {
    setState((prev) => {
      const nextCols = prev.personalCollections.filter((c) => c.id !== collectionId)
      if (nextCols.length === prev.personalCollections.length) return prev
      const next: CartographerState = {
        ...prev,
        personalCollections: nextCols,
      }
      persistState(next)
      return next
    })
  }, [])

  const toggleItemInCollection = useCallback((collectionId: string, itemId: string) => {
    setState((prev) => {
      const nextCols = prev.personalCollections.map((col) => {
        if (col.id !== collectionId) return col
        const has = col.itemIds.includes(itemId)
        return {
          ...col,
          itemIds: has ? col.itemIds.filter((id) => id !== itemId) : [...col.itemIds, itemId],
        }
      })
      const next: CartographerState = {
        ...prev,
        personalCollections: nextCols,
      }
      persistState(next)
      return next
    })
  }, [])

  const markProfileVisited = useCallback(() => {
    const nowIso = new Date().toISOString()
    setState((prev) => {
      const next: CartographerState = {
        ...prev,
        lastProfileVisitAt: nowIso,
      }
      persistState(next)
      return next
    })
  }, [])

  const updatePreferences = useCallback((patch: Partial<LabPreferences>) => {
    setState((prev) => {
      const nextPrefs: LabPreferences = {
        theme: 'dark',
        palette:
          patch.palette === 'obsidian' || patch.palette === 'nocturnal_violet'
            ? patch.palette
            : prev.preferences.palette,
        density:
          patch.density === 'compact' || patch.density === 'comfortable'
            ? patch.density
            : prev.preferences.density,
        reducedMotion:
          patch.reducedMotion === 'reduce' || patch.reducedMotion === 'system'
            ? patch.reducedMotion
            : prev.preferences.reducedMotion,
      }
      if (
        nextPrefs.palette === prev.preferences.palette &&
        nextPrefs.density === prev.preferences.density &&
        nextPrefs.reducedMotion === prev.preferences.reducedMotion
      ) {
        return prev
      }
      const next: CartographerState = {
        ...prev,
        preferences: nextPrefs,
      }
      persistState(next)
      return next
    })
  }, [])

  const clearLocalProfileData = useCallback(() => {
    const fresh = createFreshState()
    persistState(fresh)
    setState(fresh)
  }, [])

  const buildExportPayload = useCallback(
    (drafts: GapDraftRecord[]) => ({
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      profile: state,
      drafts,
    }),
    [state]
  )

  const activeDaysCount = useMemo(() => {
    const dates = new Set<string>([
      ...state.activeDateKeys,
      ...Object.entries(state.discoveredGapsByDay)
        .filter(([, ids]) => Array.isArray(ids) && ids.length > 0)
        .map(([d]) => d),
      ...state.completedDailyMissionDates,
    ])
    return Math.max(1, dates.size)
  }, [state.activeDateKeys, state.discoveredGapsByDay, state.completedDailyMissionDates])

  const streakDays = useMemo(() => {
    const activeDates = new Set<string>([
      ...Object.entries(state.discoveredGapsByDay)
        .filter(([, ids]) => Array.isArray(ids) && ids.length > 0)
        .map(([d]) => d),
      ...state.completedDailyMissionDates,
    ])
    if (activeDates.size === 0) return 0

    const today = new Date()
    const todayKey = getLocalDateKey(today)
    const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    if (!activeDates.has(todayKey)) {
      cursor.setDate(cursor.getDate() - 1)
      if (!activeDates.has(getLocalDateKey(cursor))) {
        return 0
      }
    }

    let streak = 0
    while (activeDates.has(getLocalDateKey(cursor))) {
      streak++
      cursor.setDate(cursor.getDate() - 1)
    }
    return streak
  }, [state.discoveredGapsByDay, state.completedDailyMissionDates])

  const todayCount = useMemo(() => {
    const today = getLocalDateKey()
    return (state.discoveredGapsByDay[today] || []).length
  }, [state.discoveredGapsByDay])

  const cartographerRank = useMemo(
    () => computeCartographerRank(state.discoveredGapIds.length),
    [state.discoveredGapIds.length]
  )

  const nextRankProgress = useMemo(
    () => computeNextRankProgress(state.discoveredGapIds.length),
    [state.discoveredGapIds.length]
  )

  return {
    state,
    todayCount,
    streakDays,
    activeDaysCount,
    cartographerRank,
    nextRankProgress,
    recordGapDiscovery,
    getGapSerialNumber,
    recordPromptExplored,
    toggleSound,
    markDailyMissionCompleted,
    updateDisplayName,
    toggleFavorite,
    removeFavoriteById,
    isFavorite,
    createCollection,
    deleteCollection,
    toggleItemInCollection,
    markProfileVisited,
    updatePreferences,
    clearLocalProfileData,
    buildExportPayload,
  }
}
