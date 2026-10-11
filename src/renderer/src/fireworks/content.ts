// 보내는 쪽에서 쓰는 이미지 준비 도우미

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('이미지를 불러올 수 없어요'))
    img.src = src
  })
}

/**
 * File / data URL → 투명 테두리를 잘라내고 최대 maxSide px 로 축소한 PNG data URL.
 * 투명도는 유지한다. GIF 는 첫 프레임만 쓴다. 결과는 보통 수십 KB.
 */
export async function prepareImageForFirework(src: File | string, maxSide = 320): Promise<string> {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src)
  try {
    const img = await loadImage(url)
    const iw = img.naturalWidth || img.width
    const ih = img.naturalHeight || img.height
    if (!iw || !ih) throw new Error('빈 이미지예요')

    // 1) 분석용으로 적당히 줄여 그린다 (거대한 사진 대비)
    const pre = Math.min(1, 1024 / Math.max(iw, ih))
    const pw = Math.max(1, Math.round(iw * pre))
    const ph = Math.max(1, Math.round(ih * pre))
    const a = document.createElement('canvas')
    a.width = pw
    a.height = ph
    const ag = a.getContext('2d', { willReadFrequently: true })!
    ag.drawImage(img, 0, 0, pw, ph)

    // 2) 투명 테두리 잘라내기
    const data = ag.getImageData(0, 0, pw, ph).data
    let minX = pw,
      minY = ph,
      maxX = -1,
      maxY = -1
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        if (data[(y * pw + x) * 4 + 3] > 16) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < 0) throw new Error('완전히 투명한 이미지예요')
    const cw = maxX - minX + 1
    const ch = maxY - minY + 1

    // 3) 최대 변 maxSide 로 축소 (작은 도트 그림은 키우지 않는다)
    const s = Math.min(1, maxSide / Math.max(cw, ch))
    const ow = Math.max(1, Math.round(cw * s))
    const oh = Math.max(1, Math.round(ch * s))
    const o = document.createElement('canvas')
    o.width = ow
    o.height = oh
    const og = o.getContext('2d')!
    og.imageSmoothingEnabled = true
    og.imageSmoothingQuality = 'high'
    og.drawImage(a, minX, minY, cw, ch, 0, 0, ow, oh)
    return o.toDataURL('image/png')
  } finally {
    if (typeof src !== 'string') URL.revokeObjectURL(url)
  }
}
