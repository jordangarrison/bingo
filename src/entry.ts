import { Runtime } from 'foldkit'

import { Flags, flags, init, Message, Model, subscriptions, update, view } from './main'

const application = Runtime.makeApplication({
  Model,
  Flags,
  init,
  update,
  view,
  subscriptions,
  container: document.querySelector('#root'),
  devTools: {
    Message,
  },
})

Runtime.run(application, { flags })
