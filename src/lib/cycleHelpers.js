import xs from 'xstream'
import isolate from '@cycle/isolate'
import {makeCollection} from '@cycle/state'
import delay from 'xstream/extra/delay'
import concat from 'xstream/extra/concat'
import debounce from 'xstream/extra/debounce';
import makeLog from './makeLog'


export const ABORT = '~~ABORT~~'

export function component (opts) {
  const {isolateOpts, sources} = opts
  const isolateOpts_ = (typeof isolateOpts == 'string') ? { state: isolateOpts } : (isolateOpts === true ? {} : isolateOpts)
  let fixedIsolateOpts
  if (typeof isolateOpts == 'string') {
    fixedIsolateOpts = { state: isolateOpts }
  } else {
    if (isolateOpts === true) {
      fixedIsolateOpts = {}
    } else {
      fixedIsolateOpts = isolateOpts
    }
  }

  const wrapped = sources => {
    const fixedOpts = { ...opts, sources }
    return _component(fixedOpts)
  }

  return (typeof fixedIsolateOpts == "object") ? isolate(wrapped, fixedIsolateOpts)(sources) : _component(opts)
}

function _component({ name='NO NAME', sources, intent, action, view, children={}, initialState, isolateOpts, DOMSourceName='DOM', stateSourceName='state' }) {
  if (!sources || typeof sources != 'object') throw new Error('Missing or invalid sources')
  const LABEL = name

  let action$
  if (!intent) {
    action$ = xs.never()
  } else {
    let intent_
    if (typeof intent == 'function') {
      intent_ = intent(sources)
      if (intent_.constructor && intent_.constructor.name == 'Stream') {
        action$ = intents(sources, intent_, LABEL)
      } else if (typeof intent_ == 'object') {
        action$ = intents(sources, actions(intent_), LABEL)
      } else {
        throw new Error('Intent must return either an action$ stream or map of event streams')
      }
    } else {
      throw new Error('Intent must be a function')
    }
  }

  const sourceNames = Object.keys(sources)

  if (action != undefined) {
    sourceNames.forEach(name => {
      if (action[name] == undefined) action[name] = {}
      if (name = 'state' && initialState && !action.state.INITIALIZE) {
        action.state.INITIALIZE = (_, data) => ({ ...data })
      }
    })
  }

  const model$    = action ? models(action$, action, LABEL, initialState, stateSourceName) : sourceNames.reduce((a,s) => {
    a[s] = xs.never()
    return a
  }, {})
  
  const initial = sourceNames.reduce((acc, name) => {
    if (name == DOMSourceName) {
      acc[name] = {}
    } else {
      acc[name] = []
    }
    return acc
  }, {})

  const children$ = Object.entries(children).reduce((acc, [childName, childFactory]) => {
    const child$ = childFactory(sources)
    sourceNames.forEach(source => {
      if (source == DOMSourceName) {
        acc[source][childName] = child$[source]
      } else {
        acc[source].push(child$[source])
      }
    })
    return acc
  }, initial)

  const state = sources.state.stream
  const vdom$  = (typeof view == 'function') ? views(view, { state, ...children$.DOM }, LABEL) : xs.never()

  const sinks = sourceNames.reduce((acc, name) => {
    if (name == DOMSourceName) return acc
    acc[name] = xs.merge(model$[name], ...children$[name])
    return acc
  }, {})

  sinks.DOM = vdom$
  
  return sinks
}

function intents(sources, runner, label) {
  const log = makeLog(label)
  const initialApiData = (sources && sources.HTTP) ? sources.HTTP.select('initial').flatten() : xs.never()
  const action$ = ((runner.constructor && runner.constructor.name == 'Stream') ? runner : runner(sources))
  const wrapped$ = withInitialAction(action$)
    .compose(delay(0))
  return xs.merge(wrapped$, actions({HYDRATE: initialApiData})).compose(log(({type}) => 'Action: ' + type))
}

function models(action$, map, label, initial, stateSourceName) {
  const log = makeLog(label)
  const entries = Object.entries(map)
  const mapped =  entries.reduce((acc, entry) => {
    const [name, actions] = entry
    const isStateSource = (name == stateSourceName)
    const input$ = ((isStateSource && initial) ? withInitialState(action$, initial) : action$)
      .compose(delay(0))
    const logFunc = isStateSource ? (log('State Reducer Added')) : (log((data) => `${name} Requested: ${data && (data.type || data.command || data.key || data)}`))
    acc[name] = mapActions(input$, actions, isStateSource, action$)
      .compose(logFunc)
    return acc
  }, {})
  return mapped
}

function actions(intents) {
  const mapped = Object.entries(intents).map(([type, data$]) => setAction(type, data$))
  return xs.merge(xs.never(), ...mapped)
}

function views(renderer, vdoms, LABEL) {
  const log = makeLog(LABEL)
  const pulled = Object.entries(vdoms).reduce((acc, [name, stream]) => {
    acc.names.push(name)
    acc.streams.push(stream)
    return acc
  }, {names: [], streams: []})

  const merged = xs.combine(...pulled.streams).compose(debounce(1)).map(arr => {
    return pulled.names.reduce((acc, name, index) => {
      acc[name] = arr[index]
      return acc
    }, {})
  })

  return merged.map(renderer).remember().compose(log('View Rendered'))
}


function withInitialAction(action$, initial='BOOTSTRAP') {
  const objInitial = (typeof initial == 'string') ? {type: initial} : initial
  return concat(xs.of(objInitial), action$)
}


function withInitialState(action$, initial) {
  const objInitial = {type: 'INITIALIZE', data: initial}
  return concat(xs.of(objInitial), action$)
}


function mapActions(action$, map, withState, rootAction$) {
  const on = makeOnAction(action$, withState, rootAction$)
  const mapped = Object.entries(map).map(([type, reducer]) => on(type, reducer))
  return xs.merge(xs.never(), ...mapped)
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
function setAction (type, data$) {
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
function makeOnAction (action$, withState=true, rootAction$) {
  rootAction$ = rootAction$ || action$
  return (name, reducer) => {
    const filtered$ = action$.filter(({type}) => type == name)
    const next      = (type, data) => {
      // put the "next" action request at the end of the event loop so the "current" action completes first
      setTimeout(() => {
        // push the "next" action request into the action$ stream
        rootAction$.shamefullySendNext({type, data})
      }, 10)
    }
    
    let returnStream$
    if (typeof reducer === 'function') {
      returnStream$ = filtered$.map(action => {
        if (withState) {
          return (state) => {
            const newState = reducer(state, action.data, next)
            if (newState == ABORT) return state
            return newState
          }
        } else {
          return reducer(action.data, next)
        }
      }).filter(result => result != ABORT)
    } else if (reducer === undefined || reducer === true) {
      returnStream$ = filtered$.map(({data}) => data)
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
function makeIsolatedCollection (collectionOpts, isolateOpts, sources) {
  return isolate(makeCollection(collectionOpts), isolateOpts)(sources)
}

export function collectionOf(component, stateLense, combineList=['DOM'], globalList=['events']) {
  return (sources) => {
    const collectionOpts = {
      item:         component,
      itemKey:      state => state.id,
      itemScope:    key => key,
      collectSinks: instances => {
        return Object.entries(sources).reduce((acc, [name, stream]) => {
          acc[name] = instances[(combineList.indexOf(name) >= 0 ? 'pickCombine' : 'pickMerge')](name)
          return acc
        }, {})
      }
    }

    const isolateOpts = {state: stateLense}

    globalList.forEach(global => isolateOpts[global] = null)

    return makeIsolatedCollection(collectionOpts, isolateOpts, sources)
  }
}