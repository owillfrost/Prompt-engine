import { type FC, useEffect, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Sparkles } from 'lucide-react'
import { formatTagPt } from '../core/promptTagsPt'
import type { TimelineInsightsResponse } from '../types/promptEngine'

interface TimelineEvolutionPanelProps {
  onRefinePeriod: (period: string) => void
}

export const TimelineEvolutionPanel: FC<TimelineEvolutionPanelProps> = ({ onRefinePeriod }) => {
  const [data, setData] = useState<TimelineInsightsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetch('/api/timeline-insights', { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return (await r.json()) as TimelineInsightsResponse
      })
      .then((payload) => {
        setData(payload)
        setLoading(false)
      })
      .catch((err) => {
        if ((err as { name?: string })?.name === 'AbortError') return
        setError(String(err))
        setLoading(false)
      })
    return () => controller.abort()
  }, [])

  if (loading && !data) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-[#101013] p-10 text-center font-mono text-[12px] text-zinc-500">
        Decodificando Base-36 timestamps e safras do acervo...
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-[#101013] p-8 text-center font-mono text-[12px] text-zinc-400">
        Erro ao calcular evolução temporal: {error || 'sem dados'}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Pergunta 1: Tabela de Safras Históricas */}
      <section className="rounded-2xl border border-white/[0.07] bg-[#101013] p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="section-eyebrow">
              Evolução por Safra (ID Base-36 + mtime.json · N={data.totalCorpus.toLocaleString('pt-BR')})
            </span>
            <p className="mt-0.5 text-[12px] text-zinc-400">
              Pergunta respondida: como seus formatos, dialetos e concentração de Território Virgem evoluíram ao longo do tempo?
            </p>
          </div>
          <span className="tabular-mono text-[10px] text-zinc-500">
            Agregado em {data.computationMs}ms
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-y-1.5 text-left">
            <thead>
              <tr className="font-mono text-[10px] text-zinc-500">
                <th className="px-3 py-1.5 font-normal">SAFRA</th>
                <th className="px-3 py-1.5 font-normal">PROMPTS</th>
                <th className="px-3 py-1.5 font-normal">DIALETO &amp; FORMATO</th>
                <th className="px-3 py-1.5 font-normal">TIER S (P≥95)</th>
                <th className="px-3 py-1.5 font-normal">RARO + MADURO</th>
                <th className="px-3 py-1.5 font-normal">RARO + IMATURO</th>
                <th className="px-3 py-1.5 font-normal">RARID. / MAT</th>
                <th className="px-3 py-1.5 text-right font-normal">AÇÃO</th>
              </tr>
            </thead>
            <tbody>
              {data.cohorts.map((c) => {
                const volPct = Math.round((c.totalPrompts / Math.max(1, data.totalCorpus)) * 100)
                return (
                  <tr key={c.period} className="rounded-xl bg-[#0b0b0e] font-mono text-[11px]">
                    <td className="rounded-l-xl border-y border-l border-white/[0.06] px-3 py-2.5 font-sans text-[12px] font-medium text-zinc-100">
                      {c.label}
                    </td>
                    <td className="border-y border-white/[0.06] px-3 py-2.5 text-zinc-200">
                      <div>{c.totalPrompts.toLocaleString('pt-BR')}</div>
                      <div className="mt-1 h-1 w-20 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className="h-full bg-zinc-400" style={{ width: `${Math.max(4, volPct)}%` }} />
                      </div>
                    </td>
                    <td className="border-y border-white/[0.06] px-3 py-2.5">
                      <span className="rounded border border-white/[0.08] bg-[#131318] px-1.5 py-0.5 text-[10px] text-zinc-200">
                        {c.dominantDialect}
                      </span>
                      <span className="ml-1.5 text-[10px] text-zinc-500">
                        {c.dominantFormat.toUpperCase()}
                      </span>
                    </td>
                    <td className="border-y border-white/[0.06] px-3 py-2.5 text-[#e5a93c]">
                      {c.tierSCount.toLocaleString('pt-BR')}{' '}
                      <span className="text-[10px] opacity-75">({c.tierSPct}%)</span>
                    </td>
                    <td className="border-y border-white/[0.06] px-3 py-2.5 text-zinc-200">
                      {c.raroMaduroCount.toLocaleString('pt-BR')}{' '}
                      <span className="text-[10px] text-zinc-500">({c.raroMaduroPct}%)</span>
                    </td>
                    <td className="border-y border-white/[0.06] px-3 py-2.5 text-zinc-300">
                      {c.raroImaturoCount.toLocaleString('pt-BR')}{' '}
                      <span className="text-[10px] text-zinc-500">({c.raroImaturoPct}%)</span>
                    </td>
                    <td className="border-y border-white/[0.06] px-3 py-2.5 text-zinc-400">
                      P{c.avgPercentile} · MAT {c.avgMaturity}
                    </td>
                    <td className="rounded-r-xl border-y border-r border-white/[0.06] px-3 py-2.5 text-right">
                      {c.raroImaturoCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => onRefinePeriod(c.period)}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/[0.1] bg-[#141418] px-2.5 py-1 text-[10px] text-zinc-200 hover:border-white/25 cursor-pointer"
                        >
                          <Sparkles className="h-2.5 w-2.5 text-[#e5a93c]" />
                          <span>Lapidar ({c.raroImaturoCount.toLocaleString('pt-BR')})</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-zinc-600">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pergunta 2: Deriva Criativa — Ingredientes Adormecidos vs. Em Saturação */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Adormecidos */}
        <section className="rounded-2xl border border-white/[0.07] bg-[#101013] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-2 border-b border-white/[0.06] pb-3">
            <div>
              <span className="section-eyebrow">Ingredientes Adormecidos (Jul/Ago para Out/Nov)</span>
              <p className="mt-0.5 text-[12px] text-zinc-400">
                Tags que você dominava nas primeiras safras e reduziu bruscamente na fase recente, ótimas para reativar.
              </p>
            </div>
            <ArrowDownRight className="h-4 w-4 shrink-0 text-[#e5a93c]" />
          </div>

          <div className="mt-3 space-y-2">
            {data.dormantTags.map((t) => (
              <div
                key={t.tag}
                className="flex flex-col gap-1.5 rounded-xl border border-white/[0.06] bg-[#0b0b0e] p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[12px] font-medium text-zinc-100">
                      {formatTagPt(t.tag)}
                    </span>
                    <span className="tabular-mono shrink-0 rounded border border-white/[0.07] px-1.5 py-0.5 text-[9px] text-zinc-500">
                      {t.axis}
                    </span>
                  </div>
                  <span className="tabular-mono shrink-0 text-[11px] text-[#e5a93c]">
                    {t.deltaPct > 0 ? `+${t.deltaPct}%` : `${t.deltaPct}%`}
                  </span>
                </div>

                <div className="flex items-center justify-between font-mono text-[10px] text-zinc-500">
                  <span>
                    Antes: {t.earlierPct}% ({t.earlierCount.toLocaleString('pt-BR')})
                  </span>
                  <span>
                    Recente: {t.recentPct}% ({t.recentCount.toLocaleString('pt-BR')})
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Saturação */}
        <section className="rounded-2xl border border-white/[0.07] bg-[#101013] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-2 border-b border-white/[0.06] pb-3">
            <div>
              <span className="section-eyebrow">Em Saturação Recente (Out a Nov/26)</span>
              <p className="mt-0.5 text-[12px] text-zinc-400">
                Ingredientes cujo uso cresceu fortemente nas safras recentes, puxando o acervo para padrões repetitivos.
              </p>
            </div>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-zinc-400" />
          </div>

          <div className="mt-3 space-y-2">
            {data.saturatedTags.map((t) => (
              <div
                key={t.tag}
                className="flex flex-col gap-1.5 rounded-xl border border-white/[0.06] bg-[#0b0b0e] p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[12px] font-medium text-zinc-100">
                      {formatTagPt(t.tag)}
                    </span>
                    <span className="tabular-mono shrink-0 rounded border border-white/[0.07] px-1.5 py-0.5 text-[9px] text-zinc-500">
                      {t.axis}
                    </span>
                  </div>
                  <span className="tabular-mono shrink-0 text-[11px] text-zinc-300">
                    +{t.deltaPct}%
                  </span>
                </div>

                <div className="flex items-center justify-between font-mono text-[10px] text-zinc-500">
                  <span>
                    Antes: {t.earlierPct}% ({t.earlierCount.toLocaleString('pt-BR')})
                  </span>
                  <span>
                    Recente: {t.recentPct}% ({t.recentCount.toLocaleString('pt-BR')})
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
