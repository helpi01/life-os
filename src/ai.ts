// ИИ-модуль Life OS: настройки, вызовы моделей и промпты.
// Чистый TypeScript без React; работает с DOM (fetch, FileReader, localStorage).

export type AiSettings = { baseUrl: string; apiKey: string; model: string }

export class AiNotConfigured extends Error {}

// dsh-sdk-shim хранит значения через JSON.stringify — строки лежат с кавычками.
// Здесь распознаём их корректно.
function ls(key: string): string | null {
  const raw = localStorage.getItem(key)
  if (raw === null) return null
  try {
    const v = JSON.parse(raw)
    return typeof v === 'string' ? v : String(v)
  } catch {
    return raw
  }
}
export const PROVIDER_BASE: Record<string, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  deepseek: 'https://api.deepseek.com/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  minimax: 'https://api.minimaxi.com/v1',
}

export function getAiSettings(kind: 'vision' | 'text'): AiSettings {
  const provider =
    ls('lifeos:ai_' + (kind === 'vision' ? 'vision_' : 'text_') + 'provider') ||
    (kind === 'vision' ? 'gemini' : 'deepseek')

  const model =
    ls(kind === 'vision' ? 'lifeos:ai_vision_model' : 'lifeos:ai_text_model') ||
    (kind === 'vision' ? 'gemini-2.5-flash' : 'deepseek-chat')

  let keys: { vision?: string; text?: string } = {}
  try {
    keys = JSON.parse(localStorage.getItem('lifeos:ai_keys') || '{}')
  } catch {
    keys = {}
  }
  const apiKey = (kind === 'vision' ? keys.vision : keys.text) || (kind === 'vision' ? keys.text : keys.vision) || ''

  let baseUrl: string
  if (provider === 'custom') {
    baseUrl = ls('lifeos:ai_custom_url') || ''
  } else {
    baseUrl = PROVIDER_BASE[provider] || ''
  }

  if (!baseUrl) throw new AiNotConfigured('Не задан адрес API: в настройках выбери «Свой агрегатор» и впиши Base URL')
  if (!apiKey) throw new AiNotConfigured('Не вписан API-ключ: открой настройки (шестерёнка сверху) и вставь ключ в любую карточку')
  if (!model) throw new AiNotConfigured('Не выбрана модель: в настройках выбери модель из списка или впиши её вручную')

  return { baseUrl, apiKey, model }
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error || new Error('Не удалось прочитать файл'))
    reader.readAsDataURL(file)
  })
}

export async function chatCompletion(settings: AiSettings, system: string, user: string): Promise<string> {
  const res = await fetch(settings.baseUrl + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + settings.apiKey,
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.3,
    }),
  })

  if (!res.ok) {
    let detail = ''
    try {
      detail = await res.text()
    } catch {
      detail = ''
    }
    throw new Error('Агрегатор ответил с ошибкой ' + res.status + ' — проверь ключ и модель в настройках')
  }

  const json = await res.json()
  const content = json?.choices?.[0]?.message?.content

  if (Array.isArray(content)) {
    return content
      .map((part: any) => (typeof part === 'string' ? part : part?.text || ''))
      .join('')
  }

  return typeof content === 'string' ? content : ''
}

export async function chatVision(
  settings: AiSettings,
  system: string,
  user: string,
  imageDataUrl: string,
): Promise<string> {
  const res = await fetch(settings.baseUrl + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + settings.apiKey,
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            { type: 'text', text: user },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
      temperature: 0.3,
    }),
  })

  if (!res.ok) {
    let detail = ''
    try {
      detail = await res.text()
    } catch {
      detail = ''
    }
    throw new Error('Агрегатор ответил с ошибкой ' + res.status + ' — проверь ключ и модель в настройках')
  }

  const json = await res.json()
  const content = json?.choices?.[0]?.message?.content

  if (Array.isArray(content)) {
    return content
      .map((part: any) => (typeof part === 'string' ? part : part?.text || ''))
      .join('')
  }

  return typeof content === 'string' ? content : ''
}

export async function chatJson<T>(settings: AiSettings, system: string, user: string): Promise<T> {
  const text = await chatCompletion(settings, system, user)
  try {
    return extractJson(text) as T
  } catch {
    throw new Error('ИИ вернул непонятный ответ, попробуй ещё раз')
  }
}

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim())
    } catch {
      // переходим к поиску фигурных скобок
    }
  }

  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1))
    } catch {
      // fall through
    }
  }

  throw new Error('ИИ вернул непонятный ответ')
}

export const PROMPTS: { id: string; label: string; text: string }[] = [
  {
    id: 'receipt',
    label: 'Распознавание чека',
    text: 'Ты — распознаватель чеков. По фотографии чека верни ТОЛЬКО JSON без пояснений: {"store": "Название магазина", "items": [{"name": "Товар", "price": 123}], "total": 123}. Числа — рубли без копеек, округляй вниз. Если что-то не читается, пропускай позицию.',
  },
  {
    id: 'food',
    label: 'Еда по фото',
    text: 'Ты — диетолог. По фото блюда оцени примерную калорийность и БЖУ. Верни ТОЛЬКО JSON без пояснений: {"name": "Название блюда", "kcal": 520, "protein": 40, "fat": 15, "carbs": 55}. Числа — граммы и килокалории.',
  },
  {
    id: 'plan',
    label: 'Составление плана',
    text: 'Ты — продуктивный коуч. Разбей цель человека на план из 4 недель по 2-4 шага в каждой. Верни ТОЛЬКО JSON без пояснений: {"weeks": [{"week": "Неделя 1 · Название", "tasks": ["шаг 1", "шаг 2"]}]}. Шаги конкретные, измеримые, каждое слово ценно. Отвечай на русском.',
  },
  {
    id: 'chat',
    label: 'Чат-ассистент',
    text: 'Ты — личный ИИ-ассистент в приложении Life OS. Отвечай кратко и по делу, на русском. Если спрашивают про расходы, питание, тренировки — помогай советами, но не выдумывай конкретные цифры пользователя.',
  },
  {
    id: 'invest',
    label: 'Сигналы по портфелю',
    text: 'Ты — аналитик портфеля. По списку активов оцени ситуацию и верни ТОЛЬКО JSON без пояснений: {"action": "Покупать" или "Продавать" или "Держать", "confidence": 60, "reason": "Краткое обоснование на русском, 1-2 предложения"}. Не выдумывай конкретные рыночные цены; рассуждай о диверсификации, балансе и рисках общего портфеля.',
  },
]

export function loadPrompts(): Record<string, string> {
  const base: Record<string, string> = {}
  for (const p of PROMPTS) base[p.id] = p.text

  const raw = localStorage.getItem('lifeos:ai_prompts')
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        Object.assign(base, parsed)
      }
    } catch {
      // игнорируем повреждённые данные
    }
  }

  return base
}

export function savePrompt(id: string, text: string): void {
  const current: Record<string, string> = {}
  const raw = localStorage.getItem('lifeos:ai_prompts')
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        Object.assign(current, parsed)
      }
    } catch {
      // начинаем с чистого объекта
    }
  }
  current[id] = text
  localStorage.setItem('lifeos:ai_prompts', JSON.stringify(current))
}

export function resetPrompts(id?: string): void {
  if (id === undefined) {
    localStorage.removeItem('lifeos:ai_prompts')
    return
  }

  const raw = localStorage.getItem('lifeos:ai_prompts')
  if (!raw) return

  let current: Record<string, string> = {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      current = parsed
    }
  } catch {
    return
  }

  delete current[id]
  localStorage.setItem('lifeos:ai_prompts', JSON.stringify(current))
}
