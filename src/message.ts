import * as Schema from 'effect/Schema'
import { defineMessageUnion } from 'foldkit/message'

import { GamePatternId } from './domain/bingo'
import { ActiveTab, AuthStatus, PrintCount, SharedGameState, ThemeId } from './model'

export const Message = defineMessageUnion({
  SelectedTab: { tab: ActiveTab },
  SelectedTheme: { theme: ThemeId },
  ToggledShowCalledOnly: {},
  ReceivedSyncedGame: { game: SharedGameState },
  ChangedSyncConnection: { connected: Schema.Boolean },
  ChangedPinInput: { value: Schema.String },
  SubmittedCallerPin: {},
  ChangedInviteInput: { value: Schema.String },
  SubmittedInviteCode: {},
  ClickedLockCaller: {},
  SucceededAuth: { status: AuthStatus },
  FailedAuth: { error: Schema.String },
  RejectedCallerWrite: {},
  ClickedDrawBall: {},
  DrewBall: { number: Schema.Number },
  ToggledBoardNumber: { number: Schema.Number },
  ClickedUndoLastCall: {},
  ClickedNewGame: {},
  ConfirmedNewGame: {},
  CancelledNewGame: {},
  SelectedPattern: { patternId: GamePatternId },
  ToggledCustomPatternCell: { index: Schema.Number },
  ToggledVoice: {},
  SelectedPrintCount: { count: PrintCount },
  ClickedShufflePrintCards: {},
  GeneratedPrintBaseSeed: { seed: Schema.Number },
  ClickedPrintSheet: {},
  CompletedSideEffect: {},
})

export type Message = typeof Message.Type
