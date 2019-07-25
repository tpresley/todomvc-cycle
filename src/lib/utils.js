import xs from 'xstream'
import isolate from '@cycle/isolate'
import {makeCollection} from '@cycle/state'
import dropRepeats from 'xstream/extra/dropRepeats'

export const ABORT = '~~ABORT~~'

/**
 * factory to create a logging function meant to be used inside of an xstream .compose() 
 * 
 * @param {String} context name of the component or file to be prepended to any messages 
 * @return {Function} 
 * 
 * returned function accepts either a `String` of `Function`
 * `String` values will be logged to `console` as is
 * `Function` values will be called with the current `stream` value and the result will be logged to `console`
 * all output will be prepended with the `context` (ex. "[CONTEXT] My output")
 * ONLY outputs if the global `DEBUG` variable is set to `true`
 */
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

/**
 * calculate the next id given an array of objects
 * 
 * @param {Array} items array of `objects` with some id field
 * @param {String} idKey object key name containing the id (defualts to `id`)
 * @return {Number} the highest value in the `id` field of the objects in the array plus one
 */
export function newId(items, idKey='id') {
  return items.map(item => item[idKey])
              .reduce((max, id) => id > max ? id : max, 0) + 1
}

/**
 * return a validated and properly separated string of CSS class names from any number of strings, arrays, and objects
 * 
 * @param  {...String|Array|Object} args any number of strings or arrays with valid CSS class names, or objects where the keys are valid class names and the values evaluate to true or false
 * @return {String} list of `active` classes separated by spaces
 * 
 * any `string` or `array` arguments are simply validated and appended to the result
 * `objects` will evaluate the values (which can be booleans or functions), and the keys with `thruthy` values will be validated and appended to the result
 * this function makes it easier to set dynamic classes on HTML elements
 */
export function classes(...args) {
  const classSet =  args.reduce((acc, arg) => {
    const addToSet = acc.add.bind(acc)
    if (typeof arg === 'string') {
      classes_processString(arg).map(addToSet)
    } else if (Array.isArray(arg)) {
      classes_processArray(arg).map(addToSet)
    } else if (typeof arg === 'object') {
      classes_processObject(arg).map(addToSet)
    }
    return acc
  }, new Set())
  //convert Set to Array and join with spaces
  return [...classSet].join(' ')
}

/**
 * validate a string as a CSS class name
 * 
 * @param {String} className CSS class name to validate
 * @return {Boolean} true if the name is a valid CSS class, false otherwise
 */
function isValidClassName (className) {
  //technically CSS classes can include unicode characters, but ignoring for now
  return /^[a-zA-Z0-9-_]+$/.test(className)
}

/**
 * find and validate CSS class names in a string
 * 
 * @param {String} str string containing one or more CSS class names
 * @return {Array} valid CSS classnames from the provided string
 */
function classes_processString(str) {
  if (typeof str !== 'string') throw new Error('Class name must be a string')
  return str.trim().split(' ').reduce((acc, item) => {
    if (item.trim().length === 0) return acc
    if (!isValidClassName(item)) throw new Error(`${item} is not a valid CSS class name`)
    acc.push(item)
    return acc
  }, [])
}

/**
 * find and validate CSS class names in an array of strings
 * 
 * @param {Array} arr array containing one or more strings with valid CSS class names
 * @return {Array} valid CSS class names from the provided array 
 */
function classes_processArray(arr) {
  if (!Array.isArray(arr)) throw new Error('Expecting an array of strings')
  return arr.map(classes_processString).flat()
}

/**
 * find and validate CSS class names in an object, and exclude keys whose value evaluates to `false`
 * 
 * @param {Object} obj object with keys as CSS class names and values which if `truthy` cause the associated key to be returned
 * @return {Array} valid CSS class names from the keys of the provided object where the associated value evaluated to `true` 
 * 
 * the value for each key can be either a value that evaluates to a boolean or a function that returns a boolean
 * if the value is a function, it will be run and the returned value will be used
 */
function classes_processObject(obj) {
  if (typeof obj !== 'object') throw new Error ('Expecting an object')
  return Object.entries(obj)
               .filter(([key, predicate]) => (typeof predicate === 'function') ? predicate() : !!predicate)
               .map(([key, _]) => {
                 const trimmed = key.trim()
                 if (!isValidClassName(trimmed)) throw new Error (`${trimmed} is not a valid CSS class name`)
                 return trimmed
               })
}

/**
 * simple function to map an incoming stream to "action" objects
 * 
 * @param {String} type name of the action the `data$` stream should be mapped to
 * @param {Observable} data$ an observable that represents an action
 * 
 * emits objects of shape `{type: "SOME_ACTION", data: "values emitted from the source stream"}`
 * allows you to write `set('SOME_ACTION", sourceStream$)`
 * instead of `sourceStream$.map(data => ({type: "SOME_ACTION", data}))`
 */
export function setAction (type, data$) {
  return data$.map(data => ({type, data}))
}


/**
 * helper to filter a stream of actions to a specific type
 * 
 * @param {Observable} action$ observable stream of `actions`
 * @return {Function} function which filters for a specific `action` and optionally maps to a `value` or `state reducer`
 * 
 * initialize the helper by calling it with the action stream:
 * `const on = makeOnAction(action$)`
 * the returned function then lets you write:
 * `on('SOME_ACTION', (state, data, next) => ({...state, someProperty: data}))`
 * instead of:
 * `action$.filter(action => action.type === 'SOME_ACTION').map(({data}) => (state, data) => ({...state, someProperty: data}))`
 * the returned `Observable` depends on the 2nd argument:
 *   - if not provided, the action$ stream is filtered and returned
 *   - if it's a `Function` the provided funtion will be treated as a `state reducer` and called with `current state`, `value from the action`, and a `next` function
 *     + the return value of the `state reducer` you provided will become the new `state` for the current `isolation context`
 *     + the `next` function allows for follow up actions and should be called with the name of an `action` and optionally `data` required for that action
 *   - if anything else, that value will be emitted whenever the specified action is encountered 
 */
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

/**
 * instantiate a cycle collection and isolate 
 * (makes the code for doing isolated collections more readable)
 * 
 * @param {Object} collectionOpts options for the makeCollection function (see cycle/state documentation)
 * @param {String|Object} isolateOpts options for the isolate function (see cycle/isolate documentation)
 * @param {Object} sources object of cycle style sources to use for the created collection
 * @return {Object} collection of component sinks
 */
export function makeIsolatedCollection (collectionOpts, isolateOpts, sources) {
  return isolate(makeCollection(collectionOpts), isolateOpts)(sources)
}

/**
 * create a group of components which can be switched between based on a stream of component names
 * 
 * @param {Object} factories maps names to component creation functions
 * @param {Object} sources standard cycle sources object provided to each component
 * @param {Observable} name$ stream of names corresponding to the component names
 * @param {Array} switched which cycle sinks from the components should be `switched` when a new `name$` is emitted
 * @return {Object} cycle sinks object where the selected sinks are switched to the last component name emitted to `name$`
 * 
 * any component sinks not dsignated in `switched` will be merged across all components
 */
export function makeSwitchGroup (factories, sources, name$, switched=['DOM']) {
  if (typeof switched === 'string') switched = [switched]
  const sinks = Object.entries(factories)
                      .map(([name, factory]) => [name, isolate(factory, name)(sources)])

  const switchedSinks = Object.keys(sources)
    .reduce(
      (obj, sinkName) => {
        if (switched.includes(sinkName)) {
          obj[sinkName] = name$.compose(dropRepeats())
                               .map( newComponentName => sinks.filter(([componentName, _]) => componentName === newComponentName)[0][1][sinkName] || xs.never() )
                               .flatten()
        } else {
          obj[sinkName] = xs.merge(...sinks.filter(([_,sink]) => sink[sinkName] !== undefined)
                            .map(([_,sink]) => sink[sinkName]))
        }
        return obj
      }, {}
    )

  return switchedSinks
}

/**
 * helper to get common events from an input field
 * 
 * @param {DOMSource} input$ an input field stream created from cycle's DOM driver by running DOM.select('css-selector')
 * @param {String} initialValue initial value to emit on the special `value$` stream
 * @return {Object} collection of event streams ready for mapping to actions
 */
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
