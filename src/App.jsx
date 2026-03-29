import { useState, useMemo, useDeferredValue, useEffect } from 'react'
import { useMenu } from './hooks/useMenu'
import { optimize, suggestAddition, suggestSizeChange } from './utils/optimizer'
import styles from './App.module.css'

const COLORS = ['#378ADD','#1D9E75','#BA7517','#D4537E','#7F77DD','#D85A30']
const BG_COLORS = ['#E6F1FB','#E1F5EE','#FAEEDA','#FBEAF0','#EEEDFE','#FAECE7']
const TEXT_COLORS = ['#0C447C','#085041','#633806','#72243E','#3C3489','#712B13']

const CATS = [
  { id: 'chicken', label: 'チキン',   icon: '🍗' },
  { id: 'burger',  label: 'バーガー', icon: '🍔' },
  { id: 'side',    label: 'サイド',   icon: '🥗' },
  { id: 'drink',   label: 'ドリンク', icon: '🥤' },
  { id: 'kids',    label: 'キッズ',   icon: '🧒' },
]

// スプレッドシートのカテゴリ列 → CATS.id のマッピング
const CATEGORY_MAP = {
  'チキン':   'chicken',
  'バーガー': 'burger',
  'サイド':   'side',
  'ドリンク': 'drink',
  'キッズ':   'kids',
}

function getItemCat(item) {
  return CATEGORY_MAP[item.category] ?? 'side'
}

function getDrinkSize(id) {
  if (id.endsWith('_l')) return 'L'
  if (id.endsWith('_m')) return 'M'
  return 'S'
}

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
  const [previousCart, setPreviousCart] = useState(null)
  const [activeDrinkPicker, setActiveDrinkPicker] = useState(null) // 'S'|'M'|'L'|null（追加用）
  const [activeSizeChangePicker, setActiveSizeChangePicker] = useState(null) // pickerId|null（変更用）
  const [newMember, setNewMember] = useState('')
  const [addingMember, setAddingMember] = useState(false)
  const [editingMemberId, setEditingMemberId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [editingColorIdx, setEditingColorIdx] = useState(0)
  const [selectedMember, setSelectedMember] = useState(() => {
    try {
      const saved = localStorage.getItem('kenta-members')
      const ms = saved ? JSON.parse(saved) : null
      return ms?.[0]?.id ?? 1
    } catch { return 1 }
  })
  const [selectedItem, setSelectedItem] = useState(null)
  const [isLunch, setIsLunch] = useState(false)
  const [activeCat, setActiveCat] = useState('chicken')
  const [drinkSize, setDrinkSize] = useState('S')
  const [selectorQty, setSelectorQty] = useState(1)

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
    if (isLunch) return sets
    return sets.filter(s => !s.id.startsWith('lunch_'))
  }, [sets, isLunch])

  const result = useMemo(() => {
    if (!items.length) return null
    return optimize(items, filteredSets, qty, sideGroups)
  }, [items, filteredSets, qty, sideGroups])

  const suggestions = useMemo(() => {
    if (!items.length || !Object.keys(qty).length) return []
    return suggestAddition(items, filteredSets, qty, sideGroups)
  }, [items, filteredSets, qty, sideGroups])

  const sizeChanges = useMemo(() => {
    if (!items.length || !Object.keys(qty).length) return []
    return suggestSizeChange(items, filteredSets, qty, sideGroups)
  }, [items, filteredSets, qty, sideGroups])

  const fetchedLabel = fetchedAt
    ? `${fetchedAt.getMonth() + 1}月${fetchedAt.getDate()}日取得`
    : ''

  const addToCart = () => {
    if (!selectedItem) return
    setPreviousCart(null)
    const existing = cart.findIndex(c => c.memberId === selectedMember && c.itemId === selectedItem)
    if (existing >= 0) {
      setCart(prev => prev.map((c, i) => i === existing ? { ...c, qty: c.qty + selectorQty } : c))
    } else {
      setCart(prev => [...prev, { id: Date.now(), memberId: selectedMember, itemId: selectedItem, qty: selectorQty }])
    }
    setSelectorQty(1)
  }

  const changeQty = (id, delta) => {
    setPreviousCart(null)
    setCart(prev => prev
      .map(c => c.id === id ? { ...c, qty: c.qty + delta } : c)
      .filter(c => c.qty > 0)
    )
  }

  const removeEntry = (id) => { setPreviousCart(null); setCart(prev => prev.filter(c => c.id !== id)) }

  const applyAddition = (item) => {
    setPreviousCart(cart)
    const existing = cart.findIndex(c => c.memberId === selectedMember && c.itemId === item.id)
    if (existing >= 0) {
      setCart(prev => prev.map((c, i) => i === existing ? { ...c, qty: c.qty + 1 } : c))
    } else {
      setCart(prev => [...prev, { id: Date.now(), memberId: selectedMember, itemId: item.id, qty: 1 }])
    }
  }

  const applySizeChange = (fromItem, toItem) => {
    setPreviousCart(cart)
    setCart(prev => {
      const idx = prev.findIndex(c => c.itemId === fromItem.id && c.qty > 0)
      if (idx < 0) return prev
      const entry = prev[idx]
      const { memberId } = entry
      const toIdx = prev.findIndex(c => c.memberId === memberId && c.itemId === toItem.id)

      if (entry.qty === 1) {
        if (toIdx >= 0) {
          // toItemが既にある → fromItemを消してtoItemを+1（位置はtoItemのまま）
          return prev
            .map((c, i) => i === toIdx ? { ...c, qty: c.qty + 1 } : c)
            .filter((_, i) => i !== idx)
        }
        // fromItemを同じ行のままitemIdだけ書き換え → 位置が変わらない
        return prev.map((c, i) => i === idx ? { ...c, itemId: toItem.id } : c)
      }

      // qty > 1: fromItemを1減らし、toItemをすぐ下に挿入
      if (toIdx >= 0) {
        return prev.map((c, i) =>
          i === idx ? { ...c, qty: c.qty - 1 } :
          i === toIdx ? { ...c, qty: c.qty + 1 } : c
        )
      }
      const next = prev.map((c, i) => i === idx ? { ...c, qty: c.qty - 1 } : c)
      next.splice(idx + 1, 0, { id: Date.now(), memberId, itemId: toItem.id, qty: 1 })
      return next
    })
  }

  const undoSuggestion = () => { setCart(previousCart); setPreviousCart(null) }

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
    if (name) setMembers(prev => prev.map(m => m.id === id ? { ...m, name, colorIdx: editingColorIdx } : m))
    setEditingMemberId(null)
    setEditingName('')
    setEditingColorIdx(0)
  }

  const addMember = () => {
    const name = newMember.trim() || `メンバー${members.length + 1}`
    const id = Date.now()
    const usedIdxs = members.map(m => m.colorIdx ?? members.indexOf(m))
    const colorIdx = [0,1,2,3,4,5].find(i => !usedIdxs.includes(i)) ?? members.length % COLORS.length
    setMembers(prev => [...prev, { id, name, colorIdx }])
    setSelectedMember(id)
    setNewMember('')
    setAddingMember(false)
  }

  const getMemberColor = (memberId) => {
    const member = members.find(m => m.id === memberId)
    const idx = (member?.colorIdx ?? members.findIndex(m => m.id === memberId)) % COLORS.length
    return { bg: BG_COLORS[idx], text: TEXT_COLORS[idx], border: COLORS[idx] }
  }

  const getItemName = (itemId) => {
    const name = items.find(i => i.id === itemId)?.name || ''
    return name.replace(/（期間限定）/g, '')
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logoWrap}>
          <svg width="52" height="52" viewBox="0 0 52 52">
            <text x="26" y="26" textAnchor="middle" fontFamily="Georgia, serif" fontSize="13" fontWeight="700" fill="white" letterSpacing="1.5">KFC</text>
            <text x="26" y="41" textAnchor="middle" fontFamily="'Hiragino Sans', sans-serif" fontSize="14" fontWeight="700" fill="white">算</text>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <h1 className={styles.title}>まとめてケンタさん</h1>
          <p className={styles.subtitle}>みんなの注文、最安セットで</p>
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

            <div className={styles.avatarRow}>
              {members.map((m) => {
                const c = getMemberColor(m.id)
                const active = selectedMember === m.id
                if (editingMemberId === m.id) {
                  return (
                    <div key={m.id} className={styles.avatarEditWrap}>
                      <div className={styles.avatarEditTop}>
                        <input autoFocus value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') renameMember(m.id); if (e.key === 'Escape') setEditingMemberId(null) }}
                          style={{ width: 80, fontSize: 12, height: 28, padding: '0 7px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', fontFamily: 'inherit' }} />
                        <button className={styles.miniBtn} onClick={() => renameMember(m.id)}>確定</button>
                        <button className={styles.miniBtnDanger} onClick={() => { removeMember(m.id); setEditingMemberId(null) }}>削除</button>
                      </div>
                      <div className={styles.colorSwatches}>
                        {COLORS.map((color, idx) => (
                          <button key={idx} className={styles.colorSwatch}
                            style={{ background: BG_COLORS[idx], borderColor: editingColorIdx === idx ? COLORS[idx] : 'transparent' }}
                            onClick={() => setEditingColorIdx(idx)}
                          >
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'block' }} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={m.id} className={`${styles.avatarWrap} ${active ? styles.avatarWrapActive : ''}`}
                    onClick={() => setSelectedMember(m.id)}
                    onMouseDown={e => {
                      const t = setTimeout(() => { setEditingMemberId(m.id); setEditingName(m.name); setEditingColorIdx(m.colorIdx ?? members.indexOf(m)) }, 600)
                      e.currentTarget._longpress = t
                    }}
                    onMouseUp={e => clearTimeout(e.currentTarget._longpress)}
                    onMouseLeave={e => clearTimeout(e.currentTarget._longpress)}
                    onTouchStart={e => {
                      const t = setTimeout(() => { setEditingMemberId(m.id); setEditingName(m.name); setEditingColorIdx(m.colorIdx ?? members.indexOf(m)) }, 600)
                      e.currentTarget._longpress = t
                    }}
                    onTouchEnd={e => clearTimeout(e.currentTarget._longpress)}
                    onTouchMove={e => clearTimeout(e.currentTarget._longpress)}
                    title="長押しで名前を変更・削除"
                  >
                    <div className={styles.avatarCircle}
                      style={{ background: c.bg, color: c.text, borderColor: active ? c.border : 'transparent' }}>
                      {m.name.slice(0, 1)}
                    </div>
                    <span className={styles.avatarName} style={active ? { color: c.text, fontWeight: 700 } : {}}>
                      {m.name}
                    </span>
                  </div>
                )
              })}
              {addingMember ? (
                <div className={styles.avatarEditWrap}>
                  <input autoFocus value={newMember} onChange={e => setNewMember(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addMember(); if (e.key === 'Escape') setAddingMember(false) }}
                    placeholder="名前" style={{ width: 80, fontSize: 12, height: 28, padding: '0 7px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', fontFamily: 'inherit' }} />
                  <button className={styles.miniBtn} onClick={addMember}>追加</button>
                  <button className={styles.miniBtn} onClick={() => { setAddingMember(false); setNewMember('') }}>×</button>
                </div>
              ) : (
                <button className={styles.avatarAddBtn} onClick={() => setAddingMember(true)}>＋</button>
              )}
            </div>

            {/* 2ペイン商品セレクター */}
            <div className={styles.selectorCard}>
              <div className={styles.paneWrap}>
                <div className={styles.paneLeft}>
                  {CATS.map(cat => (
                    <button
                      key={cat.id}
                      className={`${styles.catItem} ${activeCat === cat.id ? styles.catItemActive : ''}`}
                      onClick={() => { setActiveCat(cat.id); setSelectedItem(null); setDrinkSize('S') }}
                    >
                      <span className={styles.catIcon}>{cat.icon}</span>
                      <span className={styles.catLabel}>{cat.label}</span>
                    </button>
                  ))}
                </div>
                <div className={styles.paneRight}>
                  {activeCat === 'drink' && (
                    <div className={styles.sizeTabs}>
                      {['S', 'M', 'L'].map(sz => (
                        <button
                          key={sz}
                          className={`${styles.sizeTab} ${drinkSize === sz ? styles.sizeTabActive : ''}`}
                          onClick={() => { setDrinkSize(sz); setSelectedItem(null) }}
                        >{sz}</button>
                      ))}
                    </div>
                  )}
                  <div className={styles.productList}>
                    {items
                      .filter(item =>
                        activeCat === 'drink'
                          ? getItemCat(item) === 'drink' && getDrinkSize(item.id) === drinkSize
                          : getItemCat(item) === activeCat
                      )
                      .map(item => (
                        <button
                          key={item.id}
                          className={`${styles.productItem} ${selectedItem === item.id ? styles.productItemSelected : ''}`}
                          onClick={() => setSelectedItem(item.id)}
                        >
                          <span className={styles.productName}>
                            {item.name.replace(/（期間限定）/g, '')}
                            {item.name.includes('期間限定') && <span className={styles.limitedBadge}>限定</span>}
                          </span>
                          <span className={styles.productPrice}>{item.price}円</span>
                          {selectedItem === item.id && <span className={styles.checkIcon} />}
                        </button>
                      ))
                    }
                  </div>
                </div>
              </div>
              <div className={styles.selectorBottom}>
                <span
                  className={styles.selectorSelectedName}
                  style={selectedItem ? { color: 'var(--text-primary)', fontWeight: 700 } : {}}
                >
                  {selectedItem ? items.find(i => i.id === selectedItem)?.name.replace(/（期間限定）/g, '') : '商品を選んでください'}
                </span>
                <div className={styles.qtyCtrl}>
                  <button className={styles.qBtn} onClick={() => setSelectorQty(q => Math.max(1, q - 1))}>−</button>
                  <span className={styles.qNum}>{selectorQty}</span>
                  <button className={styles.qBtn} onClick={() => setSelectorQty(q => q + 1)}>＋</button>
                </div>
                <button className={styles.addBtn} onClick={addToCart} disabled={!selectedItem}>追加</button>
              </div>
            </div>

            <div className={styles.cartList}>
              {cart.length === 0 ? (
                <>
                <div className={styles.cartEmpty}>商品を追加してください</div>
                <div className={styles.cartSteps}>
                  <div className={styles.cartStepsTitle}>使い方</div>
                  {[
                    { n: 1, title: 'メンバーを選ぶ',      desc: '誰の注文か選択してから商品を追加' },
                    { n: 2, title: '商品をカートに追加',   desc: 'カテゴリから商品を選んで追加ボタン' },
                    { n: 3, title: '最安の注文構成を確認', desc: '下にスクロールすると結果が出る' },
                  ].map((s, i, arr) => (
                    <div key={s.n} className={styles.cartStep}>
                      <div className={styles.cartStepLine}>
                        <div className={styles.cartStepDot}>{s.n}</div>
                        {i < arr.length - 1 && <div className={styles.cartStepConnector} />}
                      </div>
                      <div className={styles.cartStepBody}>
                        <div className={styles.cartStepName}>{s.title}</div>
                        <div className={styles.cartStepDesc}>{s.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
                </>
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
                            <span className={styles.cartName}>
                              {getItemName(entry.itemId)}
                              {items.find(i => i.id === entry.itemId)?.name.includes('期間限定') && (
                                <span className={styles.limitedBadge}>限定</span>
                              )}
                            </span>
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
              <button className={styles.clearBtn} onClick={() => { setCart([]); setPreviousCart(null) }}>すべてクリア</button>
            )}
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>最適な注文構成</span>
              {isCalculating && <span className={styles.calcBadge}>計算中…</span>}
              <div className={styles.lunchToggleMobile}>
                <span className={styles.lunchBadge} style={{ visibility: isLunch ? 'visible' : 'hidden' }}>10時〜15時</span>
                <div className={styles.lunchToggleRow}>
                  <span className={styles.lunchToggleLabel}>ランチ</span>
                  <button
                    className={`${styles.toggle} ${isLunch ? styles.toggleOn : ''}`}
                    onClick={() => setIsLunch(v => !v)}
                    aria-label="ランチモード切替"
                  >
                    <span className={styles.toggleKnob} />
                  </button>
                </div>
              </div>
            </div>

            {!result || cart.length === 0 ? (
              <div className={styles.emptySteps}>
                <p className={styles.emptyStepsTitle}>使い方</p>
                {[
                  { n: 1, title: 'メンバーを選ぶ',      desc: '誰の注文か選択してから商品を追加' },
                  { n: 2, title: '商品をカートに追加',   desc: 'カテゴリから商品を選んで追加ボタン' },
                  { n: 3, title: '最安の注文構成を確認', desc: 'セットと単品の最適な組み合わせを自動計算' },
                ].map((s, i, arr) => (
                  <div key={s.n} className={styles.emptyStep}>
                    <div className={styles.emptyStepLine}>
                      <div className={styles.emptyStepDot}>{s.n}</div>
                      {i < arr.length - 1 && <div className={styles.emptyStepConnector} />}
                    </div>
                    <div className={styles.emptyStepBody}>
                      <div className={styles.emptyStepName}>{s.title}</div>
                      <div className={styles.emptyStepDesc}>{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ opacity: isCalculating ? 0.4 : 1, transition: 'opacity 0.15s' }}>
                <div className={styles.legend}>
                  <span className={styles.legendChoice}>選択</span>
                  <span className={styles.legendLabel}>注文時に選ぶもの</span>
                </div>
                {result.sets.map((s, si) => {
                  const isLunchSet = s.id.startsWith('lunch_')
                  const fixedItems = Object.entries(s.contains || {}).map(([id, qty]) => {
                    const name = getItemName(id)
                    return qty > 1 ? `${name}×${qty}` : name
                  })
                  return (
                    <div key={`${s.id}-${si}`} className={styles.setBlock}>
                      <div className={styles.resultRow}>
                        <div className={styles.resultName}>
                          {s.name}
                          <span className={styles.setBadge}>SET</span>
                          {isLunchSet && <span className={styles.lunchSetBadge}>ランチ</span>}
                        </div>
                        <span className={styles.resultQty}>×{s.count}</span>
                        <span className={styles.resultPrice}>{(s.price * s.count).toLocaleString()}円</span>
                      </div>
                      {fixedItems.length > 0 && (
                        <div className={styles.detailRow}>
                          <span className={styles.detailFixed}>{fixedItems.join('、')}</span>
                        </div>
                      )}
                      {s.chosenSides?.length > 0 && (
                        <div className={styles.detailRow}>
                          {Object.entries(
                            s.chosenSides.reduce((acc, c) => {
                              const key = c.itemId + (c.extra || 0)
                              acc[key] = acc[key] || { ...c, count: 0 }
                              acc[key].count++
                              return acc
                            }, {})
                          ).map(([key, c]) => {
                            const name = getItemName(c.itemId)
                            const label = c.extra > 0 ? `${name}（+${c.extra}円）` : name
                            return <span key={key} className={styles.detailChoice}>{c.count > 1 ? `${label}×${c.count}` : label}</span>
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
                {result.singles.map(i => (
                  <div key={i.id} className={styles.resultRow}>
                    <span className={styles.resultName}>
                      {i.name.replace(/（期間限定）/g, '')}
                      {i.name.includes('期間限定') && <span className={styles.limitedBadge}>限定</span>}
                    </span>
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

                {suggestions.length > 0 && (
                  <div className={styles.suggestionArea}>
                    <p className={styles.suggestionTitle}>💡 もっとお得にするには</p>
                    {suggestions.map(s => (
                      <div key={s.item.id} className={styles.suggestionRow}>
                        <span className={styles.suggestionName}>
                          {s.drinkSize ? `ドリンク${s.drinkSize}` : s.item.name.replace(/（期間限定）/g, '')}をあと1品追加すると
                        </span>
                        <div className={styles.suggestionRowBottom}>
                          <span className={styles.suggestionBenefit}>
                            実質{s.netCost.toLocaleString()}円で{s.savingsGain.toLocaleString()}円お得
                          </span>
                          {s.drinkSize ? (
                            <button
                              className={`${styles.suggestionBtn} ${activeDrinkPicker === s.drinkSize ? styles.suggestionBtnActive : ''}`}
                              onClick={() => setActiveDrinkPicker(activeDrinkPicker === s.drinkSize ? null : s.drinkSize)}
                            >追加 ▾</button>
                          ) : (
                            <button className={styles.suggestionBtn} onClick={() => applyAddition(s.item)}>追加</button>
                          )}
                        </div>
                        {s.drinkSize && activeDrinkPicker === s.drinkSize && (
                          <div className={styles.drinkPicker}>
                            {items
                              .filter(i => i.category === 'ドリンク' && getDrinkSize(i.id) === s.drinkSize)
                              .map(drink => (
                                <button
                                  key={drink.id}
                                  className={styles.drinkPickerItem}
                                  onClick={() => { applyAddition(drink); setActiveDrinkPicker(null) }}
                                >
                                  {drink.name.replace(/（期間限定）/g, '')}
                                </button>
                              ))
                            }
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {sizeChanges.length > 0 && (
                  <div className={styles.suggestionArea}>
                    <p className={styles.suggestionTitle}>↕️ サイズ変更でお得に</p>
                    {sizeChanges.map(s => {
                      const fromName = s.fromDrinkSize ? `ドリンク${s.fromDrinkSize}` : s.fromItem.name.replace(/（期間限定）/g, '')
                      const toName = s.toDrinkSize ? `ドリンク${s.toDrinkSize}` : s.toItem.name.replace(/（期間限定）/g, '')
                      const diffLabel = s.priceDiff > 0 ? `+${s.priceDiff}円` : s.priceDiff < 0 ? `${s.priceDiff}円` : '同額'
                      const pickerId = `${s.fromItem.id}→${s.toDrinkSize}`
                      const pickerOpen = activeSizeChangePicker === pickerId
                      return (
                        <div key={`${s.fromItem.id}→${s.toItem.id}`} className={styles.suggestionRow}>
                          <span className={styles.suggestionName}>
                            {fromName}を{toName}に変更すると
                          </span>
                          <div className={styles.suggestionRowBottom}>
                            <span className={styles.suggestionBenefit}>
                              差額{diffLabel}で{s.savingsGain.toLocaleString()}円お得
                            </span>
                            {s.needsPicker ? (
                              <button
                                className={`${styles.suggestionBtn} ${pickerOpen ? styles.suggestionBtnActive : ''}`}
                                onClick={() => setActiveSizeChangePicker(pickerOpen ? null : pickerId)}
                              >変更 ▾</button>
                            ) : (
                              <button className={styles.suggestionBtn} onClick={() => applySizeChange(s.fromItem, s.toItem)}>変更</button>
                            )}
                          </div>
                          {s.needsPicker && pickerOpen && (
                            <div className={styles.drinkPicker}>
                              {items
                                .filter(i => i.category === 'ドリンク' && getDrinkSize(i.id) === s.toDrinkSize)
                                .map(drink => (
                                  <button key={drink.id} className={styles.drinkPickerItem}
                                    onClick={() => { applySizeChange(s.fromItem, drink); setActiveSizeChangePicker(null) }}
                                  >
                                    {drink.name.replace(/（期間限定）/g, '')}
                                  </button>
                                ))
                              }
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {previousCart && (
                  <div className={styles.undoBar}>
                    <span>カートを変更しました</span>
                    <button className={styles.undoBtn} onClick={undoSuggestion}>元に戻す</button>
                  </div>
                )}

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
