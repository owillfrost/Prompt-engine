import { useCallback, useEffect, useRef, useState } from 'react'
import type { SyncStatusResponse } from '../types/promptEngine'

interface UseCorpusSyncOptions {
  onSyncCompleted?: (status: SyncStatusResponse) => void
}

export function useCorpusSync(options: UseCorpusSyncOptions = {}) {
  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [triggerError, setTriggerError] = useState<string | null>(null)

  const onSyncCompletedRef = useRef(options.onSyncCompleted)
  onSyncCompletedRef.current = options.onSyncCompleted

  const prevStateRef = useRef<SyncStatusResponse['state'] | null>(null)
  const lastFocusRefreshRef = useRef<number>(0)

  const refreshStatus = useCallback(async (): Promise<SyncStatusResponse | null> => {
    try {
      const res = await fetch('/api/sync-status', { cache: 'no-store' })
      if (!res.ok) {
        setLoadingStatus(false)
        return null
      }
      const data = (await res.json()) as SyncStatusResponse
      const prev = prevStateRef.current
      prevStateRef.current = data.state
      setSyncStatus(data)
      setLoadingStatus(false)

      if (prev === 'running' && data.state === 'idle' && !data.lastError) {
        onSyncCompletedRef.current?.(data)
      }
      return data
    } catch {
      setLoadingStatus(false)
      return null
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    const onFocus = () => {
      const now = Date.now()
      if (now - lastFocusRefreshRef.current < 15_000) return
      lastFocusRefreshRef.current = now
      void refreshStatus()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshStatus])

  useEffect(() => {
    if (syncStatus?.state !== 'running') return
    const timer = window.setInterval(() => {
      void refreshStatus()
    }, 1200)
    return () => window.clearInterval(timer)
  }, [syncStatus?.state, refreshStatus])

  const triggerSync = useCallback(async () => {
    setTriggerError(null)
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as SyncStatusResponse
      prevStateRef.current = data.state
      setSyncStatus(data)
      if (data.state === 'idle' && !data.lastError) {
        onSyncCompletedRef.current?.(data)
      }
    } catch (err) {
      setTriggerError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  return {
    syncStatus,
    loadingStatus,
    triggerError,
    isSyncing: syncStatus?.state === 'running',
    refreshStatus,
    triggerSync,
  }
}
