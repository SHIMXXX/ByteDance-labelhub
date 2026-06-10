import { useEffect, useMemo, useRef, useState } from 'react'

type ResizableTimelinePanelProps = {
  children: React.ReactNode
  className?: string
  minHeight?: number
  maxHeight?: number
  defaultHeight?: number
  storageKey?: string
}

export function ResizableTimelinePanel({
  children,
  className,
  minHeight = 180,
  maxHeight = 520,
  defaultHeight = 280,
  storageKey,
}: ResizableTimelinePanelProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef<{ startY: number; startHeight: number } | null>(null)
  const resolvedDefaultHeight = useMemo(
    () => Math.min(maxHeight, Math.max(minHeight, defaultHeight)),
    [defaultHeight, maxHeight, minHeight],
  )

  const [height, setHeight] = useState<number>(() => {
    if (!storageKey || typeof window === 'undefined') {
      return resolvedDefaultHeight
    }

    const saved = window.localStorage.getItem(storageKey)
    const parsed = saved ? Number(saved) : NaN
    return Number.isFinite(parsed)
      ? Math.min(maxHeight, Math.max(minHeight, parsed))
      : resolvedDefaultHeight
  })

  useEffect(() => {
    setHeight((current) => Math.min(maxHeight, Math.max(minHeight, current)))
  }, [maxHeight, minHeight])

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return
    window.localStorage.setItem(storageKey, String(height))
  }, [height, storageKey])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!dragStateRef.current) return
      const delta = event.clientY - dragStateRef.current.startY
      setHeight(Math.min(maxHeight, Math.max(minHeight, dragStateRef.current.startHeight + delta)))
    }

    const handlePointerUp = () => {
      dragStateRef.current = null
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [maxHeight, minHeight])

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    dragStateRef.current = {
      startY: event.clientY,
      startHeight: rootRef.current?.getBoundingClientRect().height ?? height,
    }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'ns-resize'
  }

  return (
    <div className={className ? `resizable-timeline ${className}` : 'resizable-timeline'} ref={rootRef}>
      <button
        aria-label="调整时间线高度"
        className="resizable-timeline__handle"
        type="button"
        onPointerDown={handlePointerDown}
      >
        <span />
      </button>
      <div className="resizable-timeline__viewport" style={{ height: `${height}px` }}>
        {children}
      </div>
    </div>
  )
}
