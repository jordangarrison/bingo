import * as Array from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'

import { currentBall, formatBall } from '../domain/bingo'
import { Message } from '../message'
import type { ActiveTab, Model, ThemeId } from '../model'
import { callerView } from './caller'
import { liveView } from './live'
import { printView } from './print'

const TABS: readonly { readonly id: ActiveTab; readonly label: string }[] = [
  { id: 'live', label: 'Live board' },
  { id: 'caller', label: 'Caller' },
  { id: 'print', label: 'Print cards' },
]

const THEMES: readonly { readonly id: ThemeId; readonly label: string; readonly swatch: string }[] = [
  { id: 'felt', label: 'Pine Felt', swatch: 'bg-[#1b3b2b] border-[#e5a93c]' },
  { id: 'parchment', label: 'Parchment', swatch: 'bg-[#f4ece0] border-[#b83a16]' },
  { id: 'high-contrast', label: 'High Contrast', swatch: 'bg-white border-[#111111]' },
  { id: 'hearth', label: 'Hearth', swatch: 'bg-[#1c1917] border-[#f2b249]' },
]

const renderInviteGate = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.Class('max-w-md mx-auto mt-6 theme-surface rounded-2xl border p-6 flex flex-col gap-4')],
    [
      h.div(
        [h.Class('flex flex-col gap-1')],
        [
          h.h2([h.Class('font-display text-2xl font-extrabold')], ['Join Thanksgiving Bingo']),
          h.p([h.Class('theme-text-muted text-sm')], ['Enter the family room code to see the live board.']),
        ]
      ),
      h.form(
        [h.OnSubmit(Message.SubmittedInviteCode()), h.Class('flex flex-col gap-3')],
        [
          h.input([
            h.Type('text'),
            h.Attribute('autocomplete', 'one-time-code'),
            h.Placeholder('Room code'),
            h.Value(model.inviteInput),
            h.OnInput((value) => Message.ChangedInviteInput({ value })),
            h.Class(
              'theme-tile border rounded-xl px-4 py-3 text-lg font-bold text-center focus:outline-none focus:ring-2'
            ),
          ]),
          ...Option.match(model.authError, {
            onNone: () => [],
            onSome: (err) => [h.p([h.Class('theme-accent-text text-sm font-semibold text-center')], [err])],
          }),
          h.button(
            [
              h.Type('submit'),
              h.Disabled(model.authSubmitting || model.inviteInput.trim().length === 0),
              h.Class(
                'theme-btn-primary rounded-xl py-3 px-4 font-bold text-base disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
              ),
            ],
            [model.authSubmitting ? 'Joining…' : 'Join game']
          ),
        ]
      ),
    ]
  )

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const title = Option.match(currentBall(model.calledNumbers), {
    onNone: () => 'Thanksgiving Bingo',
    onSome: (num) => `${formatBall(num)} — Thanksgiving Bingo`,
  })

  const gated = model.inviteRequired && !model.viewerAuthenticated

  const content = gated
    ? renderInviteGate(model, h)
    : Match.value(model.activeTab).pipe(
        Match.when('live', () => liveView(model, h)),
        Match.when('caller', () => callerView(model, h)),
        Match.when('print', () => printView(model, h)),
        Match.exhaustive
      )

  return {
    title,
    body: h.div(
      [h.Class('theme-page min-h-screen flex flex-col')],
      [
        h.header(
          [h.Class('no-print theme-surface border-b sticky top-0 z-20')],
          [
            h.div(
              [h.Class('max-w-7xl mx-auto px-3 sm:px-6 py-3 flex flex-col gap-2.5')],
              [
                h.div(
                  [h.Class('flex flex-wrap items-center justify-between gap-2.5')],
                  [
                    h.div(
                      [h.Class('flex items-center gap-2.5')],
                      [
                        h.h1(
                          [h.Class('font-display text-xl sm:text-2xl font-extrabold tracking-tight')],
                          ['Thanksgiving Bingo']
                        ),
                        h.span(
                          [
                            h.Class(
                              model.syncConnected
                                ? 'inline-flex items-center gap-1.5 rounded-full theme-tile border px-2 py-0.5 text-xs font-semibold'
                                : 'inline-flex items-center gap-1.5 rounded-full theme-tile border px-2 py-0.5 text-xs font-medium opacity-70'
                            ),
                          ],
                          [
                            h.span(
                              [
                                h.Class(
                                  model.syncConnected
                                    ? 'w-2 h-2 rounded-full bg-emerald-500'
                                    : 'w-2 h-2 rounded-full bg-amber-400'
                                ),
                              ],
                              []
                            ),
                            h.span([], [model.syncConnected ? 'Live' : 'Offline']),
                          ]
                        ),
                      ]
                    ),
                    h.nav(
                      [h.AriaLabel('Bingo views'), h.Class('theme-tile inline-flex rounded-xl border p-1 gap-1')],
                      Array.map(TABS, (tab) => {
                        const active = model.activeTab === tab.id
                        return h.button(
                          [
                            h.Type('button'),
                            h.OnClick(Message.SelectedTab({ tab: tab.id })),
                            h.AriaPressed(String(active)),
                            h.Class(
                              active
                                ? 'theme-btn-highlight rounded-lg font-bold text-sm px-3 py-1.5 transition-colors'
                                : 'theme-text-muted rounded-lg font-semibold text-sm px-3 py-1.5 transition-colors'
                            ),
                          ],
                          [tab.label]
                        )
                      })
                    ),
                  ]
                ),
                h.div(
                  [h.Class('flex items-center gap-1.5 overflow-x-auto pb-0.5')],
                  [
                    h.span([h.Class('theme-text-muted text-xs font-semibold mr-1 shrink-0')], ['Color scheme']),
                    ...Array.map(THEMES, (theme) => {
                      const active = model.theme === theme.id
                      return h.button(
                        [
                          h.Type('button'),
                          h.OnClick(Message.SelectedTheme({ theme: theme.id })),
                          h.AriaPressed(String(active)),
                          h.Class(
                            active
                              ? 'theme-btn-highlight inline-flex items-center gap-1.5 rounded-full text-xs font-bold px-2.5 py-1 shrink-0'
                              : 'theme-btn-secondary inline-flex items-center gap-1.5 rounded-full border text-xs font-medium px-2.5 py-1 shrink-0'
                          ),
                        ],
                        [
                          h.span([h.Class(`w-3 h-3 rounded-full border-2 ${theme.swatch}`)], []),
                          h.span([], [theme.label]),
                        ]
                      )
                    }),
                  ]
                ),
              ]
            ),
          ]
        ),
        h.main([h.Class('flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6')], [content]),
      ]
    ),
  }
}
