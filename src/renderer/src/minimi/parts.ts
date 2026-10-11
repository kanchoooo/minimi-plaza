/// <reference types="vite/client" />
// 미니미 도트 파츠 데이터 (전부 오리지널 그림)
//
// 캔버스 32x40. 스프라이트는 문자 격자로 그린다.
//   '.'        빈칸
//   a b c d e  파츠 색에서 파생: 기본 / 그림자 / 하이라이트 / 진한색 / 옅은색  (레이어 외곽이면 자동 외곽선)
//   A B C D E  위와 같은 색이지만 자동 외곽선 제외
//   o          파츠 외곽선 색
//   s S        피부 / 피부 그림자
//   그 밖의 글자는 고정색 (render.ts FIXED 참고)
//
// sym(y, rows)  : 16칸 왼쪽 절반만 적으면 좌우 대칭으로 펼친다
// full(y, rows) : 32칸 전체
// pair(...)     : 왼팔/왼다리를 적으면 오른쪽은 거울로 만들어 각각 따로 움직이게 한다

export type Src = 'main' | 'skin' | 'hair' | 'acc' | `#${string}`
export type Attach = 'body' | 'armL' | 'armR' | 'legL' | 'legR' | 'face'

export interface Piece {
  y: number
  rows: string[]
  attach?: Attach
  src?: Src
}

export interface Layer {
  z: number
  src: Src
  outline: boolean
  pieces: Piece[]
}

export interface PartDef {
  id: string
  label: string
  layers: Layer[]
  /** 좌우 비대칭 → 오른쪽을 볼 때 거울 반전 */
  asym?: boolean
}

export interface HairDef extends PartDef {
  /** 귀가 보이는 머리 */
  ears: boolean
}

export interface EyeDef {
  id: string
  label: string
  open: Piece
  closed: Piece
  asym?: boolean
}

export interface MouthDef {
  id: string
  label: string
  piece: Piece
  asym?: boolean
}

export interface TopDef extends PartDef {
  /** 원피스·멜빵처럼 하의를 가리는 옷 */
  hidesBottom?: boolean
}

// ───────── z 순서 ─────────
export const Z = {
  hairBack: 10,
  legs: 20,
  shoes: 25,
  bottom: 30,
  boots: 35,
  torso: 40,
  top: 45,
  arms: 50,
  sleeves: 55,
  head: 60,
  blush: 64,
  eyes: 65,
  mouth: 66,
  faceAcc: 68,
  accBehindHair: 69,
  hairFront: 70,
  hairTie: 71,
  acc: 80
} as const

// ───────── 헬퍼 ─────────
const W = 32
const HALF = 16

function check(rows: string[], width: number, where: string): void {
  if (import.meta.env?.DEV) {
    rows.forEach((r, i) => {
      if (r.length !== width) console.warn(`[minimi] ${where} row ${i} has ${r.length} chars (want ${width})`)
    })
  }
}

const rev = (s: string): string => s.split('').reverse().join('')

export function sym(y: number, half: string[], attach?: Attach, src?: Src): Piece {
  check(half, HALF, `sym@${y}`)
  return { y, rows: half.map((h) => h + rev(h)), attach, src }
}

export function full(y: number, rows: string[], attach?: Attach, src?: Src): Piece {
  check(rows, W, `full@${y}`)
  return { y, rows, attach, src }
}

/** 왼쪽 절반만 (반대쪽은 비움) */
function leftOnly(y: number, half: string[], attach?: Attach, src?: Src): Piece {
  check(half, HALF, `left@${y}`)
  return { y, rows: half.map((h) => h + '.'.repeat(HALF)), attach, src }
}

/** 왼쪽 그림 + 거울 오른쪽, 각각 다른 부착점 */
export function pair(y: number, half: string[], a: Attach, b: Attach, src?: Src): Piece[] {
  check(half, HALF, `pair@${y}`)
  return [leftOnly(y, half, a, src), { y, rows: half.map((h) => '.'.repeat(HALF) + rev(h)), attach: b, src }]
}

const arms = (y: number, half: string[], src?: Src): Piece[] => pair(y, half, 'armL', 'armR', src)
const legs = (y: number, half: string[], src?: Src): Piece[] => pair(y, half, 'legL', 'legR', src)

function layer(z: number, src: Src, pieces: Piece | Piece[], outline = true): Layer {
  return { z, src, outline, pieces: Array.isArray(pieces) ? pieces : [pieces] }
}

const rep = (row: string, n: number): string[] => Array.from({ length: n }, () => row)

// ───────── 몸 (공통) ─────────

export const HEAD = sym(9, [
  '...........aaaaa', // 9
  '........aaaaaaaa', // 10
  '.......aaaaaaaaa', // 11
  '......aaaaaaaaaa', // 12
  '......aaaaaaaaaa', // 13
  '.....aaaaaaaaaaa', // 14
  '.....aaaaaaaaaaa', // 15
  '.....aaaaaaaaaaa', // 16
  '.....aaaaaaaaaaa', // 17
  '.....aaaaaaaaaaa', // 18
  '.....aaaaaaaaaaa', // 19
  '.....aaaaaaaaaaa', // 20
  '.....aaaaaaaaaaa', // 21
  '......aaaaaaaaaa', // 22
  '......aaaaaaaaaa', // 23
  '.......aaaaaaaaa', // 24
  '.........aaaaaaa', // 25
  '...........aaaaa' // 26
])

export const EARS = sym(17, [
  '...aa...........', // 17
  '...ab...........', // 18
  '...ab...........', // 19
  '...aa...........' // 20
])

export const TORSO = sym(25, rep('..........aaaaaa', 8)) // 25..32

export const ARMS = arms(27, [
  '.........aa.....', // 27
  '........aaa.....', // 28
  '........aaa.....', // 29
  '........aaa.....', // 30
  '........aaa.....', // 31
  '........aaa.....', // 32
  '........aaa.....' // 33
])

export const LEGS = legs(31, rep('............aaa.', 6)) // 31..36

// ───────── 소매 모양 ─────────
const SHORT_SLEEVE = ['.........aa.....', '........aaa.....', '........aaa.....'] // 27..29
const LONG_SLEEVE = ['.........aa.....', '........aaa.....', '........aaa.....', '........aaa.....', '........aaa.....'] // 27..31
const PANT_LEGS = (n: number): string[] => rep('...........aaaa.', n)

// ───────── 머리 ─────────

const CAP_TOP = [
  '...........aaaaa', // 5
  '.........aaaaaaa', // 6
  '.......aaaaaaaaa', // 7
  '......aacccaaaaa', // 8
  '.....aaaaaaaaaaa', // 9
  '....aaaaaaaaaaaa', // 10
  '....aaaaaaaaaaaa', // 11
  '....aaaaaaaaaaaa', // 12
  '....aaaaaaaaaaaa', // 13
  '....aaaaaaaaaaaa' // 14
]

const BANGS_TIPS = '....aaaaa.aaa..a' // 15

export const HAIRS: HairDef[] = [
  {
    id: 'bob',
    label: '단발',
    ears: false,
    layers: [
      layer(Z.hairBack, 'main', sym(10, [...rep('....bbbbbbbbbbbb', 15), '.....bbbbbbbbbbb'])),
      layer(Z.hairFront, 'main', sym(5, [...CAP_TOP, BANGS_TIPS, ...rep('....aaba........', 8), '.....aaa........']))
    ]
  },
  {
    id: 'long',
    label: '긴생머리',
    ears: false,
    layers: [
      layer(Z.hairBack, 'main', sym(10, [...rep('..bbbbbbbbbbbbbb', 21), '...bbbbbbbbbbbbb', '.....bbbbbbbbbbb'])),
      layer(
        Z.hairFront,
        'main',
        sym(5, [
          ...CAP_TOP.slice(0, 8), // 5..12
          '....aaaaaaaaaaa.', // 13 가르마
          '....aaaaaaaaaa..', // 14
          '....aaaaaaaa....', // 15
          '....aaaaaa......', // 16
          '....aaaa........', // 17
          ...rep('....aaba........', 12), // 18..29
          '.....aa.........' // 30
        ])
      )
    ]
  },
  {
    id: 'short',
    label: '숏컷',
    ears: true,
    layers: [
      layer(
        Z.hairFront,
        'main',
        sym(6, [
          '...........aaaaa', // 6
          '.........aaaaaaa', // 7
          '.......aaaaaaaaa', // 8
          '......aacccaaaaa', // 9
          '.....aaaaaaaaaaa', // 10
          '....aaaaaaaaaaaa', // 11
          '....aaaaaaaaaaaa', // 12
          '....aaaaaaaaaaaa', // 13
          '....aaaa.aa.aa.a', // 14
          '....aaa.........', // 15
          '....aaa.........' // 16
        ])
      )
    ]
  },
  {
    id: 'twin',
    label: '양갈래',
    ears: false,
    layers: [
      layer(
        Z.hairBack,
        'main',
        sym(10, [
          '....aa..........', // 10
          '...aaaa.........', // 11
          '..aaaaa.........', // 12
          '.aaaaaa.........', // 13
          '.aacaa..........', // 14
          'aacaaa..........', // 15
          'aacaa...........', // 16
          'aaaaa...........', // 17
          'aaaba...........', // 18
          'aaaba...........', // 19
          '.aaba...........', // 20
          '.aaba...........', // 21
          '..aaa...........', // 22
          '..aaa...........', // 23
          '...aa...........', // 24
          '...a............' // 25
        ])
      ),
      layer(Z.hairFront, 'main', sym(5, [...CAP_TOP, BANGS_TIPS, ...rep('....aaba........', 3), '.....aa.........'])),
      layer(Z.hairTie, 'main', sym(11, ['...ppp..........', '...PPP..........']), false)
    ]
  },
  {
    id: 'bun',
    label: '똥머리',
    ears: true,
    layers: [
      layer(
        Z.accBehindHair,
        'main',
        sym(0, [
          '............aaaa', // 0
          '...........aaaaa', // 1
          '...........acaaa', // 2
          '...........aaaaa', // 3
          '............aaaa', // 4
          '.............aaa' // 5
        ])
      ),
      layer(
        Z.hairFront,
        'main',
        sym(5, [
          ...CAP_TOP.slice(0, 7), // 5..11
          '....aaaaaaaa....', // 12
          '....aaaaaa......', // 13
          '....aaaa........', // 14
          '....aaa.........', // 15
          '....aa..........' // 16
        ])
      )
    ]
  },
  {
    id: 'pony',
    label: '포니테일',
    ears: false,
    asym: true,
    layers: [
      layer(
        Z.hairBack,
        'main',
        full(5, [
          '.......................aaaa.....', // 5
          '........................aaaaa...', // 6
          '.........................aaaaa..', // 7
          '..........................aaaaa.', // 8
          '..........................aaaaa.', // 9
          '...........................aaaaa', // 10
          '...........................aacaa', // 11
          '...........................aacaa', // 12
          '...........................aaaaa', // 13
          '...........................aaaa.', // 14
          '...........................aaaa.', // 15
          '...........................abaa.', // 16
          '............................aba.', // 17
          '............................aaa.', // 18
          '............................aa..', // 19
          '.............................a..' // 20
        ])
      ),
      layer(
        Z.hairFront,
        'main',
        full(5, [
          '...........aaaaaaaaaa...........', // 5
          '.........aaaaaaaaaaaaaa.........', // 6
          '.......aaaaaaaaaaaaaaaaaa.......', // 7
          '......aacccaaaaaaaaaaaaaaa......', // 8
          '.....aaaaaaaaaaaaaaaaaaaaaa.....', // 9
          '....aaaaaaaaaaaaaaaaaaaaaaaa....', // 10
          '....aaaaaaaaaaaaaaaaaaaaaaaa....', // 11
          '....aaaaaaaaaaaaaaaaaaaaaaaa....', // 12
          '....aaaaaaaaaaaaaaaaaaaaa.aa....', // 13
          '....aaaaaaaaaaaaaaaaaa....aa....', // 14
          '....aaaaaaaaaaaaaaa.......aa....', // 15
          '....aaaaaaaaaaa...........aa....', // 16
          '....aaaaaaa................a....', // 17
          '....aaaa........................', // 18
          '....aaa.........................' // 19
        ])
      ),
      layer(Z.hairTie, 'main', full(5, ['......................pp........', '.......................PP.......']), false)
    ]
  },
  {
    id: 'curly',
    label: '뽀글펌',
    ears: false,
    layers: [
      layer(
        Z.hairFront,
        'main',
        sym(3, [
          '...........aa.aa', // 3
          '........aaaaaaaa', // 4
          '......aaaaaaaaaa', // 5
          '.....aaacaaaacaa', // 6
          '....aaaaaaaaaaaa', // 7
          '...aaaaabaaaaaab', // 8
          '...aaaaaaaaaaaaa', // 9
          '..aaacaaaaacaaaa', // 10
          '..aaaaaaaaaaaaaa', // 11
          '...aaaaaaaaaaaaa', // 12
          '..aaaaabaaaaabaa', // 13
          '..aaaaaaaaaaaaaa', // 14
          '..aaaa.aa..aa..a', // 15
          '..aaaa..........', // 16
          '...aaaa.........', // 17
          '..aaaaa.........', // 18
          '..aaaa..........', // 19
          '...aaa..........', // 20
          '....a...........' // 21
        ])
      )
    ]
  },
  {
    id: 'spiky',
    label: '삐죽머리',
    ears: true,
    layers: [
      layer(
        Z.hairFront,
        'main',
        sym(2, [
          '.........a......', // 2
          '.........aa...a.', // 3
          '......a..aaa.aa.', // 4
          '......aa.aaaaaaa', // 5
          '......aaaaaaaaaa', // 6
          '.....aaaaaaaaaaa', // 7
          '....aaacccaaaaaa', // 8
          '...aaaaaaaaaaaaa', // 9
          '....aaaaaaaaaaaa', // 10
          '....aaaaaaaaaaaa', // 11
          '....aaaaaaaaaaaa', // 12
          '....aaaaaaaaaaaa', // 13
          '....aaa.aaaa.aaa', // 14
          '....aa...aa...a.', // 15
          '....a...........' // 16
        ])
      )
    ]
  },
  {
    id: 'bowl',
    label: '바가지',
    ears: false,
    layers: [
      layer(Z.hairFront, 'main', sym(5, [...CAP_TOP, '....aaaaaaaaaaaa', ...rep('....aaaa........', 5)]))
    ]
  },
  {
    id: 'buzz',
    label: '까까머리',
    ears: true,
    layers: [
      layer(
        Z.hairFront,
        'main',
        sym(8, [
          '..........aaaaaa', // 8
          '........aaaaaaaa', // 9
          '.......aaaaaaaaa', // 10
          '......aacaaaaaaa', // 11
          '.....aaaaaaaaaaa', // 12
          '.....aaaaaaaaaaa', // 13
          '.....aaaa.......', // 14
          '.....aaa........' // 15
        ])
      )
    ]
  }
]

// ───────── 눈 ─────────

const CLOSED_2 = sym(19, ['.........kkkk...'])
const CLOSED_3 = sym(19, ['.........kkk....'])

export const EYES: EyeDef[] = [
  {
    id: 'dot',
    label: '콩눈',
    open: sym(18, ['..........kk....', '..........kk....', '..........kk....']),
    closed: CLOSED_2
  },
  {
    id: 'round',
    label: '초롱눈',
    open: full(17, [
      '.........kkk........kkk.........',
      '.........wkk........wkk.........',
      '.........kkk........kkk.........',
      '.........kkk........kkk.........'
    ]),
    closed: CLOSED_3
  },
  {
    id: 'smile',
    label: '웃는눈',
    open: sym(18, ['..........kk....', '.........k..k...']),
    closed: sym(18, ['..........kk....', '.........k..k...'])
  },
  {
    id: 'sleepy',
    label: '졸린눈',
    open: sym(19, ['.........k..k...', '..........kk....']),
    closed: CLOSED_2
  },
  {
    id: 'wink',
    label: '윙크',
    asym: true,
    open: full(18, [
      '..........kk........kk..........',
      '..........kk.......k..k.........',
      '..........kk....................'
    ]),
    closed: full(18, ['....................kk..........', '.........kkkk......k..k.........'])
  },
  {
    id: 'line',
    label: '무표정',
    open: CLOSED_2,
    closed: CLOSED_2
  },
  {
    id: 'sparkle',
    label: '반짝눈',
    open: full(17, [
      '........kkkk........kkkk........',
      '.........wkk........wkk.........',
      '.........kkk........kkk.........',
      '.........kkw........kkw.........'
    ]),
    closed: sym(19, ['........kkkk....'])
  },
  {
    id: 'heart',
    label: '하트눈',
    open: sym(17, ['........hh.hh...', '........hhhhh...', '.........hhh....', '..........h.....']),
    closed: CLOSED_3
  },
  {
    id: 'teary',
    label: '글썽눈',
    open: full(17, [
      '.........kkk........kkk.........',
      '.........wkk........wkk.........',
      '.........kkk........kkk.........',
      '.........ttt........ttt.........'
    ]),
    closed: CLOSED_3
  }
]

// ───────── 입 ─────────

export const MOUTHS: MouthDef[] = [
  { id: 'smile', label: '미소', piece: sym(22, ['..............m.', '...............m']) },
  { id: 'open', label: '활짝', piece: sym(22, ['..............mm', '..............mr', '...............m']) },
  { id: 'cat', label: '고양이입', piece: sym(22, ['.............m.m', '..............m.']) },
  { id: 'flat', label: '시큰둥', piece: sym(23, ['..............mm']) },
  { id: 'tongue', label: '메롱', piece: sym(22, ['..............mm', '...............p', '...............P']) },
  { id: 'o', label: '놀람', piece: sym(22, ['...............m', '...............m']) },
  {
    id: 'pout',
    label: '뽀뽀',
    asym: true,
    piece: full(21, ['...............m................', '................m...............', '...............m................'])
  }
]

export const BLUSH = sym(21, ['........qqq.....', '........QQQ.....'])

// ───────── 상의 ─────────
// 몸통 26..32 (26 은 턱에 가려짐, 32 가 밑단). 팔 27..33.

const SHIRT_WHITE: Src = '#fbfaf5'
const PLAIN_TORSO = rep('..........aaaaaa', 7)

export const TOPS: TopDef[] = [
  {
    id: 'tee',
    label: '반팔티',
    layers: [
      layer(
        Z.top,
        'main',
        sym(26, [
          '..........aaaaaa', // 26
          '..........aaabbb', // 27 목둘레
          '..........aaaaaa', // 28
          '..........aaaaaa', // 29
          '..........aaaaaa', // 30
          '..........aaaaaa', // 31
          '..........aaaaaa' // 32
        ])
      ),
      layer(Z.sleeves, 'main', arms(27, SHORT_SLEEVE))
    ]
  },
  {
    id: 'hoodie',
    label: '후드티',
    layers: [
      layer(
        Z.top,
        'main',
        sym(26, [
          '..........aaaaaa', // 26
          '..........abbbbb', // 27 후드 테두리
          '..........aaawaa', // 28 끈
          '..........aaawaa', // 29
          '..........aaaaaa', // 30
          '..........aabbbb', // 31 주머니
          '..........aabaaa' // 32
        ])
      ),
      layer(Z.sleeves, 'main', arms(27, LONG_SLEEVE))
    ]
  },
  {
    id: 'sweater',
    label: '줄무늬니트',
    layers: [
      layer(
        Z.top,
        'main',
        sym(26, [
          '..........aaaaaa', // 26
          '..........aabbbb', // 27
          '..........aaaaaa', // 28
          '..........eeeeee', // 29
          '..........aaaaaa', // 30
          '..........eeeeee', // 31
          '..........aaaaaa' // 32
        ])
      ),
      layer(Z.sleeves, 'main', arms(27, ['.........aa.....', '........aaa.....', '........eee.....', '........aaa.....', '........eee.....']))
    ]
  },
  {
    id: 'dress',
    label: '원피스',
    hidesBottom: true,
    layers: [
      layer(
        Z.top,
        'main',
        sym(26, [
          '..........aaaaaa', // 26
          '..........awwwww', // 27 카라
          '..........aawwwa', // 28
          '..........aaaaaa', // 29
          '..........bbbbbb', // 30 허리
          '.........aaaaaaa', // 31
          '.........aaaaaaa', // 32
          '........aacaacaa', // 33
          '........aaaaaaaa' // 34 밑단
        ])
      ),
      layer(Z.sleeves, 'main', arms(27, ['........aaa.....', '.......aaaa.....', '........aaa.....']))
    ]
  },
  {
    id: 'overalls',
    label: '멜빵바지',
    hidesBottom: true,
    layers: [
      layer(Z.top, SHIRT_WHITE, sym(26, PLAIN_TORSO)),
      layer(Z.top + 1, 'main', [
        sym(27, [
          '............AA..', // 27 멜빵
          '............AA..', // 28
          '...........ayaaa', // 29 단추
          '...........aaaaa', // 30
          '..........aaaaaa', // 31
          '..........aaaaaa', // 32
          '..........aaaaaa' // 33
        ]),
        ...legs(33, PANT_LEGS(4))
      ]),
      layer(Z.sleeves, SHIRT_WHITE, arms(27, SHORT_SLEEVE))
    ]
  },
  {
    id: 'sailor',
    label: '세일러',
    layers: [
      layer(Z.top, SHIRT_WHITE, sym(26, PLAIN_TORSO)),
      layer(Z.top + 1, 'main', sym(26, ['..........aaaaaa', '..........aaaa..', '..........aaa...', '..........aa....'])),
      layer(Z.top + 2, 'main', sym(28, ['.............RrR', '..............RR', '..............R.']), false),
      layer(Z.sleeves, SHIRT_WHITE, arms(27, LONG_SLEEVE)),
      layer(Z.sleeves + 1, 'main', arms(31, ['........ooo.....']), false)
    ]
  },
  {
    id: 'jacket',
    label: '교복자켓',
    layers: [
      layer(Z.top, SHIRT_WHITE, sym(26, PLAIN_TORSO)),
      layer(Z.top + 1, '#e5484d', sym(27, ['...............R', '...............r', '...............r', '...............r', '...............R']), false),
      layer(
        Z.top + 2,
        'main',
        sym(26, [
          '..........aaaaaa', // 26
          '..........aaab..', // 27 깃
          '..........aaab..', // 28
          '..........aaaa..', // 29
          '..........aaay..', // 30 단추
          '..........aaaa..', // 31
          '..........aaaa..' // 32
        ])
      ),
      layer(Z.sleeves, 'main', arms(27, LONG_SLEEVE))
    ]
  }
]

// ───────── 하의 ─────────
// 엉덩이 30..32 는 상의에 가려지고 33 부터 보인다

const HIPS = sym(30, rep('..........aaaaaa', 3))

export const BOTTOMS: PartDef[] = [
  {
    id: 'pants',
    label: '긴바지',
    layers: [layer(Z.bottom, 'main', [HIPS, ...legs(33, PANT_LEGS(4))])]
  },
  {
    id: 'shorts',
    label: '반바지',
    layers: [layer(Z.bottom, 'main', [HIPS, ...legs(33, PANT_LEGS(2))])]
  },
  {
    id: 'skirt',
    label: '치마',
    layers: [
      layer(
        Z.bottom,
        'main',
        sym(30, [
          '..........aaaaaa', // 30
          '..........aaaaaa', // 31
          '..........aaaaaa', // 32
          '.........aaaaaaa', // 33
          '........aaaaaaaa', // 34
          '........aaaaaaaa' // 35
        ])
      )
    ]
  },
  {
    id: 'pleats',
    label: '주름치마',
    layers: [
      layer(
        Z.bottom,
        'main',
        sym(30, [
          '..........aaaaaa', // 30
          '..........aaaaaa', // 31
          '..........aaaaaa', // 32
          '.........abaabaa', // 33
          '........aabaabaa', // 34
          '........aaaaaaaa' // 35
        ])
      )
    ]
  }
]

// ───────── 신발 ─────────

export const SHOES: PartDef[] = [
  {
    id: 'sneakers',
    label: '운동화',
    layers: [layer(Z.shoes, 'main', legs(36, ['...........aaaa.', '..........acaaa.', '..........aaaaa.']))]
  },
  {
    id: 'flats',
    label: '구두',
    layers: [layer(Z.shoes, 'main', legs(36, ['............o...', '..........ocaao.', '..........ooooo.']), false)]
  },
  {
    id: 'boots',
    label: '부츠',
    layers: [layer(Z.boots, 'main', legs(34, ['...........aaaa.', '...........acaa.', '...........acaa.', '..........aaaaa.', '..........aaaaa.']))]
  },
  {
    id: 'slippers',
    label: '털신',
    layers: [layer(Z.shoes, 'main', legs(36, ['...........aaaa.', '.........aeaeaa.', '.........aaaaaa.']))]
  }
]

// ───────── 소품 ─────────

export const ACCS: PartDef[] = [
  { id: 'none', label: '없음', layers: [] },
  {
    id: 'ribbon',
    label: '리본',
    asym: true,
    layers: [
      layer(
        Z.acc,
        'acc',
        full(4, [
          '....aa.....aa...................', // 4
          '...aaaa...aaaa..................', // 5
          '...acaaabaaaca..................', // 6
          '...aaaaabaaaaa..................', // 7
          '...aaaa...aaaa..................', // 8
          '....aa.....aa...................' // 9
        ])
      )
    ]
  },
  {
    id: 'cap',
    label: '야구모자',
    layers: [
      layer(
        Z.acc,
        'acc',
        sym(3, [
          '...........aaaaa', // 3
          '.........aaaaaaa', // 4
          '.......aaaaaaaaa', // 5
          '......aacaaaaaaa', // 6
          '......aaaaaaaaaw', // 7
          '.....aaaaaaaaaaw', // 8
          '.....aaaaaaaaaaa', // 9
          '....aaaaaaaaaaaa', // 10
          '..bbbbbbbbbbbbbb', // 11 챙
          '...bbbbbbbbbbbbb' // 12
        ])
      )
    ]
  },
  {
    id: 'beanie',
    label: '비니',
    layers: [
      layer(
        Z.acc,
        'acc',
        sym(2, [
          '...........aaaaa', // 2
          '.........aaaaaaa', // 3
          '.......aaaaaaaaa', // 4
          '......aacaaaaaaa', // 5
          '.....aaaaaaaaaaa', // 6
          '.....aaaaaaaaaaa', // 7
          '....aaaaaaaaaaaa', // 8
          '....aaaaaaaaaaaa', // 9
          '...bbbbbbbbbbbbb', // 10 접단
          '...bebebebebebeb', // 11
          '...bbbbbbbbbbbbb' // 12
        ])
      ),
      layer(Z.acc + 1, SHIRT_WHITE, sym(0, ['..............aa', '.............aaa', '.............aaa']))
    ]
  },
  {
    id: 'glasses',
    label: '동글안경',
    layers: [
      layer(
        Z.faceAcc,
        'acc',
        sym(
          17,
          ['.........ooo....', '........oLLLo...', '........oLLLoooo', '........oLLLo...', '.........ooo....'],
          'face'
        ),
        false
      )
    ]
  },
  {
    id: 'sunglasses',
    label: '선글라스',
    layers: [
      layer(
        Z.faceAcc,
        'acc',
        sym(
          17,
          ['........ooooo...', '.......okkkkkooo', '.......okGkkko..', '........okkko...', '.........ooo....'],
          'face'
        ),
        false
      )
    ]
  },
  {
    id: 'headphones',
    label: '헤드폰',
    layers: [
      layer(
        Z.acc,
        'acc',
        sym(3, [
          '..........aaaaaa', // 3
          '........aaaaaaaa', // 4
          '......aaa.......', // 5
          '.....aaa........', // 6
          '....aaa.........', // 7
          '....aaa.........', // 8
          '...aaa..........', // 9
          '...aaa..........', // 10
          '..aaaa..........', // 11
          '.aaaaaa.........', // 12
          '.aacaaa.........', // 13
          '.aabbaa.........', // 14
          '.aabbaa.........', // 15
          '.aabbaa.........', // 16
          '.aaaaaa.........', // 17
          '..aaaa..........' // 18
        ])
      )
    ]
  },
  {
    id: 'flower',
    label: '꽃핀',
    asym: true,
    layers: [
      layer(
        Z.acc,
        'acc',
        full(7, [
          '........................a.......', // 7
          '.......................aaa......', // 8
          '......................aayaa.....', // 9
          '.......................aaa......', // 10
          '........................a.......' // 11
        ])
      )
    ]
  },
  {
    id: 'crown',
    label: '왕관',
    layers: [
      layer(
        Z.acc,
        'acc',
        sym(0, [
          '..........a....a', // 0
          '..........aa..aa', // 1
          '..........aaaaaa', // 2
          '..........acaraa', // 3
          '..........aaaaaa', // 4
          '..........aaaaaa' // 5
        ])
      )
    ]
  },
  {
    id: 'catears',
    label: '고양이귀',
    layers: [
      layer(
        Z.accBehindHair,
        'acc',
        sym(1, [
          '......a.........', // 1
          '......aa........', // 2
          '......apa.......', // 3
          '.....appaa......', // 4
          '.....apppaa.....', // 5
          '.....aaaaaaa....', // 6
          '......aaaaaaa...' // 7
        ])
      )
    ]
  },
  {
    id: 'bunny',
    label: '토끼귀',
    layers: [
      layer(
        Z.accBehindHair,
        'acc',
        sym(0, [
          '.........aa.....', // 0
          '........aaaa....', // 1
          '........apaa....', // 2
          '........apaa....', // 3
          '........apaa....', // 4
          '........apaa....', // 5
          '.........apa....', // 6
          '.........aaa....' // 7
        ])
      )
    ]
  },
  {
    id: 'halo',
    label: '천사링',
    layers: [layer(Z.acc, 'acc', sym(0, ['..........aacccc', '.........a......', '..........dddddd']), false)]
  },
  {
    id: 'star',
    label: '별핀',
    asym: true,
    layers: [
      layer(
        Z.acc,
        'acc',
        full(7, [
          '.......................a........', // 7
          '.....................aaaaa......', // 8
          '......................aca.......', // 9
          '......................a.a.......' // 10
        ]),
        false
      )
    ]
  },
  {
    id: 'sprout',
    label: '새싹',
    layers: [
      layer(
        Z.acc,
        'acc',
        full(0, [
          '...........aaa....aaa...........', // 0
          '..........aacaa..aacaa..........', // 1
          '...........aaaaaaaaaa...........', // 2
          '...............aa...............', // 3
          '...............aa...............', // 4
          '...............aa...............' // 5
        ])
      )
    ]
  }
]

export const byId = <T extends { id: string }>(list: T[], id: string): T => list.find((p) => p.id === id) ?? list[0]
