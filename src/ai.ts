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
    text: 'Ты — диетолог и читатель маркировки. По фото определи блюдо или продукт. Если на фото упаковка (чипсы, батончик, йогурт и т.п.) — прочитай маркировку нетто. Верни ТОЛЬКО JSON без пояснений: {"name": "Название", "kcal_per_100": 525, "protein_per_100": 7, "fat_per_100": 33, "carbs_per_100": 50, "net_g": 135 | null}. КБЖУ — строго на 100 г, целые числа. net_g — масса нетто упаковки в граммах, если видна маркировка, иначе null. Если продукт без маркировки (блюдо на тарелке) — оцени КБЖУ на 100 г по виду и net_g оставь null. Если не уверен в значении — поставь разумную оценку, не пропускай поле.'
  },
  {
    id: 'plan',
    label: 'Составление плана',
    text: 'Ты — продуктивный коуч. Разбей цель человека на план из 6 недель по 4-6 конкретных маленьких задач в каждой. Верни ТОЛЬКО JSON без пояснений: {"weeks": [{"week": "Неделя 1 — Название", "tasks": [{"name": "задача 1"}, {"name": "задача 2"}]}]}. 6 недель, 4-6 задач в неделе, исходя из цели. Шаги конкретные, измеримые, каждое слово ценно. Отвечай на русском.'
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
  {
    id: 'bank',
    label: 'Скриншот банка',
    text: 'Ты — финансовый ассистент. По скриншоту банковского приложения прочитай операции (списания и поступления). Верни ТОЛЬКО JSON без пояснений: {"items": [{"name": "Магазин или получатель", "amount": 350, "cat": "Еда"}]}. amount — всегда положительное целое число в рублях (без знаков минус/плюс, без «₽» и копеек — округляй). cat — ровно одна из категорий: Еда, Транспорт, Жильё, Развлечения, Здоровье, Прочее. Определяй категорию по названию операции. Не выдумывай операции и не пропускай читаемые.',
  },
  {
    id: 'report',
    label: 'Недельный отчёт',
    text: 'Ты — аналитик личной эффективности. По статистике пользователя за последние 7 дней напиши короткий отчёт на русском (до 120 слов, без маркдауна и звёздочек): 1) что получилось; 2) что сорвалось и вероятная причина по данным; 3) две-три конкретные рекомендации на следующую неделю. Не выдумывай цифры сверх данных, которые тебе передали.',
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
