import React, { useMemo, useState } from 'react'
import {
  ArrowLeft,
  Check,
  Compass,
  Copy,
  Grid,
  Heart,
  Image as ImageIcon,
  Layers,
  Menu,
  Moon,
  MoreHorizontal,
  Palette,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Type,
  User,
} from 'lucide-react'

import { SearchReplica } from './SearchReplica'

type SectionId = 'feed' | 'tokens' | 'typography' | 'components' | 'animations'

const FILTER_PILLS = [
  'Popular',
  'Interface Design',
  'Branding',
  'Web Design',
  'Graphic Design',
  'Typography',
  'Logo',
  'Photography',
  'Gradient',
  'Motion',
  'Editorial',
  'Portfolio',
]

const SAMPLE_SAVES = [
  { id: '1', title: 'Swiss Grid Poster', handle: '@ruslan_siiz', height: 260, bg: '#262629', isVideo: false },
  { id: '2', title: 'Kinetic Type Study', handle: '@studio_k', height: 190, bg: '#3E46FF', isVideo: true },
  { id: '3', title: 'Brutalist Archive', handle: '@monolith', height: 310, bg: '#1F1F23', isVideo: false },
  { id: '4', title: 'Editorial Spread 04', handle: '@type_lab', height: 220, bg: '#6B5EFF', isVideo: false },
  { id: '5', title: 'Glassmorphic Rail', handle: '@ui_craft', height: 270, bg: '#2C2C32', isVideo: true },
  { id: '6', title: 'Monochrome Print', handle: '@archive_01', height: 200, bg: '#18181B', isVideo: false },
  { id: '7', title: '3D Chrome Object', handle: '@render_x', height: 290, bg: '#32323A', isVideo: false },
  { id: '8', title: 'Minimal Packaging', handle: '@form_nyc', height: 230, bg: '#27272A', isVideo: false },
  { id: '9', title: 'Motion System 02', handle: '@aesth_io', height: 250, bg: '#404048', isVideo: true },
  { id: '10', title: 'Serif Specimen', handle: '@foundry_9', height: 210, bg: '#1C1C20', isVideo: false },
]

const SEMANTIC_TOKENS = [
  { name: 'Page Dark', token: '--color-base-page-dark', hex: '#0E0E0E' },
  { name: 'Primary / Ink', token: '--color-base-black', hex: '#0A0A0A' },
  { name: 'White / Surface', token: '--color-base-white', hex: '#FDFDFD' },
  { name: 'Landing Canvas', token: 'bg-[#F3F3F3]', hex: '#F3F3F3' },
  { name: 'Brand Primary', token: '--color-brand', hex: '#3E46FF' },
  { name: 'Brand Secondary', token: '--color-brand-2', hex: '#6B5EFF' },
  { name: 'Foreground Dark', token: '--color-foreground', hex: '#D4D4D4' },
  { name: 'Muted Dark', token: '--color-gray-800', hex: '#2F2F2F' },
]

export function App() {
  const [section, setSection] = useState<SectionId>('feed')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [activeFilter, setActiveFilter] = useState('Popular')
  const [searchQuery, setSearchQuery] = useState('')
  const [gridOpen, setGridOpen] = useState(false)
  const [columns, setColumns] = useState(5)
  const [gridGap, setGridGap] = useState(16)
  const [cornerRadius, setCornerRadius] = useState(6)
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({})
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [animReplayKey, setAnimReplayKey] = useState(0)

  const isDark = theme === 'dark'
  const bgPage = isDark ? '#0E0E0E' : '#F3F3F3'
  const bgSurface = isDark ? '#151515' : '#FDFDFD'
  const textPrimary = isDark ? '#FDFDFD' : '#0A0A0A'
  const textMuted = isDark ? '#A3A3A3' : '#404040'
  const borderCol = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(10,10,10,0.08)'

  const filteredSaves = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return SAMPLE_SAVES
    return SAMPLE_SAVES.filter(
      (s) => s.title.toLowerCase().includes(q) || s.handle.toLowerCase().includes(q)
    )
  }, [searchQuery])

  const handleCopy = (key: string, value: string) => {
    navigator.clipboard.writeText(value)
    setCopiedKey(key)
    window.setTimeout(() => setCopiedKey((p) => (p === key ? null : p)), 1400)
  }

  if (section === 'feed') {
    return <SearchReplica onNavigate={(t) => setSection(t)} />
  }

  return (
    <div
      className="min-h-screen transition-colors duration-300"
      style={{ backgroundColor: bgPage, color: textPrimary }}
    >
      <style>{`
        @keyframes saveeRailPopupIn {
          0% { opacity: 0; transform: translateY(-50%) scale(0.4); }
          60% { opacity: 1; transform: translateY(-50%) scale(1.08); }
          100% { opacity: 1; transform: translateY(-50%) scale(1); }
        }
        @keyframes saveeImageEntrance {
          0% { opacity: 0; filter: blur(15px); transform: translateY(40px) scale(0.8) rotate(-5deg); }
          100% { opacity: 1; filter: blur(0px); transform: translateY(0) scale(1) rotate(0deg); }
        }
        @keyframes saveeChipIn {
          0% { opacity: 0; transform: translateY(10px) scale(0.9); }
          100% { opacity: 1; transform: none; }
        }
        @keyframes saveeColorPop {
          0% { opacity: 0; transform: scale(0.3); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes saveeFloatDrift {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
      {/* Savee Left Vertical Icon Rail (64px) */}
      <aside
        className="fixed top-0 left-0 z-40 flex h-full w-16 flex-col items-center justify-between border-r py-4"
        style={{ backgroundColor: bgPage, borderColor: borderCol }}
      >
        <div className="flex flex-col items-center gap-3">
          <a
            href="/"
            title="Voltar ao App Principal"
            className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold tracking-tighter transition hover:opacity-80"
            style={{ backgroundColor: textPrimary, color: bgPage }}
          >
            SS
          </a>

          <div className="my-1 h-px w-6" style={{ backgroundColor: borderCol }} />

          {[
            { id: 'feed', label: 'Explore & Grid', icon: Compass },
            { id: 'tokens', label: 'Cores & Tokens', icon: Palette },
            { id: 'typography', label: 'Tipografia', icon: Type },
            { id: 'components', label: 'Componentes', icon: Layers },
            { id: 'animations', label: 'Posição & Animações', icon: Sparkles },
          ].map((item) => {
            const Icon = item.icon
            const active = section === item.id
            return (
              <button
                key={item.id}
                type="button"
                title={item.label}
                onClick={() => setSection(item.id as SectionId)}
                className="flex h-10 w-10 items-center justify-center rounded-full transition cursor-pointer"
                style={{
                  backgroundColor: active
                    ? isDark
                      ? 'rgba(255,255,255,0.12)'
                      : 'rgba(10,10,10,0.08)'
                    : 'transparent',
                  color: active ? textPrimary : textMuted,
                }}
              >
                <Icon className="h-[18px] w-[18px]" />
              </button>
            )
          })}

          <button
            type="button"
            title="Create (+)"
            className="flex h-10 w-10 items-center justify-center rounded-full transition hover:opacity-80 cursor-pointer"
            style={{ color: textMuted }}
          >
            <Plus className="h-[18px] w-[18px]" />
          </button>

          <button
            type="button"
            title="Notifications"
            className="flex h-10 w-10 items-center justify-center rounded-full transition hover:opacity-80 cursor-pointer"
            style={{ color: textMuted }}
          >
            <Heart className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            title="Customize Grid"
            onClick={() => setGridOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full transition cursor-pointer"
            style={{
              backgroundColor: gridOpen ? '#3E46FF' : 'transparent',
              color: gridOpen ? '#FFFFFF' : textMuted,
            }}
          >
            <SlidersHorizontal className="h-[18px] w-[18px]" />
          </button>

          <button
            type="button"
            title="Alternar Tema"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            className="flex h-10 w-10 items-center justify-center rounded-full transition hover:opacity-80 cursor-pointer"
            style={{ color: textMuted }}
          >
            {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </button>

          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold"
            style={{ backgroundColor: '#3E46FF', color: '#FFFFFF' }}
            title="Ultra (@ultraprotegido)"
          >
            <User className="h-4 w-4" />
          </div>

          <button
            type="button"
            title="Open menu"
            className="flex h-10 w-10 items-center justify-center rounded-full transition hover:opacity-80 cursor-pointer"
            style={{ color: textMuted }}
          >
            <Menu className="h-[18px] w-[18px]" />
          </button>
        </div>
      </aside>

      {/* Customize Grid Popover */}
      {gridOpen && (
        <div
          className="fixed bottom-20 left-20 z-50 w-64 rounded-2xl border p-4 shadow-2xl backdrop-blur-2xl"
          style={{
            backgroundColor: isDark ? 'rgba(21,21,21,0.92)' : 'rgba(253,253,253,0.94)',
            borderColor: borderCol,
          }}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold">Customize Grid</span>
            <button
              type="button"
              onClick={() => setGridOpen(false)}
              className="text-[11px] opacity-60 hover:opacity-100 cursor-pointer"
            >
              Close
            </button>
          </div>

          <div className="flex flex-col gap-3 text-xs">
            <label className="flex items-center justify-between gap-2">
              <span style={{ color: textMuted }}>Columns ({columns})</span>
              <input
                type="range"
                min={2}
                max={6}
                value={columns}
                onChange={(e) => setColumns(Number(e.target.value))}
                className="w-28 accent-[#3E46FF]"
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              <span style={{ color: textMuted }}>Padding ({gridGap}px)</span>
              <input
                type="range"
                min={8}
                max={28}
                step={4}
                value={gridGap}
                onChange={(e) => setGridGap(Number(e.target.value))}
                className="w-28 accent-[#3E46FF]"
              />
            </label>
            <label className="flex items-center justify-between gap-2">
              <span style={{ color: textMuted }}>Corners ({cornerRadius}px)</span>
              <input
                type="range"
                min={0}
                max={24}
                value={cornerRadius}
                onChange={(e) => setCornerRadius(Number(e.target.value))}
                className="w-28 accent-[#3E46FF]"
              />
            </label>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="pl-16 pb-28">
        {/* Top Bar */}
        <header
          className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4 backdrop-blur-xl"
          style={{
            backgroundColor: isDark ? 'rgba(14,14,14,0.8)' : 'rgba(243,243,243,0.82)',
            borderColor: borderCol,
          }}
        >
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition hover:opacity-80"
              style={{ borderColor: borderCol, color: textMuted }}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>App</span>
            </a>
            <div>
              <h1 className="text-base font-semibold tracking-tight">
                Savee Design System Playground
              </h1>
              <p className="text-[11px]" style={{ color: textMuted }}>
                Extraído da interface autenticada &amp; landing de savee.com
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                handleCopy(
                  'tokens',
                  `:root {\n  --grid-corner-radius: ${cornerRadius}px;\n  --grid-gap: ${gridGap}px;\n  --color-brand: #3E46FF;\n  --color-brand-2: #6B5EFF;\n}`
                )
              }
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium transition hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: textPrimary, color: bgPage }}
            >
              {copiedKey === 'tokens' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedKey === 'tokens' ? 'Tokens Copiados' : 'Copiar Tokens'}</span>
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-6 pt-6">
          {section === 'feed' && (
            <div className="flex flex-col gap-6">
              {/* Explore Filter Pill Strip */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {FILTER_PILLS.map((pill) => {
                  const active = activeFilter === pill
                  return (
                    <button
                      key={pill}
                      type="button"
                      onClick={() => setActiveFilter(pill)}
                      className="shrink-0 rounded-full px-5 py-2 text-[15px] font-medium leading-[1.4] transition cursor-pointer"
                      style={
                        active
                          ? { backgroundColor: textPrimary, color: bgPage }
                          : {
                              border: `1px solid ${isDark ? '#2F2F2F' : '#DADADA'}`,
                              color: isDark ? '#D4D4D4' : '#404040',
                            }
                      }
                    >
                      {pill}
                    </button>
                  )
                })}
              </div>

              {/* Savee Masonry Grid */}
              <div
                className="grid items-start"
                style={{
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  gap: `${gridGap}px`,
                }}
              >
                {filteredSaves.map((item) => {
                  const isSaved = !!savedIds[item.id]
                  return (
                    <div
                      key={item.id}
                      className="group relative overflow-hidden transition-transform duration-300 ease-out hover:-translate-y-0.5"
                      style={{
                        height: `${item.height}px`,
                        borderRadius: `${cornerRadius}px`,
                        backgroundColor: item.bg,
                      }}
                    >
                      {/* Video Badge */}
                      {item.isVideo && (
                        <span className="absolute bottom-2.5 left-2.5 z-10 rounded bg-black/55 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider text-white backdrop-blur-sm">
                          VIDEO
                        </span>
                      )}

                      {/* Hover Overlay */}
                      <div className="absolute inset-0 flex flex-col justify-between bg-black/35 p-2.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-white transition hover:bg-black/30 hover:backdrop-blur-xs cursor-pointer"
                            title="More options"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setSavedIds((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                            }
                            className="rounded-full bg-[#FDFDFD] px-3.5 py-1 text-xs font-medium text-[#0A0A0A] transition hover:opacity-90 cursor-pointer"
                          >
                            {isSaved ? 'Saved' : 'Save'}
                          </button>
                        </div>

                        <div className="flex items-end justify-between">
                          <span className="text-xs font-medium text-white/95">{item.title}</span>
                          <span className="text-xs font-medium text-white/80">{item.handle}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {section === 'tokens' && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {SEMANTIC_TOKENS.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => handleCopy(t.name, t.hex)}
                  className="flex flex-col overflow-hidden rounded-xl border text-left transition hover:-translate-y-0.5 cursor-pointer"
                  style={{ backgroundColor: bgSurface, borderColor: borderCol }}
                >
                  <div className="h-20 w-full" style={{ backgroundColor: t.hex }} />
                  <div className="p-3">
                    <div className="text-xs font-semibold">{t.name}</div>
                    <div className="mt-0.5 font-mono text-[10px]" style={{ color: textMuted }}>
                      {copiedKey === t.name ? 'Copiado!' : `${t.hex} · ${t.token}`}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {section === 'typography' && (
            <div className="flex flex-col gap-6 rounded-2xl border p-6" style={{ backgroundColor: bgSurface, borderColor: borderCol }}>
              <div>
                <span className="font-mono text-[11px]" style={{ color: textMuted }}>
                  .type-title · 60px · weight 600 · tracking -1.5px
                </span>
                <div className="mt-1 text-4xl font-semibold tracking-[-0.035em] sm:text-6xl">
                  The best place to save inspiration
                </div>
              </div>
              <div>
                <span className="font-mono text-[11px]" style={{ color: textMuted }}>
                  .type-subnav · 21px · weight 500 · tracking -0.63px
                </span>
                <div className="mt-1 text-[21px] font-medium tracking-[-0.63px]">
                  References curated by designers, sorted into boards.
                </div>
              </div>
              <div>
                <span className="font-mono text-[11px]" style={{ color: textMuted }}>
                  body · 16px · weight 400 · lh 1.375 · tracking -0.16px
                </span>
                <p className="mt-1 max-w-2xl text-base leading-[1.375] tracking-[-0.16px]" style={{ color: textMuted }}>
                  Tipografia variável saveeFont com ligaduras ativadas e suavização antialiased.
                </p>
              </div>
            </div>
          )}

          {section === 'components' && (
            <div className="flex flex-col gap-6 rounded-2xl border p-6" style={{ backgroundColor: bgSurface, borderColor: borderCol }}>
              <div>
                <span className="font-mono text-[11px]" style={{ color: textMuted }}>
                  Floating Glassmorphic Pill Navbar (738px × 64px · blur 50px)
                </span>
                <div
                  className="mt-3 flex h-16 max-w-3xl items-center justify-between rounded-full px-6 backdrop-blur-[50px]"
                  style={{
                    backgroundColor: 'rgba(82, 82, 82, 0.3)',
                    boxShadow: '0 18px 70px rgba(0, 0, 0, 0.35)',
                  }}
                >
                  <span className="text-sm font-bold text-white">SAVEE</span>
                  <div className="flex items-center gap-5 text-sm font-medium text-white/70">
                    <span className="hover:text-white cursor-pointer">Features</span>
                    <span className="hover:text-white cursor-pointer">Marketplace</span>
                    <span className="hover:text-white cursor-pointer">MCP</span>
                  </div>
                  <button
                    type="button"
                    className="rounded-full bg-[#FDFDFD] px-4 py-2 text-xs font-medium text-[#0A0A0A] cursor-pointer"
                  >
                    Create your team
                  </button>
                </div>
              </div>
            </div>
          )}

          {section === 'animations' && (
            <div className="flex flex-col gap-6">
              {/* Motion & Keyframes */}
              <div
                className="flex flex-col gap-5 rounded-2xl border p-6"
                style={{ backgroundColor: bgSurface, borderColor: borderCol }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">Keyframes &amp; Curvas de Easing</h2>
                    <p className="text-xs" style={{ color: textMuted }}>
                      Durações base: 0.18s (over), 0.30s (over-long), 0.35s (slide) · Expo: cubic-bezier(.16, 1, .3, 1)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAnimReplayKey((k) => k + 1)}
                    className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition hover:opacity-90 cursor-pointer"
                    style={{ backgroundColor: textPrimary, color: bgPage }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Replay Animações</span>
                  </button>
                </div>

                <div key={animReplayKey} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border p-4" style={{ borderColor: borderCol }}>
                    <div className="font-mono text-[10px]" style={{ color: textMuted }}>
                      image-entrance · 1.5s expo
                    </div>
                    <div
                      className="mt-3 flex h-24 items-center justify-center rounded-lg bg-[#3E46FF] text-xs font-medium text-white"
                      style={{ animation: 'saveeImageEntrance 1.5s cubic-bezier(.16,1,.3,1) forwards' }}
                    >
                      Blur + Rotate + Scale
                    </div>
                  </div>

                  <div className="rounded-xl border p-4" style={{ borderColor: borderCol }}>
                    <div className="font-mono text-[10px]" style={{ color: textMuted }}>
                      chip-in · 0.5s (.32,.72,0,1)
                    </div>
                    <div className="mt-3 flex h-24 items-center justify-center">
                      <span
                        className="rounded-full bg-[#6B5EFF] px-4 py-1.5 text-xs font-medium text-white"
                        style={{ animation: 'saveeChipIn 0.5s cubic-bezier(.32,.72,0,1) backwards' }}
                      >
                        @ultraprotegido
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border p-4" style={{ borderColor: borderCol }}>
                    <div className="font-mono text-[10px]" style={{ color: textMuted }}>
                      color-pop · 0.4s (.34,1.8,.64,1)
                    </div>
                    <div className="mt-3 flex h-24 items-center justify-center gap-2">
                      {['#3E46FF', '#6B5EFF', '#FF3B30', '#34C759'].map((c, idx) => (
                        <span
                          key={c}
                          className="h-6 w-6 rounded-full"
                          style={{
                            backgroundColor: c,
                            animation: `saveeColorPop 0.4s cubic-bezier(.34,1.8,.64,1) ${idx * 70}ms both`,
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border p-4" style={{ borderColor: borderCol }}>
                    <div className="font-mono text-[10px]" style={{ color: textMuted }}>
                      float-drift · 6s ease-in-out
                    </div>
                    <div className="mt-3 flex h-24 items-center justify-center">
                      <div
                        className="rounded-xl border px-4 py-2 text-xs font-medium"
                        style={{
                          borderColor: borderCol,
                          animation: 'saveeFloatDrift 6s ease-in-out infinite',
                        }}
                      >
                        Floating Card
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Z-Index & Positioning Map */}
              <div
                className="flex flex-col gap-4 rounded-2xl border p-6"
                style={{ backgroundColor: bgSurface, borderColor: borderCol }}
              >
                <div>
                  <h2 className="text-sm font-semibold">Escala de Z-Index &amp; Posicionamento</h2>
                  <p className="text-xs" style={{ color: textMuted }}>
                    Rail fixo left-0 (64px) · Bottom bar fixed bottom-[30px] left-16 · Search pill max-w-[424px] h-[54px]
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {[
                    { cls: '.z-index-nav', val: '1000', desc: 'Rail 64px & Bottom Bar' },
                    { cls: '.z-index-grid-settings', val: '1300', desc: 'Customize Grid Dock' },
                    { cls: '.z-index-notifications', val: '1400', desc: 'Notifications Drawer' },
                    { cls: '.z-index-dropdown', val: '1700', desc: 'Context & Rail Menus' },
                    { cls: '.z-index-retractable-bar', val: '1901', desc: 'Slide-in Side Panels' },
                    { cls: '.z-index-overlay', val: '2000', desc: 'Backdrop Scrims' },
                    { cls: '.z-index-modal', val: 'max - 100', desc: 'Dialogs & Modals' },
                    { cls: '.z-index-toast', val: 'max - 50', desc: 'Toasts & Alerts' },
                  ].map((z) => (
                    <div
                      key={z.cls}
                      className="rounded-xl border p-3"
                      style={{ borderColor: borderCol }}
                    >
                      <div className="font-mono text-[11px] font-semibold text-[#6B5EFF]">{z.cls}</div>
                      <div className="mt-0.5 font-mono text-xs">{z.val}</div>
                      <div className="mt-1 text-[11px]" style={{ color: textMuted }}>
                        {z.desc}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Bottom-Left Quota / Upgrade Pill */}
      <div
        className="fixed bottom-5 left-20 z-30 hidden items-center gap-3 rounded-full py-2 pr-2 pl-3.5 backdrop-blur-[50px] sm:flex"
        style={{
          backgroundColor: isDark ? 'rgba(30,30,30,0.72)' : 'rgba(228,228,228,0.82)',
          border: `1px solid ${borderCol}`,
        }}
      >
        <span className="font-mono text-xs font-medium">0 / 150</span>
        <button
          type="button"
          className="rounded-full px-3.5 py-1.5 text-xs font-medium transition hover:opacity-90 cursor-pointer"
          style={{ backgroundColor: textPrimary, color: bgPage }}
        >
          Get Pro
        </button>
      </div>

      {/* Bottom-Center Floating Search Pill */}
      <div className="fixed right-0 bottom-5 left-16 z-30 flex justify-center px-4 pointer-events-none">
        <div
          className="pointer-events-auto flex h-12 w-full max-w-md items-center gap-2 rounded-full border px-4 shadow-2xl backdrop-blur-[50px]"
          style={{
            backgroundColor: isDark ? 'rgba(30,30,30,0.78)' : 'rgba(253,253,253,0.88)',
            borderColor: borderCol,
          }}
        >
          <Search className="h-4 w-4 shrink-0" style={{ color: textMuted }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for inspiration"
            className="w-full bg-transparent text-sm outline-none placeholder:opacity-60"
            style={{ color: textPrimary }}
          />
          <button
            type="button"
            title="Search by image"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition hover:opacity-80 cursor-pointer"
            style={{ color: textMuted }}
          >
            <ImageIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Search by color"
            className="h-5 w-5 shrink-0 rounded-full cursor-pointer"
            style={{
              background:
                'conic-gradient(from 0deg, #ff3b30, #ff9500, #ffcc00, #34c759, #007aff, #af52de, #ff3b30)',
            }}
          />
        </div>
      </div>
    </div>
  )
}
