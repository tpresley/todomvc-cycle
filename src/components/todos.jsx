import todo from './todo'
import { collectionOf } from '../lib/cycleHelpers';

const filters = {
  all:       todo => true,
  active:    todo => !todo.completed,
  completed: todo => todo.completed
}


// STATE LENSE
// - object with 'get' and 'set' functions
//   get: receives the current state, and should return an array with the state of each item in the collection
//   set: receives the current state and an array of all states from items in the collection
//        it should return the updated full state incorporating the items
const lense = {
  get: state => {
    if (!state.todos) return []
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
export default collectionOf(todo, lense)