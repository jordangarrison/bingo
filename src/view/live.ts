import * as Array from 'effect/Array'
import * as Option from 'effect/Option'
import type { Html, HtmlBuilder } from 'foldkit/html'

import {
  currentBall,
  FREE_CELL_INDEX,
  letterForNumber,
  MAX_BINGO_NUMBER,
  patternById,
  patternMaskFor,
  recentHistory,
} from '../domain/bingo'
import { Message } from '../message'
import type { Model } from '../model'
import { renderResponsiveBoard } from './board'

const renderPatternSummary = (model: Model, h: HtmlBuilder<Message>): Html => {
  const mask = patternMaskFor(model.patternId, model.customPatternMask)
  const label =
    model.patternId === 'custom'
      ? 'Custom pattern'
      : Option.match(patternById(model.patternId), {
          onNone: () => 'Open Tracker',
          onSome: (preset) => preset.label,
        })

  return h.div(
    [h.Class('flex items-center gap-3')],
    [
      h.div(
        [h.Class('theme-tile grid grid-cols-5 gap-0.5 p-1 rounded-md border shrink-0')],
        Array.map(mask, (filled, index) =>
          h.span(
            [
              h.Class(
                filled
                  ? 'theme-letter-badge w-3 h-3 rounded-[2px] flex items-center justify-center text-[7px] font-bold'
                  : 'theme-surface w-3 h-3 rounded-[2px] border flex items-center justify-center text-[7px]'
              ),
            ],
            [index === FREE_CELL_INDEX ? '★' : '']
          )
        )
      ),
      h.div(
        [h.Class('flex flex-col')],
        [
          h.span([h.Class('theme-text-muted text-xs font-medium')], ['Round pattern']),
          h.span([h.Class('text-sm font-bold leading-tight')], [label]),
        ]
      ),
    ]
  )
}

export const liveView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const latest = currentBall(model.calledNumbers)
  const previous = recentHistory(model.calledNumbers, 5)

  return h.div(
    [h.Class('flex flex-col gap-5')],
    [
      h.section(
        [h.Class('theme-surface rounded-2xl border p-4 sm:p-6 flex flex-col md:flex-row md:items-center gap-5')],
        [
          h.div(
            [h.Class('flex items-center gap-4 sm:gap-5')],
            [
              Option.match(latest, {
                onNone: () =>
                  h.div(
                    [
                      h.Class(
                        'theme-tile w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-dashed flex flex-col items-center justify-center shrink-0'
                      ),
                    ],
                    [h.span([h.Class('font-display text-lg font-bold theme-text-muted')], ['Ready'])]
                  ),
                onSome: (num) =>
                  h.div(
                    [
                      h.Key(`live-ball-${num}`),
                      h.AriaLive('polite'),
                      h.Class(
                        'animate-ball-pop theme-ball w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 shadow-lg flex flex-col items-center justify-center shrink-0'
                      ),
                    ],
                    [
                      h.span(
                        [h.Class('theme-accent-text font-display text-xl sm:text-2xl font-extrabold leading-none')],
                        [letterForNumber(num)]
                      ),
                      h.span(
                        [h.Class('font-display text-4xl sm:text-5xl font-extrabold tabular-nums leading-none mt-0.5')],
                        [String(num)]
                      ),
                    ]
                  ),
              }),
              h.div(
                [h.Class('flex flex-col gap-1.5 min-w-0')],
                [
                  h.p(
                    [h.Class('font-display text-2xl sm:text-3xl font-extrabold leading-tight')],
                    [
                      Option.match(latest, {
                        onNone: () => 'Waiting for first call',
                        onSome: (num) => `Last called: ${letterForNumber(num)}-${num}`,
                      }),
                    ]
                  ),
                  h.p(
                    [h.Class('theme-text-muted text-sm sm:text-base tabular-nums font-medium')],
                    [`${model.calledNumbers.length} of ${MAX_BINGO_NUMBER} numbers called`]
                  ),
                ]
              ),
            ]
          ),
          h.div(
            [
              h.Class(
                'md:ml-auto flex flex-col sm:flex-row sm:items-center gap-4 pt-3 md:pt-0 border-t md:border-t-0 border-current/10'
              ),
            ],
            [
              renderPatternSummary(model, h),
              ...(previous.length > 0
                ? [
                    h.div(
                      [h.Class('flex flex-col gap-1.5')],
                      [
                        h.span([h.Class('theme-text-muted text-xs font-medium')], ['Previous calls']),
                        h.div(
                          [h.Class('flex flex-wrap gap-1.5')],
                          Array.map(previous, (num) =>
                            h.span(
                              [
                                h.Class(
                                  'theme-called border inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums'
                                ),
                              ],
                              [
                                h.span([h.Class('theme-accent-text font-display')], [letterForNumber(num)]),
                                h.span([], [String(num)]),
                              ]
                            )
                          )
                        ),
                      ]
                    ),
                  ]
                : []),
            ]
          ),
        ]
      ),
      h.section(
        [h.Class('theme-surface rounded-2xl border p-4 sm:p-6 flex flex-col gap-4')],
        [
          h.div(
            [h.Class('flex flex-wrap items-center justify-between gap-3')],
            [
              h.h2([h.Class('font-display text-xl sm:text-2xl font-bold')], ['Called numbers']),
              h.div(
                [h.Class('theme-tile inline-flex rounded-xl border p-1 gap-1')],
                [
                  h.button(
                    [
                      h.Type('button'),
                      h.OnClick(Message.ToggledShowCalledOnly()),
                      h.Disabled(!model.showCalledOnly),
                      h.AriaPressed(String(!model.showCalledOnly)),
                      h.Class(
                        model.showCalledOnly
                          ? 'theme-text-muted rounded-lg text-sm font-semibold px-3 py-1.5'
                          : 'theme-btn-highlight rounded-lg text-sm font-bold px-3 py-1.5'
                      ),
                    ],
                    ['All 1–75']
                  ),
                  h.button(
                    [
                      h.Type('button'),
                      h.OnClick(Message.ToggledShowCalledOnly()),
                      h.Disabled(model.showCalledOnly),
                      h.AriaPressed(String(model.showCalledOnly)),
                      h.Class(
                        model.showCalledOnly
                          ? 'theme-btn-highlight rounded-lg text-sm font-bold px-3 py-1.5'
                          : 'theme-text-muted rounded-lg text-sm font-semibold px-3 py-1.5'
                      ),
                    ],
                    ['Called only']
                  ),
                ]
              ),
            ]
          ),
          renderResponsiveBoard(model, { interactive: false, calledOnly: model.showCalledOnly }, h),
        ]
      ),
    ]
  )
}
