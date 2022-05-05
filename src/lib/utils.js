import xs from 'xstream'
import isolate from '@cycle/isolate'
import {makeCollection} from '@cycle/state'
import dropRepeats from 'xstream/extra/dropRepeats'

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
 * helper to get common events from an input field
 *
 * @param {DOMSource} input$ an input field stream created from cycle's DOM driver by running DOM.select('css-selector')
 * @param {String} initialValue initial value to emit on the special `value$` stream
 * @return {Object} collection of event streams ready for mapping to actions
 */
export function inputEvents (el$, initialValue='') {
  const input$ = el$.events('input')
  const keydown$  = el$.events('keydown')
  const keyup$    = el$.events('keyup')
  const change$   = el$.events('change')
  const focus$    = el$.events('focus')
  const blur$     = el$.events('blur')
  const value$    = xs.merge(focus$, input$)
    .map(e => e.target.value)
    .startWith(initialValue)
    .remember()

  const enter$    = keydown$.filter(e => e.keyCode === 13).mapTo('enter')
  const escape$   = keydown$.filter(e => e.keyCode === 27).mapTo('escape')

  return {
    value$,
    input$,
    enter$,
    escape$,
    focus$,
    blur$,
    keydown$,
    keyup$,
  }
}
