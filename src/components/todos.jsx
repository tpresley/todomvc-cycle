import xs from 'xstream'
import sampleCombine from 'xstream/extra/sampleCombine'
import delay from 'xstream/extra/delay'
import {makeIsolatedCollection, setAction as set, makeOnAction, inputEvents, makeLog, classes} from '../lib/utils'

const log = makeLog('TODO')

// todos collection component
//  - sources are passed directly to the created collection of todo items
export default function todos(sources) {
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
        return filters[state.visibility](todo) ? todo : {...todo, hidden: true}
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
  
  const collectionOpts = {
    item:         todo,
    itemKey:      state => state.id,
    itemScope:    key => key,
    collectSinks: instances => ({
      // collect sinks from individual todos
      //  - see documentation for makeCollection in @cycle/state for more info
      state: instances.pickMerge('state'),
      DOM:   instances.pickCombine('DOM'),
      DOMfx: instances.pickMerge('DOMfx'),
    })
  }

  const isolateOpts = {state: lense}

  // instantiate the todos collection and isolate using the lense for state
  return makeIsolatedCollection(collectionOpts, isolateOpts, sources)
}



// individual todo component
function todo({state, DOM}) {
  const state$    = state.stream
  
  // collect DOM events and elements
  const toggle$   = DOM.select('.toggle').events('click')
  const label$    = DOM.select('.todo label').events('dblclick')
  const destroy$  = DOM.select('.destroy').events('click')
  const input$    = DOM.select('.edit')

  // get events from the input field
  //  - the inputEvents helper returns common events and automatically returns the current value
  const {value$, enter$, escape$, blur$} = inputEvents(input$)
  
  // map submitted edits to the new title
  const doneEditing$ = xs.merge(enter$, blur$)
                         .compose(sampleCombine(value$))
                         .map(([_, title]) => title)

  // map streams to actions
  //  - the "set" helper maps the input stream to "action" objects {type: 'SOME_ACTION', data: 'value emitted from input stream'}
  const action$ = xs.merge(
    set('TOGGLE',      toggle$),
    set('DESTROY',     destroy$),
    set('EDIT_START',  label$),
    set('EDIT_DONE',   doneEditing$),
    set('EDIT_CANCEL', escape$)
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

  // map state reducers to actions
  const reducer$ = xs.merge(
    // toggle completion of the todo
    on('TOGGLE',     (state, _) => ({...state, completed: !state.completed})),
    // delete todo
    on('DESTROY',    (state, _) => ({...state, deleted: true})),
    // start editing todo
    on('EDIT_START', (state, _, next) => {
      const selector = '.todo-' + state.id + ' .edit'
      // update the value of the input field to the current todo title
      next('SET_EDIT_VALUE',   {type: 'SET_VALUE', data: {selector: selector, value: state.title}})
      // set focus on the input field
      next('FOCUS_EDIT_FIELD', {type: 'FOCUS',     data: {selector: selector}})
      // mark the todo as being edited and save the current title in case the edit is cancelled
      return {...state, editing: true, cachedTitle: state.title}
    }),
    // complete the editing of the todo
    on('EDIT_DONE',  (state, title) => {
      // if the todo is not being edited then don't change
      if (state.editing === false) return state
      // update the todo's title, remove the editing flag, and delete the cached title
      return {...state, title, editing: false, cachedTitle: ''}
    }),
    // cancel an in progress edit
    on('EDIT_CANCEL', (state, _, next) => {
      const selector = '.todo-' + state.id + ' .edit'
      // set the value of the edit input field back to the original title
      next('SET_EDIT_VALUE', {type: 'SET_VALUE', data: {selector: selector, value: state.cachedTitle}})
      // set the todo back to the pre-edit value and remove the editing flag
      return {...state, title: state.cachedTitle, editing: false, cachedTitle: ''}
    })
  )
  .compose(log('State Reducer Added'))

  // map DOM side effect actions 
  //  - emit the data value of the action
  //  - delay the stream events 1ms to ensure latest state changes are rendered before applying side effects
  const DOMfx$ = xs.merge(
    on('SET_EDIT_VALUE'  ),
    on('FOCUS_EDIT_FIELD'),
  )
  .map(({data}) => data)
  .compose(delay(5))
  .compose(log(({type}) => 'DOM Side Effect Requested: ' + type))

  // render the view
  const vdom$ = state$.map(state => {
    if (state.hidden) return
    // calculate class for todo
    const classNames = classes('todo', 'todo-' + state.id, {completed: state.completed, editing: state.editing})
    
    // is the todo completed?
    const checked = !!state.completed

    return (
      <li className={classNames}>
        <div className="view">
          <input className="toggle" type="checkbox" checked={checked} />
          <label>{state.title}</label>
          <button className="destroy" />
        </div>
        <input className="edit" type="text" value={state.title} />
      </li>
    )
  })  
  .compose(log('View Rendered'))
  

  // collect and return sinks
  return {
    state: reducer$,
    DOM:   vdom$,
    DOMfx: DOMfx$,
  }
}
