import * as Array from 'effect/Array'
import * as Option from 'effect/Option'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { BINGO_LETTERS, currentBall, numbersForLetter } from '../domain/bingo'
import { Message } from '../message'
import type { Model } from '../model'

const tileStateClass = (isCalled: boolean, isLatest: boolean, interactive: boolean): string => {
  if (isLatest) {
    return 'theme-latest border font-extrabold shadow-md'
  }
  if (isCalled) {
    return 'theme-called border font-bold shadow-xs'
  }
  return interactive
    ? 'theme-tile theme-tile-interactive border font-semibold'
    : 'theme-tile border font-medium opacity-55'
}

const renderNumberCell = (
  letter: string,
  num: number,
  isCalled: boolean,
  isLatest: boolean,
  interactive: boolean,
  sizeClass: string,
  h: HtmlBuilder<Message>
): Html => {
  const baseClass = `${sizeClass} rounded-lg tabular-nums flex items-center justify-center transition-colors ${tileStateClass(isCalled, isLatest, interactive)}`

  if (interactive) {
    return h.button(
      [
        h.Type('button'),
        h.OnClick(Message.ToggledBoardNumber({ number: num })),
        h.AriaPressed(String(isCalled)),
        h.AriaLabel(`${letter} ${num}`),
        h.Class(baseClass),
      ],
      [String(num)]
    )
  }

  return h.div([h.AriaLabel(`${letter} ${num}${isCalled ? ' called' : ''}`), h.Class(baseClass)], [String(num)])
}

export interface BoardOptions {
  readonly interactive: boolean
  readonly calledOnly: boolean
}

export const renderResponsiveBoard = (model: Model, options: BoardOptions, h: HtmlBuilder<Message>): Html => {
  const latestNumber = Option.getOrElse(currentBall(model.calledNumbers), () => -1)

  const mobileColumns = h.div(
    [h.Class('grid grid-cols-5 gap-2 lg:hidden')],
    Array.map(BINGO_LETTERS, (letter) => {
      const allColNumbers = numbersForLetter(letter)
      const colNumbers = options.calledOnly
        ? Array.filter(allColNumbers, (num) => Array.contains(model.calledNumbers, num))
        : allColNumbers

      return h.div(
        [h.Class('flex flex-col gap-1.5')],
        [
          h.div(
            [
              h.Class(
                'theme-letter-badge h-11 rounded-lg font-display text-2xl font-extrabold flex items-center justify-center shadow-xs'
              ),
            ],
            [letter]
          ),
          ...(colNumbers.length === 0
            ? [h.div([h.Class('theme-text-dim text-center text-sm py-3')], ['—'])]
            : Array.map(colNumbers, (num) => {
                const isCalled = Array.contains(model.calledNumbers, num)
                const isLatest = num === latestNumber
                return renderNumberCell(letter, num, isCalled, isLatest, options.interactive, 'h-11 text-lg', h)
              })),
        ]
      )
    })
  )

  const desktopRows = h.div(
    [h.Class('hidden lg:flex flex-col gap-2.5')],
    Array.map(BINGO_LETTERS, (letter) => {
      const allRowNumbers = numbersForLetter(letter)
      const rowNumbers = options.calledOnly
        ? Array.filter(allRowNumbers, (num) => Array.contains(model.calledNumbers, num))
        : allRowNumbers

      return h.div(
        [h.Class('grid grid-cols-[3rem_1fr] gap-2.5 items-center')],
        [
          h.div(
            [
              h.Class(
                'theme-letter-badge h-12 rounded-lg font-display text-3xl font-extrabold flex items-center justify-center shadow-xs'
              ),
            ],
            [letter]
          ),
          rowNumbers.length === 0
            ? h.div([h.Class('theme-text-dim text-sm pl-2')], ['None called yet'])
            : h.div(
                [h.Class(options.calledOnly ? 'flex flex-wrap gap-2' : 'grid grid-cols-15 gap-1.5')],
                Array.map(rowNumbers, (num) => {
                  const isCalled = Array.contains(model.calledNumbers, num)
                  const isLatest = num === latestNumber
                  const sizeClass = options.calledOnly ? 'h-12 w-14 text-lg' : 'h-12 text-lg'
                  return renderNumberCell(letter, num, isCalled, isLatest, options.interactive, sizeClass, h)
                })
              ),
        ]
      )
    })
  )

  return h.div([], [mobileColumns, desktopRows])
}
