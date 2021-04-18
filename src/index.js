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
//  NOTE: by default, withState() adds a 'state' (lowercase) source/sink to your application
//        the 2nd argument allows you to set any name for the state source/sink
const main = withState(App, 'STATE')

const drivers = {
  // DOM driver - attach app to the #root element
  //  - source provides a .select() method that takes a CSS selector to find DOM elements
  //    and then a .events() method to get a stream of the specified events
  //    EX: DOM.select('.my-class').events('click)
  //        returns a stream that emits a DOM Event object whenever elements with the .my-class class are clicked
  //  - sink expects vDom (JSX or Cycle DOM helpers) and renders to the specified contaiiner (#root) whenever vDom is received
  DOM:    makeDOMDriver('#root'),
  // DOM side effects driver for handling non-render interactions with the page
  // mostly useful for input fields on forms
  //  - no source events
  //  - sink expects an object like { type: 'SET_VALUE', selector: '#my-input-field' value: 'Abracadabara' }
  DOMFX:  DOMfxDriver,
  // driver to handle getting and putting data to local storage
  //  - source provides a .get() method that takes a 'key' to fetch from localstorage
  //    and optionally takes a second argument for a default value to use
  //  - sink expects an object like { key: 'localstorage-key', value: 'value to save' }
  STORE:  localStorageDriver,
  // driver for setting up page routes and getting routing events
  //  - source is a stream of routing events that emits the name of the new page route
  //  - sink accepts names of routes to listen for that will then be sent to the source
  ROUTER: routerDriver,
}

// start the Cycle application
run(main, drivers)
