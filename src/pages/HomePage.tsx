import { SAMPLE_INVESTMENTS, SAMPLE_TX, fmtTon, isWeekend } from '../utils/config'

interface Props {
  onDeposit: () => void
  onWithdraw: () => void
  onGoPlans: () => void
  onGoProfile: () => void
}

const txIcon: Record<string, string> = { deposit:'↓', withdraw:'↑', profit:'◎', referral:'⊕' }
const txClass: Record<string, string> = { deposit:'d', withdraw:'w', profit:'p', referral:'r' }

export default function HomePage({ onDeposit, onWithdraw, onGoPlans, onGoProfile }: Props) {
  const weekend = isWeekend()
  const todayProfit = SAMPLE_INVESTMENTS.reduce((s, i) => s + i.amount * i.profitRate / 100, 0)

  return (
    <div style={{ paddingTop: 4 }}>

      {/* Balance hero */}
      <div className="card card-p" style={{ marginBottom: 12, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position:'absolute', top:-50, right:-50, width:180, height:180, background:'radial-gradient(circle,#f5a62318,transparent 65%)', pointerEvents:'none' }} />
        {/* COIN IMAGE — replace span below with: <img src="/coin.png" style={{width:'100%',height:'100%',objectFit:'contain'}} /> */}
        <div style={{ position:'absolute', top:10, right:14, width:80, height:80, opacity:.15, fontSize:72, lineHeight:'80px', textAlign:'center', userSelect:'none' }}>◎</div>

        <div style={{ fontSize:10, fontWeight:700, letterSpacing:'1.2px', textTransform:'uppercase', color:'var(--muted)', marginBottom:8 }}>Total Portfolio</div>
        <div style={{ fontFamily:'var(--font-display)', fontSize:38, fontWeight:700, letterSpacing:'-1.5px', lineHeight:1, marginBottom:4 }}>
          1,247.83 <span style={{ color:'var(--gold)', fontSize:22 }}>TON</span>
        </div>
        <div style={{ fontSize:13, color:'var(--muted)', display:'flex', alignItems:'center', gap:6 }}>
          {weekend
            ? <span style={{ color:'#ff8a80' }}>⏸ Weekend — no profit today</span>
            : <><span style={{ color:'var(--green)', fontWeight:600 }}>+{fmtTon(todayProfit)} TON today</span><span style={{ color:'var(--muted2)' }}>·</span><span>≈ $3,841.20</span></>
          }
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:18 }}>
          <button className="btn btn-gold" onClick={onDeposit}>↓ Deposit</button>
          <button className="btn btn-ghost" onClick={onWithdraw}>↑ Withdraw</button>
        </div>
      </div>

      {/* Status pills */}
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        {[
          { dot:'green', label:'Today profit',  val: weekend ? 'Weekend pause' : `+${fmtTon(todayProfit)} TON`, valColor: weekend ? 'var(--red)' : 'var(--green)' },
          { dot:'gold',  label:'Active plans',  val: '2 running',              valColor: 'var(--text)' },
        ].map(p => (
          <div key={p.label} className="card" style={{ flex:1, padding:'11px 12px', display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background: p.dot === 'green' ? 'var(--green)' : 'var(--gold)', flexShrink:0, animation: p.dot==='green'&&!weekend ? 'pulse 2s infinite' : 'none' }} />
            <div>
              <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.2 }}>{p.label}</div>
              <div style={{ fontSize:13, fontWeight:700, color:p.valColor, marginTop:1 }}>{p.val}</div>
            </div>
          </div>
        ))}
      </div>

      {/* My investments */}
      <div style={{ marginBottom:16 }}>
        <div className="sec-hdr">
          <div className="sec-title">My Investments</div>
          <div className="sec-link" onClick={onGoPlans}>Invest more →</div>
        </div>
        {SAMPLE_INVESTMENTS.map(inv => {
          const progress = ((inv.totalDays - inv.daysLeft) / inv.totalDays) * 100
          return (
            <div key={inv.id} className="card" style={{ padding:14, marginBottom:8, position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', left:0, top:0, bottom:0, width:3, background:`var(--${inv.color})`, borderRadius:'2px 0 0 2px' }} />
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <span style={{ fontSize:10, fontWeight:700, letterSpacing:'.8px', textTransform:'uppercase', padding:'3px 8px', borderRadius:20, background:`var(--${inv.color})18`, color:`var(--${inv.color})` }}>{inv.planName}</span>
                <span style={{ fontFamily:'var(--font-display)', fontSize:15, fontWeight:700, color:'var(--green)' }}>+{fmtTon(inv.earnedTotal)} TON</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                <div style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:700 }}>{fmtTon(inv.amount, 0)} <span style={{ fontSize:13, color:'var(--muted)', fontFamily:'var(--font-body)', fontWeight:400 }}>TON</span></div>
                <div style={{ fontSize:12, color:'var(--muted)', textAlign:'right', lineHeight:1.5 }}>
                  {inv.daysLeft} days left<br/>
                  <span style={{ color:`var(--${inv.color})` }}>{inv.profitRate}% / day</span>
                </div>
              </div>
              <div className="pbar"><div className={`pbar-fill ${inv.color}`} style={{ width: `${progress}%` }} /></div>
            </div>
          )
        })}
      </div>

      {/* Referral mini */}
      <div style={{ marginBottom:16 }}>
        <div className="sec-hdr"><div className="sec-title">Referral</div></div>
        <div className="card" style={{ padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer' }} onClick={onGoProfile}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:9, background:'#3d9be918', border:'1px solid #3d9be930', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17 }}>⊕</div>
            <div>
              <div style={{ fontSize:13, fontWeight:600 }}>Invite friends · Earn 5%</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>12 friends joined · 24.5 TON earned</div>
            </div>
          </div>
          <span style={{ fontSize:18, color:'var(--muted)' }}>›</span>
        </div>
      </div>

      {/* Recent activity */}
      <div>
        <div className="sec-hdr"><div className="sec-title">Recent Activity</div></div>
        <div className="card" style={{ padding:'2px 14px' }}>
          {SAMPLE_TX.map((tx, i) => (
            <div key={tx.id} style={{ display:'flex', alignItems:'center', gap:11, padding:'11px 0', borderBottom: i < SAMPLE_TX.length-1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width:36, height:36, borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, flexShrink:0, background: txClass[tx.type]==='d'?'#1fd67918': txClass[tx.type]==='w'?'#ff4d4d18': txClass[tx.type]==='p'?'#f5a62318':'#3d9be918' }}>
                {txIcon[tx.type]}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>{tx.label}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>{tx.date}</div>
              </div>
              <div style={{ fontFamily:'var(--font-display)', fontSize:14, fontWeight:700, color: tx.amount > 0 ? 'var(--green)' : 'var(--red)' }}>
                {tx.amount > 0 ? '+' : ''}{fmtTon(Math.abs(tx.amount))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ height:8 }} />
    </div>
  )
}
