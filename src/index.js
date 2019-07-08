import {run} from '@cycle/run'
import {makeDOMDriver} from '@cycle/dom'
import DOMfxDriver from './lib/DOMfxDriver'
import localStorageDriver from './lib/localStorageDriver'
import routerDriver from './lib/routerDriver'
import {withState} from '@cycle/state'
import {App} from './app'

// add hierarchical state handling using reducers by wrapping the App with "withState" from @cycle/state
//  - a "state" sink is automatically added to the root component and any child components using the "isolate" wrapper
//  - state is updated by emitting a stream of reducers to the "state" sink
//  - each level of the app hierarchy is automatically scoped so reducers effect only that components state
//  - see docs for @cycle/state and @cycle/isolate for more information
const main = withState(App)

const drivers = {
  // DOM driver - attach app to the #root element 
  DOM:    makeDOMDriver('#root'),
  // DOM side effects driver for handling non-render interactions with the page
  // mostly useful for input fields on forms
  DOMfx:  DOMfxDriver,
  // driver to handle getting and putting data to local storage
  store:  localStorageDriver,
  // driver for setting up page routes and getting routing events
  router: routerDriver,
}

run(main, drivers)
