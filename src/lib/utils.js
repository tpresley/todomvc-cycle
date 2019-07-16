import xs from 'xstream'
import isolate from '@cycle/isolate'
import dropRepeats from 'xstream/extra/dropRepeats'

export const ABORT = '~~ABORT~~'

// logging function meant to be used inside of an xstream .compose() 
//
//  - accepts either a String or a Function
//  - strings will just be logged to the console as is
//  - functions will be called with the stream's value and the result will be logged ot console
//  - only logs if the global DEBUG variable is set to true
//
export function makeLog (context) {
  return function (msg) {
    const fixedMsg = (typeof msg === 'function') ? msg : _ => msg
    return stream => {
      stream.map(fixedMsg).subscribe({
        next: msg => {
          if (window.DEBUG) console.log(`[${context}] ${msg}`)
        }
      })
      return stream
    }
  }
}

// calculate the next id given an array of objects
//
//  - simply finds the current highest id and returns that plus 1
//
export function newId(items, idKey='id') {
  const maxId = items.map(item => item[idKey])
                     .reduce((max, id) => id > max ? id : max, 0)
  return maxId + 1
}

// simple function to map an incoming stream to "action" objects
//
//  - object shape:  {type: "SOME_ACTION", data: "values emitted from the source stream"}
//  - this helper allows you to write the easier to read:
//      set('SOME_ACTION", sourceStream$)
//    instead of
//      sourceStream$.map(data => ({type: "SOME_ACTION", data}))
//
export function setAction (type, data$) {
  return data$.map(data => ({type, data}))
}


// helper to filter a stream of actions to a specific type
//
//  - initialize the helper by calling it with the action stream
//  - the returned function then lets you write:
//      on('SOME_ACTION', (state, data, next) => ({...state, someProperty: data}))
//    instead of
//      action$.filter(action => action.type === 'SOME_ACTION')
//             .map(({data}) => (state, data) => ({...state, someProperty: data}))
//  - the returned stream depends on the 2nd argument:
//    + if not provided, the action$ stream is filtered and returned
//    + if a function, the function will be emitted and called with the current state, the value from the action, and a "next" function
//      > the "next" function is used to initiate a new action. this can be used for follow up operations, and is emitted on the action$ stream
//    + if anything else, that value will be emitted when the action happens
//
export function makeOnAction (action$) {
  return (name, reducer) => {
    const filtered$ = action$.filter(action => action.type === name)
    const next      = (type, data) => action$.shamefullySendNext({type, data})
    
    let returnStream$
    if (typeof reducer === 'function') {
      returnStream$ = filtered$.map(action => state => reducer(state, action.data, next))
    } else if (reducer === undefined) {
      returnStream$ = filtered$
    } else {
      const value = reducer
      returnStream$ = filtered$.mapTo(value)
    }

    return returnStream$
  }
}

// merge multiple components into a single "switchable" component
//
//  @factories: Object mapping names to component creation functions
//  @sources: Object of source streams
//  @name$: Observable stream of names to determine active component (uses object keys from factories argument)
//  @switched: Array of component sinks to switch when name$ changes. All other sinks will be merged across all components
//  Returns an Object of component sinks 
//
export function makeSwitchGroup (factories, sources, name$, switched=['DOM']) {
  if (typeof switched === 'string') switched = [switched]
  const sinks = Object.entries(factories)
                      .map(([name, factory]) => [name, isolate(factory, name)(sources)])

  const switchedSinks = Object.keys(sources)
    .reduce(
      (obj, sinkName) => {
        if (switched.filter(source => source === sinkName).length > 0) {
          obj[sinkName] = name$.compose(dropRepeats()).map(newComponentName => sinks.filter(([componentName, _]) => componentName === newComponentName)[0][1][sinkName]||xs.never()).flatten()
        } else {
          obj[sinkName] = xs.merge(...sinks.filter(([_,sink]) => sink[sinkName] !== undefined).map(([_,sink]) => sink[sinkName]))
        }
        return obj
      }, {}
    )

  return switchedSinks
}

// helper to get common events from an input field
//
//  - returns an object containing streams of each event type
//  - also returns a special value$ stream that will always emeit the latest values of the input
//
export function inputEvents (input$, initialValue='') {
  const keydown$  = input$.events('keydown')
  const keyup$    = input$.events('keyup')
  const change$   = input$.events('change')
  const focus$    = input$.events('focus')
  const blur$     = input$.events('blur')
  const value$    = xs.merge(keydown$, change$).map(e => e.target.value).startWith(initialValue)
  const enter$    = keydown$.filter(e => e.keyCode === 13).mapTo('enter')
  const escape$   = keydown$.filter(e => e.keyCode === 27).mapTo('escape')

  return {
    value$,
    enter$,
    escape$,
    focus$,
    blur$,
    keydown$,
    keyup$,
  }
}
