import React, { useEffect, useRef, useState } from 'react'
import {
  ArrowUp,
  Check,
  ChevronLeft,
  ExternalLink,
  Info,
  MoreHorizontal,
  PanelRightClose,
  Plus,
  Search,
  X,
} from 'lucide-react'

/**
 * Réplica de https://savee.com/i/<id>/ (dark).
 * Medido: top bar px-6 pt-2.5, stage 720x900 r6, info panel 360px sticky (divisor 1.5px),
 * tabs 14px border-b 1.5px, more-menu 200px r16, swatches 32px com expansão no hover.
 * Save popover e modal de board: aproximação (sessão deslogada no momento da extração).
 */

const C = {
  page: '#0E0E0E',
  primary: '#FDFDFD',
  g50: '#FAFAFA',
  g100: '#F5F5F5',
  g300: '#D4D4D4',
  g400: '#A3A3A3',
  g500: '#737373',
  g600: '#525252',
  g700: '#404040',
  g800: '#2F2F2F',
  g900: '#1E1E1E',
  g950: '#151515',
}

const PALETTE = ['#F2F2F2', '#363434', '#969595']
const TAGS = ['water', 'silver', 'liquid', 'drop', 'water drop', 'dart']
const BOARDS = [
  { name: 'Liquid 3D', count: 214, owner: 'a' },
  { name: 'Chrome & Metal', count: 98, owner: 'b' },
  { name: 'Daily Renders', count: 351, owner: 'c' },
  { name: 'Motion Refs', count: 72, owner: 'd' },
  { name: 'Textures', count: 140, owner: 'e' },
  { name: 'Inspo / Blender', count: 63, owner: 'f' },
]

const RELATED = Array.from({ length: 9 }, (_, i) => ({
  id: i,
  ratio: [133.241, 100, 150, 75, 125, 90, 140, 66.6, 120][i],
  bg: `hsl(${(i * 47) % 360} 14% ${16 + ((i * 4) % 10)}%)`,
}))

const MENU_ITEMS = ['Comments', 'Share', 'Download', 'Find original']

const Overlay: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => (
  <div
    className="fixed inset-0 z-[2000] flex items-center justify-center"
    style={{ backgroundColor: 'rgba(0,0,0,.6)', animation: 'itemFade .18s ease-out both' }}
    onMouseDown={(e) => e.target === e.currentTarget && onClose()}
  >
    {children}
  </div>
)

export const ItemReplica: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [infoOpen, setInfoOpen] = useState(true)
  const [tab, setTab] = useState<'boards' | 'comments'>('boards')
  const [menuOpen, setMenuOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [newBoardOpen, setNewBoardOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [boardQuery, setBoardQuery] = useState('')
  const [comment, setComment] = useState('')
  const [boardName, setBoardName] = useState('')
  const [boardDesc, setBoardDesc] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (newBoardOpen) setNewBoardOpen(false)
      else if (saveOpen) setSaveOpen(false)
      else if (menuOpen) setMenuOpen(false)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [newBoardOpen, saveOpen, menuOpen, onClose])

  const visibleBoards = showAll ? BOARDS : BOARDS.slice(0, 4)
  const filtered = BOARDS.filter((b) => b.name.toLowerCase().includes(boardQuery.toLowerCase()))

  return (
    <div className="relative flex min-h-screen w-full font-sans antialiased" style={{ backgroundColor: C.page, color: C.g300, letterSpacing: '-0.16px' }}>
      <style>{`
        @keyframes itemFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes itemPop { from { opacity: 0; transform: scale(.96) translateY(4px) } to { opacity: 1; transform: none } }
        @keyframes itemInfoIn { from { opacity: 0; transform: translateX(24px) } to { opacity: 1; transform: none } }
      `}</style>

      {/* ───── coluna principal ───── */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {/* top bar */}
        <div style={{ padding: '10px 24px 38px' }}>
          <ul className="flex items-center" style={{ height: 50 }}>
            <li style={{ marginLeft: -11 }}>
              <button type="button" aria-label="Close" onClick={onClose} className="flex cursor-pointer items-center justify-center rounded-full transition-colors hover:text-[#FDFDFD]" style={{ width: 32, height: 32, color: C.g500 }}>
                <ChevronLeft width={32} height={32} strokeWidth={1.125} />
              </button>
            </li>

            <li style={{ marginLeft: 12 }}>
              <div className="inline-flex items-center" style={{ minHeight: 44 }}>
                {['#3E46FF', '#6B5EFF', '#FF6B6B', '#34C759', '#FFB800'].map((c, i) => (
                  <span key={c} className="block rounded-full" style={{ width: 28, height: 28, backgroundColor: c, border: `2px solid ${C.page}`, marginLeft: i ? -10 : 0 }} />
                ))}
                <span className="rounded-full text-xs" style={{ marginLeft: 6, color: C.g400 }}>+ 71</span>
              </div>
            </li>

            <li className="ml-auto" style={{ marginLeft: 'auto' }}>
              <button
                type="button"
                onClick={() => setSaveOpen(true)}
                className="cursor-pointer rounded-full font-medium transition-colors hover:opacity-80"
                style={{ padding: '10px 20px', fontSize: 14, lineHeight: '20px', backgroundColor: C.primary, color: C.page, letterSpacing: 0 }}
              >
                Save
              </button>
            </li>

            <li className="relative" ref={menuRef}>
              <button type="button" aria-label="More options" onClick={() => setMenuOpen((v) => !v)} className="flex cursor-pointer items-center justify-center transition-colors hover:text-[#FDFDFD]" style={{ margin: '16px 2px 2px', width: 20, height: 20, color: menuOpen ? C.primary : C.g500, alignSelf: 'flex-start' }}>
                <MoreHorizontal width={20} height={20} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-[1699]" onClick={() => setMenuOpen(false)} />
                  <div
                    className="absolute z-[1700] min-w-[200px] shadow-lg"
                    style={{
                      top: 48,
                      right: -4,
                      width: 200,
                      padding: '10px 6px',
                      borderRadius: 16,
                      backgroundColor: 'rgba(30,30,30,.8)',
                      border: '1px solid rgba(253,253,253,.1)',
                      backdropFilter: 'blur(50px)',
                      WebkitBackdropFilter: 'blur(50px)',
                      animation: 'itemFade .18s ease-out both',
                    }}
                  >
                    {MENU_ITEMS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setMenuOpen(false)
                          if (m === 'Comments') {
                            setInfoOpen(true)
                            setTab('comments')
                          }
                        }}
                        className="block w-full cursor-pointer text-left transition-colors hover:bg-[rgba(250,250,250,.1)]"
                        style={{ height: 34, padding: '6px 10px', borderRadius: 10, fontSize: 14, color: C.primary, letterSpacing: 0 }}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </li>

            {!infoOpen && (
              <li style={{ marginLeft: 24 }}>
                <button type="button" aria-label="Info" onClick={() => setInfoOpen(true)} className="flex cursor-pointer items-center justify-center transition-colors hover:text-[#FDFDFD]" style={{ marginTop: 14, width: 24, height: 36, color: C.g500 }}>
                  <Info width={22} height={22} strokeWidth={1.5} />
                </button>
              </li>
            )}
          </ul>
        </div>

        {/* stage */}
        <div className="flex justify-center" style={{ padding: '0 24px' }}>
          <div
            className="relative overflow-hidden"
            style={{
              width: 720,
              maxWidth: '100%',
              height: 900,
              borderRadius: 6,
              background: 'radial-gradient(circle at 50% 38%, #F2F2F2 0%, #969595 38%, #363434 78%)',
              transition: 'transform .35s cubic-bezier(.3,0,0,1)',
            }}
          >
            <div className="absolute left-1/2 top-[34%] -translate-x-1/2" style={{ width: 150, height: 210, borderRadius: '50% 50% 50% 50% / 62% 62% 38% 38%', background: 'radial-gradient(circle at 35% 30%, #fff, #bfc3c8 45%, #6d7075)', boxShadow: '0 40px 60px -20px rgba(0,0,0,.5)' }} />
          </div>
        </div>

        {/* related grid */}
        <div className="flex" style={{ margin: '48px 0 0', padding: '0 0 80px' }}>
          {[0, 1, 2, 3, 4].map((ci) => (
            <div key={ci} className="min-w-0 flex-1">
              {RELATED.filter((_, i) => i % 5 === ci).map((r) => (
                <div key={r.id} style={{ padding: '0 6.3% 12.6%' }}>
                  <div style={{ paddingBottom: `${r.ratio}%`, borderRadius: 6, backgroundColor: r.bg }} />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="mx-auto flex flex-col items-center pb-20" style={{ gap: 16 }}>
          <span style={{ fontSize: 24, fontWeight: 600, color: C.primary, letterSpacing: -0.5 }}>Join to see more saves</span>
        </div>
      </div>

      {/* ───── info panel ───── */}
      {infoOpen && (
        <aside
          className="sticky top-0 z-[1600] flex shrink-0 flex-col overflow-hidden"
          style={{ width: 360, height: 'calc(97vh - 24px)', backgroundColor: C.page, paddingLeft: 1.5, animation: 'itemInfoIn .35s cubic-bezier(.3,0,0,1) both' }}
        >
          <span className="absolute bottom-0 left-0 top-5" style={{ width: 1.5, backgroundColor: C.g800 }} />
          <button type="button" aria-label="Hide info panel" onClick={() => setInfoOpen(false)} className="absolute z-10 cursor-pointer transition-colors hover:text-[#FDFDFD]" style={{ top: 24, right: 24, color: C.g500 }}>
            <PanelRightClose width={18} height={18} />
          </button>

          <div className="flex-1 overflow-y-auto" style={{ padding: '24px 24px 0' }}>
            <a href="#" onClick={(e) => e.preventDefault()} className="inline-flex items-center" style={{ gap: 4, fontSize: 14, color: C.g50, borderBottom: `1px solid ${C.g400}`, height: 25, letterSpacing: 0 }}>
              instagram.com <ExternalLink width={14} height={14} style={{ color: C.g400 }} />
            </a>
            <p className="line-clamp-3 overflow-hidden" style={{ marginTop: 6, paddingRight: 18, height: 66, color: C.g500, fontSize: 14, lineHeight: '22px' }}>
              day 1797 - water drop // #m0studio #dailyrender #everydays #3dart #blender
            </p>

            <div className="flex items-center" style={{ paddingTop: 12, fontSize: 12, letterSpacing: '-0.02em', color: C.g600 }}>
              <span className="mr-2 block rounded-full" style={{ width: 20, height: 20, background: 'linear-gradient(135deg,#3E46FF,#6B5EFF)' }} />
              <span>3d ago</span>
              <span className="ml-auto flex" style={{ gap: 16 }}>
                <span>76 saves</span>
                <span>311 views</span>
              </span>
            </div>

            {/* palette */}
            <div className="group/colors flex items-center" style={{ marginTop: 20, paddingLeft: 12, height: 40 }}>
              {PALETTE.map((hex, i) => (
                <button
                  key={hex}
                  type="button"
                  title={`Search ${hex}`}
                  onClick={() => {
                    navigator.clipboard?.writeText(hex)
                    setCopied(hex)
                    window.setTimeout(() => setCopied(null), 1200)
                  }}
                  className="group/sw relative cursor-pointer rounded-full group-hover/colors:!ml-1.5 hover:!w-[100px]"
                  style={{
                    height: 32,
                    width: 32,
                    marginLeft: i ? -12 : 0,
                    backgroundColor: hex,
                    zIndex: 3 - i,
                    boxShadow: `0 0 0 3px ${C.page}`,
                    transition: 'all .35s cubic-bezier(.25,1,.5,1)',
                  }}
                >
                  <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-medium opacity-0 transition-opacity group-hover/sw:opacity-100" style={{ color: i === 1 ? '#fff' : '#111' }}>
                    {copied === hex ? 'copied' : hex}
                  </span>
                </button>
              ))}
            </div>

            {/* tags */}
            <div className="flex flex-wrap" style={{ marginTop: 16, gap: 8 }}>
              {TAGS.map((t) => (
                <a
                  key={t}
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="flex items-center rounded-full hover:!bg-transparent"
                  style={{ height: 32, padding: '0 12px', fontSize: 12, color: C.g100, backgroundColor: C.g900, transition: 'all .3s cubic-bezier(.22,1,.36,1)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.boxShadow = `0 0 0 1px ${C.g700}`)}
                  onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
                >
                  {t}
                </a>
              ))}
            </div>

            {/* tabs */}
            <div className="flex" style={{ marginTop: 24 }}>
              {(
                [
                  ['boards', 'All boards', '11'],
                  ['comments', 'Comments', ''],
                ] as const
              ).map(([id, label, n]) => {
                const on = tab === id
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className="flex-1 cursor-pointer transition-colors"
                    style={{ paddingTop: 4, paddingBottom: 10, fontSize: 14, letterSpacing: 0, borderBottom: `1.5px solid ${on ? C.primary : 'transparent'}`, color: on ? C.primary : C.g500, transitionDuration: '.18s' }}
                  >
                    {label} {n && <span style={{ color: C.g600 }}>{n}</span>}
                  </button>
                )
              })}
            </div>

            {tab === 'boards' ? (
              <div style={{ paddingTop: 8, paddingBottom: 24 }}>
                {visibleBoards.map((b) => (
                  <a
                    key={b.name}
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    className="group/b flex items-center hover:bg-[#1E1E1E]"
                    style={{ height: 40, borderRadius: 8, padding: '6px 12px 6px 6px', gap: 10, transition: 'background-color .18s' }}
                  >
                    <span className="grid shrink-0 grid-cols-2 overflow-hidden" style={{ width: 28, height: 28, borderRadius: 2, gap: 1, backgroundColor: C.g800 }}>
                      <span style={{ backgroundColor: '#3a3a42', gridRow: 'span 2' }} />
                      <span style={{ backgroundColor: '#4a4a52' }} />
                      <span style={{ backgroundColor: '#2c2c32' }} />
                    </span>
                    <span className="min-w-0 flex-1 truncate transition-colors group-hover/b:text-[#FDFDFD]" style={{ fontSize: 14, color: C.g500, letterSpacing: 0 }}>{b.name}</span>
                    <span style={{ fontSize: 12, color: C.g600 }}>{b.count}</span>
                    <span className="block rounded-full" style={{ width: 20, height: 20, background: 'linear-gradient(135deg,#444,#777)' }} />
                  </a>
                ))}
                {!showAll && (
                  <button type="button" onClick={() => setShowAll(true)} className="w-full cursor-pointer rounded-lg text-left transition-colors hover:bg-[#1E1E1E] hover:text-[#FDFDFD]" style={{ height: 36, padding: '0 8px', fontSize: 14, color: C.g500, letterSpacing: 0 }}>
                    Show 6 more
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center" style={{ height: 200, gap: 4 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: C.primary }}>No comments yet</span>
                <span style={{ fontSize: 14, color: C.g500, letterSpacing: 0 }}>Be the first to comment.</span>
              </div>
            )}
          </div>

          {tab === 'comments' && (
            <div style={{ padding: '12px 24px 20px' }}>
              <div className="flex items-center" style={{ height: 48, borderRadius: 999, padding: '0 6px 0 16px', backgroundColor: C.g900 }}>
                <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add your comment" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#737373]" style={{ color: C.primary, letterSpacing: 0 }} />
                <button type="button" aria-label="Send" className="flex cursor-pointer items-center justify-center rounded-full transition-opacity" style={{ width: 36, height: 36, backgroundColor: comment ? C.primary : C.g800, color: comment ? C.page : C.g500 }}>
                  <ArrowUp width={18} height={18} />
                </button>
              </div>
            </div>
          )}
        </aside>
      )}

      {/* ───── Save popover (aproximação) ───── */}
      {saveOpen && (
        <>
          <div className="fixed inset-0 z-[2000]" onClick={() => setSaveOpen(false)} />
          <div
            className="fixed z-[2001] flex flex-col"
            style={{
              top: 66,
              right: infoOpen ? 396 : 24,
              width: 300,
              maxHeight: 420,
              borderRadius: 16,
              padding: 8,
              backgroundColor: 'rgba(30,30,30,.8)',
              border: '1px solid rgba(253,253,253,.1)',
              backdropFilter: 'blur(50px)',
              WebkitBackdropFilter: 'blur(50px)',
              boxShadow: '0 24px 80px rgba(0,0,0,.55)',
              transformOrigin: 'top right',
              animation: 'itemPop .18s ease-out both',
            }}
          >
            <div className="flex items-center" style={{ height: 40, borderRadius: 10, padding: '0 12px', gap: 8, backgroundColor: 'rgba(253,253,253,.06)' }}>
              <Search width={16} height={16} style={{ color: C.g500 }} />
              <input autoFocus value={boardQuery} onChange={(e) => setBoardQuery(e.target.value)} placeholder="Search boards" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#737373]" style={{ color: C.primary, letterSpacing: 0 }} />
            </div>
            <div className="mt-1 flex-1 overflow-y-auto">
              {filtered.map((b) => {
                const on = !!picked[b.name]
                return (
                  <button
                    key={b.name}
                    type="button"
                    onClick={() => setPicked((p) => ({ ...p, [b.name]: !p[b.name] }))}
                    className="flex w-full cursor-pointer items-center text-left transition-colors hover:bg-[rgba(250,250,250,.1)]"
                    style={{ height: 44, borderRadius: 10, padding: '0 10px', gap: 10 }}
                  >
                    <span className="grid shrink-0 grid-cols-2 overflow-hidden" style={{ width: 28, height: 28, borderRadius: 4, gap: 1, backgroundColor: C.g800 }}>
                      <span style={{ backgroundColor: '#3a3a42', gridRow: 'span 2' }} />
                      <span style={{ backgroundColor: '#4a4a52' }} />
                      <span style={{ backgroundColor: '#2c2c32' }} />
                    </span>
                    <span className="min-w-0 flex-1 truncate" style={{ fontSize: 14, color: C.primary, letterSpacing: 0 }}>{b.name}</span>
                    {on && <Check width={16} height={16} style={{ color: C.primary }} />}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                setSaveOpen(false)
                setNewBoardOpen(true)
              }}
              className="flex w-full cursor-pointer items-center transition-colors hover:bg-[rgba(250,250,250,.1)]"
              style={{ height: 44, borderRadius: 10, padding: '0 10px', gap: 10, marginTop: 4, borderTop: '1px solid rgba(253,253,253,.08)' }}
            >
              <span className="flex items-center justify-center" style={{ width: 28, height: 28, borderRadius: 999, backgroundColor: 'rgba(255,255,255,.08)', color: C.g300 }}>
                <Plus width={16} height={16} />
              </span>
              <span style={{ fontSize: 14, color: C.primary, letterSpacing: 0 }}>New board</span>
            </button>
          </div>
        </>
      )}

      {/* ───── New board / Board settings modal (aproximação) ───── */}
      {newBoardOpen && (
        <Overlay onClose={() => setNewBoardOpen(false)}>
          <div style={{ width: 440, maxWidth: 'calc(100vw - 32px)', borderRadius: 24, padding: 28, backgroundColor: C.g950, border: `1px solid ${C.g800}`, boxShadow: '0 24px 80px rgba(0,0,0,.55)', animation: 'itemPop .2s cubic-bezier(.16,1,.3,1) both' }}>
            <div className="flex items-center justify-between">
              <h3 style={{ fontSize: 21, fontWeight: 500, letterSpacing: -0.63, color: C.primary }}>New board</h3>
              <button type="button" aria-label="Close" onClick={() => setNewBoardOpen(false)} className="cursor-pointer transition-colors hover:text-[#FDFDFD]" style={{ color: C.g500 }}>
                <X width={20} height={20} />
              </button>
            </div>

            <label className="mt-6 block">
              <span style={{ fontSize: 13, color: C.g400 }}>Name</span>
              <input value={boardName} onChange={(e) => setBoardName(e.target.value)} placeholder="e.g. Liquid 3D" className="mt-1.5 w-full outline-none transition-colors placeholder:text-[#525252] focus:border-[#525252]" style={{ height: 48, borderRadius: 12, padding: '0 16px', fontSize: 15, color: C.primary, backgroundColor: C.g900, border: `1px solid ${C.g800}`, letterSpacing: 0 }} />
            </label>
            <label className="mt-4 block">
              <span style={{ fontSize: 13, color: C.g400 }}>Description</span>
              <textarea value={boardDesc} onChange={(e) => setBoardDesc(e.target.value)} rows={3} placeholder="What is this board about?" className="mt-1.5 w-full resize-none outline-none transition-colors placeholder:text-[#525252] focus:border-[#525252]" style={{ borderRadius: 12, padding: '12px 16px', fontSize: 15, color: C.primary, backgroundColor: C.g900, border: `1px solid ${C.g800}`, letterSpacing: 0 }} />
            </label>

            <button type="button" onClick={() => setIsPrivate((v) => !v)} className="mt-5 flex w-full cursor-pointer items-center justify-between text-left">
              <span>
                <span className="block" style={{ fontSize: 15, color: C.primary }}>Private board</span>
                <span className="block" style={{ fontSize: 13, color: C.g500 }}>Only you can see this board.</span>
              </span>
              <span className="relative block rounded-full" style={{ width: 44, height: 26, backgroundColor: isPrivate ? C.primary : C.g800, transition: 'background-color .18s' }}>
                <span className="absolute block rounded-full" style={{ top: 3, left: 3, width: 20, height: 20, backgroundColor: isPrivate ? C.page : C.g400, transform: `translateX(${isPrivate ? 18 : 0}px)`, transition: 'transform .35s cubic-bezier(.3,0,0,1)' }} />
              </span>
            </button>

            <div className="mt-7 flex justify-end" style={{ gap: 8 }}>
              <button type="button" onClick={() => setNewBoardOpen(false)} className="cursor-pointer rounded-full transition-colors hover:bg-[#2F2F2F]" style={{ padding: '14px 24px', fontSize: 14, lineHeight: 1, backgroundColor: C.g900, color: C.g300, letterSpacing: 0 }}>
                Cancel
              </button>
              <button type="button" disabled={!boardName.trim()} onClick={() => setNewBoardOpen(false)} className="cursor-pointer rounded-full font-medium transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40" style={{ padding: '14px 24px', fontSize: 14, lineHeight: 1, backgroundColor: C.primary, color: C.page, letterSpacing: 0 }}>
                Create board
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  )
}
