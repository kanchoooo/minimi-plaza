import { useEffect } from 'react'

export interface ModalProps {
  title: React.ReactNode
  onClose: () => void
  children: React.ReactNode
  width?: number
  footer?: React.ReactNode
}

export function Modal({ title, onClose, children, width, footer }: ModalProps): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal panel" style={width ? { width: `min(${width}px, calc(100vw - 40px))` } : undefined}>
        <div className="panel-head">
          <span>{title}</span>
          <span className="spacer" />
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="panel-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }): React.JSX.Element {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={'switch' + (on ? ' on' : '')} onClick={() => onChange(!on)} />
  )
}
