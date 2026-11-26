import * as Array from 'effect/Array'
import * as Option from 'effect/Option'
import type { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import {
  AnnounceBall,
  ApplyTheme,
  DrawRandomBall,
  GeneratePrintSeed,
  LogoutCaller,
  persistSharedGameCommand,
  saveLocalPrefsCommand,
  SubmitCallerPin,
  SubmitInviteCode,
  TriggerPrint,
} from './command'
import { patternMaskFor, remainingNumbers, toggleMaskCell, TOTAL_CELLS } from './domain/bingo'
import { Message } from './message'
import type { Model } from './model'

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    SelectedTab: ({ tab }) => ({
      model: modifyFields(model, {
        activeTab: () => tab,
        confirmingNewGame: () => false,
        authError: () => Option.none(),
      }),
    }),

    SelectedTheme: ({ theme }) => {
      const nextModel = modifyFields(model, { theme: () => theme })
      return {
        model: nextModel,
        commands: [ApplyTheme({ theme }), saveLocalPrefsCommand(nextModel)],
      }
    },

    ToggledShowCalledOnly: () => {
      const nextModel = modifyFields(model, { showCalledOnly: (value) => !value })
      return {
        model: nextModel,
        commands: [saveLocalPrefsCommand(nextModel)],
      }
    },

    ReceivedSyncedGame: ({ game }) => ({
      model: modifyFields(model, {
        calledNumbers: () => game.calledNumbers,
        patternId: () => game.patternId,
        customPatternMask: (prev) => (game.customPatternMask.length === TOTAL_CELLS ? game.customPatternMask : prev),
        syncConnected: () => true,
      }),
    }),

    ChangedSyncConnection: ({ connected }) => ({
      model: modifyFields(model, { syncConnected: () => connected }),
    }),

    ChangedPinInput: ({ value }) => ({
      model: modifyFields(model, {
        pinInput: () => value,
        authError: () => Option.none(),
      }),
    }),

    SubmittedCallerPin: () => {
      const trimmed = model.pinInput.trim()
      if (trimmed.length === 0 || model.authSubmitting) {
        return { model }
      }
      return {
        model: modifyFields(model, {
          authSubmitting: () => true,
          authError: () => Option.none(),
        }),
        commands: [SubmitCallerPin({ pin: trimmed })],
      }
    },

    ChangedInviteInput: ({ value }) => ({
      model: modifyFields(model, {
        inviteInput: () => value,
        authError: () => Option.none(),
      }),
    }),

    SubmittedInviteCode: () => {
      const trimmed = model.inviteInput.trim()
      if (trimmed.length === 0 || model.authSubmitting) {
        return { model }
      }
      return {
        model: modifyFields(model, {
          authSubmitting: () => true,
          authError: () => Option.none(),
        }),
        commands: [SubmitInviteCode({ code: trimmed })],
      }
    },

    ClickedLockCaller: () => ({
      model: modifyFields(model, {
        callerAuthenticated: () => false,
        confirmingNewGame: () => false,
      }),
      commands: [LogoutCaller({})],
    }),

    SucceededAuth: ({ status }) => ({
      model: modifyFields(model, {
        callerAuthenticated: () => status.callerAuthenticated,
        viewerAuthenticated: () => status.viewerAuthenticated,
        inviteRequired: () => status.inviteRequired,
        pinInput: () => '',
        inviteInput: () => '',
        authError: () => Option.none(),
        authSubmitting: () => false,
      }),
    }),

    FailedAuth: ({ error }) => ({
      model: modifyFields(model, {
        authError: () => Option.some(error),
        authSubmitting: () => false,
      }),
    }),

    RejectedCallerWrite: () => ({
      model: modifyFields(model, {
        callerAuthenticated: () => false,
        authError: () => Option.some('Caller session locked. Enter the Caller PIN to continue.'),
      }),
    }),

    ClickedDrawBall: () => {
      const pool = remainingNumbers(model.calledNumbers)
      if (!model.callerAuthenticated || pool.length === 0) {
        return { model }
      }
      return {
        model: modifyFields(model, { confirmingNewGame: () => false }),
        commands: [DrawRandomBall({ pool })],
      }
    },

    DrewBall: ({ number }) => {
      if (!model.callerAuthenticated || Array.contains(model.calledNumbers, number)) {
        return { model }
      }
      const nextModel = modifyFields(model, {
        calledNumbers: (called) => Array.append(called, number),
        confirmingNewGame: () => false,
      })
      const commands = model.voiceEnabled
        ? [persistSharedGameCommand(nextModel), AnnounceBall({ number })]
        : [persistSharedGameCommand(nextModel)]
      return { model: nextModel, commands }
    },

    ToggledBoardNumber: ({ number }) => {
      if (!model.callerAuthenticated) {
        return { model }
      }
      const alreadyCalled = Array.contains(model.calledNumbers, number)
      const nextModel = modifyFields(model, {
        calledNumbers: (called) =>
          alreadyCalled ? Array.filter(called, (item) => item !== number) : Array.append(called, number),
        confirmingNewGame: () => false,
      })
      const commands =
        !alreadyCalled && model.voiceEnabled
          ? [persistSharedGameCommand(nextModel), AnnounceBall({ number })]
          : [persistSharedGameCommand(nextModel)]
      return { model: nextModel, commands }
    },

    ClickedUndoLastCall: () => {
      if (!model.callerAuthenticated || model.calledNumbers.length === 0) {
        return { model }
      }
      const nextModel = modifyFields(model, {
        calledNumbers: (called) => Array.dropRight(called, 1),
        confirmingNewGame: () => false,
      })
      return { model: nextModel, commands: [persistSharedGameCommand(nextModel)] }
    },

    ClickedNewGame: () => {
      if (!model.callerAuthenticated || model.calledNumbers.length === 0) {
        return { model }
      }
      return {
        model: modifyFields(model, { confirmingNewGame: () => true }),
      }
    },

    ConfirmedNewGame: () => {
      if (!model.callerAuthenticated) {
        return { model }
      }
      const nextModel = modifyFields(model, {
        calledNumbers: () => [],
        confirmingNewGame: () => false,
      })
      return { model: nextModel, commands: [persistSharedGameCommand(nextModel)] }
    },

    CancelledNewGame: () => ({
      model: modifyFields(model, { confirmingNewGame: () => false }),
    }),

    SelectedPattern: ({ patternId }) => {
      if (!model.callerAuthenticated) {
        return { model }
      }
      const nextModel = modifyFields(model, { patternId: () => patternId })
      return { model: nextModel, commands: [persistSharedGameCommand(nextModel)] }
    },

    ToggledCustomPatternCell: ({ index }) => {
      if (!model.callerAuthenticated) {
        return { model }
      }
      const currentMask = patternMaskFor(model.patternId, model.customPatternMask)
      const nextMask = toggleMaskCell(currentMask, index)
      const nextModel = modifyFields(model, {
        patternId: () => 'custom',
        customPatternMask: () => nextMask,
      })
      return { model: nextModel, commands: [persistSharedGameCommand(nextModel)] }
    },

    ToggledVoice: () => {
      const nextModel = modifyFields(model, { voiceEnabled: (enabled) => !enabled })
      return { model: nextModel, commands: [saveLocalPrefsCommand(nextModel)] }
    },

    SelectedPrintCount: ({ count }) => {
      const nextModel = modifyFields(model, { printCount: () => count })
      return { model: nextModel, commands: [saveLocalPrefsCommand(nextModel)] }
    },

    ClickedShufflePrintCards: () => ({
      model,
      commands: [GeneratePrintSeed({})],
    }),

    GeneratedPrintBaseSeed: ({ seed }) => {
      const nextModel = modifyFields(model, { printBaseSeed: () => seed })
      return { model: nextModel, commands: [saveLocalPrefsCommand(nextModel)] }
    },

    ClickedPrintSheet: () => ({
      model,
      commands: [TriggerPrint({})],
    }),

    CompletedSideEffect: () => ({ model }),
  })
