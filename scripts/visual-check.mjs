// Post-build sanity probes: canvas pixels at expected spots + DOM layout audit.
// Usage: npm run build && npm run preview (on :4173), then `node scripts/visual-check.mjs`
import { chromium } from '@playwright/test'
import { inflateSync } from 'node:zlib'

const URL = 'http://localhost:4173/'
let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures += 1
}

/** Minimal PNG decoder for Chromium screenshots (8-bit RGB/RGBA, non-interlaced). */
function decodePng(buf) {
  let pos = 8 // signature
  let width = 0
  let height = 0
  let colorType = 0
  let bitDepth = 0
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    pos += 12 + len
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`unsupported png: depth=${bitDepth} color=${colorType}`)
  }
  const bpp = colorType === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * bpp
  const out = Buffer.alloc(stride * height)
  let src = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw[src]
    src += 1
    const row = raw.subarray(src, src + stride)
    src += stride
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null
    const cur = out.subarray(y * stride, (y + 1) * stride)
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? cur[x - bpp] : 0
      const b = prev ? prev[x] : 0
      const c = x >= bpp && prev ? prev[x - bpp] : 0
      let v = row[x]
      if (filter === 1) v = (v + a) & 0xff
      else if (filter === 2) v = (v + b) & 0xff
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 0xff
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff
      }
      cur[x] = v
    }
  }
  return {
    width,
    height,
    at(x, y) {
      const i = (y * width + x) * bpp
      return [out[i], out[i + 1], out[i + 2]]
    },
  }
}

const browser = await chromium.launch()

for (const vp of [
  { name: 'phone', width: 393, height: 852 },
  { name: 'tablet', width: 1138, height: 712 },
]) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(URL)
  await page.getByRole('button', { name: 'Theodore' }).click()
  await page.locator('[data-scene="island"][data-scene-ready="true"]').waitFor()

  // --- DOM layout audit ---
  const audit = await page.evaluate(() => {
    const r = (sel) => document.querySelector(sel)?.getBoundingClientRect()
    const header = r('.home-header')
    const island = r('.island-wrap')
    const cards = [...document.querySelectorAll('.quest-card')].map((c) => {
      const b = c.getBoundingClientRect()
      return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }
    })
    const canvas = document.querySelector('.island-wrap canvas')
    const cb = canvas?.getBoundingClientRect()
    const btns = [...document.querySelectorAll('button')].map((b) => {
      const x = b.getBoundingClientRect()
      return { name: b.textContent?.slice(0, 20), w: x.width, h: x.height }
    })
    return {
      vw: innerWidth,
      headerBottom: header?.bottom ?? 0,
      islandTop: island?.top ?? 0,
      canvasW: cb?.width ?? 0,
      canvasH: cb?.height ?? 0,
      cards,
      btns,
      scrollW: document.documentElement.scrollWidth,
    }
  })
  check(`${vp.name}: no horizontal overflow`, audit.scrollW <= audit.vw + 1, `scrollW=${audit.scrollW} vw=${audit.vw}`)
  check(`${vp.name}: island below header`, audit.islandTop >= audit.headerBottom - 1)
  check(`${vp.name}: canvas fills wrap`, audit.canvasW > 100 && audit.canvasH > 100, `${Math.round(audit.canvasW)}x${Math.round(audit.canvasH)}`)
  const cardsFit = audit.cards.every((c) => c.bottom <= vp.height + 400 && c.right <= audit.vw + 1 && c.left >= -1)
  check(`${vp.name}: quest cards in viewport`, cardsFit)
  const small = audit.btns.filter((b) => b.h > 0 && b.h < 40)
  check(`${vp.name}: buttons >=40px tall`, small.length === 0, JSON.stringify(small.slice(0, 3)))

  // --- pixel probes via composited screenshot of the canvas element ---
  const probeCanvas = async (selector, points) => {
    const box = await page.locator(selector).boundingBox()
    const png = decodePng(await page.screenshot({ clip: box }))
    return points.map(([gx, gy]) =>
      png.at(Math.round((gx / 1000) * png.width), Math.round((gy / 700) * png.height)),
    )
  }

  const [sky, sea, grassL, theoHead] = await probeCanvas('.island-wrap canvas', [
    [500, 60],
    [500, 640],
    [170, 500],
    [205, 430], // Theodore face zone (feet ~500, head ~410-450)
  ])
  check(`${vp.name} island: sky painted`, sky[2] > 150 && sky[1] > 150, `rgb=${sky}`)
  check(`${vp.name} island: sea painted`, sea[2] > sea[0] && sea[2] > 80, `rgb=${sea}`)
  check(`${vp.name} island: left island grass`, grassL[1] > grassL[0] && grassL[1] > 80, `rgb=${grassL}`)
  check(`${vp.name} island: explorer visible`, theoHead[0] !== sky[0] || theoHead[2] !== sky[2], `rgb=${theoHead}`)

  // room: buy + wear hat, then probe head zone for leaf green
  await page.getByRole('button', { name: 'Shop' }).click()
  await page.getByRole('button', { name: 'Buy for 20 coins' }).click()
  await page.getByRole('button', { name: 'Wear it' }).click()
  await page.getByRole('button', { name: 'Back' }).click()
  await page.getByRole('button', { name: 'My room' }).click()
  await page.locator('[data-scene="room"][data-scene-ready="true"]').waitFor()
  await page.waitForTimeout(400)
  const roomProbe = await probeCanvas('.room-wrap canvas', [
    [280, 345], // hat zone: head top ~y360 (feet 585 - 225)
    [280, 330],
    [280, 390], // face zone
    [805, 160], // round window sky (off the cross bars)
    [500, 60], // wall
  ])
  const greenish = (p) => p[1] > p[0] + 15 && p[1] > p[2] + 15 && p[1] > 90
  check(
    `${vp.name} room: leaf hat on head`,
    greenish(roomProbe[0]) || greenish(roomProbe[1]),
    `hat=${roomProbe[0]},${roomProbe[1]}`,
  )
  check(`${vp.name} room: face below hat`, roomProbe[2][0] > roomProbe[2][2], `face=${roomProbe[2]}`)
  check(`${vp.name} room: window sky`, roomProbe[3][2] > 120, `win=${roomProbe[3]}`)
  check(`${vp.name} room: wall painted`, roomProbe[4][0] > 150, `wall=${roomProbe[4]}`)

  check(`${vp.name}: no page errors`, errors.length === 0, errors[0] ?? '')
  await page.close()
}

await browser.close()
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILURES`)
process.exit(failures ? 1 : 0)
