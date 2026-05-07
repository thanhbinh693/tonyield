import { useState, useCallback, useRef } from 'react'

export function useToast() {
  const [msg, setMsg]     = useState('')
  const [type, setType]   = useState<'ok' | 'err'>('ok')
  const [show, setShow]   = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const toast = useCallback((message: string, variant: 'ok' | 'err' = 'ok') => {
    clearTimeout(timerRef.current)
    setMsg(message)
    setType(variant)
    setShow(true)
    timerRef.current = setTimeout(() => setShow(false), 2600)
  }, [])

  return { toast, msg, type, show }
}
