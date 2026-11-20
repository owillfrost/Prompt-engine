import React, { useEffect, useState } from 'react'
import { Check, Database, Download, Lock, RefreshCw, Trash2, X } from 'lucide-react'
import { LAB_PALETTES } from '../utils/themeTokens'
import type { CartographerState, LabPreferences } from '../../hooks/useCartographerProfile'
import type { CorpusOverviewStats, GapDraftRecord, SyncStatusResponse } from '../../types/promptEngine'

interface SettingsViewProps {
  profile: CartographerState
  stats: CorpusOverviewStats | null
  drafts: GapDraftRecord[]
  syncStatus?: SyncStatusResponse | null
  isSyncing?: boolean
  onTriggerSync?: () => void
  onToggleSound: () => void
  onUpdatePreferences: (patch: Partial<LabPreferences>) => void
  onExportProfile: () => void
  onClearLocalData: (alsoClearDrafts: boolean) => Promise<void>
  onOpenSchemaModal: () => void
}

function formatSyncTimestamp(iso: string | null | undefined): string {
  if (!iso) return 'Nunca sincronizado'
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  profile,
  stats,
  drafts,
  syncStatus,
  isSyncing = false,
  onTriggerSync,
  onToggleSound,
  onUpdatePreferences,
  onExportProfile,
  onClearLocalData,
  onOpenSchemaModal,
}) => {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmClosing, setConfirmClosing] = useState(false)
  const [alsoDeleteDrafts, setAlsoDeleteDrafts] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [clearedNotice, setClearedNotice] = useState(false)
  const [exportedNotice, setExportedNotice] = useState(false)

  const closeConfirmModal = () => {
    if (clearing) return
    setConfirmClosing(true)
    window.setTimeout(() => {
      setConfirmOpen(false)
      setConfirmClosing(false)
      setAlsoDeleteDrafts(false)
    }, 170)
  }

  useEffect(() => {
    if (!confirmOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeConfirmModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmOpen, clearing])

  const handleConfirmClear = async () => {
    setClearing(true)
    try {
      await onClearLocalData(alsoDeleteDrafts)
      setClearedNotice(true)
      window.setTimeout(() => setClearedNotice(false), 2600)
      setConfirmClosing(true)
      window.setTimeout(() => {
        setConfirmOpen(false)
        setConfirmClosing(false)
        setAlsoDeleteDrafts(false)
      }, 170)
    } finally {
      setClearing(false)
    }
  }

  const handleExport = () => {
    onExportProfile()
    setExportedNotice(true)
    window.setTimeout(() => setExportedNotice(false), 2000)
  }

  const sources = stats?.sourcesReadOnly ?? []

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-4 sm:p-6">
      <header className="border-b border-border-subtle pb-4">
        <span className="section-eyebrow">Infraestrutura · Preferências &amp; Acervo</span>
        <h1 className="mt-1 text-[20px] font-medium tracking-tight text-ink">
          Configurações
        </h1>
        <p className="mt-1 text-[12px] text-ink-tertiary">
          Preferências locais da estação de trabalho e estado das fontes Read-Only.
        </p>
      </header>

      {/* GRUPO 1: APARÊNCIA */}
      <section aria-labelledby="settings-appearance" className="space-y-3">
        <h2 id="settings-appearance" className="section-eyebrow px-1">
          Aparência
        </h2>

        <div className="club-card divide-y divide-border-subtle px-4">
          <div className="space-y-3 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-medium text-ink">Paleta de cores</div>
                <p className="mt-0.5 text-[12px] text-ink-tertiary">
                  Alterne entre o tema padrão Apple Obsidian e a paleta extra salva no projeto.
                </p>
              </div>
              <span className="tabular-mono rounded-full border border-hairline bg-canvas px-2.5 py-0.5 text-[10px] text-ink-secondary">
                Dark Mode
              </span>
            </div>

            <div
              role="radiogroup"
              aria-label="Paleta de cores"
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            >
              {LAB_PALETTES.map((opt) => {
                const isActive = profile.preferences.palette === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => onUpdatePreferences({ palette: opt.id })}
                    className={[
                      'lab-pressable flex flex-col gap-2.5 rounded-2xl border p-3.5 text-left transition-colors cursor-pointer',
                      isActive
                        ? 'border-brand bg-brand/12 ring-1 ring-inset ring-brand/40'
                        : 'border-hairline bg-canvas hover:border-border-hover hover:bg-surface-hover',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-ink">
                          {opt.name}
                        </span>
                        <span className="shrink-0 rounded-full border border-hairline bg-surface px-2 py-0.5 text-[10px] font-medium text-ink-secondary">
                          {opt.badge}
                        </span>
                      </div>
                      <span
                        aria-hidden="true"
                        className={[
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                          isActive
                            ? 'border-brand bg-brand text-ink'
                            : 'border-hairline bg-surface text-transparent',
                        ].join(' ')}
                      >
                        <Check className="h-3 w-3" />
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5" aria-hidden="true">
                      {opt.swatches.map((hex) => (
                        <span
                          key={hex}
                          className="h-4 w-6 rounded-md border border-white/15"
                          style={{ backgroundColor: hex }}
                          title={hex}
                        />
                      ))}
                    </div>

                    <p className="text-[11px] leading-relaxed text-ink-tertiary">
                      {opt.description}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 py-3.5">
            <div className="min-w-0 flex-1">
              <label htmlFor="settings-density" className="text-[14px] font-medium text-ink">
                Densidade
              </label>
              <p className="mt-0.5 text-[12px] text-ink-tertiary">
                Ajusta o espaçamento das grades de prompts e do Caderno pessoal.
              </p>
            </div>
            <select
              id="settings-density"
              value={profile.preferences.density}
              onChange={(e) =>
                onUpdatePreferences({
                  density: e.target.value === 'compact' ? 'compact' : 'comfortable',
                })
              }
              className="rounded-xl border border-hairline bg-canvas px-3 py-1.5 text-[12px] text-ink-secondary focus:border-border-strong focus:outline-none"
            >
              <option value="comfortable">Confortável</option>
              <option value="compact">Compacta</option>
            </select>
          </div>
        </div>
      </section>

      {/* GRUPO 2: FEEDBACK */}
      <section aria-labelledby="settings-feedback" className="space-y-3">
        <h2 id="settings-feedback" className="section-eyebrow px-1">
          Feedback
        </h2>

        <div className="club-card divide-y divide-border-subtle px-4">
          <div className="flex items-center justify-between gap-4 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium text-ink">Som na revelação</div>
              <p className="mt-0.5 text-[12px] text-ink-tertiary">
                Click ao abrir gap, chime harmônico ao inspecionar Tier S.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={profile.soundEnabled}
              aria-label="Som na revelação"
              onClick={onToggleSound}
              className="lab-switch shrink-0"
            >
              <span className="lab-switch-thumb" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium text-ink">Reduzir animações</div>
              <p className="mt-0.5 text-[12px] text-ink-tertiary">
                Espelha <span className="font-mono text-ink-secondary">prefers-reduced-motion</span> e
                desativa transições decorativas.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={profile.preferences.reducedMotion === 'reduce'}
              aria-label="Reduzir animações"
              onClick={() =>
                onUpdatePreferences({
                  reducedMotion:
                    profile.preferences.reducedMotion === 'reduce' ? 'system' : 'reduce',
                })
              }
              className="lab-switch shrink-0"
            >
              <span className="lab-switch-thumb" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      {/* GRUPO 3: DADOS */}
      <section aria-labelledby="settings-data" className="space-y-3">
        <h2 id="settings-data" className="section-eyebrow px-1">
          Dados
        </h2>

        <div className="club-card divide-y divide-border-subtle px-4">
          {/* Fontes read-only */}
          <div className="space-y-3 py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[14px] font-medium text-ink">Fontes do acervo</div>
                <p className="mt-0.5 text-[12px] text-ink-tertiary">
                  Bibliotecas montadas em modo somente leitura para consulta e decomposição.
                </p>
              </div>
              <span className="tabular-mono inline-flex items-center gap-1 rounded-full border border-hairline bg-canvas px-2.5 py-0.5 text-[11px] text-ink-secondary">
                <Lock className="h-3 w-3 text-ink-tertiary" />
                <span>Read-Only</span>
              </span>
            </div>

            {onTriggerSync ? (
              <div className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-canvas p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={[
                          'tabular-mono inline-flex items-center gap-1.5 text-[12px] font-medium',
                          isSyncing
                            ? 'text-tier-s'
                            : syncStatus?.state === 'error'
                              ? 'text-danger'
                              : syncStatus && !syncStatus.inSync
                                ? 'text-tier-s'
                                : 'text-ink-secondary',
                        ].join(' ')}
                      >
                        {isSyncing
                          ? 'Sincronizando bibliotecas Eagle...'
                          : syncStatus?.state === 'error'
                            ? 'Falha na última sincronização'
                            : syncStatus && !syncStatus.inSync
                              ? `${syncStatus.totalPendingChanges.toLocaleString('pt-BR')} alterações detectadas no Eagle`
                              : syncStatus
                                ? 'Acervo sincronizado'
                                : 'Verificando estado do Eagle...'}
                      </span>
                      {syncStatus?.lastDurationMs ? (
                        <span className="tabular-mono text-[10px] text-ink-muted">
                          ({(syncStatus.lastDurationMs / 1000).toFixed(1)}s)
                        </span>
                      ) : null}
                    </div>
                    <div className="tabular-mono text-[11px] text-ink-muted">
                      Última sincronização: {formatSyncTimestamp(syncStatus?.lastSyncedAt)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onTriggerSync}
                    disabled={isSyncing}
                    className={[
                      'inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-medium transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-60',
                      syncStatus && !syncStatus.inSync
                        ? 'border-tier-s/60 bg-tier-s/12 text-tier-s hover:bg-tier-s/20'
                        : 'border-hairline bg-white/[0.04] text-ink-secondary hover:border-border-hover',
                    ].join(' ')}
                  >
                    <RefreshCw className={['h-3.5 w-3.5', isSyncing ? 'animate-spin' : ''].join(' ')} />
                    <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar acervo'}</span>
                  </button>
                </div>

                {isSyncing && syncStatus?.lastLogLines?.length ? (
                  <div className="max-h-24 overflow-y-auto rounded-lg border border-border-subtle bg-canvas px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ink-tertiary">
                    {syncStatus.lastLogLines.slice(-4).map((line, i) => (
                      <div key={i} className="truncate">
                        {line}
                      </div>
                    ))}
                  </div>
                ) : null}

                {syncStatus?.state === 'error' && syncStatus.lastError ? (
                  <p className="rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-1.5 font-mono text-[11px] text-danger">
                    {syncStatus.lastError}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-1.5 pt-1">
              {sources.map((src) => {
                const libStatus = syncStatus?.libraries.find((l) => l.name === src.name)
                const pendingCount = libStatus
                  ? libStatus.pendingNewCount + libStatus.pendingModifiedCount + libStatus.pendingRemovedCount
                  : 0
                return (
                  <div
                    key={src.name}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-canvas px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-medium text-ink-secondary">{src.name}</div>
                      <div className="truncate font-mono text-[11px] text-ink-muted">{src.path}</div>
                    </div>
                    <div className="tabular-mono flex shrink-0 items-center gap-2 text-[12px] text-ink-secondary">
                      <span>{src.count.toLocaleString('pt-BR')}</span>
                      {pendingCount > 0 ? (
                        <span className="rounded-full border border-tier-s/35 bg-tier-s/10 px-2 py-0.5 text-[10px] text-tier-s">
                          +{pendingCount.toLocaleString('pt-BR')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-ink-tertiary">
                          <Check className="h-3 w-3" />
                          <span>Ativa</span>
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Exportar perfil */}
          <div className="flex flex-wrap items-center justify-between gap-4 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium text-ink">Exportar perfil</div>
              <p className="mt-0.5 text-[12px] text-ink-tertiary">
                Gera um arquivo <span className="font-mono text-ink-secondary">.json</span> com
                identidade, favoritos, coleções e registros do Caderno.
              </p>
            </div>
            <button type="button" onClick={handleExport} className="btn-secondary text-[12px]">
              {exportedNotice ? <Check className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
              <span>{exportedNotice ? 'Exportado' : 'Exportar .JSON'}</span>
            </button>
          </div>

          {/* Ação destrutiva isolada ao final do grupo DADOS */}
          <div className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium text-ink">Limpar dados locais</div>
              <p className="mt-0.5 text-[12px] text-ink-tertiary">
                Remove perfil, {profile.favorites.length} favoritos,{' '}
                {profile.personalCollections.length} coleções e{' '}
                {profile.discoveredGapIds.length} marcações locais deste navegador.
              </p>
              {clearedNotice ? (
                <p className="mt-1 font-mono text-[11px] text-ink-secondary">
                  Dados locais reiniciados.
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="btn-danger text-[12px]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Limpar dados locais</span>
            </button>
          </div>
        </div>
      </section>

      {/* GRUPO 4: SOBRE */}
      <section aria-labelledby="settings-about" className="space-y-3">
        <h2 id="settings-about" className="section-eyebrow px-1">
          Sobre
        </h2>

        <div className="club-card space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[14px] font-medium text-ink">Prompt Engine V1 · Lab</div>
              <p className="tabular-mono mt-0.5 text-[12px] text-ink-tertiary">
                Corpus {(stats?.totalCorpusSize ?? 0).toLocaleString('pt-BR')} prompts · SQLite
                FTS5 · Esquema de 8 atributos
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenSchemaModal}
              className="btn-secondary text-[12px]"
            >
              <Database className="h-3.5 w-3.5" />
              <span>Esquema &amp; definição de Gap</span>
            </button>
          </div>

          <p className="border-t border-border-subtle pt-3 text-[12px] text-ink-tertiary">
            Preferências e favoritos ficam armazenados localmente no navegador; rascunhos de gaps
            são gravados em <span className="font-mono text-ink-secondary">data/gap_drafts.json</span>.
          </p>
        </div>
      </section>

      {/* Modal centralizado de confirmação destrutiva */}
      {confirmOpen ? (
        <div
          data-closing={confirmClosing ? 'true' : 'false'}
          className="gaps-intro-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
          onClick={closeConfirmModal}
        >
          <div
            data-closing={confirmClosing ? 'true' : 'false'}
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar limpeza de dados locais"
            onClick={(e) => e.stopPropagation()}
            className="gaps-intro-panel flex w-full max-w-md flex-col gap-4 rounded-2xl border border-danger/35 bg-surface p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="section-eyebrow text-danger">Ação irreversível</span>
                <h3 className="mt-1 text-[16px] font-medium text-ink">
                  Limpar dados locais?
                </h3>
              </div>
              <button
                type="button"
                onClick={closeConfirmModal}
                disabled={clearing}
                aria-label="Fechar confirmação"
                className="btn-ghost h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-[13px] leading-relaxed text-ink-secondary">
              Isso apaga seus{' '}
              <span className="tabular-mono font-medium text-ink">
                {profile.favorites.length}
              </span>{' '}
              favoritos,{' '}
              <span className="tabular-mono font-medium text-ink">
                {profile.personalCollections.length}
              </span>{' '}
              coleções e{' '}
              <span className="tabular-mono font-medium text-ink">
                {profile.discoveredGapIds.length}
              </span>{' '}
              mapeamentos registrados localmente. Não há como desfazer.
            </p>

            {drafts.length > 0 ? (
              <label className="flex items-start gap-2.5 rounded-xl border border-hairline bg-canvas p-3 text-[12px] text-ink-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={alsoDeleteDrafts}
                  onChange={(e) => setAlsoDeleteDrafts(e.target.checked)}
                  className="mt-0.5 accent-ink"
                />
                <span>
                  Também apagar os{' '}
                  <span className="tabular-mono font-medium text-ink">{drafts.length}</span>{' '}
                  rascunhos salvos em <span className="font-mono">data/gap_drafts.json</span>
                </span>
              </label>
            ) : null}

            <div className="flex items-center justify-end gap-2 border-t border-border-subtle pt-3">
              <button
                type="button"
                onClick={closeConfirmModal}
                disabled={clearing}
                className="btn-secondary text-[12px]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmClear()}
                disabled={clearing}
                className="btn-danger text-[12px]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{clearing ? 'Apagando...' : 'Apagar dados'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
