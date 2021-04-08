import xs from 'xstream'
import sampleCombine from 'xstream/extra/sampleCombine'
import { component, ABORT } from '../lib/cycleHelpers'
import { inputEvents, classes } from '../lib/utils'

const LABEL = 'TODO'

export default function todo(sources) {
  return component({ name: LABEL, sources, intent, action, view })
}


function intent({state, DOM}) {
  // collect DOM events and elements
  const toggle$   = DOM.select('.toggle').events('click')
  const label$    = DOM.select('.todo label').events('dblclick')
  const destroy$  = DOM.select('.destroy').events('click')
  const input$    = DOM.select('.edit')

  // get events from the input field
  //  - the inputEvents helper returns common events and automatically returns the current value
  const { value$, enter$, escape$, blur$ } = inputEvents(input$)
  // get all clicks on the document except on the edit input itself
  const allClick$ = DOM.select('document')
                       .events('click')
                       .filter(e => e.target.className != 'edit')
  
  // map submitted edits to the new title
  // - wait until we start editing (label$ = double cliicking the todo's label)
  // - take one of any of the following: enter key press, input field blurred, user click anywhere on the document
  const doneEditing$ = label$.map(_ => xs.merge(enter$, blur$, allClick$).take(1))
                             .flatten()
                             .compose(sampleCombine(value$))
                             .map(([_, title]) => title.trim())

  return {
    TOGGLE:      toggle$,
    DELETE:      destroy$,
    EDIT_START:  label$,
    EDIT_DONE:   doneEditing$,
    EDIT_CANCEL: escape$
  }
}

const action = {
  state: {
    // toggle completion of the todo
    TOGGLE:     (state, _) => ({ ...state, completed: !state.completed }),
    // delete todo
    DELETE:     (state, _) => ({ ...state, deleted: true }),
    // start editing todo
    EDIT_START: (state, _, next) => {
      const selector = '.todo-' + state.id + ' .edit'
      // update the value of the input field to the current todo title
      next('SET_EDIT_VALUE',   { selector, value: state.title })
      // set focus on the input field
      next('FOCUS_EDIT_FIELD', {selector})
      // mark the todo as being edited and save the current title in case the edit is cancelled
      return { ...state, editing: true, cachedTitle: state.title }
    },
    // complete the editing of the todo
    EDIT_DONE:  (state, title, next) => {
      // if the todo is not being edited then don't change
      if (state.editing === false || !title.trim()) return ABORT
      // update the todo's title, remove the editing flag, and delete the cached title
      return { ...state, title, editing: false, cachedTitle: '' }
    },
    // cancel an in progress edit
    EDIT_CANCEL: (state, _, next) => {
      const selector = '.todo-' + state.id + ' .edit'
      // set the value of the edit input field back to the original title
      next('SET_EDIT_VALUE', { selector, value: state.cachedTitle })
      // set the todo back to the pre-edit value and remove the editing flag
      return { ...state, title: state.cachedTitle, editing: false, cachedTitle: '' }
    }
  },

  DOMfx: {
    SET_EDIT_VALUE:   (data) => ({ type: 'SET_VALUE', data }),
    FOCUS_EDIT_FIELD: (data) => ({ type: 'FOCUS',     data }),
  },
}
  

function view({ state }) {
  // if the todo is hidden, don't render
  if (state.hidden) return
  // calculate class for todo
  const classNames = classes('todo', 'todo-' + state.id, {completed: state.completed, editing: state.editing})
  
  // is the todo completed?
  const checked = !!state.completed

  return (
    <li className={ classNames }>
      <div className="view">
        <input className="toggle" type="checkbox" checked={ checked } />
        <label>{ state.title }</label>
        <button className="destroy" />
      </div>
      <input className="edit" type="text" value={ state.title } />
    </li>
  )
}
