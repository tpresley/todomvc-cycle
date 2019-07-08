import xs from 'xstream'

export default function localStorageDriver (fx$) {
  fx$.subscribe({next: ({key, value}) => {
    localStorage.setItem(key, JSON.stringify(value))
  }})

  return {
    get: key => xs.of(JSON.parse(window.localStorage.getItem(key)))
  }
}