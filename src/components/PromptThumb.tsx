import React, { useEffect, useState } from 'react'

interface PromptThumbProps {
  src: string | null | undefined
  alt: string
  className?: string
  fallbackClassName?: string
  fallbackLabel?: string
  loading?: 'lazy' | 'eager'
  decoding?: 'async' | 'sync' | 'auto'
}

/**
 * Miniatura padrão com fallback neutro garantido no onError (`tile-img-no-onerror`).
 */
export const PromptThumb: React.FC<PromptThumbProps> = ({
  src,
  alt,
  className = 'h-full w-full object-cover',
  fallbackClassName = 'flex h-full w-full items-center justify-center bg-[#121217] font-mono text-[10px] text-zinc-600',
  fallbackLabel = 'Sem imagem',
  loading = 'lazy',
  decoding = 'async',
}) => {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (!src || failed) {
    return <div className={fallbackClassName}>{fallbackLabel}</div>
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      decoding={decoding}
      onError={() => setFailed(true)}
      className={className}
    />
  )
}
