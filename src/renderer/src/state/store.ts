import { useSyncExternalStore } from 'react'

/** 아주 작은 외부 스토어 (불변 업데이트 + 셀렉터 구독) */
export function createStore<T extends object>(initial: T) {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    get: (): T => state,
    set(patch: Partial<T> | ((s: T) => Partial<T>)): void {
      const p = typeof patch === 'function' ? patch(state) : patch
      state = { ...state, ...p }
      for (const l of listeners) l()
    },
    subscribe(l: () => void): () => void {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    /** 셀렉터는 상태 안의 참조나 원시값을 돌려줘야 한다 (새 객체 X) */
    use<U>(selector: (s: T) => U): U {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      return useSyncExternalStore(this.subscribe, () => selector(state))
    }
  }
}
