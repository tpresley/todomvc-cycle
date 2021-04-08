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
export default function makeLog (context) {
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
  