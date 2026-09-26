//
// PRODUÇÃO, NO MOTOR DO IPHONE, SEM GANCHO.
//
// O gancho `window.__roquecraft` é INERTE fora do modo de teste — de propósito.
// Então em produção não dá pra teleportar nem perguntar o estado: só resta
// fotografar o canvas, que é exatamente o que o founder vê.
//
// Este harness existe porque todo print meu até 2026-08-23 saiu de Chromium
// desktop, em qualidade alta, contra o build local. O founder joga no Safari do
// iPhone, em qualidade baixa, contra produção. Três diferenças, nenhuma testada.
import fs from 'node:fs'
import path from 'node:path'
import { webkit, chromium, devices } from 'playwright'
const OUT = path.resolve('scripts/.qa-mobile')
fs.mkdirSync(OUT, { recursive: true })
// A rota do JOGO, não a landing do site — ver `qa-roquecraft-prod.mjs`.
const ALVO = process.argv[2] || 'https://roqueos.com.br/jogar/roquecraft'
const saida = []
for (const c of [
  { nome: 'prod-webkit', motor: webkit, args: [] },
  {
    nome: 'prod-chromium',
    motor: chromium,
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
  },
]) {
  const b = await c.motor.launch({ args: c.args })
  const ctx = await b.newContext({
    ...devices['iPhone 13'],
    serviceWorkers: 'block',
    locale: 'pt-BR',
  })
  const page = await ctx.newPage()
  const erros = []
  page.on('pageerror', (e) => erros.push(`PAGEERROR ${e.message.slice(0, 200)}`))
  page.on('console', (m) => {
    const t = m.text()
    if (/Shader|WebGL|INVALID|not compiled|TypeError|undefined/i.test(t))
      erros.push(t.slice(0, 200))
  })
  try {
    await page.goto(ALVO, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('canvas', { timeout: 60000 })
    // ⚠️ E DEPOIS o menu do JOGO. São dois portões, não um: o botão da landing
    // monta o motor, e aí aparece "Novo mundo / Jogar com amigos / Ajustes".
    // A primeira volta deste harness fotografou o menu por 22 s achando que
    // fotografava o jogo — e o mundo atrás do menu estava perfeito, o que teria
    // me feito concluir "produção está boa" sem nunca ter entrado.
    await page.waitForTimeout(3000)
    const semente = await page.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find(
        (n) => /Semente\s+\d+/.test(n.textContent || '') && n.children.length === 0,
      )
      return el ? el.textContent.trim() : null
    })
    for (const t of ['Novo mundo', 'Continuar', 'Jogar']) {
      const b = page.locator(`text=${t}`).first()
      if (await b.count()) {
        await b.click({ force: true }).catch(() => {})
        break
      }
    }
    await page.waitForTimeout(2000)
    for (const ms of [4000, 8000, 14000, 22000]) {
      await page.waitForTimeout(
        ms === 4000
          ? 4000
          : ms - [4000, 8000, 14000, 22000][[4000, 8000, 14000, 22000].indexOf(ms) - 1],
      )
      await page
        .locator('canvas')
        .first()
        .screenshot({ path: path.join(OUT, `${c.nome}-t${ms}.png`) })
    }
    // olhar pra CIMA: e onde ele diz que o mapa esta
    const cv = await page.locator('canvas').first().boundingBox()
    if (cv) {
      await page.mouse.move(cv.x + cv.width / 2, cv.y + cv.height * 0.6)
      await page.mouse.down()
      await page.mouse.move(cv.x + cv.width / 2, cv.y + cv.height * 0.95, { steps: 12 })
      await page.mouse.up()
      await page.waitForTimeout(2500)
      await page
        .locator('canvas')
        .first()
        .screenshot({ path: path.join(OUT, `${c.nome}-olhando-cima.png`) })
    }
    saida.push({ cenario: c.nome, ok: true, semente, erros: erros.slice(0, 8) })
  } catch (e) {
    saida.push({ cenario: c.nome, erro: e.message.slice(0, 180), erros: erros.slice(0, 8) })
  }
  await b.close()
}
console.log(JSON.stringify(saida, null, 2))
// ⚠️ VEREDITO, não só relato. Sem esta linha a sonda saía com 0 mesmo quando o
// WebKit nem abria — e foi assim que ela ficou "verde" por semanas sem rodar.
const vermelho = saida.some((c) => c.erro || c.erros.some((e) => e.startsWith('PAGEERROR')))
process.exit(vermelho ? 1 : 0)
