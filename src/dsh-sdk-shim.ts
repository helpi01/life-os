import { useEffect, useState } from 'react'

// Локальная замена виртуального модуля @dsh-genui/sdk для standalone-сборки:
// обычный useState с сохранением в localStorage, чтобы выборы (тема, вкладка,
// модели ИИ, вес) переживали перезагрузку страницы.
export function useArtifactState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem('lifeos:' + key)
      if (raw !== null) return JSON.parse(raw) as T
    } catch {
      /* ignore */
    }
    return initialValue
  })

  useEffect(() => {
    try {
      localStorage.setItem('lifeos:' + key, JSON.stringify(value))
    } catch {
      /* ignore */
    }
  }, [key, value])

  return [value, setValue, { ready: true, error: null }] as const
}