import * as Array from 'effect/Array'
import * as Option from 'effect/Option'
import { describe, expect, it } from 'vitest'

import {
  ALL_NUMBERS,
  countCompletedLines,
  FREE_CELL_INDEX,
  formatBall,
  generateCard,
  GRID_SIZE,
  initialCardMarks,
  letterForNumber,
  numbersForLetter,
  patternMaskFor,
  recentHistory,
  remainingNumbers,
  toggleCardMark,
  toggleMaskCell,
  TOTAL_CELLS,
} from '../src/domain/bingo'

describe('bingo domain', () => {
  it('maps numbers 1-75 to the correct B-I-N-G-O letters', () => {
    expect(letterForNumber(1)).toBe('B')
    expect(letterForNumber(15)).toBe('B')
    expect(letterForNumber(16)).toBe('I')
    expect(letterForNumber(30)).toBe('I')
    expect(letterForNumber(31)).toBe('N')
    expect(letterForNumber(45)).toBe('N')
    expect(letterForNumber(46)).toBe('G')
    expect(letterForNumber(60)).toBe('G')
    expect(letterForNumber(61)).toBe('O')
    expect(letterForNumber(75)).toBe('O')
    expect(formatBall(42)).toBe('N-42')
  })

  it('produces 15 numbers per column covering 1-75', () => {
    expect(numbersForLetter('B')).toHaveLength(15)
    expect(numbersForLetter('O')).toHaveLength(15)
    expect(ALL_NUMBERS).toHaveLength(75)
    expect(remainingNumbers([1, 2, 3])).toHaveLength(72)
  })

  it('returns recent history excluding the current ball in reverse order', () => {
    expect(recentHistory([], 5)).toEqual([])
    expect(recentHistory([12], 5)).toEqual([])
    expect(recentHistory([1, 2, 3, 4, 5, 6, 7], 5)).toEqual([6, 5, 4, 3, 2])
  })

  it('generates a deterministic 5x5 card with valid column ranges, unique numbers, and a FREE center', () => {
    const cardA = generateCard(42_001)
    const cardB = generateCard(42_001)
    const cardC = generateCard(99_999)

    expect(cardA).toEqual(cardB)
    expect(cardA.cells).not.toEqual(cardC.cells)
    expect(cardA.cells).toHaveLength(TOTAL_CELLS)
    expect(Option.isNone(cardA.cells[FREE_CELL_INDEX] ?? Option.some(0))).toBe(true)

    const numbers = Array.getSomes(cardA.cells)
    expect(numbers).toHaveLength(24)
    expect(Array.dedupe(numbers)).toHaveLength(24)

    const validColumns = Array.every(cardA.cells, (cell, index) => {
      if (index === FREE_CELL_INDEX) {
        return Option.isNone(cell)
      }
      const col = index % GRID_SIZE
      const min = col * 15 + 1
      const max = min + 14
      return Option.match(cell, {
        onNone: () => false,
        onSome: (num) => num >= min && num <= max,
      })
    })
    expect(validColumns).toBe(true)
  })

  it('keeps the center free space locked and detects completed 5-in-a-row lines', () => {
    const start = initialCardMarks()
    expect(countCompletedLines(start)).toBe(0)
    expect(toggleCardMark(start, FREE_CELL_INDEX)).toEqual(start)

    const diagonal = Array.reduce([0, 6, 18, 24], start, (marks, index) => toggleCardMark(marks, index))
    expect(countCompletedLines(diagonal)).toBe(1)

    const twoLines = Array.reduce([1, 2, 3, 4], diagonal, (marks, index) => toggleCardMark(marks, index))
    expect(countCompletedLines(twoLines)).toBe(2)
  })

  it('toggles custom pattern cells cleanly', () => {
    const corners = patternMaskFor('four-corners', initialCardMarks())
    expect(corners[0]).toBe(true)
    expect(corners[4]).toBe(true)
    expect(corners[20]).toBe(true)
    expect(corners[24]).toBe(true)
    expect(corners[1]).toBe(false)

    const toggled = toggleMaskCell(corners, 1)
    expect(toggled[1]).toBe(true)
  })
})
