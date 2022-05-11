import xs from 'xstream'
import sampleCombine from 'xstream/extra/sampleCombine'
import { inputEvents, newId, classes } from './lib/utils'
import { component } from 'cyclejs-component'
import todos from './components/todos'


const name = 'APP'


const FILTER_LIST = ['all', 'active', 'completed']




// INTENT FUNCTION   (optional, but needed to trigger any actions)
// - takes the 'sources' object
// - returns an object that maps 'intents' to 'actions'
//   + intents are signals from outside the component (events from sources) that indicate something should happen
//     * intents are just streams that 'fire' when an action should happen
//     * they can optionally include relevent data to help perform the action later
//   + actions are just a name/label for something that will happen
//     * we don't *DO* anything here... we are just collecting a stream of 'actions' to do later
//
// sources:
//  - STATE: stream of application state objects
//    + automatically added by @cycle/state
//    + send reducer functions to the state sink to update state (see @cycle/state documentation for details)
//    + new state is emitted on the state source
//  - DOM: searchable collection of DOM elements
//    + search for elements by DOM selector using the .select() method
//    + after running .select(), get a stream of events by running .events()
//  - DOMFX: side effects for DOM elements (mainly focusing or changing the value of input fields)
//    + no source events
//    + send commands with the selctor, command, and data
//  - ROUTER: add page hash routes and receive a stream of routing events
//    + pass one or more paths to the route sink to set up routes
//    + routing events for the paths you sent will then be emitted to the route source
//  - STORE: access to get or set data to local storage
//    + use .get(key) to fetch values
//    + send objects of shape {key: 'key', value: 'value'} to the store sink to save to local storage
//    + data is automatically converted to and from JSON
//
function intent({ STATE, DOM, ROUTER, STORE }) {

  // fetch stored todos from local storage
  //  - init to an empty array if no todos were found
  //  - only take the first event to prevent reloading after storing todos
  const store$           = STORE.get('todos', [])

  // collect required DOM events and elements
  const toggleAll$       = DOM.select('.toggle-all').events('click')
  const clearCompleted$  = DOM.select('.clear-completed').events('click')
  const input$           = DOM.select('.new-todo')

  // get events from the input field
  //  - the inputEvents helper returns common events and automatically returns the current value
  const { value$, enter$ } = inputEvents(input$)

  // create a stream of titles whenever a new todo is submitted
  // - wait until the 'enter' key is pressed
  // - map the event stream to just the 'title' (current value of the input)
  // - filter out blank titles
  const newTodo$ = enter$.compose(sampleCombine(value$))
                         .map(([_, title]) => title.trim())
                         .filter(title => title !== '')

  // add routes to handle filtering based on browser path
  const route$ = xs.fromArray(FILTER_LIST)

  // save todos to localStorage whenever the app state changes
  // - ignore the first state event to prevent storing the initialization data
  const toStore$ = STATE.stream.drop(1)


  return {
    VISIBILITY:      ROUTER,
    FROM_STORE:      store$,
    NEW_TODO:        newTodo$,
    TOGGLE_ALL:      toggleAll$,
    CLEAR_COMPLETED: clearCompleted$,
    ADD_ROUTE:       route$,
    TO_STORE:        toStore$,
  }
}


const model = {

  VISIBILITY: { STATE: (state, data) => ({ ...state, visibility: data }) },

  FROM_STORE: { STATE: (state, data) => ({ ...state, todos: data }) },

  NEW_TODO: { STATE: (state, data, next) => {
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
  } },

  TOGGLE_ALL: { STATE: (state) => {
    const allDone = state.todos.every(todo => todo.completed)
    const todos   = state.todos.map(todo => ({ ...todo, completed: !allDone }))
    return {...state, todos }
  } },

  CLEAR_COMPLETED: { STATE: (state) => {
    const todos = state.todos.filter(todo => !todo.completed)
    return { ...state, todos }
  } },

  CLEAR_FORM: { DOMFX: ({ type: 'SET_VALUE', data: { selector: '.new-todo' } }) },

  ADD_ROUTE: { ROUTER: true },

  TO_STORE: { STORE: (state, data) => {
    // sanitize todo objects
    const todos = state.todos.map(({ id, title, completed }) => ({ id, title, completed }))
    return { key: 'todos', value: todos }
  } },

}


function view({ state, todos }) {
  // total todos
  const total      = state.todos.length
  // number of todos that haven't been marked as complete
  const remaining  = state.todos.filter(todo => !todo.completed).length
  // number of completed todos
  const completed  = total - remaining
  // are all todos completed?
  const allDone    = remaining === 0
  // current filter setting
  const visibility = state.visibility
  // use the list of filters to generate links in footer
  const links      = FILTER_LIST

  const capitalize = word => word.charAt(0).toUpperCase() + word.slice(1)
  const renderLink = link => <li><a href={ `#/${link}` } className={ classes({ selected: visibility == link }) }>{ capitalize(link) }</a></li>

  return (
    <section className="todoapp">
      <header className="header">
        <h1>todos</h1>
        <input className="new-todo" autofocus autocomplete="off" placeholder="What needs to be done?" />
      </header>

      { (total > 0) &&
        <section className="main">
          <input id="toggle-all" className="toggle-all" type="checkbox" checked={ allDone } />
          <label for="toggle-all">Mark all as complete</label>
          <ul className="todo-list">
            { todos }
          </ul>
        </section>
      }

      { (total > 0) &&
        <footer className="footer">
          <span className="todo-count">
            <strong>{ remaining }</strong> { (remaining === 1) ? 'item' : 'items' } left
          </span>
          <ul className="filters">
            { links.map(renderLink) }
          </ul>
          { (completed > 0) && <button className="clear-completed">Clear completed</button> }
        </footer>
      }

    </section>
  )
}




// initial state of the application
const initialState     = {
  visibility: 'all',
  todos: []
}

const children = {
  todos
}

export default component({ name, intent, model, view, children, initialState })