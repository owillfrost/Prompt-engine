import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, CheckCircle2, Clock, Compass, Flame, Layers, Sparkles } from 'lucide-react'
import { formatTagPt } from '../../core/promptTagsPt'
import type { GapRecord, PromptItem } from '../../types/promptEngine'

export function axisNamePt(axis: string): string {
  const map: Record<string, string> = {
    environment: 'Cenário',
    lighting: 'Luz',
    pose: 'Sujeito / Pose',
    angle: 'Câmera',
    fabric: 'Textura',
    wardrobe: 'Figurino',
    color: 'Cor',
    motif: 'Fronteira Criativa',
  }
  return map[axis] || axis
}

export function getLocalDateKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

interface CountdownParts {
  hours: string
  minutes: string
  seconds: string
}

function getMidnightCountdown(nowMs: number): CountdownParts {
  const now = new Date(nowMs)
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0
  )
  const diffMs = Math.max(0, nextMidnight.getTime() - now.getTime())
  const totalSeconds = Math.floor(diffMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return {
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
  }
}

interface DailyGapMissionBannerProps {
  gap: GapRecord
  serialNumber: number | null
  missionStatus?: 'idle' | 'copied' | 'forged' | 'tested'
  testedImagesCount?: number
  isActiveInLab: boolean
  itemMap: Map<string, PromptItem>
  onExecuteMission: () => void
  onInspectItem: (item: PromptItem) => void
  onDateRollover?: (dateKey: string) => void
  bountyProgress?: {
    exploredCount: number
    discoveredGapsCount: number
    curatedCount: number
  }
}

/**
 * Visual abstrato do Altar de Fusão & Matriz de Gaps preenchendo o card do Hero Banner (sem texto interno).
 */
const GapMissionHeroBannerVisual: React.FC = () => (
  <div
    aria-hidden="true"
    className="relative h-full min-h-[204px] w-full overflow-hidden rounded-2xl bg-canvas/90 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-ink)_8%,transparent)] lg:min-h-[228px]"
  >
    {/* Camada 1: Superfície, brilhos radiais e matriz de co-ocorrência preenchendo 100% do card */}
    <svg
      viewBox="0 0 640 240"
      preserveAspectRatio="none"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <defs>
        <radialGradient
          id="gapSuiteGlowRosa"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(320 120) rotate(135) scale(260 148)"
        >
          <stop stopColor="var(--color-tier-s)" stopOpacity="0.34" />
          <stop offset="0.58" stopColor="var(--color-brand)" stopOpacity="0.14" />
          <stop offset="1" stopColor="var(--color-canvas)" stopOpacity="0" />
        </radialGradient>
        <radialGradient
          id="gapSuiteGlowIndigo"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(156 156) rotate(22) scale(230 112)"
        >
          <stop stopColor="var(--color-brand)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--color-canvas)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="640" height="240" fill="var(--color-surface)" />
      <rect width="640" height="240" fill="url(#gapSuiteGlowRosa)" />
      <rect width="640" height="240" fill="url(#gapSuiteGlowIndigo)" />

      {/* Grade óptica da matriz */}
      <g stroke="var(--color-ink)" strokeOpacity="0.06" strokeWidth="1">
        <line x1="0" y1="60" x2="640" y2="60" />
        <line x1="0" y1="120" x2="640" y2="120" />
        <line x1="0" y1="180" x2="640" y2="180" />
        <line x1="128" y1="0" x2="128" y2="240" />
        <line x1="256" y1="0" x2="256" y2="240" />
        <line x1="384" y1="0" x2="384" y2="240" />
        <line x1="512" y1="0" x2="512" y2="240" />
      </g>
    </svg>

    {/* Camada 2: Células da matriz, arcos de convergência dos doadores e núcleo de síntese */}
    <svg
      viewBox="0 0 640 240"
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="hv-enter pointer-events-none absolute inset-0 h-full w-full"
    >
      <defs>
        <linearGradient
          id="gapFusionBridge"
          x1="124"
          y1="120"
          x2="516"
          y2="120"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--color-brand-bright)" stopOpacity="0.8" />
          <stop offset="0.5" stopColor="var(--color-tier-s)" stopOpacity="1" />
          <stop offset="1" stopColor="var(--color-tier-s-bright)" stopOpacity="0.85" />
        </linearGradient>
      </defs>

      {/* Células de matriz ao fundo (territórios saturados vs. lacunas tracejadas) */}
      {[
        { x: 64, y: 44, gap: false, gapOrder: -1 },
        { x: 64, y: 156, gap: true, gapOrder: 0 },
        { x: 184, y: 38, gap: true, gapOrder: 1 },
        { x: 184, y: 162, gap: false, gapOrder: -1 },
        { x: 416, y: 38, gap: false, gapOrder: -1 },
        { x: 416, y: 162, gap: true, gapOrder: 2 },
        { x: 536, y: 44, gap: true, gapOrder: 3 },
        { x: 536, y: 156, gap: false, gapOrder: -1 },
      ].map((cell, idx) => (
        <rect
          key={idx}
          x={cell.x}
          y={cell.y}
          width={40}
          height={40}
          rx={8}
          fill={cell.gap ? 'var(--color-tier-s)' : 'var(--color-ink)'}
          fillOpacity={cell.gap ? 0.08 : 0.03}
          className={cell.gap ? 'hv-gap-cell' : undefined}
          style={cell.gap ? { animationDelay: `${cell.gapOrder * 180}ms` } : undefined}
          stroke={cell.gap ? 'var(--color-tier-s)' : 'var(--color-ink)'}
          strokeOpacity={cell.gap ? 0.42 : 0.12}
          strokeWidth="1.2"
          strokeDasharray={cell.gap ? '3 3' : undefined}
        />
      ))}

      {/* Anéis concêntricos do Altar de Fusão */}
      <circle
        cx="320"
        cy="120"
        r="76"
        className="hero-viz-spin"
        stroke="var(--color-ink)"
        strokeOpacity="0.1"
        strokeWidth="1"
        strokeDasharray="3 4"
      />
      <circle
        cx="320"
        cy="120"
        r="44"
        className="hv-gap-core"
        stroke="var(--color-tier-s)"
        strokeOpacity="0.32"
        strokeWidth="1.2"
      />
      <circle
        cx="320"
        cy="120"
        r="22"
        className="hv-gap-core"
        fill="var(--color-tier-s)"
        fillOpacity="0.14"
        stroke="var(--color-tier-s)"
        strokeOpacity="0.65"
        strokeWidth="1.4"
      />

      {/* Feixes de fusão entre Doador A (esquerda), Altar Central e Doador B (direita) */}
      <path
        d="M148 120 C206 72, 262 72, 320 120 C378 168, 434 168, 492 120"
        stroke="url(#gapFusionBridge)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M148 120 C206 168, 262 168, 320 120 C378 72, 434 72, 492 120"
        stroke="url(#gapFusionBridge)"
        strokeOpacity="0.55"
        strokeWidth="1.6"
        strokeDasharray="3 4"
        strokeLinecap="round"
      />
      <line
        x1="148"
        y1="120"
        x2="492"
        y2="120"
        stroke="url(#gapFusionBridge)"
        strokeOpacity="0.4"
        strokeWidth="1.25"
      />

      {/* Nodo Doador A */}
      <circle
        cx="148"
        cy="120"
        r="16"
        className="hv-gap-donor-a"
        fill="var(--color-canvas)"
        stroke="var(--color-brand-bright)"
        strokeOpacity="0.65"
        strokeWidth="1.4"
      />
      <circle cx="148" cy="120" r="5.5" fill="var(--color-brand-bright)" />

      {/* Nodo Doador B */}
      <circle
        cx="492"
        cy="120"
        r="16"
        className="hv-gap-donor-b"
        fill="var(--color-canvas)"
        stroke="var(--color-tier-s)"
        strokeOpacity="0.7"
        strokeWidth="1.4"
      />
      <circle cx="492" cy="120" r="5.5" fill="var(--color-tier-s)" />

      <circle cx="148" cy="120" r="4" fill="var(--color-ink)" className="hv-gap-packet" />

      {/* Cruz central de síntese O=0 */}
      <line
        x1="313"
        y1="120"
        x2="327"
        y2="120"
        stroke="var(--color-ink)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="320"
        y1="113"
        x2="320"
        y2="127"
        stroke="var(--color-ink)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>

    {/* Camada 3: Retículos óticos nos 4 cantos (sem texto na ilustração) */}
    <span className="pointer-events-none absolute top-3.5 left-3.5 h-3 w-3 border-t border-l border-ink/25" />
    <span className="pointer-events-none absolute top-3.5 right-3.5 h-3 w-3 border-t border-r border-ink/25" />
    <span className="pointer-events-none absolute bottom-3.5 left-3.5 h-3 w-3 border-b border-l border-ink/25" />
    <span className="pointer-events-none absolute right-3.5 bottom-3.5 h-3 w-3 border-r border-b border-ink/25" />
  </div>
)

export const DailyGapMissionBanner: React.FC<DailyGapMissionBannerProps> = ({
  gap,
  serialNumber,
  missionStatus = 'idle',
  testedImagesCount = 0,
  isActiveInLab,
  onExecuteMission,
  onDateRollover,
  bountyProgress,
}) => {
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  const bannerRef = useRef<HTMLElement | null>(null)
  const [animPaused, setAnimPaused] = useState(false)

  useEffect(() => {
    const syncPause = (inView: boolean) => {
      const docHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
      setAnimPaused(!inView || docHidden)
    }

    let isInView = true
    const el = bannerRef.current
    const obs =
      el && typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              isInView = entries.some((entry) => entry.isIntersecting)
              syncPause(isInView)
            },
            { threshold: 0.05 }
          )
        : null
    if (obs && el) obs.observe(el)

    const onVis = () => syncPause(isInView)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      obs?.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  useEffect(() => {
    let lastDateKey = getLocalDateKey(new Date())
    const timer = window.setInterval(() => {
      const nextNow = Date.now()
      setNowMs(nextNow)
      const nextDateKey = getLocalDateKey(new Date(nextNow))
      if (nextDateKey !== lastDateKey) {
        lastDateKey = nextDateKey
        onDateRollover?.(nextDateKey)
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [onDateRollover])

  const countdown = useMemo(() => getMidnightCountdown(nowMs), [nowMs])

  const tagALabel = formatTagPt(gap.tagA)
  const tagBLabel = formatTagPt(gap.tagB)
  const tagCLabel = gap.tagC ? formatTagPt(gap.tagC) : null

  const axisALabel = axisNamePt(gap.axisA)
  const axisBLabel = axisNamePt(gap.axisB)
  const axisCLabel = gap.axisC ? axisNamePt(gap.axisC) : null

  const isCompleted = missionStatus === 'tested' || missionStatus === 'forged' || testedImagesCount > 0
  const isCopiedInProgress = !isCompleted && missionStatus === 'copied'

  const bounties = useMemo(() => {
    const explored = bountyProgress?.exploredCount ?? 0
    const discovered = bountyProgress?.discoveredGapsCount ?? 0
    const curated = bountyProgress?.curatedCount ?? 0

    return [
      {
        id: 'codex-explorer',
        title: 'Explorador do Códice',
        detail: 'Inspecionar cartas individuais no acervo',
        current: explored,
        target: 5,
        icon: Layers,
      },
      {
        id: 'fusion-alchemist',
        title: 'Alquimista de Fusão',
        detail: 'Revelar & mapear cruzamentos O = 0',
        current: discovered,
        target: 3,
        icon: Flame,
      },
      {
        id: 'deck-curator',
        title: 'Curador de Decks',
        detail: 'Favoritar cartas ou salvar sínteses no Caderno',
        current: curated,
        target: 3,
        icon: Sparkles,
      },
    ] as const
  }, [bountyProgress])

  return (
    <section
      ref={bannerRef}
      aria-label="Quadro de Missões do Cartógrafo"
      className={[
        'mission-banner-shell relative overflow-hidden rounded-[22px] border transition-[border-color,filter] duration-200',
        isCompleted
          ? 'border-success/35 shadow-[0_18px_46px_-26px_color-mix(in_srgb,var(--color-success)_22%,transparent)]'
          : 'border-tier-s/35 shadow-[0_24px_60px_-28px_color-mix(in_srgb,var(--color-tier-s)_24%,transparent)]',
        animPaused || isCompleted ? 'mission-anim-paused' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        aria-hidden="true"
        className="mission-canvas-grid pointer-events-none absolute inset-0 opacity-55"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-brand/65 via-white/15 to-tier-s/55"
      />

      <div className="relative grid grid-cols-1 gap-6 p-5 sm:p-7 lg:grid-cols-12 lg:items-stretch">
        {/* Coluna Esquerda: Missão Principal Diária */}
        <div className="flex min-w-0 flex-col justify-between gap-4 lg:col-span-5">
          <div className="space-y-4">
            <div className="mission-stagger-1 flex flex-wrap items-center gap-2">
              <span className="tabular-mono inline-flex items-center gap-1.5 rounded-full border border-tier-s/60 bg-tier-s/15 px-3 py-1 text-[10px] font-medium tracking-[0.16em] text-tier-s">
                <Compass className="h-3.5 w-3.5" />
                MISSÃO PRINCIPAL DO DIA
              </span>

              <span className="tabular-mono rounded-full border border-hairline bg-surface/85 px-2.5 py-1 text-[10px] text-ink-secondary">
                Selo Serial {serialNumber !== null ? `#${String(serialNumber).padStart(4, '0')}` : 'Pendente'}
              </span>

              {isCompleted ? (
                <span className="stamp-certify tabular-mono relative inline-flex items-center gap-1 rounded-full border border-success/45 bg-success/15 px-2.5 py-1 text-[10px] font-medium text-success">
                  <span
                    aria-hidden="true"
                    className="gap-certify-ring pointer-events-none absolute inset-0 rounded-full border border-success/60"
                  />
                  <CheckCircle2 className="h-3 w-3" />
                  {testedImagesCount > 0
                    ? `Cumprida (${testedImagesCount} ${testedImagesCount === 1 ? 'imagem' : 'imagens'} no Eagle)`
                    : missionStatus === 'tested'
                      ? 'Testada & Cumprida'
                      : 'Forjada no Caderno'}
                </span>
              ) : isCopiedInProgress ? (
                <span className="tabular-mono inline-flex items-center gap-1 rounded-full border border-tier-s/45 bg-tier-s/12 px-2.5 py-1 text-[10px] font-medium text-tier-s">
                  <Clock className="h-3 w-3" />
                  Em teste (copiada)
                </span>
              ) : null}
            </div>

            <h2 className="mission-stagger-2 text-[20px] font-semibold leading-[1.14] tracking-[-0.025em] text-ink sm:text-[28px]">
              Funda{' '}
              <span className="text-tier-s">{tagALabel}</span>{' '}
              com{' '}
              <span className="text-tier-s">{tagBLabel}</span>
              {tagCLabel ? (
                <>
                  {' '}
                  e <span className="text-tier-s">{tagCLabel}</span>
                </>
              ) : null}
            </h2>

            <p className="mission-stagger-3 max-w-xl text-[13px] leading-relaxed text-ink-secondary">
              Una uma carta doadora de{' '}
              <span className="font-medium text-ink">{axisALabel}</span> com outra de{' '}
              <span className="font-medium text-ink">{axisBLabel}</span>
              {axisCLabel ? (
                <>
                  {' '}
                  e <span className="font-medium text-ink">{axisCLabel}</span>
                </>
              ) : null}{' '}
              no Altar de Fusão abaixo e revele o prompt inédito antes do reset diário.
            </p>
          </div>

          <div className="mission-stagger-4 flex flex-wrap items-center gap-6 pt-1">
            <button
              type="button"
              onClick={onExecuteMission}
              className="club-btn-primary min-h-[44px] cursor-pointer px-5 text-[13px]"
            >
              <Compass className="h-4 w-4" />
              <span>
                {isActiveInLab
                  ? 'Carregada no Altar de Fusão'
                  : isCompleted
                    ? 'Reabrir carta no Altar'
                    : 'Forjar Missão no Altar'}
              </span>
              <ArrowRight className="mission-cta-arrow h-4 w-4" />
            </button>

            <div className="flex flex-col gap-1">
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-tier-s">
                <Clock className="h-3 w-3" />
                Ciclo diário termina em
              </span>

              <div
                className="flex items-baseline gap-1.5"
                aria-label={`Tempo restante até a missão acabar: ${countdown.hours} horas, ${countdown.minutes} minutos e ${countdown.seconds} segundos`}
              >
                {[
                  { val: countdown.hours, unit: 'h' },
                  { val: countdown.minutes, unit: 'm' },
                  { val: countdown.seconds, unit: 's' },
                ].map((seg, idx) => (
                  <React.Fragment key={seg.unit}>
                    {idx > 0 ? (
                      <span className="tabular-mono text-[20px] font-light text-ink-muted sm:text-[24px]">
                        :
                      </span>
                    ) : null}
                    <span className="inline-flex items-baseline gap-0.5">
                      <span className="tabular-mono text-[24px] font-semibold leading-none tracking-[-0.03em] text-ink sm:text-[28px]">
                        {seg.val}
                      </span>
                      <span className="font-mono text-[11px] font-medium text-ink-tertiary">
                        {seg.unit}
                      </span>
                    </span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Coluna Direita: Ilustração abstrata do Altar de Fusão preenchendo todo o card (sem texto) */}
        <div className="mission-stagger-5 flex w-full lg:col-span-7">
          <GapMissionHeroBannerVisual />
        </div>
      </div>

      {/* Tactical Bounty Strip (3 Missões Secundárias / Quest Tracker) */}
      <div className="relative grid grid-cols-1 gap-2.5 border-t border-hairline bg-canvas px-5 py-3.5 sm:grid-cols-3 sm:px-7">
        {bounties.map((b) => {
          const Icon = b.icon
          const done = b.current >= b.target
          const ratio = Math.min(1, b.current / b.target)
          return (
            <div
              key={b.id}
              className={[
                'flex flex-col justify-between gap-2 rounded-xl border px-3 py-2.5',
                done
                  ? 'border-success/35 bg-success/[0.06]'
                  : 'border-hairline bg-surface',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={[
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border',
                      done
                        ? 'border-success/45 bg-success/15 text-success'
                        : 'border-hairline bg-elevated text-tier-s',
                    ].join(' ')}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-medium text-ink">{b.title}</div>
                    <div className="truncate text-[10px] text-ink-muted">{b.detail}</div>
                  </div>
                </div>
                <span
                  className={[
                    'tabular-mono shrink-0 text-[11px] font-medium',
                    done ? 'text-success' : 'text-tier-s',
                  ].join(' ')}
                >
                  {Math.min(b.current, b.target)}/{b.target}
                </span>
              </div>

              <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className={[
                    'h-full w-full origin-left rounded-full transition-transform [transition-duration:var(--dur-base)] [transition-timing-function:var(--ease-out)]',
                    done ? 'bg-success' : 'bg-tier-s',
                  ].join(' ')}
                  style={{
                    transform: `scaleX(${ratio === 0 ? 0 : Math.max(0.04, ratio)})`,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
