import React, { useEffect, useRef, useState } from 'react'
import { ImageOff } from 'lucide-react'

interface PromptThumbProps {
  src: string | null | undefined
  alt: string
  className?: string
  fallbackClassName?: string
  fallbackLabel?: string
  loading?: 'lazy' | 'eager'
  decoding?: 'async' | 'sync' | 'auto'
  onImageLoad?: (naturalWidth: number, naturalHeight: number) => void
}

/**
 * Miniatura padrão com placeholder sutil e reveal blur→nítido no carregamento.
 */
export const PromptThumb: React.FC<PromptThumbProps> = ({
  src,
  alt,
  className = 'h-full w-full object-cover',
  fallbackClassName = 'flex h-full w-full flex-col items-center justify-center gap-1 bg-surface px-1.5 text-center font-mono text-[10px] text-ink-tertiary',
  fallbackLabel = 'Sem imagem',
  loading = 'lazy',
  decoding = 'async',
  onImageLoad,
}) => {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setFailed(false)
    const img = imgRef.current
    if (img && img.complete && img.naturalWidth > 0) {
      setLoaded(true)
    } else {
      setLoaded(false)
    }
  }, [src])

  if (!src || failed) {
    return (
      <div className={fallbackClassName}>
        {fallbackLabel !== '·' ? (
          <ImageOff className="h-3.5 w-3.5 shrink-0 text-ink-muted/80" aria-hidden="true" />
        ) : null}
        <span className="max-w-full truncate">{fallbackLabel}</span>
      </div>
    )
  }

  return (
    <div className="relative isolate h-full w-full overflow-hidden bg-surface">
      {!loaded ? (
        <span
          aria-hidden="true"
          className="lab-skeleton-shimmer pointer-events-none absolute inset-0"
        />
      ) : null}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading={loading}
        decoding={decoding}
        data-loaded={loaded ? 'true' : 'false'}
        onLoad={(e) => {
          setLoaded(true)
          if (onImageLoad && e.currentTarget.naturalWidth > 0 && e.currentTarget.naturalHeight > 0) {
            onImageLoad(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)
          }
        }}
        onError={() => setFailed(true)}
        className={['lab-thumb-img relative z-[1]', className].join(' ')}
      />
    </div>
  )
}
