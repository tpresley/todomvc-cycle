import xs from 'xstream'
import sampleCombine from 'xstream/extra/sampleCombine'
import { component, collection } from 'cyclejs-component'
import { inputEvents, classes } from '../lib/utils'


const name = 'TODO'




function intent({ STATE, DOM }) {
  // collect DOM events and elements
  const toggle$   = DOM.select('.toggle').events('click')
  const label$    = DOM.select('.todo label').events('dblclick')
  const destroy$  = DOM.select('.destroy').events('click')
  const input$    = DOM.select('.edit')

  // get events from the input field
  //  - the inputEvents helper returns common events and automatically returns the current value
  const { value$, enter$, escape$, blur$ } = inputEvents(input$)

  // map submitted edits to the new title
  const doneEditing$ = xs.merge(enter$, blur$)
                         .compose(sampleCombine(value$))
                         .map(([_, title]) => title)


  return {
    TOGGLE:      toggle$,
    DESTROY:     destroy$,
    EDIT_START:  label$,
    EDIT_DONE:   doneEditing$,
    EDIT_CANCEL: escape$,
  }
}


const model = {

  TOGGLE:     { STATE: (state) => ({ ...state, completed: !state.completed }) },

  DESTROY:    { STATE: (state) => ({ ...state, deleted: true }) },

  EDIT_START: { STATE: (state, data, next) => {
    const selector = '.todo-' + state.id + ' .edit'
    // update the value of the input field to the current todo title
    next('SET_EDIT_VALUE',   { selector, value: state.title })
    // set focus on the input field
    next('FOCUS_EDIT_FIELD', { selector })
    // mark the todo as being edited and save the current title in case the edit is cancelled
    return { ...state, editing: true, cachedTitle: state.title }
  } },

  EDIT_DONE: { STATE: (state, data) => {
    // if the todo is not being edited then don't change
    if (state.editing === false) return state
    // update the todo's title, remove the editing flag, and delete the cached title
    return { ...state, title: data, editing: false, cachedTitle: '' }
  } },

  EDIT_CANCEL: { STATE: (state, done, next) => {
    const selector = '.todo-' + state.id + ' .edit'
    // set the value of the edit input field back to the original title
    next('SET_EDIT_VALUE', { selector: selector, value: state.cachedTitle })
    // set the todo back to the pre-edit value and remove the editing flag
    return { ...state, title: state.cachedTitle, editing: false, cachedTitle: '' }
  } },

  SET_EDIT_VALUE:   { DOMFX: (state, data) => ({ type: 'SET_VALUE', data }) },

  FOCUS_EDIT_FIELD: { DOMFX: (state, data) => ({ type: 'FOCUS', data }) },

}


function view({ STATE }) {
  if (STATE.hidden) return
  // calculate class for todo
  const classNames = classes('todo', 'todo-' + STATE.id, { completed: STATE.completed, editing: STATE.editing })

  const title = STATE.title
  // is the todo completed?
  const checked = !!STATE.completed

  return (
    <li className={ classNames }>
      <div className="view">
        <input className="toggle" type="checkbox" checked={ checked } />
        <label>{ title }</label>
        <button className="destroy" />
      </div>
      <input className="edit" type="text" value={ title } />
    </li>
  )
}




const todo = component({ name, intent, model, view })

// filter functions for each visibility option
const filters = {
  all:       todo => true,
  active:    todo => !todo.completed,
  completed: todo => todo.completed
}

// state lense for getting and setting state for the todo collection
const lense = {
  get: state => {
    // filter based on selected visibility
    //  - makeCollection uses reference checks to determine changes so
    //    for best performance, return the same object if you don't want
    //    to re-render, and return a new object if you do
    return state.todos.map(todo => {
      return filters[state.visibility](todo) ? todo : { ...todo, hidden: true }
    })
  },
  set: (state, childState) => {
    return {
      ...state,
      // replace todos in main list with the filtered ones from the collection
      // and remove any todos marked as deleted
      todos: state.todos.map(todo => {
        const newTodo = childState.find(ctodo => ctodo.id === todo.id)
        return newTodo || todo
      }).filter(todo => !todo.deleted)
    }
  }
}

// build a new 'collection' component of 'todo' components
// - the resulting collection will automatically grow and shink with changes to the state
// - all sources and sinks are automatically 'wired' properly for almost all use cases
// - returns an instantiable 'component', so can be included in the 'children' parameter of the component() function
// - for very simple applications the 'lense' parameter can be a string specifying an array in the state
//   but most applications quickly get to the point they need a 'lense' like above
export default collection(todo, lense)
