import xs from 'xstream'
import sampleCombine from 'xstream/extra/sampleCombine'
import dropUntil from 'xstream/extra/dropUntil'
import dropRepeats from 'xstream/extra/dropRepeats'
import { component } from './lib/cycleHelpers'
import { inputEvents, newId } from './lib/utils'

import todos from './components/todos'

const LABEL = 'APP'
window.DEBUG = false

// filtering options for the todo list
const FILTER_LIST = [ 'all', 'active', 'completed' ]

// COMPONENT FACTORY
// - accepts a 'sources' object (provided from Cycle)
// - returns a 'sinks' object
export function App(sources) {
  // initial state of the application
  const initialState = {visibility: 'all', todos: []}

  // create the component
  // - 'sources' is the only required parameter (in almost all cases you can just pass the incoming sources)
  // - 'children' is an object of sub-components
  //   + key is the name used for the child sinks, and the name used for the vDOM automatically provided to the 'view' function
  //   + value is a component factory function (sub-components will be instantiated automatically)
  return component({ name: LABEL, sources, intent, action, view, children: { todos }, initialState })
}





// INTENT FUNCTION   (optional, but needed to trigger any actions)
// - takes the 'sources' object
// - returns an object that maps 'intents' to 'actions'
//   + intents are signals from outside the component (events from sources) that indicate something should happen
//     * intents are just streams that 'fire' when an action should happen
//     * they can optionally include relevent data to help perform the action later
//   + actions are just a name/label for something that will happen
//     * we don't *DO* anything here... we are just collecting a stream of 'actions' to do later
//
// example:
//
// return { NAME_OF_ACTION: streamOfMeaningfulEvents }
//
function intent({STATE, DOM, ROUTER, STORE}) {
  // convert the array of filter types to a stream
  const addRoute$ = xs.fromArray(FILTER_LIST)

  // fetch stored todos from local storage
  //  - init to an empty array if no todos were found
  //  - wait until we get the initial state to avoid the retrieved todos getting overwritten
  const fromLocalStorage$ = STATE.stream
    // limit to the first state update
    .take(1)
    // when the first state update happens, take 1 event from the 'todos' localstorage key
    // - if we don't limit to one STORE event, we will get a new event every time we save the todos to localstorage
    .map( _ => STORE.get('todos', []).take(1) )
    // the map function above returns an event that is a stream...
    // .flatten() "flatens" the stream in the event into a normal value
    .flatten()

  // fetch state changes to trigger writes to localstorage
  // - only start after we get the todos from localstorage
  // - drop the first 2 events to avoid re-storing the originally fetched todos
  // - drop repeats so we don't store the same data twice
  const save$ = STATE.stream
    .compose(dropUntil(fromLocalStorage$))
    .drop(2)
    .compose(dropRepeats())

  // collect required DOM events and elements
  const toggleAll$       = DOM.select('.toggle-all').events('click')
  const clearCompleted$  = DOM.select('.clear-completed').events('click')
  const input$           = DOM.select('.new-todo')

  // get events from the input field
  //  - the inputEvents helper returns common events and automatically returns the current value
  const {value$, enter$} = inputEvents(input$)

  // create a stream of titles whenever a new todo is submitted
  // - wait until the 'enter' key is pressed
  // - map the event stream to just the 'title' (current value of the input)
  // - filter out blank titles
  const newTodo$ = enter$.compose(sampleCombine(value$))
                         .map(([ _, title ]) => title.trim())
                         .filter(title => title != '')

  // map the streams built above to 'action' names
  // - this list of names becomes the 'menu' of actions that can be applied
  //   in the 'action' section below
  // - the specified action will 'fire' every time the associated stream get an event
  // - the value of the emitted stream event will be passed as the 'data' to the action
  return {
    ADD_ROUTE:       addRoute$,
    FROM_STORE:      fromLocalStorage$,
    TO_STORE:        save$,
    VISIBILITY:      ROUTER,
    NEW_TODO:        newTodo$,
    TOGGLE_ALL:      toggleAll$,
    CLEAR_COMPLETED: clearCompleted$,
  }
}





// ACTIONS OBJECT   (optional, but requires 'intents' function if this is set)
// - maps 'actions' to 'reducers' or 'commands' which *DO* the action
// - the object should have a key for any 'sink' receiving a reducer or command
// - each 'sink' key should contain sub-keys for each 'action' to be acted on by that sink
// - the 'state' sink takes either a 'reducer' function, or an object:
//   + reducer functions are passed (state, data, next)
//     state: current state (global or isolated depending on component options)
//     data:  any data found in the event that triggered this action
//     next:  function to set a follow-up action to perform e.g. next('SOME_OTHER_ACTION', dataForTheNextAction)
//     return: reducers should return the new state.. usually something like `return { ...state, changed: 'new value' }`
//             (the special constant ABORT can be returned to stop antyhing from happening)
//   + object: will replace the current state with the object provided
// - all other sinks take a command function, object, or boolean true
//   + function: called with (data, next)
//     data:  any data found in the event that triggered this action
//     next:  function to set a follow-up action to perform e.g. next('SOME_OTHER_ACTION', dataForTheNextAction)
//     return: whatever input is expected by the sink
//             (the special constant ABORT will stop antyhing from happening)
//   + object: will be passed 'as is' to the sink
//   + boolean true: will cause the data from the triggering stream to be passed directly to the sink
// - the 'INITIALIZE' and 'BOOTSTRAP' actions are fired automatically whenever the component is instantiated
//   + INITIALIZE: run immediately upon instantiation, and can ONLY be passed to the STATE sink.
//                 The 'data' is the value of initialData provided to component()
//                 if no INITIALIZE action is specified, the initialData will
//                 automatically be set as the state
//   + BOOTSTRAP:  run after the initial state is set.  useful for triggering fetches for remote data or other startup tasks
//                 and can be passed to any valid sink
//
//  example:
//
//  const action = {
//    SINK_NAME: {
//      ACTION_NAME: (data, next) => {
//        const dataForFollowUp = data.myValue
//        next('SOME_FOLLOW_UP_ACTION', dataForFollowUp)
//        return { properties: 'expected by the sink', moreData: 'data is good' }
//      }
//    },
//    ANOTHER_SINK: {
//      SOME_FOLLOW_UP_ACTION: (data, next) => ({ valuesFor: 'this other sink})
//    }
//  }
//
const action = {

  // state sink actions
  // - takes reducer functions that return the updated state
  STATE: {
    // INITIALIZE: (state, data) => ({ ...data }),
    FROM_STORE: (state, data) => ({ ...state, todos: data }),
    // change the visibility filter for the todos
    VISIBILITY: (state, data) => ({ ...state, visibility: data }),
    // add new todo
    NEW_TODO:   (state, data, next) => {
      // calculate next id
      const nextId = newId(state.todos)

      // send a new action to clear the new todo field
      next('CLEAR_FORM')

      // build new todo object
      const newTodo = {
        id: nextId,
        title: data,
        completed: false
      }

      // add the new todo to the state
      return {
        ...state,
        todos: [ ...state.todos, newTodo ]
      }
    },
    // toggle completed status of all todos
    TOGGLE_ALL: (state, _) => {
      // are all todos completed?
      const allDone = state.todos.filter(todo => !todo.completed).length === 0
      // update all todos (all to complete if some were not completed... all to NOT completed if they were all already completed)
      const todos = state.todos.map(todo => ({...todo, completed: allDone?false:true}))
      return { ...state, todos }
    },
    // remove all completed todos
    CLEAR_COMPLETED: (state, _) => {
      // filter out any todos set to 'completed'
      const todos = state.todos.filter(todo => !todo.completed)
      return { ...state, todos }
    },

  },

  // DOM Side Effects sink
  // - commands to perform effects that can't be done through re-rendering
  // - common examples are setting 'focus', changing the value of a focused input field, scrolling, etc.
  // NOTE: almost all normal application tasks can be done without programatically touching the DOM
  //       if you use this for more than focusing input fields or scrolling, there's a VERY good chance
  //       that you are overcomplicating the task, or not thinking in a 'streams/observables' way
  DOMFX: {
    // send a command to clear the 'new todo' form
    CLEAR_FORM: { type: 'SET_VALUE', data: { selector: '.new-todo' } },
  },

  // Local storage sink
  // - used to save data to local storage at the provided key
  STORE: {
    TO_STORE:   (data) => ({ key: 'todos', value: data.todos }),
  },

  // browser navigation router
  // - names sent to this sink will cause the 'router' source to fire when the browser navigates to that name (e.g. mysite.com/#/mySuperSpecialRoute)
  // - the boolean 'true' value causes the value of the triggering stream (from the 'intent' function) to be sent on directly
  ROUTER: {
    ADD_ROUTE: true,
  }
}






// VIEW FUNCTION   (optional, but makes for a boring component without it!)
// - receives an object with a key for state, and a key for each component specified in the 'children' parameter of component()
// - the child components will have the same name as the key name provided to the 'children' parameter
// - should return vDom (use either JSX or Cycle's DOM helpers)
// - children vDoms are already rendered and can be added 'as is' to your JSX or DOM as normal javascript variables
//   + vDom from child components that are 'collections' are arrays, so can optionally be iterated over when needed
//
function view({STATE, todos}) {
  // total todos
  const total      = STATE.todos.length
  // number of todos that haven't been marked as complete
  const remaining  = STATE.todos.filter(todo => !todo.completed).length
  // number of completed todos
  const completed  = total - remaining
  // are all todos completed?
  const allDone    = remaining === 0

  // render helpers
  const selected   = (visibility => filter => visibility === filter ? ' selected' : '')(STATE.visibility)

  return (
    <section className="todoapp">
      { header() }
      { (total > 0) ? main(allDone, todos) : '' }
      { (total > 0) ? footer(selected, remaining, completed) : '' }
    </section>
  )
}







function header() {
  return (
    <header className="header">
      <h1>todos</h1>
      <input className="new-todo" autofocus autocomplete="off" placeholder="What needs to be done?" />
    </header>
  )
}

function main(allDone, todos) {
  return (
    <section className="main">
      <input id="toggle-all" className="toggle-all" type="checkbox" checked={allDone} />
      <label for="toggle-all">Mark all as complete</label>
      <ul className="todo-list">
        { todos }
      </ul>
    </section>
  )
}

function footer(selected, remaining, completed) {
  return (
    <footer className="footer">
      { todoCount(remaining) }
      { filters(selected) }
      { (completed > 0) ? clearCompleted() : '' }
    </footer>
  )
}

function todoCount(remaining) {
  return (
    <span className="todo-count">
      <strong>{ remaining }</strong> { (remaining === 1) ? 'item' : 'items' } left
    </span>
  )
}

function filters(selected) {
  const capitalize = word => word.charAt(0).toUpperCase() + word.slice(1)
  const links = FILTER_LIST
  const renderLink = link => <li><a href={ `#/${link}` } className={ selected(link) }>{ capitalize(link) }</a></li>
  return (
    <ul className="filters">
      { links.map(renderLink) }
    </ul>
  )
}

function clearCompleted() {
  return <button className="clear-completed">Clear completed</button>
}