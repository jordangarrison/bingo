import * as Array from 'effect/Array'
import * as Option from 'effect/Option'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { BINGO_LETTERS, FREE_CELL_INDEX, generateCard, printCardSeeds } from '../domain/bingo'
import { Message } from '../message'
import type { Model, PrintCount } from '../model'

const PRINT_COUNTS: readonly PrintCount[] = [2, 4, 6, 8, 12]

const renderPrintableCard = (seed: number, h: HtmlBuilder<Message>): Html => {
  const card = generateCard(seed)

  return h.article(
    [
      h.Class(
        'print-card rounded-xl bg-[#fbf6ec] text-[#1e1a16] p-4 border-2 border-[#1e1a16]/25 shadow-md flex flex-col gap-2'
      ),
    ],
    [
      h.div(
        [h.Class('flex items-baseline justify-between')],
        [
          h.span([h.Class('font-display text-base font-bold')], ['Thanksgiving Bingo']),
          h.span([h.Class('text-xs text-[#64594c] tabular-nums font-semibold')], [`Card #${card.seed}`]),
        ]
      ),
      h.div(
        [h.Class('grid grid-cols-5 gap-1')],
        Array.map(BINGO_LETTERS, (letter) =>
          h.div([h.Class('font-display text-2xl font-extrabold text-[#c4451c] text-center py-0.5')], [letter])
        )
      ),
      h.div(
        [h.Class('grid grid-cols-5 gap-1')],
        Array.map(card.cells, (cell, index) => {
          const isFree = index === FREE_CELL_INDEX
          return h.div(
            [
              h.Class(
                isFree
                  ? 'aspect-square rounded border border-[#1e1a16]/50 bg-[#f2e8d5] flex items-center justify-center font-display text-xs font-extrabold text-[#c4451c]'
                  : 'aspect-square rounded border border-[#1e1a16]/50 bg-white flex items-center justify-center font-bold text-xl tabular-nums text-[#1e1a16]'
              ),
            ],
            [
              Option.match(cell, {
                onNone: () => 'FREE',
                onSome: String,
              }),
            ]
          )
        })
      ),
    ]
  )
}

export const printView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const seeds = printCardSeeds(model.printBaseSeed, model.printCount)

  return h.div(
    [h.Class('flex flex-col gap-6')],
    [
      h.div(
        [
          h.Class(
            'no-print theme-surface rounded-2xl border p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4'
          ),
        ],
        [
          h.div(
            [h.Class('flex flex-wrap items-center gap-2')],
            [
              h.span([h.Class('text-sm font-semibold mr-1')], ['Cards to print']),
              ...Array.map(PRINT_COUNTS, (count) => {
                const selected = model.printCount === count
                return h.button(
                  [
                    h.Type('button'),
                    h.OnClick(Message.SelectedPrintCount({ count })),
                    h.AriaPressed(String(selected)),
                    h.Class(
                      selected
                        ? 'theme-btn-highlight rounded-lg font-bold text-sm px-3 py-1.5 tabular-nums'
                        : 'theme-btn-secondary rounded-lg border text-sm font-semibold px-3 py-1.5 tabular-nums'
                    ),
                  ],
                  [String(count)]
                )
              }),
            ]
          ),
          h.div(
            [h.Class('flex items-center gap-2.5')],
            [
              h.button(
                [
                  h.Type('button'),
                  h.OnClick(Message.ClickedShufflePrintCards()),
                  h.Class('theme-btn-secondary rounded-xl border text-sm font-semibold px-4 py-2.5 transition-colors'),
                ],
                ['Shuffle cards']
              ),
              h.button(
                [
                  h.Type('button'),
                  h.OnClick(Message.ClickedPrintSheet()),
                  h.Class('theme-btn-primary rounded-xl text-sm font-bold px-5 py-2.5 transition-colors shadow-sm'),
                ],
                ['Print cards']
              ),
            ]
          ),
        ]
      ),
      h.div(
        [h.Class('print-sheet grid grid-cols-1 sm:grid-cols-2 gap-6')],
        Array.map(seeds, (seed) => renderPrintableCard(seed, h))
      ),
    ]
  )
}
