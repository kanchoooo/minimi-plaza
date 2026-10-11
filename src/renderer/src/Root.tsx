import { lazy, Suspense } from 'react'
import { App } from './App'

// 개발용 단독 확인 화면: index.html#lab=이름
const labs: Record<string, React.LazyExoticComponent<() => React.JSX.Element>> = {
  minimi: lazy(() => import('./minimi/Lab')),
  plaza: lazy(() => import('./plaza/Lab'))
}

export function Root(): React.JSX.Element {
  const lab = new URLSearchParams(location.hash.slice(1)).get('lab')
  const Lab = lab ? labs[lab] : null
  if (Lab) {
    return (
      <Suspense fallback={null}>
        <Lab />
      </Suspense>
    )
  }
  return <App />
}
