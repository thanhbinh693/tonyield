import type { Tab } from '../utils/config'

interface Props { active: Tab; onChange: (t: Tab) => void; navHeight: number }

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'home',    icon: '⌂', label: 'Home'    },
  { id: 'plans',   icon: '◎', label: 'Plans'   },
  { id: 'profile', icon: '◉', label: 'Profile' },
]

export default function BottomNav({ active, onChange, navHeight }: Props) {
  return (
    <div
      className="bottom-nav"
      style={{ height: navHeight, paddingBottom: `max(8px, env(safe-area-inset-bottom))` }}
    >
      {TABS.map(t => (
        <div
          key={t.id}
          className={`nav-item${active === t.id ? ' active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          <span className="nav-icon">{t.icon}</span>
          <span className="nav-label">{t.label}</span>
        </div>
      ))}
    </div>
  )
}
