import xs from 'xstream'
import {Router} from 'director/build/director'

export default function routerDriver (route$) {
  const router = new Router()
  router.configure({
    notfound: _ => {
      window.location.hash = ''
    }
  })
  router.init()
  const action$ = xs.create({
    start: listener => {
      route$.subscribe({
        next: route => {
          router.on(route, _ => {
            listener.next(route)
          })
        }
      })
    },
    stop: _ => undefined
  })
  return action$
}