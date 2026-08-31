// E2E: проверка загрузки фото в Life OS (Playwright, headless Chromium)
// Запуск из папки life-os: node e2e/food-upload-test.mjs [BASE_URL]
import { chromium } from 'playwright'
import fs from 'node:fs'

const BASE = process.argv[2] || 'https://helpi01.github.io/life-os/'
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
fs.mkdirSync('e2e/shots', { recursive: true })

async function step(page, label, fn) {
  try {
    const r = await fn()
    console.log(`  [OK] ${label}: ${r === undefined ? 'done' : JSON.stringify(r)}`)
  } catch (e) {
    console.log(`  [FAIL] ${label}: ${e.message.split('\n')[0]}`)
    await page.screenshot({ path: `e2e/shots/fail-${label.replace(/\W+/g, '-')}.png` }).catch(() => {})
  }
}

async function run(viewport, label) {
  console.log(`\n===== ${label} (${viewport.width}x${viewport.height}) =====`)
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport })
  const page = await ctx.newPage()
  // Мобильный прогон открывает сразу «Питание» (вкладка сидится из localStorage перед загрузкой)
  if (label === 'mobile') {
    await ctx.addInitScript(() => { localStorage.setItem('lifeos:tab', '"food"') })
  }
  page.on('pageerror', (e) => console.log(`  [PAGEERROR] ${e.message}`))
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(1000)
  console.log(`  URL=${page.url()}`)

  // Первый запуск: настройка блокировки → онбординг
  await step(page, label + '-lock', async () => {
    const pw = page.locator('input[type="password"]').first()
    if (!(await pw.count())) return 'no-password-input'
    await pw.fill('test1234')
    await page.getByRole('button', { name: 'Сохранить доступ' }).click()
    await page.waitForTimeout(500)
    return 'saved'
  })
  await step(page, label + '-onboarding', async () => {
    const later = page.getByRole('button', { name: 'Позже' })
    if (await later.count()) { await later.click(); await page.waitForTimeout(300); return 'skipped' }
    return 'no-onboarding'
  })

  // Открыть «Питание»
  await step(page, label + '-tab', async () => {
    if (viewport.width >= 900) {
      await page.getByRole('button', { name: 'Питание' }).first().click()
      await page.waitForTimeout(500)
    } else {
      const n = await page.locator('.bn-item').count()
      console.log(`  bn-item count=${n}`)
      // mobile: вкладка уже открыта через addInitScript — навигацию не трогаем
    }
    return (await page.locator('h1').first().textContent().catch(() => 'n/a')).trim()
  })

  // Кнопка «Фото»
  await step(page, label + '-foto', async () => {
    await page.getByRole('button', { name: /^Фото$/ }).first().click()
    await page.waitForTimeout(600)
    return {
      sheet: await page.locator('.overlay .scan-zone').isVisible(),
      fotoBtnCount: await page.getByRole('button', { name: /^Фото$/ }).count(),
      makePhoto: await page.getByRole('button', { name: 'Сделать фото' }).count(),
      gallery: await page.getByRole('button', { name: /Выбрать изображение/ }).count(),
      dnd: await page.locator('.dnd-zone').count(),
    }
  })
  await page.screenshot({ path: `e2e/shots/shot-${label}-capture.png` })

  // Подложить файл
  await step(page, label + '-file', async () => {
    await page.setInputFiles('input[type="file"][accept="image/*"]:not([capture="environment"])', {
      name: 'food.png', mimeType: 'image/png', buffer: PNG,
    })
    await page.waitForTimeout(700)
    return {
      preview: await page.locator('.scan-preview').isVisible(),
      chip: (await page.locator('.chip.ok').textContent().catch(() => 'none')).trim(),
      analyzeBtn: await page.getByRole('button', { name: 'Анализировать фото' }).count(),
    }
  })
  await page.screenshot({ path: `e2e/shots/shot-${label}-preview.png` })

  // Анализ без API-ключа → демо-результат без краша
  await step(page, label + '-analyze', async () => {
    await page.getByRole('button', { name: 'Анализировать фото' }).click()
    await page.waitForTimeout(3000)
    return (await page.locator('.result-head').textContent().catch(() => 'none')).trim().replace(/\s+/g, ' ')
  })

  // Добавить в дневник
  await step(page, label + '-add', async () => {
    await page.getByRole('button', { name: /Добавить в дневник/ }).click()
    await page.waitForTimeout(400)
    const food = await page.evaluate(() => JSON.parse(localStorage.getItem('lifeos:food') || '[]'))
    const xp = await page.evaluate(() => localStorage.getItem('lifeos:xp'))
    const xpDaily = await page.evaluate(() => localStorage.getItem('lifeos:xp_daily'))
    return {
      foodCount: food.length,
      lastName: food[0] ? food[0].name : '—',
      xp,
      xpDaily,
    }
  })
  await page.screenshot({ path: `e2e/shots/shot-${label}-result.png` })

  // Повторный выбор того же файла (input сброшен)
  await step(page, label + '-repeat', async () => {
    // Закрыть шторку: «Готово» (результат) или крестик (захват), иначе фон
    const done = page.getByRole('button', { name: 'Готово' })
    if (await done.count()) { await done.first().click() }
    else {
      const close = page.locator('.scan-close').first()
      if (await close.count()) await close.click()
      else await page.locator('.overlay').first().click({ position: { x: 5, y: 5 } })
    }
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: /^Фото$/ }).first().click()
    await page.waitForTimeout(500)
    const values = await page.locator('input[type="file"]').evaluateAll((els) => els.map((e) => e.value))
    return { inputsReset: values.every((v) => v === ''), inputs: values }
  })

  await page.screenshot({ path: `e2e/shots/final-${label}.png`, fullPage: true })
  await browser.close()
}
await run({ width: 390, height: 844 }, 'mobile')
await run({ width: 1280, height: 800 }, 'desktop')

// Краевые случаи: не-изображение и слишком большой файл
console.log('\n===== edge (validation) =====')
const browser = await chromium.launch()
const ctxE = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const pe = await ctxE.newPage()
await pe.goto(BASE, { waitUntil: 'networkidle', timeout: 45000 })
await pe.waitForTimeout(800)
const pwe = pe.locator('input[type="password"]').first()
if (await pwe.count()) {
  await pwe.fill('test1234')
  await pe.getByRole('button', { name: 'Сохранить доступ' }).click()
  await pe.waitForTimeout(400)
}
const le = pe.getByRole('button', { name: 'Позже' })
if (await le.count()) { await le.click(); await pe.waitForTimeout(200) }
await pe.getByRole('button', { name: 'Питание' }).first().click()
await pe.waitForTimeout(400)
await pe.getByRole('button', { name: /^Фото$/ }).first().click()
await pe.waitForTimeout(500)
const sel2 = 'input[type="file"][accept="image/*"]:not([capture="environment"])'
await pe.setInputFiles(sel2, { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
await pe.waitForTimeout(400)
console.log('  non-image error: ' + ((await pe.locator('.lock-err').textContent().catch(() => 'none')) || 'none'))
await pe.setInputFiles(sel2, { name: 'huge.png', mimeType: 'image/png', buffer: Buffer.alloc(16 * 1024 * 1024 + 1, 7) })
await pe.waitForTimeout(400)
console.log('  too-large error: ' + ((await pe.locator('.lock-err').textContent().catch(() => 'none')) || 'none'))
await browser.close()

// Реальный Vision-запрос через агрегатор (ключ читается из локального credentials-файла, не печатается)
console.log('\n===== vision (real API via aggregator) =====')
let VKEY = ''
try {
  const cred = fs.readFileSync('C:\\Users\\Homepc\\.dsh\\.credentials.yaml', 'utf8')
  const m = cred.match(/WORMSOFT_API_KEY\s*[:=]\s*["']?([^"'\s]+)/)
  if (m) VKEY = m[1].trim()
} catch { /* ключ не найден */ }
console.log('  key-loaded=' + (VKEY.length > 0))
if (VKEY) {
  const browserV = await chromium.launch()
  const ctxV = await browserV.newContext({ viewport: { width: 1280, height: 800 } })
  await ctxV.addInitScript((k) => {
    localStorage.setItem('lifeos:ai_vision_provider', '"custom"')
    localStorage.setItem('lifeos:ai_vision_model', '"wormsoft/vision/low"')
    localStorage.setItem('lifeos:ai_text_model', '"wormsoft/agent/low"')
    localStorage.setItem('lifeos:ai_custom_url', '"https://ai.wormsoft.ru/api/gpt"')
    localStorage.setItem('lifeos:ai_keys', JSON.stringify({ vision: k, text: k }))
  }, VKEY)
  const pv = await ctxV.newPage()
  pv.on('pageerror', (e) => console.log(`  [PAGEERROR] ${e.message}`))
  await pv.goto(BASE, { waitUntil: 'networkidle', timeout: 45000 })
  await pv.waitForTimeout(800)
  const pwv = pv.locator('input[type="password"]').first()
  if (await pwv.count()) {
    await pwv.fill('test1234')
    await pv.getByRole('button', { name: 'Сохранить доступ' }).click()
    await pv.waitForTimeout(400)
  }
  const lv = pv.getByRole('button', { name: 'Позже' })
  if (await lv.count()) { await lv.click(); await pv.waitForTimeout(200) }
  await pv.getByRole('button', { name: 'Питание' }).first().click()
  await pv.waitForTimeout(400)
  await pv.getByRole('button', { name: /^Фото$/ }).first().click()
  await pv.waitForTimeout(500)
  await pv.setInputFiles('input[type="file"][accept="image/*"]:not([capture="environment"])', {
    name: 'food.jpg', mimeType: 'image/jpeg', buffer: fs.readFileSync('e2e/shots/input-food.jpg'),
  })
  await pv.waitForTimeout(600)
  console.log('  preview=' + (await pv.locator('.scan-preview').isVisible()))
  await pv.getByRole('button', { name: 'Анализировать фото' }).click()
  let state = 'unknown'
  for (let i = 0; i < 20; i++) {
    await pv.waitForTimeout(3000)
    const head = (await pv.locator('.result-head').textContent().catch(() => '')).trim()
    const errTitle = (await pv.locator('.scan-zone .scan-title').first().textContent().catch(() => '')).trim()
    if (head) { state = 'result:' + head.replace(/\s+/g, ' '); break }
    if (errTitle === 'Не получилось') {
      state = 'error:' + ((await pv.locator('.scan-hint').textContent().catch(() => '')) || '').trim().slice(0, 200)
      break
    }
    state = 'analyzing-' + (i + 1)
  }
  console.log('  final-state: ' + state)
  await pv.screenshot({ path: 'e2e/shots/vision-result.png' })
  const addV = pv.getByRole('button', { name: /Добавить в дневник/ })
  console.log('  add-btn=' + (await addV.count()))
  if (await addV.count()) {
    await addV.click()
    await pv.waitForTimeout(400)
    const foodV = await pv.evaluate(() => JSON.parse(localStorage.getItem('lifeos:food') || '[]'))
    console.log('  saved-food=' + JSON.stringify(foodV[0] || null))
  }
  await browserV.close()
} else {
  console.log('  SKIP: ключ не найден')
}
await browser.close()
console.log('\nDONE')