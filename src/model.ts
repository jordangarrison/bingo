import * as Schema from 'effect/Schema'

import { GamePatternId } from './domain/bingo'

export const ActiveTab = Schema.Literals(['live', 'caller', 'print'])
export type ActiveTab = typeof ActiveTab.Type

export const ThemeId = Schema.Literals(['felt', 'parchment', 'high-contrast', 'hearth'])
export type ThemeId = typeof ThemeId.Type

export const PrintCount = Schema.Literals([2, 4, 6, 8, 12])
export type PrintCount = typeof PrintCount.Type

export const AuthStatus = Schema.Struct({
  callerAuthenticated: Schema.Boolean,
  viewerAuthenticated: Schema.Boolean,
  inviteRequired: Schema.Boolean,
})
export type AuthStatus = typeof AuthStatus.Type

export const AuthStatusJsonString = Schema.fromJsonString(AuthStatus)

export const SharedGameState = Schema.Struct({
  calledNumbers: Schema.Array(Schema.Number),
  patternId: GamePatternId,
  customPatternMask: Schema.Array(Schema.Boolean),
})
export type SharedGameState = typeof SharedGameState.Type

export const SharedGameStateJsonString = Schema.fromJsonString(SharedGameState)

export const LocalPrefs = Schema.Struct({
  theme: ThemeId,
  voiceEnabled: Schema.Boolean,
  showCalledOnly: Schema.Boolean,
  printBaseSeed: Schema.Number,
  printCount: PrintCount,
})
export type LocalPrefs = typeof LocalPrefs.Type

export const LocalPrefsJsonString = Schema.fromJsonString(LocalPrefs)

export const Model = Schema.Struct({
  activeTab: ActiveTab,
  theme: ThemeId,
  calledNumbers: Schema.Array(Schema.Number),
  patternId: GamePatternId,
  customPatternMask: Schema.Array(Schema.Boolean),
  voiceEnabled: Schema.Boolean,
  showCalledOnly: Schema.Boolean,
  confirmingNewGame: Schema.Boolean,
  printBaseSeed: Schema.Number,
  printCount: PrintCount,
  syncConnected: Schema.Boolean,
  callerAuthenticated: Schema.Boolean,
  viewerAuthenticated: Schema.Boolean,
  inviteRequired: Schema.Boolean,
  pinInput: Schema.String,
  inviteInput: Schema.String,
  authError: Schema.Option(Schema.String),
  authSubmitting: Schema.Boolean,
})
export type Model = typeof Model.Type

export const toSharedGameState = (model: Model): SharedGameState => ({
  calledNumbers: model.calledNumbers,
  patternId: model.patternId,
  customPatternMask: model.customPatternMask,
})

export const toLocalPrefs = (model: Model): LocalPrefs => ({
  theme: model.theme,
  voiceEnabled: model.voiceEnabled,
  showCalledOnly: model.showCalledOnly,
  printBaseSeed: model.printBaseSeed,
  printCount: model.printCount,
})
