interface ToastProps { msg: string; type: 'ok' | 'err'; show: boolean }

export default function Toast({ msg, type, show }: ToastProps) {
  return (
    <div className={`toast${show ? ' show' : ''}${type === 'err' ? ' err' : ''}`}>
      {msg}
    </div>
  )
}
