import * as Array from 'effect/Array'
import * as Option from 'effect/Option'
import type { Html, HtmlBuilder } from 'foldkit/html'

import {
  currentBall,
  FREE_CELL_INDEX,
  GAME_PATTERNS,
  letterForNumber,
  MAX_BINGO_NUMBER,
  patternById,
  patternMaskFor,
  recentHistory,
} from '../domain/bingo'
import { Message } from '../message'
import type { Model } from '../model'
import { renderResponsiveBoard } from './board'

const renderCurrentBall = (model: Model, h: HtmlBuilder<Message>): Html => {
  const latest = currentBall(model.calledNumbers)
  const remainingCount = MAX_BINGO_NUMBER - model.calledNumbers.length

  return h.div(
    [h.Class('theme-surface rounded-2xl border p-5 flex flex-col items-center gap-4')],
    [
      Option.match(latest, {
        onNone: () =>
          h.div(
            [
              h.Class(
                'theme-tile w-40 h-40 rounded-full border-4 border-dashed flex flex-col items-center justify-center text-center px-4'
              ),
            ],
            [
              h.span([h.Class('font-display text-2xl font-bold')], ['Ready']),
              h.span([h.Class('theme-text-muted text-xs mt-1')], ['Draw a ball or tap any number']),
            ]
          ),
        onSome: (num) =>
          h.div(
            [
              h.Key(`ball-${num}`),
              h.AriaLive('polite'),
              h.Class(
                'animate-ball-pop theme-ball w-40 h-40 rounded-full border-4 shadow-xl flex flex-col items-center justify-center'
              ),
            ],
            [
              h.span(
                [h.Class('theme-accent-text font-display text-3xl font-extrabold leading-none')],
                [letterForNumber(num)]
              ),
              h.span([h.Class('font-display text-6xl font-extrabold tabular-nums leading-none mt-1')], [String(num)]),
            ]
          ),
      }),
      h.button(
        [
          h.Type('button'),
          h.OnClick(Message.ClickedDrawBall()),
          h.Disabled(remainingCount === 0),
          h.Class(
            'theme-btn-primary w-full rounded-xl disabled:opacity-40 disabled:cursor-not-allowed font-bold text-lg py-3.5 px-5 transition-colors shadow-md'
          ),
        ],
        [remainingCount === 0 ? 'All 75 balls called' : 'Draw ball']
      ),
      h.div(
        [h.Class('w-full grid grid-cols-3 gap-2')],
        [
          h.button(
            [
              h.Type('button'),
              h.OnClick(Message.ClickedUndoLastCall()),
              h.Disabled(model.calledNumbers.length === 0),
              h.Class(
                'theme-btn-secondary rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold py-2.5 px-2 transition-colors'
              ),
            ],
            ['Undo']
          ),
          h.button(
            [
              h.Type('button'),
              h.OnClick(Message.ToggledVoice()),
              h.AriaPressed(String(model.voiceEnabled)),
              h.Class(
                model.voiceEnabled
                  ? 'theme-btn-highlight rounded-lg text-sm font-bold py-2.5 px-2 transition-colors'
                  : 'theme-btn-secondary rounded-lg border text-sm font-semibold py-2.5 px-2 transition-colors'
              ),
            ],
            [model.voiceEnabled ? 'Voice on' : 'Voice off']
          ),
          h.button(
            [
              h.Type('button'),
              h.OnClick(Message.ClickedNewGame()),
              h.Disabled(model.calledNumbers.length === 0),
              h.Class(
                'theme-btn-secondary rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold py-2.5 px-2 transition-colors'
              ),
            ],
            ['New game']
          ),
        ]
      ),
      ...(model.confirmingNewGame
        ? [
            h.div(
              [h.Class('theme-tile w-full rounded-xl border p-3.5 flex flex-col gap-2.5 text-sm')],
              [
                h.p(
                  [h.Class('font-semibold')],
                  [`Clear all ${model.calledNumbers.length} called numbers for everyone?`]
                ),
                h.div(
                  [h.Class('flex gap-2')],
                  [
                    h.button(
                      [
                        h.Type('button'),
                        h.OnClick(Message.ConfirmedNewGame()),
                        h.Class('theme-btn-primary flex-1 rounded-lg font-semibold py-2 px-3'),
                      ],
                      ['Clear board']
                    ),
                    h.button(
                      [
                        h.Type('button'),
                        h.OnClick(Message.CancelledNewGame()),
                        h.Class('theme-btn-secondary flex-1 rounded-lg border font-semibold py-2 px-3'),
                      ],
                      ['Keep playing']
                    ),
                  ]
                ),
              ]
            ),
          ]
        : []),
    ]
  )
}

const renderRecentCalls = (model: Model, h: HtmlBuilder<Message>): Html => {
  const previous = recentHistory(model.calledNumbers, 5)

  return h.div(
    [h.Class('theme-surface rounded-2xl border p-4 flex flex-col gap-2.5')],
    [
      h.div(
        [h.Class('flex items-center justify-between text-sm')],
        [
          h.span([h.Class('font-semibold')], ['Previous calls']),
          h.span([h.Class('theme-text-muted tabular-nums')], [`${model.calledNumbers.length} of ${MAX_BINGO_NUMBER}`]),
        ]
      ),
      previous.length === 0
        ? h.p([h.Class('theme-text-muted text-xs')], ['Recent balls appear here as you call them.'])
        : h.div(
            [h.Class('flex flex-wrap gap-2')],
            Array.map(previous, (num) =>
              h.span(
                [
                  h.Class(
                    'theme-called border inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold tabular-nums'
                  ),
                ],
                [h.span([h.Class('theme-accent-text font-display')], [letterForNumber(num)]), h.span([], [String(num)])]
              )
            )
          ),
    ]
  )
}

const renderPatternPanel = (model: Model, h: HtmlBuilder<Message>): Html => {
  const activeMask = patternMaskFor(model.patternId, model.customPatternMask)
  const activeSummary =
    model.patternId === 'custom'
      ? 'Custom house-rule pattern. Tap squares to edit.'
      : Option.match(patternById(model.patternId), {
          onNone: () => 'Tap squares to sketch any winning shape.',
          onSome: (preset) => preset.summary,
        })

  return h.div(
    [h.Class('theme-surface rounded-2xl border p-4 flex flex-col gap-3')],
    [
      h.div(
        [h.Class('flex items-center justify-between gap-2')],
        [
          h.span([h.Class('font-semibold text-sm')], ['Round pattern']),
          h.span([h.Class('theme-text-muted text-xs')], ['Tap grid for custom']),
        ]
      ),
      h.div(
        [h.Class('flex gap-4 items-start')],
        [
          h.div(
            [h.Class('theme-tile grid grid-cols-5 gap-1 shrink-0 p-1.5 rounded-lg border')],
            Array.map(activeMask, (filled, index) =>
              h.button(
                [
                  h.Type('button'),
                  h.OnClick(Message.ToggledCustomPatternCell({ index })),
                  h.AriaLabel(`Toggle pattern cell ${index + 1}`),
                  h.AriaPressed(String(filled)),
                  h.Class(
                    filled
                      ? 'theme-letter-badge w-6 h-6 rounded-sm text-[10px] font-bold flex items-center justify-center'
                      : 'theme-surface border w-6 h-6 rounded-sm theme-text-dim text-[10px] flex items-center justify-center'
                  ),
                ],
                [index === FREE_CELL_INDEX ? '★' : '']
              )
            )
          ),
          h.div(
            [h.Class('flex flex-col gap-2 min-w-0 flex-1')],
            [
              h.div(
                [h.Class('flex flex-wrap gap-1.5')],
                Array.map(GAME_PATTERNS, (preset) => {
                  const selected = model.patternId === preset.id
                  return h.button(
                    [
                      h.Type('button'),
                      h.OnClick(Message.SelectedPattern({ patternId: preset.id })),
                      h.AriaPressed(String(selected)),
                      h.Class(
                        selected
                          ? 'theme-btn-highlight rounded-md font-bold text-xs px-2.5 py-1.5'
                          : 'theme-btn-secondary rounded-md border text-xs font-medium px-2.5 py-1.5'
                      ),
                    ],
                    [preset.label]
                  )
                })
              ),
              h.p([h.Class('theme-text-muted text-xs leading-snug')], [activeSummary]),
            ]
          ),
        ]
      ),
    ]
  )
}

const renderCallerUnlock = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.Class('max-w-md mx-auto theme-surface rounded-2xl border p-6 flex flex-col gap-4')],
    [
      h.div(
        [h.Class('flex flex-col gap-1')],
        [
          h.h2([h.Class('font-display text-2xl font-extrabold')], ['Unlock caller controls']),
          h.p(
            [h.Class('theme-text-muted text-sm')],
            ['Enter the Caller PIN to draw balls, mark numbers, or start a new game.']
          ),
        ]
      ),
      h.form(
        [h.OnSubmit(Message.SubmittedCallerPin()), h.Class('flex flex-col gap-3')],
        [
          h.input([
            h.Type('password'),
            h.Attribute('inputmode', 'numeric'),
            h.Attribute('autocomplete', 'one-time-code'),
            h.Placeholder('Caller PIN'),
            h.Value(model.pinInput),
            h.OnInput((value) => Message.ChangedPinInput({ value })),
            h.Class(
              'theme-tile border rounded-xl px-4 py-3 text-lg font-bold tracking-widest text-center focus:outline-none focus:ring-2'
            ),
          ]),
          ...Option.match(model.authError, {
            onNone: () => [],
            onSome: (err) => [h.p([h.Class('theme-accent-text text-sm font-semibold text-center')], [err])],
          }),
          h.button(
            [
              h.Type('submit'),
              h.Disabled(model.authSubmitting || model.pinInput.trim().length === 0),
              h.Class(
                'theme-btn-primary rounded-xl py-3 px-4 font-bold text-base disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
              ),
            ],
            [model.authSubmitting ? 'Checking PIN…' : 'Unlock caller']
          ),
        ]
      ),
    ]
  )

export const callerView = (model: Model, h: HtmlBuilder<Message>): Html => {
  if (!model.callerAuthenticated) {
    return renderCallerUnlock(model, h)
  }

  return h.div(
    [h.Class('grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-5 items-start')],
    [
      h.div(
        [h.Class('flex flex-col gap-4')],
        [renderCurrentBall(model, h), renderRecentCalls(model, h), renderPatternPanel(model, h)]
      ),
      h.section(
        [h.Class('theme-surface rounded-2xl border p-4 sm:p-6 flex flex-col gap-4')],
        [
          h.div(
            [h.Class('flex flex-wrap items-center justify-between gap-2')],
            [
              h.div(
                [h.Class('flex flex-col')],
                [
                  h.h2([h.Class('font-display text-xl sm:text-2xl font-bold')], ['Caller board']),
                  h.p(
                    [h.Class('theme-text-muted text-xs sm:text-sm')],
                    ['Tap any number to call or uncall it manually.']
                  ),
                ]
              ),
              h.button(
                [
                  h.Type('button'),
                  h.OnClick(Message.ClickedLockCaller()),
                  h.Class('theme-btn-secondary rounded-lg border text-xs font-semibold px-3 py-1.5'),
                ],
                ['Lock caller']
              ),
            ]
          ),
          renderResponsiveBoard(model, { interactive: true, calledOnly: false }, h),
        ]
      ),
    ]
  )
}
