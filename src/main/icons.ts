import { nativeImage, NativeImage } from 'electron'

// 트레이 아이콘: 작은 불꽃(별 모양) 도트. 런타임에 비트맵으로 만든다.
// '#' = 진한 픽셀, '+' = 옅은 픽셀
const SPARK_16 = [
  '................',
  '.......#........',
  '.......#........',
  '..#....#....#...',
  '...#...+...#....',
  '....+.....+.....',
  '................',
  '.###+..#..+###..',
  '................',
  '....+.....+.....',
  '...#...+...#....',
  '..#....#....#...',
  '.......#........',
  '.......#........',
  '................',
  '................'
]

function rasterize(rows: string[], scale: number, dark: [number, number, number], light: [number, number, number], template: boolean): Buffer {
  const h = rows.length
  const w = rows[0].length
  const W = w * scale
  const H = h * scale
  const buf = Buffer.alloc(W * H * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = rows[y][x]
      if (c === '.') continue
      const [r, g, b] = c === '#' ? dark : light
      const a = template ? (c === '#' ? 255 : 150) : 255
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const i = ((y * scale + sy) * W + (x * scale + sx)) * 4
          // createFromBitmap 은 BGRA
          buf[i] = b
          buf[i + 1] = g
          buf[i + 2] = r
          buf[i + 3] = a
        }
      }
    }
  }
  return buf
}

export function trayIcon(): NativeImage {
  const isMac = process.platform === 'darwin'
  const dark: [number, number, number] = isMac ? [0, 0, 0] : [255, 127, 42]
  const light: [number, number, number] = isMac ? [0, 0, 0] : [255, 205, 90]
  const img = nativeImage.createEmpty()
  img.addRepresentation({ scaleFactor: 1, width: 16, height: 16, buffer: rasterize(SPARK_16, 1, dark, light, isMac) })
  img.addRepresentation({ scaleFactor: 2, width: 32, height: 32, buffer: rasterize(SPARK_16, 2, dark, light, isMac) })
  if (isMac) img.setTemplateImage(true)
  return img
}
