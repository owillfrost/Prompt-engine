import React, { useMemo, useRef, useState } from 'react'
import { ItemReplica } from './ItemReplica'
import {
  ArrowRight,
  ArrowUpDown,
  Compass,
  Heart,
  Image as ImageIcon,
  LayoutGrid,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'

/**
 * Réplica 1:1 de https://savee.com/search/ (tema dark, viewport 1387x1269).
 * Medidas extraídas via DOM: rail 64px, pills 39px/gap 8, trending cards 196x154,
 * grid 5 colunas com .grid-cell padding 0 6.3% 12.6%, radius 6px, search pill 424x54.
 */

export type ReplicaNavTarget = 'tokens' | 'typography' | 'components' | 'animations'

const C = {
  page: '#0E0E0E',
  primary: '#FDFDFD',
  g300: '#D4D4D4',
  g400: '#A3A3A3',
  g500: '#737373',
  g700: '#404040',
  g800: '#2F2F2F',
  g900: '#1E1E1E',
  g950: '#151515',
  brand: '#3E2DFF',
}

const FILTERS = [
  'Popular', 'Interface Design', 'Branding', 'Web Design', 'Graphic Design', 'Typography',
  'Logo', 'Photography', 'Gradient', 'Motion', 'Website', 'Editorial', 'Portfolio', 'Apple',
]

const TRENDING = [
  { handle: 'ruslan_siiz', saves: '20k', a: '#2a3a2c', b: '#3b2f4a' },
  { handle: 'studio_k', saves: '18k', a: '#4a3b2f', b: '#2f3f4a' },
  { handle: 'monolith', saves: '15k', a: '#3a3a3a', b: '#4a2f3a' },
  { handle: 'type_lab', saves: '12k', a: '#2f4a44', b: '#44402f' },
  { handle: 'ui_craft', saves: '11k', a: '#3f2f4a', b: '#2f4a3a' },
  { handle: 'archive_01', saves: '9k', a: '#4a2f2f', b: '#2f3a4a' },
  { handle: 'render_x', saves: '8k', a: '#33384a', b: '#4a4433' },
]

// padding-bottom % define a proporção de cada card (como no Savee)
const SAVES = Array.from({ length: 40 }, (_, i) => {
  const ratios = [133.241, 75, 100, 150, 66.6, 125, 177.7, 90, 120, 140]
  const hues = [32, 250, 190, 12, 280, 150, 45, 220, 330, 100]
  const h = hues[(i * 3) % hues.length]
  return {
    id: i,
    ratio: ratios[(i * 7 + (i % 3)) % ratios.length],
    bg: `hsl(${h} 18% ${14 + ((i * 5) % 12)}%)`,
    author: ['ruslan_siiz', 'studio_k', 'monolith', 'type_lab', 'ui_craft', 'render_x'][i % 6],
    video: i % 7 === 3,
  }
})

interface Props {
  onNavigate: (t: ReplicaNavTarget) => void
}

export const SearchReplica: React.FC<Props> = ({ onNavigate }) => {
  const [active, setActive] = useState('Popular')
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [columns, setColumns] = useState(5)
  const [padPct, setPadPct] = useState(6.3)
  const [radius, setRadius] = useState(6)
  const [gridOpen, setGridOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [saved, setSaved] = useState<Record<number, boolean>>({})
  const [tip, setTip] = useState<string | null>(null)
  const [view, setView] = useState<'explore' | 'profile'>('explore')
  const [tab, setTab] = useState<'saves' | 'boards'>('saves')
  const [scoped, setScoped] = useState(true)
  const isProfile = view === 'profile'
  const [itemOpen, setItemOpen] = useState(false)
  const onBoards = isProfile && tab === 'boards'
  const inputRef = useRef<HTMLInputElement>(null)

  const cols = useMemo(() => {
    const out: (typeof SAVES)[number][][] = Array.from({ length: columns }, () => [])
    const heights = Array(columns).fill(0)
    SAVES.forEach((s) => {
      const k = heights.indexOf(Math.min(...heights))
      out[k].push(s)
      heights[k] += s.ratio + 12.6
    })
    return out
  }, [columns])

  const RailItem: React.FC<{
    label: string
    h?: number
    onClick?: () => void
    activeItem?: boolean
    children: React.ReactNode
  }> = ({ label, h = 44, onClick, activeItem, children }) => (
    <div className="relative" style={{ height: h }}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        onMouseEnter={() => setTip(label)}
        onMouseLeave={() => setTip(null)}
        className="group/rail absolute inset-0 flex w-16 cursor-pointer items-center justify-center outline-none"
      >
        <span
          className="absolute top-1/2 left-3 h-10 w-10 -translate-y-1/2 rounded-xl transition-colors duration-[180ms] group-hover/rail:bg-[#1E1E1E]"
        />
        <span
          className="relative transition-colors duration-[180ms]"
          style={{ color: activeItem ? C.primary : C.g400 }}
        >
          {children}
        </span>
      </button>
      {tip === label && (
        <span
          className="pointer-events-none absolute top-1/2 left-[58px] z-[1700] origin-left whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium"
          style={{
            backgroundColor: C.g900,
            color: C.primary,
            animation: 'saveeRailPopupIn .4s cubic-bezier(.2,.9,.3,1.15) both',
            transformOrigin: '0',
          }}
        >
          {label}
        </span>
      )}
    </div>
  )

  if (itemOpen) return <ItemReplica onClose={() => setItemOpen(false)} />

  return (
    <div
      className="min-h-screen font-sans antialiased"
      style={{
        backgroundColor: C.page,
        color: C.g300,
        letterSpacing: '-0.16px',
        fontSize: 16,
        lineHeight: '22px',
      }}
    >
      <style>{`
        @keyframes saveeRailPopupIn {
          0% { opacity: 0; transform: translateY(-50%) scale(.4); }
          60% { opacity: 1; transform: translateY(-50%) scale(1.08); }
          100% { opacity: 1; transform: translateY(-50%) scale(1); }
        }
        @keyframes saveeBarRise { 0% { opacity:0; transform: translateY(88px);} 100% { opacity:1; transform:none; } }
        .savee-noscroll::-webkit-scrollbar { display: none; }
        .savee-noscroll { scrollbar-width: none; }
      `}</style>

      {/* ───── Rail (fixed 64px, z 1000) ───── */}
      <nav
        aria-label="Primary"
        className="fixed top-0 left-0 z-[1000] flex h-full w-16 flex-col py-5"
        style={{ backgroundColor: C.page, gap: 6 }}
      >
        <RailItem label="Home" onClick={() => window.location.assign('/')}>
          <span className="flex h-[22px] w-[22px] items-center justify-center text-[13px] font-bold tracking-tighter" style={{ color: C.primary }}>
            SS
          </span>
        </RailItem>

        <div className="my-auto flex flex-col" style={{ gap: 0 }}>
          <RailItem label="Explore" activeItem={!isProfile} onClick={() => setView('explore')}>
            <Compass width={22} height={22} strokeWidth={1.75} />
          </RailItem>
          <RailItem label="Create">
            <Plus width={20} height={20} strokeWidth={1.75} />
          </RailItem>
          <RailItem label="Notifications">
            <Heart width={20} height={20} strokeWidth={1.75} />
          </RailItem>
          <div style={{ height: 6 }} />
          <RailItem label="Profile" onClick={() => setView('profile')}>
            <span
              className="block h-[26px] w-[26px] rounded-full"
              style={{
                background: 'linear-gradient(135deg,#3E46FF,#6B5EFF)',
                boxShadow: isProfile ? `0 0 0 2px ${C.page}, 0 0 0 3.5px ${C.primary}` : undefined,
              }}
            />
          </RailItem>
        </div>

        <div className="flex flex-col">
          {!onBoards && (
            <RailItem label="Multi select" h={40}>
              <LayoutGrid width={20} height={20} strokeWidth={1.75} />
            </RailItem>
          )}
          {!onBoards && (
            <RailItem label="Customize Grid" h={40} onClick={() => setGridOpen((v) => !v)} activeItem={gridOpen}>
              <SlidersHorizontal width={20} height={20} strokeWidth={1.75} />
            </RailItem>
          )}
          <RailItem label="Open menu" h={40} onClick={() => setMenuOpen((v) => !v)} activeItem={menuOpen}>
            <Menu width={20} height={20} strokeWidth={1.75} />
          </RailItem>
        </div>
      </nav>

      {/* Menu popover (z-popover) */}
      {menuOpen && (
        <div
          className="fixed z-[1700] w-56 rounded-xl p-1.5 shadow-2xl"
          style={{
            left: 64,
            bottom: 20,
            backgroundColor: C.g950,
            border: `1px solid ${C.g800}`,
            animation: 'saveeBarRise .18s ease-out both',
          }}
        >
          <div className="px-3 py-2 text-xs" style={{ color: C.g500 }}>
            Design System
          </div>
          {([
            ['tokens', 'Cores & Tokens'],
            ['typography', 'Tipografia'],
            ['components', 'Componentes'],
            ['animations', 'Posição & Animações'],
          ] as [ReplicaNavTarget, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              className="block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm transition-colors duration-[180ms] hover:bg-[#1E1E1E]"
              style={{ color: C.g300 }}
            >
              {label}
            </button>
          ))}
          <a
            href="/"
            className="block rounded-lg px-3 py-2 text-sm transition-colors duration-[180ms] hover:bg-[#1E1E1E]"
            style={{ color: C.g300 }}
          >
            Voltar ao App
          </a>
        </div>
      )}

      {/* ───── Main (padding-left: rail) ───── */}
      <main style={{ paddingLeft: 64 }}>
        {isProfile && (
          <ProfileContent tab={tab} setTab={setTab} />
        )}
        {/* header: mx-10px mt-6 mb-5 */}
        <div style={{ margin: '24px 10px 20px', display: isProfile ? 'none' : undefined }}>
          {/* filter strip */}
          <div className="savee-noscroll flex overflow-x-auto" style={{ gap: 8, margin: '-4px 0', padding: '4px 0' }}>
            {FILTERS.map((f) => {
              const on = f === active
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setActive(f)}
                  className="shrink-0 cursor-pointer rounded-full capitalize transition-colors"
                  style={{
                    padding: '8px 20px',
                    fontSize: 15,
                    lineHeight: 1.4,
                    fontWeight: 500,
                    transitionDuration: '.15s',
                    ...(on
                      ? { backgroundColor: C.primary, color: C.page, border: '1px solid transparent' }
                      : { border: `1px solid ${C.g800}`, color: C.g300 }),
                  }}
                  onMouseEnter={(e) => {
                    if (!on) {
                      e.currentTarget.style.borderColor = '#525252'
                      e.currentTarget.style.color = '#F5F5F5'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!on) {
                      e.currentTarget.style.borderColor = C.g800
                      e.currentTarget.style.color = C.g300
                    }
                  }}
                >
                  {f}
                </button>
              )
            })}
          </div>

          {/* trending users */}
          <div style={{ marginTop: 20 }}>
            <div style={{ paddingBottom: 8, fontSize: 15, color: C.g500, textAlign: 'left' }}>
              Trending users
            </div>
            <div className="savee-noscroll flex overflow-x-auto" style={{ gap: 8, margin: '-4px 0', padding: '4px 0' }}>
              {TRENDING.map((u) => (
                <a
                  key={u.handle}
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="group/user flex shrink-0 flex-col items-center transition-colors"
                  style={{
                    width: 196,
                    borderRadius: 12,
                    padding: '8px 8px 10px',
                    backgroundColor: C.g900,
                    transitionDuration: '.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = C.g800)}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = C.g900)}
                >
                  <div className="flex w-full overflow-hidden" style={{ gap: 2, borderRadius: 8 }}>
                    <div className="flex-1" style={{ height: 76, backgroundColor: u.a }} />
                    <div className="flex-1" style={{ height: 76, backgroundColor: u.b }} />
                  </div>
                  <span
                    className="relative z-10 block rounded-full"
                    style={{
                      width: 40,
                      height: 40,
                      marginTop: -20,
                      background: `linear-gradient(135deg, ${u.a}, ${u.b})`,
                      boxShadow: `0 0 0 3px ${C.g900}, inset 0 0 0 1px rgba(253,253,253,.1)`,
                    }}
                  />
                  <span className="flex items-center" style={{ marginTop: 6, fontSize: 14, lineHeight: 1, color: C.g300 }}>
                    @{u.handle}
                    <svg viewBox="0 0 12 12" width="12" height="12" style={{ marginLeft: 2 }} fill={C.g300}>
                      <circle cx="6" cy="6" r="5" />
                    </svg>
                  </span>
                  <span style={{ marginTop: 4, fontSize: 12, lineHeight: 1, color: C.g500 }}>
                    {u.saves} saves
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* masonry: flex, grid-cell padding 0 6.3% 12.6% */}
        <div className="flex" style={{ margin: '0 -6px', padding: '24px 0 140px', display: isProfile ? 'none' : undefined }}>
          {cols.map((col, ci) => (
            <div key={ci} className="min-w-0 flex-1">
              {col.map((s) => (
                <div
                  key={s.id}
                  className="grid-cell"
                  style={{ padding: `0 ${padPct}% ${padPct * 2}%` }}
                >
                  <div
                    className="group relative cursor-pointer overflow-hidden"
                    onClick={() => setItemOpen(true)}
                    style={{
                      paddingBottom: `${s.ratio}%`,
                      borderRadius: radius,
                      backgroundColor: s.bg,
                    }}
                  >
                    {s.video && (
                      <span className="absolute bottom-2 left-2 rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-white" style={{ background: 'rgba(0,0,0,.5)' }}>
                        VIDEO
                      </span>
                    )}
                    <div
                      className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
                      style={{ background: 'rgba(0,0,0,.3)', borderRadius: radius, transitionDuration: '.18s' }}
                    >
                      <button
                        type="button"
                        aria-label="More options"
                        className="absolute flex cursor-pointer items-center justify-center rounded-full text-white transition-colors hover:bg-[rgba(30,30,30,.3)] hover:backdrop-blur-[4px]"
                        style={{ top: 12, left: 12, width: 26, height: 26 }}
                      >
                        <MoreHorizontal width={16} height={16} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSaved((p) => ({ ...p, [s.id]: !p[s.id] }))
                        }}
                        className="absolute cursor-pointer rounded-full font-medium transition-colors hover:opacity-80"
                        style={{
                          top: 12,
                          right: 12,
                          padding: '8px 14px',
                          fontSize: 14,
                          lineHeight: '20px',
                          backgroundColor: C.primary,
                          color: C.page,
                          letterSpacing: 0,
                        }}
                      >
                        {saved[s.id] ? 'Saved' : 'Save'}
                      </button>
                      <span
                        className="absolute rounded-md px-1 text-xs font-medium text-white"
                        style={{ bottom: 8, right: 8, lineHeight: '23px' }}
                      >
                        @{s.author}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </main>

      {/* ───── Customize Grid dock ───── */}
      {gridOpen && (
        <div className="fixed inset-x-0 bottom-0 z-[1300] flex justify-center px-6 pb-[90px]" style={{ left: 64 }}>
          <div
            className="w-full max-w-[1080px] rounded-[28px] p-6 backdrop-blur-2xl"
            style={{
              backgroundColor: 'rgba(22,22,24,.75)',
              boxShadow: '0 24px 80px rgba(0,0,0,.55)',
              animation: 'saveeBarRise .35s cubic-bezier(.3,0,0,1) both',
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-medium" style={{ color: C.primary }}>Customize Grid</span>
              <button type="button" aria-label="Close grid settings" onClick={() => setGridOpen(false)} className="cursor-pointer" style={{ color: C.g400 }}>
                <X width={18} height={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-8 text-sm">
              {[
                ['Columns', columns, 2, 7, 1, setColumns],
                ['Padding', padPct, 0, 12, 0.3, setPadPct],
                ['Corners', radius, 0, 24, 1, setRadius],
              ].map(([label, val, min, max, step, set]) => (
                <label key={label as string} className="flex flex-col gap-2">
                  <span className="flex justify-between" style={{ color: C.g400 }}>
                    <span>{label as string}</span>
                    <span style={{ color: C.primary }}>{Number(val).toFixed(step === 0.3 ? 1 : 0)}</span>
                  </span>
                  <input
                    type="range"
                    min={min as number}
                    max={max as number}
                    step={step as number}
                    value={val as number}
                    onChange={(e) => (set as (n: number) => void)(Number(e.target.value))}
                    style={{ accentColor: C.primary }}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ───── Bottom bar: fixed bottom 30 left 64 right 0, z 1000 ───── */}
      <div
        className="pointer-events-none fixed right-0 z-[1000]"
        style={{ bottom: 30, left: 64, height: 54 }}
      >
        {!onBoards && <div className="pointer-events-auto relative mx-auto w-full px-3" style={{ maxWidth: 424 }}>
          <div
            className="relative z-30 flex w-full items-center rounded-full"
            style={{
              height: 54,
              padding: '8px 12px',
              gap: 8,
              backgroundColor: 'rgba(30,30,30,.6)',
              backdropFilter: 'blur(50px)',
              WebkitBackdropFilter: 'blur(50px)',
              border: `1.5px solid ${focused ? 'rgba(253,253,253,.25)' : 'transparent'}`,
              transition: 'border-color .35s cubic-bezier(.3,0,0,1)',
            }}
          >
            {isProfile && scoped ? (
              <span
                className="flex shrink-0 items-center rounded-full"
                style={{ height: 34, padding: '2px 12px 2px 6px', gap: 6, marginLeft: -2, backgroundColor: 'rgba(253,253,253,.1)' }}
              >
                <button
                  type="button"
                  aria-label="Clear search scope"
                  onClick={() => setScoped(false)}
                  className="group/chip relative h-6 w-6 cursor-pointer overflow-hidden rounded-full"
                  style={{ background: 'linear-gradient(135deg,#3E46FF,#6B5EFF)' }}
                >
                  <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/chip:opacity-100" style={{ background: C.primary, color: C.page }}>
                    <X width={14} height={14} />
                  </span>
                </button>
                <span style={{ fontSize: 14, lineHeight: 1, color: '#E5E5E5' }}>@ultraprotegido</span>
              </span>
            ) : (
              <Search width={24} height={24} style={{ opacity: 0.5, color: C.primary, flexShrink: 0 }} />
            )}
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={isProfile && scoped ? 'Search your saves' : 'Search for inspiration'}
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[rgba(253,253,253,.7)]"
              style={{ fontSize: 16, lineHeight: '20px', letterSpacing: '-0.01em', color: C.primary }}
            />
            {!(isProfile && scoped) && (
              <div className="flex items-center" style={{ gap: 10 }}>
                <button type="button" aria-label="Search by image" className="cursor-pointer" style={{ opacity: 0.7, color: C.primary }}>
                  <ImageIcon width={20} height={20} />
                </button>
                <button
                  type="button"
                  aria-label="Search by color"
                  className="cursor-pointer rounded-full"
                  style={{
                    width: 20,
                    height: 20,
                    background: 'conic-gradient(#ff3b30,#ff9500,#ffcc00,#34c759,#007aff,#af52de,#ff3b30)',
                  }}
                />
              </div>
            )}
          </div>
        </div>}

        {/* quota pill */}
        <div className="pointer-events-auto absolute bottom-0 left-4">
          <div
            className="flex items-center rounded-full transition-transform duration-500 ease-out hover:scale-[1.05]"
            style={{
              height: 46,
              padding: '8px 8px 8px 12px',
              gap: 10,
              backgroundColor: 'rgba(30,30,30,.6)',
              backdropFilter: 'blur(50px)',
              WebkitBackdropFilter: 'blur(50px)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke={C.g700} strokeWidth="2" />
            </svg>
            <span style={{ fontSize: 12, color: '#FAFAFA', letterSpacing: 0 }}>0/150</span>
            <button
              type="button"
              className="cursor-pointer rounded-full font-medium transition-colors hover:opacity-80"
              style={{
                padding: '8px 16px',
                fontSize: 14,
                lineHeight: 1,
                backgroundColor: C.primary,
                color: C.page,
                letterSpacing: 0,
              }}
            >
              Get Pro
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Réplica de https://savee.com/ultraprotegido/ (header pt-15, avatar 80,
 * h1 28px/500, pill de rewards 46px, tabs h-11 gap-9, empty state).
 */
const ProfileContent: React.FC<{
  tab: 'saves' | 'boards'
  setTab: (t: 'saves' | 'boards') => void
}> = ({ tab, setTab }) => {
  const saves = tab === 'saves'
  return (
    <div style={{ paddingBottom: 140 }}>
      <header className="flex flex-col items-center" style={{ paddingTop: 60 }}>
        <div style={{ paddingTop: 16 }} className="flex flex-col items-center">
          <span
            className="block rounded-full transition-[filter] hover:brightness-75"
            style={{
              width: 80,
              height: 80,
              background: 'linear-gradient(135deg,#3E46FF,#6B5EFF)',
              boxShadow: 'inset 0 0 0 1px rgba(253,253,253,.1)',
            }}
          />
          <h1
            style={{
              marginTop: 12,
              fontSize: 28,
              fontWeight: 500,
              lineHeight: 1.16,
              letterSpacing: -0.8,
              color: '#FAFAFA',
            }}
          >
            Ultra
          </h1>
          <p style={{ marginTop: 8, fontSize: 15, lineHeight: 1.35, color: '#E5E5E5' }}>
            Motion Designer <span style={{ color: C.g500 }}>@</span>{' '}
            <a href="#" onClick={(e) => e.preventDefault()} className="transition-colors hover:text-[#A3A3A3]" style={{ color: C.primary }}>
              Ultra
            </a>
          </p>
          <div className="flex items-center" style={{ marginTop: 12, gap: 7, fontSize: 15, lineHeight: 1, color: C.g500 }}>
            <span><b style={{ fontWeight: 600, color: '#FAFAFA' }}>0</b> Followers</span>
            <span className="rounded-full" style={{ width: 4, height: 4, margin: '0 4px', backgroundColor: C.g500 }} />
            <span><b style={{ fontWeight: 600, color: '#FAFAFA' }}>0</b> Following</span>
          </div>

          {/* rewards glass pill */}
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="group/reward relative flex items-center overflow-hidden rounded-full"
            style={{
              marginTop: 16,
              height: 46,
              padding: '0 12px 0 16px',
              gap: 8,
              fontSize: 14,
              fontWeight: 500,
              color: '#FAFAFA',
              letterSpacing: 0,
              backgroundColor: 'rgba(255,255,255,.08)',
              backdropFilter: 'blur(24px)',
              boxShadow:
                '0 0 0 1px rgba(255,255,255,.12), inset 0 1px 0 rgba(255,255,255,.28), inset 0 -1px 0 rgba(255,255,255,.08), 0 16px 28px -10px rgba(0,0,0,.9)',
            }}
          >
            <span
              className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-[20deg] opacity-0 transition-all group-hover/reward:left-[120%] group-hover/reward:opacity-100"
              style={{
                transitionDuration: '900ms',
                background: 'linear-gradient(to right, transparent, rgba(255,255,255,.25), transparent)',
              }}
            />
            <span className="block rounded-md" style={{ width: 24, height: 24, background: 'linear-gradient(135deg,#FFB800,#FF4D8D)', transform: 'rotate(-8deg)' }} />
            <span className="relative">Share Savee and win rewards</span>
            <ArrowRight width={16} height={16} style={{ opacity: 0.5 }} />
          </a>
        </div>
      </header>

      {/* tabs */}
      <div className="relative" style={{ margin: '16px 10px 0', height: 54, paddingBottom: 14 }}>
        <nav
          aria-label="Profile content"
          className="absolute left-1/2 flex -translate-x-1/2"
          style={{ top: 3, height: 44, gap: 36, transform: 'translate(-50%, 5px)' }}
        >
          {(
            [
              ['saves', 'Saves'],
              ['boards', 'Boards'],
            ] as const
          ).map(([id, label]) => {
            const on = tab === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className="group/tab flex cursor-pointer items-baseline self-center"
                style={{ height: 28, minWidth: 64, gap: 6, fontSize: 20, lineHeight: 1 }}
              >
                <span
                  className="transition-colors"
                  style={{ color: on ? '#FAFAFA' : C.g500, transitionDuration: '.18s' }}
                >
                  {label}
                </span>
                <span style={{ fontSize: 16, color: on ? C.g400 : '#525252' }}>0</span>
              </button>
            )
          })}
        </nav>
        <div className="absolute right-0 flex items-center" style={{ top: 10, gap: 24, color: C.g500 }}>
          {saves && (
            <button type="button" aria-label="Search your saves" className="cursor-pointer transition-colors hover:text-[#FDFDFD]">
              <Search width={20} height={20} />
            </button>
          )}
          <button type="button" aria-label="Sort" className="cursor-pointer transition-colors hover:text-[#FDFDFD]">
            <ArrowUpDown width={20} height={20} />
          </button>
        </div>
      </div>

      {saves ? (
        <div className="flex flex-col items-center" style={{ marginTop: 64 }}>
          <div className="flex flex-col items-center" style={{ maxWidth: 384, gap: 8 }}>
            <div className="relative flex items-center justify-center" style={{ height: 96, width: 120, marginBottom: 8 }}>
              <span className="absolute rounded-lg" style={{ width: 56, height: 72, transform: 'translateX(-52px) rotate(-6deg)', backgroundColor: 'rgba(47,47,47,.6)' }} />
              <span className="absolute z-[1] rounded-lg" style={{ width: 72, height: 96, backgroundColor: C.g800 }} />
              <span className="absolute rounded-lg" style={{ width: 56, height: 64, transform: 'translateX(52px) rotate(6deg)', backgroundColor: 'rgba(47,47,47,.4)' }} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: C.primary, lineHeight: '24px' }}>
              You haven't saved anything yet
            </h2>
            <p style={{ fontSize: 14, color: C.g400, letterSpacing: 0 }}>
              Follow people for ideas, and save what you like.
            </p>
            <button
              type="button"
              className="cursor-pointer rounded-full font-medium transition-colors hover:opacity-80"
              style={{ marginTop: 24, padding: '20px 40px', fontSize: 16, lineHeight: 1, backgroundColor: C.primary, color: C.page, letterSpacing: 0 }}
            >
              Follow some users and start saving
            </button>
          </div>
        </div>
      ) : (
        <div style={{ margin: '0 10px' }}>
          <button
            type="button"
            className="group/new flex cursor-pointer flex-col items-center justify-center transition-colors"
            style={{
              width: 243,
              aspectRatio: '3 / 2',
              borderRadius: 16,
              border: '1px solid rgba(253,253,253,.2)',
              gap: 16,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(253,253,253,.3)'
              e.currentTarget.style.backgroundColor = 'rgba(253,253,253,.03)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(253,253,253,.2)'
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <span className="flex items-center justify-center rounded-full" style={{ width: 40, height: 40, backgroundColor: 'rgba(255,255,255,.05)', color: C.g300 }}>
              <Plus width={20} height={20} />
            </span>
            <span style={{ fontSize: 14, color: C.g400, letterSpacing: 0 }}>New board</span>
          </button>
        </div>
      )}
    </div>
  )
}
