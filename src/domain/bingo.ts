import * as Array from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

export const BINGO_LETTERS = ['B', 'I', 'N', 'G', 'O'] as const

export const BingoLetter = Schema.Literals(BINGO_LETTERS)
export type BingoLetter = typeof BingoLetter.Type

export const MIN_BINGO_NUMBER = 1
export const MAX_BINGO_NUMBER = 75
export const NUMBERS_PER_LETTER = 15
export const GRID_SIZE = 5
export const TOTAL_CELLS = 25
export const FREE_CELL_INDEX = 12

export const ALL_NUMBERS: readonly number[] = Array.makeBy(MAX_BINGO_NUMBER, (index) => index + 1)

export const GamePatternId = Schema.Literals([
  'free-play',
  'any-line',
  'four-corners',
  'x-pattern',
  'letter-t',
  'postage-stamp',
  'outer-frame',
  'blackout',
  'custom',
])
export type GamePatternId = typeof GamePatternId.Type

export interface GamePatternPreset {
  readonly id: GamePatternId
  readonly label: string
  readonly summary: string
  readonly cells: readonly boolean[]
}

const makeMask = (predicate: (row: number, col: number) => boolean): readonly boolean[] =>
  Array.makeBy(TOTAL_CELLS, (index) => {
    const row = Math.floor(index / GRID_SIZE)
    const col = index % GRID_SIZE
    return predicate(row, col)
  })

export const GAME_PATTERNS: readonly GamePatternPreset[] = [
  {
    id: 'free-play',
    label: 'Open Tracker',
    summary: 'Track any house-rule game without a fixed shape.',
    cells: makeMask((row, col) => row === 2 && col === 2),
  },
  {
    id: 'any-line',
    label: 'Any Line',
    summary: '5 in a row across, down, or diagonal.',
    cells: makeMask((row, col) => row === col),
  },
  {
    id: 'four-corners',
    label: 'Four Corners',
    summary: 'All four outer corner squares.',
    cells: makeMask((row, col) => (row === 0 || row === 4) && (col === 0 || col === 4)),
  },
  {
    id: 'x-pattern',
    label: 'Letter X',
    summary: 'Both full diagonals crossing the center.',
    cells: makeMask((row, col) => row === col || row + col === 4),
  },
  {
    id: 'letter-t',
    label: 'Letter T',
    summary: 'Top row and center column.',
    cells: makeMask((row, col) => row === 0 || col === 2),
  },
  {
    id: 'postage-stamp',
    label: 'Postage Stamp',
    summary: 'Any 2x2 corner block of four squares.',
    cells: makeMask((row, col) => row <= 1 && col >= 3),
  },
  {
    id: 'outer-frame',
    label: 'Picture Frame',
    summary: 'Every square around the outside edge.',
    cells: makeMask((row, col) => row === 0 || row === 4 || col === 0 || col === 4),
  },
  {
    id: 'blackout',
    label: 'Blackout',
    summary: 'Cover every square on the card.',
    cells: makeMask(() => true),
  },
]

export const patternById = (id: GamePatternId): Option.Option<GamePatternPreset> =>
  Array.findFirst(GAME_PATTERNS, (preset) => preset.id === id)

export const patternMaskFor = (patternId: GamePatternId, customMask: readonly boolean[]): readonly boolean[] => {
  if (patternId === 'custom') {
    return customMask.length === TOTAL_CELLS ? customMask : makeMask((row, col) => row === 2 && col === 2)
  }
  return Option.match(patternById(patternId), {
    onNone: () => makeMask((row, col) => row === 2 && col === 2),
    onSome: (preset) => preset.cells,
  })
}

export const toggleMaskCell = (mask: readonly boolean[], index: number): readonly boolean[] =>
  Array.map(mask, (value, cellIndex) => (cellIndex === index ? !value : value))

export const letterForNumber = (value: number): BingoLetter => {
  if (value <= 15) {
    return 'B'
  }
  if (value <= 30) {
    return 'I'
  }
  if (value <= 45) {
    return 'N'
  }
  if (value <= 60) {
    return 'G'
  }
  return 'O'
}

export const numbersForLetter = (letter: BingoLetter): readonly number[] => {
  const start = Match.value(letter).pipe(
    Match.when('B', () => 1),
    Match.when('I', () => 16),
    Match.when('N', () => 31),
    Match.when('G', () => 46),
    Match.when('O', () => 61),
    Match.exhaustive
  )
  return Array.makeBy(NUMBERS_PER_LETTER, (offset) => start + offset)
}

export const formatBall = (value: number): string => `${letterForNumber(value)}-${value}`

export const spokenBall = (value: number): string => `${letterForNumber(value)}, ${value}`

export const remainingNumbers = (calledNumbers: readonly number[]): readonly number[] =>
  Array.filter(ALL_NUMBERS, (num) => !Array.contains(calledNumbers, num))

export const currentBall = (calledNumbers: readonly number[]): Option.Option<number> => Array.last(calledNumbers)

export const recentHistory = (calledNumbers: readonly number[], limit: number): readonly number[] => {
  const withoutCurrent = Array.dropRight(calledNumbers, 1)
  return Array.reverse(Array.takeRight(withoutCurrent, limit))
}

interface PrngState {
  readonly next: number
  readonly value: number
}

interface PoolPickState {
  readonly remaining: readonly number[]
  readonly picked: readonly number[]
  readonly state: number
}

interface PoolPickResult {
  readonly picked: readonly number[]
  readonly state: number
}

interface ColumnBuildState {
  readonly columns: readonly (readonly number[])[]
  readonly state: number
}

const LCG_MULTIPLIER = 48_271
const LCG_MODULUS = 2_147_483_647

const nextPrng = (state: number): PrngState => {
  const normalized = (Math.abs(Math.trunc(state)) % (LCG_MODULUS - 1)) + 1
  const next = (normalized * LCG_MULTIPLIER) % LCG_MODULUS
  return { next, value: (next - 1) / (LCG_MODULUS - 1) }
}

const pickUniqueFromPool = (pool: readonly number[], count: number, initialState: number): PoolPickResult => {
  const initial: PoolPickState = {
    remaining: pool,
    picked: [],
    state: initialState,
  }

  const result = Array.reduce(
    Array.makeBy(count, (idx) => idx),
    initial,
    (acc) => {
      const step = nextPrng(acc.state)
      const chosenIndex = Math.floor(step.value * acc.remaining.length)
      const chosen = Array.get(acc.remaining, chosenIndex)
      return Option.match(chosen, {
        onNone: () => ({ ...acc, state: step.next }),
        onSome: (num) => ({
          remaining: Array.filter(acc.remaining, (_, idx) => idx !== chosenIndex),
          picked: Array.append(acc.picked, num),
          state: step.next,
        }),
      })
    }
  )

  return { picked: result.picked, state: result.state }
}

export interface BingoCard {
  readonly seed: number
  readonly cells: readonly Option.Option<number>[]
}

export const generateCard = (seed: number): BingoCard => {
  const safeSeed = Math.abs(Math.trunc(seed)) || 1
  const initialAcc: ColumnBuildState = {
    columns: [],
    state: safeSeed,
  }

  const columnResult = Array.reduce(BINGO_LETTERS, initialAcc, (acc, letter) => {
    const pool = numbersForLetter(letter)
    const picked = pickUniqueFromPool(pool, GRID_SIZE, acc.state)
    return {
      columns: Array.append(acc.columns, picked.picked),
      state: picked.state,
    }
  })

  const cells: readonly Option.Option<number>[] = Array.makeBy(TOTAL_CELLS, (index) => {
    if (index === FREE_CELL_INDEX) {
      return Option.none()
    }
    const row = Math.floor(index / GRID_SIZE)
    const col = index % GRID_SIZE
    return Option.flatMap(Array.get(columnResult.columns, col), (column) => Array.get(column, row))
  })

  return { seed: safeSeed, cells }
}

export const initialCardMarks = (): readonly boolean[] =>
  Array.makeBy(TOTAL_CELLS, (index) => index === FREE_CELL_INDEX)

export const toggleCardMark = (marks: readonly boolean[], index: number): readonly boolean[] => {
  if (index === FREE_CELL_INDEX) {
    return marks
  }
  return Array.map(marks, (marked, cellIndex) => (cellIndex === index ? !marked : marked))
}

const WINNING_LINES: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
]

const isCellMarked = (marks: readonly boolean[], index: number): boolean =>
  index === FREE_CELL_INDEX || Option.getOrElse(Array.get(marks, index), () => false)

export const completedLines = (marks: readonly boolean[]): readonly (readonly number[])[] =>
  Array.filter(WINNING_LINES, (line) => Array.every(line, (index) => isCellMarked(marks, index)))

export const countCompletedLines = (marks: readonly boolean[]): number => completedLines(marks).length

export const isWinningLineCell = (marks: readonly boolean[], index: number): boolean =>
  Array.some(completedLines(marks), (line) => Array.contains(line, index))

export const markedSquareCount = (marks: readonly boolean[]): number =>
  Array.filter(marks, (marked, index) => marked && index !== FREE_CELL_INDEX).length

export const printCardSeeds = (baseSeed: number, count: number): readonly number[] =>
  Array.makeBy(count, (offset) => baseSeed + offset * 7919)
