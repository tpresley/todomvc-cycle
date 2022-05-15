import xs from 'xstream'
import sampleCombine from 'xstream/extra/sampleCombine'
import { inputEvents, newId, classes } from './lib/utils'
import { component } from 'cyclejs-component'
import todos from './components/todos'



const FILTER_LIST = ['all', 'active', 'completed']


// filter functions for each visibility option
const filters = {
  all:       todo => true,
  active:    todo => !todo.completed,
  completed: todo => todo.completed
}



export default component({
  name: 'APP',

  initialState: {
    visibility: 'all',
    todos: []
  },

  calculated: {
    total:     (state) => state.todos.length,
    remaining: (state) => state.todos.filter(todo => !todo.completed).length,
    completed: (state) => state.todos.filter(todo => todo.completed).length,
    allDone:   (state) => state.todos.every(todo => todo.completed),
  },

  children: { todos },

  model: {
    VISIBILITY: (state, visibility) => ({
      ...state,
      visibility,
      todos: state.todos.map(todo => ({ ...todo, hidden: !filters[visibility](todo) }))
    }),

    FROM_STORE: (state, data) => ({ ...state, todos: data }),

    NEW_TODO: (state, data, next) => {
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
    },

    TOGGLE_ALL: (state) => {
      const allDone = state.todos.every(todo => todo.completed)
      const todos   = state.todos.map(todo => ({ ...todo, completed: !allDone }))
      return {...state, todos }
    },

    CLEAR_COMPLETED: (state) => {
      const todos = state.todos.filter(todo => !todo.completed)
      return { ...state, todos }
    },

    CLEAR_FORM: { DOMFX: ({ type: 'SET_VALUE', data: { selector: '.new-todo' } }) },

    ADD_ROUTE: { ROUTER: true },

    TO_STORE: { STORE: (state, data) => {
      // sanitize todo objects
      const todos = state.todos.map(({ id, title, completed }) => ({ id, title, completed }))
      return { key: 'todos', value: todos }
    } },
  },

  intent: ({ STATE, DOM, ROUTER, STORE }) => {

    // fetch stored todos from local storage
    //  - init to an empty array if no todos were found
    //  - only take the first event to prevent reloading after storing todos
    const store$           = STORE.get('todos', [])

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
  },

  view: ({ state, todos }) => {
    const { visibility, total, remaining, completed, allDone } = state
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

})
