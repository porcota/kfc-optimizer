import { useState, useMemo, useDeferredValue, useEffect } from 'react'
import { useMenu } from './hooks/useMenu'
import { optimize } from './utils/optimizer'
import styles from './App.module.css'

const COLORS = ['#378ADD','#1D9E75','#BA7517','#D4537E','#7F77DD','#D85A30']
const BG_COLORS = ['#E6F1FB','#E1F5EE','#FAEEDA','#FBEAF0','#EEEDFE','#FAECE7']
const TEXT_COLORS = ['#0C447C','#085041','#633806','#72243E','#3C3489','#712B13']

export default function App() {
  const { items, sets, sideGroups, status, error, fetchedAt, reload } = useMenu()
  const [members, setMembers] = useState(() => {
    try {
      const saved = localStorage.getItem('kenta-members')
      return saved ? JSON.parse(saved) : [{ id: 1, name: 'メンバー1' }]
    } catch { return [{ id: 1, name: 'メンバー1' }] }
  })
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem('kenta-cart')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [newMember, setNewMember] = useState('')
  const [addingMember, setAddingMember] = useState(false)
  const [editingMemberId, setEditingMemberId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [selectedMember, setSelectedMember] = useState(() => {
    try {
      const saved = localStorage.getItem('kenta-members')
      const ms = saved ? JSON.parse(saved) : null
      return ms?.[0]?.id ?? 1
    } catch { return 1 }
  })
  const [selectedItem, setSelectedItem] = useState(null)
  const [isLunch, setIsLunch] = useState(false)

  useEffect(() => {
    try { localStorage.setItem('kenta-members', JSON.stringify(members)) } catch {}
  }, [members])

  useEffect(() => {
    try { localStorage.setItem('kenta-cart', JSON.stringify(cart)) } catch {}
  }, [cart])

  const deferredCart = useDeferredValue(cart)
  const isCalculating = cart !== deferredCart

  const qty = useMemo(() => {
    const q = {}
    deferredCart.forEach(entry => {
      q[entry.itemId] = (q[entry.itemId] || 0) + entry.qty
    })
    return q
  }, [deferredCart])

  const filteredSets = useMemo(() => {
    if (isLunch) return sets.filter(s => s.id.startsWith('lunch_'))
    return sets.filter(s => !s.id.startsWith('lunch_'))
  }, [sets, isLunch])

  const result = useMemo(() => {
    if (!items.length) return null
    return optimize(items, filteredSets, qty, sideGroups)
  }, [items, filteredSets, qty, sideGroups])

  const fetchedLabel = fetchedAt
    ? `${fetchedAt.getMonth() + 1}月${fetchedAt.getDate()}日取得`
    : ''

  const addToCart = () => {
    if (!selectedItem) return
    const existing = cart.findIndex(c => c.memberId === selectedMember && c.itemId === selectedItem)
    if (existing >= 0) {
      setCart(prev => prev.map((c, i) => i === existing ? { ...c, qty: c.qty + 1 } : c))
    } else {
      setCart(prev => [...prev, { id: Date.now(), memberId: selectedMember, itemId: selectedItem, qty: 1 }])
    }
  }

  const changeQty = (id, delta) => {
    setCart(prev => prev
      .map(c => c.id === id ? { ...c, qty: c.qty + delta } : c)
      .filter(c => c.qty > 0)
    )
  }

  const removeEntry = (id) => setCart(prev => prev.filter(c => c.id !== id))

  const removeMember = (id) => {
    setMembers(prev => prev.filter(m => m.id !== id))
    setCart(prev => prev.filter(c => c.memberId !== id))
    if (selectedMember === id) {
      const remaining = members.filter(m => m.id !== id)
      if (remaining.length > 0) setSelectedMember(remaining[0].id)
    }
  }

  const renameMember = (id) => {
    const name = editingName.trim()
    if (name) setMembers(prev => prev.map(m => m.id === id ? { ...m, name } : m))
    setEditingMemberId(null)
    setEditingName('')
  }

  const addMember = () => {
    const name = newMember.trim() || `メンバー${members.length + 1}`
    const id = Date.now()
    setMembers(prev => [...prev, { id, name }])
    setSelectedMember(id)
    setNewMember('')
    setAddingMember(false)
  }

  const getMemberColor = (memberId) => {
    const idx = members.findIndex(m => m.id === memberId) % COLORS.length
    return { bg: BG_COLORS[idx], text: TEXT_COLORS[idx], border: COLORS[idx] }
  }

  const getItemName = (itemId) => items.find(i => i.id === itemId)?.name || ''

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logoWrap}><span className={styles.logoText}>KFC</span></div>
        <div style={{ flex: 1 }}>
          <h1 className={styles.title}>ケンタ賢者</h1>
          <p className={styles.subtitle}>KFCの注文を賢く最安値で</p>
        </div>
        <div className={styles.lunchToggleWrap}>
          <span className={styles.lunchToggleLabel}>ランチ</span>
          <button
            className={`${styles.toggle} ${isLunch ? styles.toggleOn : ''}`}
            onClick={() => setIsLunch(v => !v)}
            aria-label="ランチモード切替"
          >
            <span className={styles.toggleKnob} />
          </button>
          {isLunch && <span className={styles.lunchBadge}>〜15時</span>}
        </div>
      </header>

      {status === 'loading' && (
        <div className={styles.statusBox}>
          <div className={styles.spinner} />
          <span>メニューを読み込み中...</span>
        </div>
      )}
      {status === 'error' && (
        <div className={`${styles.statusBox} ${styles.statusError}`}>
          <p>読み込みに失敗しました</p>
          <p className={styles.errorMsg}>{error}</p>
          <button className={styles.retryBtn} onClick={reload}>再試行</button>
        </div>
      )}

      {status === 'success' && (
        <div className={styles.grid}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>注文を追加</span>
              <span className={styles.freshTag}>{fetchedLabel}</span>
            </div>

            <div className={styles.memberRow}>
              {members.map((m) => {
                const c = getMemberColor(m.id)
                const active = selectedMember === m.id
                if (editingMemberId === m.id) {
                  return (
                    <div key={m.id} className={styles.addMemberInput}>
                      <input autoFocus value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') renameMember(m.id); if (e.key === 'Escape') { setEditingMemberId(null) } }}
                        style={{ width: 90, fontSize: 12 }} />
                      <button className={styles.miniBtn} onClick={() => renameMember(m.id)}>確定</button>
                      <button className={styles.miniBtnDanger} onClick={() => { removeMember(m.id); setEditingMemberId(null) }}>削除</button>
                    </div>
                  )
                }
                return (
                  <button key={m.id} className={styles.memberTag}
                    onClick={() => setSelectedMember(m.id)}
                    onDoubleClick={() => { setEditingMemberId(m.id); setEditingName(m.name) }}
                    title="ダブルクリックで名前を変更"
                    style={active ? { background: c.bg, color: c.text, borderColor: c.border } : {}}>
                    {m.name}
                  </button>
                )
              })}
              {addingMember ? (
                <div className={styles.addMemberInput}>
                  <input autoFocus value={newMember} onChange={e => setNewMember(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addMember(); if (e.key === 'Escape') setAddingMember(false) }}
                    placeholder="名前を入力" style={{ width: 90, fontSize: 12 }} />
                  <button className={styles.miniBtn} onClick={addMember}>追加</button>
                </div>
              ) : (
                <button className={styles.addMemberBtn} onClick={() => setAddingMember(true)}>＋</button>
              )}
            </div>

            <div className={styles.addRow}>
              <select className={styles.itemSelect} value={selectedItem || ''} onChange={e => setSelectedItem(e.target.value)}>
                <option value="">商品を選択</option>
                {items.map(item => (
                  <option key={item.id} value={item.id}>{item.name}（{item.price}円）</option>
                ))}
              </select>
              <button className={styles.addBtn} onClick={addToCart} disabled={!selectedItem}>追加</button>
            </div>

            <div className={styles.cartList}>
              {cart.length === 0 ? (
                <div className={styles.cartEmpty}>商品を追加してください</div>
              ) : (
                members.map(m => {
                  const entries = cart.filter(c => c.memberId === m.id)
                  if (!entries.length) return null
                  const c = getMemberColor(m.id)
                  return (
                    <div key={m.id} className={styles.cartGroup}>
                      <div className={styles.cartGroupHead}>
                        <div className={styles.avatar} style={{ background: c.bg, color: c.text, width: 22, height: 22, fontSize: 10 }}>
                          {m.name.slice(0, 1)}
                        </div>
                        <span className={styles.cartGroupName}>{m.name}</span>
                      </div>
                      {entries.map(entry => {
                        const item = items.find(i => i.id === entry.itemId)
                        return (
                          <div key={entry.id} className={styles.cartRow}>
                            <span className={styles.cartName}>{getItemName(entry.itemId)}</span>
                            <span className={styles.cartPrice}>{((item?.price || 0) * entry.qty).toLocaleString()}円</span>
                            <div className={styles.qtyCtrl}>
                              <button className={styles.qBtn} onClick={() => changeQty(entry.id, -1)}>−</button>
                              <span className={styles.qNum}>{entry.qty}</span>
                              <button className={styles.qBtn} onClick={() => changeQty(entry.id, +1)}>＋</button>
                            </div>
                            <button className={styles.removeBtn} onClick={() => removeEntry(entry.id)}>×</button>
                          </div>
                        )
                      })}
                    </div>
                  )
                })
              )}
            </div>
            {cart.length > 0 && (
              <button className={styles.clearBtn} onClick={() => setCart([])}>すべてクリア</button>
            )}
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>最適な注文構成</span>
              {isCalculating && <span className={styles.calcBadge}>計算中…</span>}
            </div>

            {!result || cart.length === 0 ? (
              <div className={styles.empty}><p>左側で商品を追加してください</p></div>
            ) : (
              <div style={{ opacity: isCalculating ? 0.4 : 1, transition: 'opacity 0.15s' }}>
                {result.sets.map((s, si) => (
                  <div key={`${s.id}-${si}`}>
                    <div className={styles.resultRow}>
                      <div className={styles.resultName}>
                        {s.name}<span className={styles.setBadge}>SET</span>
                      </div>
                      <span className={styles.resultQty}>×{s.count}</span>
                      <span className={styles.resultPrice}>{(s.price * s.count).toLocaleString()}円</span>
                    </div>
                    {s.chosenSides?.length > 0 && (
                      <div className={styles.sideDetail}>
                        サイド：{s.chosenSides.map((c, i) => {
                          const name = getItemName(c.itemId)
                          return c.extra > 0 ? `${name}（+${c.extra}円）` : name
                        }).join('、')}
                      </div>
                    )}
                  </div>
                ))}
                {result.singles.map(i => (
                  <div key={i.id} className={styles.resultRow}>
                    <span className={styles.resultName}>{i.name}</span>
                    <span className={styles.resultQty}>×{i.count}</span>
                    <span className={styles.resultPrice}>{(i.price * i.count).toLocaleString()}円</span>
                  </div>
                ))}
                <div className={styles.totalRow}>
                  <span className={styles.totalLabel}>合計</span>
                  <span className={styles.totalValue}>{result.total.toLocaleString()}円</span>
                </div>
                <div className={styles.savingsRow}>
                  {result.savings > 0 ? (
                    <>
                      <span className={styles.savingsBase}>単品合計 {result.singleOnly.toLocaleString()}円</span>
                      <span className={styles.savingsAmount}>{result.savings.toLocaleString()}円お得！</span>
                    </>
                  ) : (
                    <span className={styles.savingsBase}>単品注文が最安です</span>
                  )}
                </div>


              </div>
            )}
          </div>
        </div>
      )}

      {status === 'success' && (
        <div className={styles.footer}>
          <button className={styles.reloadBtn} onClick={reload}>メニューを再読み込み</button>
          <a href="https://www.kfc.co.jp/menu" target="_blank" rel="noopener noreferrer" className={styles.menuLink}>
            KFC公式メニューを確認 →
          </a>
        </div>
      )}
    </div>
  )
}
