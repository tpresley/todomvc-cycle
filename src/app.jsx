import xs from 'xstream'
import sampleCombine from 'xstream/extra/sampleCombine'
import debounce from 'xstream/extra/debounce'
import delay from 'xstream/extra/delay'
import {setAction as set, makeOnAction, inputEvents, ABORT, newId, makeLog} from './lib/utils'
import todos from './components/todos'

const log = makeLog('APP')
const FILTER_LIST = ['all', 'active', 'completed']

// root component
//
// sources:
//  - state: stream of application state objects
//    + automatically added by @cycle/state
//    + send reducer functions to the state sink to update state (see @cycle/state documentation for details)
//    + new state is emitted on the state source
//  - DOM: searchable collection of DOM elements
//    + search for elements by DOM selector using the .select() method
//    + after running .select(), get a stream of events by running .events()
//  - router: add page hash routes and receive a stream of routing events
//    + pass one or more paths to the route sink to set up routes
//    + routing events for the paths you sent will then be emitted to the route source
//  - store: access to get or set data to local storage
//    + use .get(key) to fetch values
//    + send objects of shape {key: 'key', value: 'value'} to the store sink to save to local storage
//    + data is automatically converted to and from JSON  
//
export function App ({state, DOM, router, store}) {
  const state$           = state.stream
  
  // initial state of the application
  const initialState     = {visibility: 'all'}
  
  // fetch stored todos from local storage
  //  - init to an empty array if no todos were found
  const store$           = store.get('todos')
                                .map(todos => todos || [])

  // combine initial state with todos from local storage
  // and convert the data to a reducer
  const initialReducer$  = xs.combine(xs.of(initialState), store$)
                             .map(([initialState, todosFromStorage]) => (state, _) => ({ ...initialState, todos: todosFromStorage }))

  // collect required DOM events and elements
  const toggleAll$       = DOM.select('.toggle-all').events('click')
  const clearCompleted$  = DOM.select('.clear-completed').events('click')
  const input$           = DOM.select('.new-todo')
  
  // get events from the input field
  //  - the inputEvents helper returns common events and automatically returns the current value
  const {value$, enter$} = inputEvents(input$)

  // instantiate the todos coomponent
  const {state: todoReducer$, DOM: todoVdom$, DOMfx: todoDomfx$} = todos({state, DOM})

  // create a stream of titles whenever a new todo is submitted
  const newTodo$ = enter$.compose(sampleCombine(value$))
                         .map(([_, title]) => title)

  // add routes to handle filtering based on browser path
  const route$ = xs.fromArray(FILTER_LIST)
  
  // map streams to actions
  //  - the "set" helper maps the input stream to "action" objects, e.g. {type: 'SOME_ACTION', data: 'value emitted from input stream'}
  const action$ = xs.merge(
    set('VISIBILITY',      router),
    set('NEW_TODO',        newTodo$),
    set('TOGGLE_ALL',      toggleAll$),
    set('CLEAR_COMPLETED', clearCompleted$),
  )
  .compose(log(({type}) => 'Action: ' + type))

  // initialize the "on" helper
  //  - this helper returns the action$ stream filtered for a specific action type
  //  - the returned stream depends on the 2nd argument:
  //    + if not provided, the action$ stream is filtered and returned
  //    + if a function, the function will be emitted and called with the current state, the value from the action, and a "next" function
  //      > the "next" function is used to initiate a new action. this can be used for follow up operations, and is emitted on the action$ stream
  //    + if anything else, that value will be emitted when the action happens
  const on = makeOnAction(action$)

  // map actions into state reducers
  const reducer$ = xs.merge(
    // change the visibility filter for the todos
    on('VISIBILITY', (state, data) => ({...state, visibility: data})),
    // add new todo
    on('NEW_TODO',   (state, data, next) => {
      // abort action if todo title is blank
      if (!data.trim()) return ABORT
      // calculate next id
      const nextId = newId(state.todos)

      // send a new action to clear the new todo field
      next('CLEAR_FORM')

      // add the new todo to the state
      return {
        ...state, 
        todos: [
          ...state.todos, 
          {
            id: nextId, 
            title: data, 
            completed: false
          }
        ]
      }
    }),
    // toggle completed status of all todos
    on('TOGGLE_ALL', (state, _) => {
      const allDone = state.todos.filter(todo => !todo.completed).length === 0
      return {...state, todos: state.todos.map(todo => ({...todo, completed: allDone?false:true}))}
    }),
    // remove all completed todos
    on('CLEAR_COMPLETED', (state, _) => {
      return {...state, todos: state.todos.filter(todo => !todo.completed)}
    }),
  )
  .filter(reducer => reducer !== ABORT)
  .compose(log('State Reducer Added'))

  // map DOM side effect actions 
  //  - delay the stream events 5ms to ensure latest state changes are rendered before applying side effects
  const DOMfx$ = xs.merge(
    on('CLEAR_FORM', {type: 'SET_VALUE', data: {selector: '.new-todo'}}),
  )
  .compose(delay(5))
  .compose(log(({type}) => 'DOM Side Effect Requested: ' + type))

  // render the view
  const vdom$ = xs.combine(state$, todoVdom$).compose(debounce(1)).map(([state, visibleTodos]) => {
    // total todos
    const total      = state.todos.length
    // number of todos that haven't been marked as complete
    const remaining  = state.todos.filter(todo => !todo.completed).length
    // number of completed todos
    const completed  = total - remaining
    // are all todos completed?
    const allDone    = remaining === 0
    
    // render helpers
    const selected   = (visibility => filter => visibility === filter ? ' selected' : '')(state.visibility)
    
    return (
      <section className="todoapp">
        {renderHeader()}
        {(total > 0) ? renderMain(allDone, visibleTodos) : ''}
        {(total > 0) ? renderFooter(selected, remaining, completed) : ''}
      </section>
    )
  })
  .compose(log('View Rendered'))

  // collect and return sinks
  return {
    state:  xs.merge(initialReducer$, reducer$, todoReducer$),
    DOM:    vdom$,
    DOMfx:  xs.merge(DOMfx$, todoDomfx$),
    store:  state$.map(state => ({key: 'todos', value: state.todos})),
    router: route$,
  }
}

function renderHeader() {
  return (
    <header className="header">
      <h1>todos</h1>
      <input className="new-todo" autofocus autocomplete="off" placeholder="What needs to be done?" />
    </header>
  )
}

function renderMain(allDone, todos) {
  return (
    <section className="main">
      <input id="toggle-all" className="toggle-all" type="checkbox" checked={allDone} />
      <label for="toggle-all">Mark all as complete</label>
      <ul className="todo-list">
        {todos}
      </ul>
    </section>
  )
}

function renderFooter(selected, remaining, completed) {
  return (
    <footer className="footer">
      {renderCount(remaining)}
      {renderFilters(selected)}
      {(completed > 0) ? renderClearCompleted() : ''}
    </footer>
  )
}

function renderCount(remaining) {
  return (
    <span className="todo-count">
      <strong>{remaining}</strong> {(remaining === 1) ? 'item' : 'items'} left
    </span>
  )
}

function renderFilters(selected) {
  const capitalize = word => word.charAt(0).toUpperCase() + word.slice(1)
  const links = FILTER_LIST
  const renderLink = link => <li><a href={`#/${link}`} className={selected(link)}>{capitalize(link)}</a></li>
  return (
    <ul className="filters">
      {links.map(renderLink)}
    </ul>
  )
}

function renderClearCompleted() {
  return <button className="clear-completed">Clear completed</button>
}