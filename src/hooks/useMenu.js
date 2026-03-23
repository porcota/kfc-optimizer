import { useState, useEffect, useCallback } from 'react'

const ITEMS_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTrX3_eg_0IvXzIjd_DXh1fxEOC-v3y7TmkwGaEvW_aW2HvbVN86k477DlHpbYdKw/pub?gid=1856895665&single=true&output=csv'
const SETS_URL  = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTrX3_eg_0IvXzIjd_DXh1fxEOC-v3y7TmkwGaEvW_aW2HvbVN86k477DlHpbYdKw/pub?gid=1498963288&single=true&output=csv'
const SIDE_GROUPS_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTrX3_eg_0IvXzIjd_DXh1fxEOC-v3y7TmkwGaEvW_aW2HvbVN86k477DlHpbYdKw/pub?gid=829233979&single=true&output=csv'
const UPDATED_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRC3hOwZ_rj3zgPy3LXJoqP0Ps857IBFPazOJVOnVE1U2ywvNXaIfoTeNdPMAUB8jyjEFtMxsBrMDxv/pub?gid=1549646750&single=true&output=csv'

function parseCSV(text) {
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map(line => {
    const vals = []
    let cur = '', inQ = false
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ }
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = '' }
      else cur += ch
    }
    vals.push(cur.trim())
    const obj = {}
    headers.forEach((h, i) => obj[h] = (vals[i] || '').replace(/^"|"$/g, '').trim())
    return obj
  })
}

function parseContains(str) {
  const fixed = {}
  const freeGroups = []
  if (!str) return { fixed, freeGroups }
  str.split(',').forEach(part => {
    const [k, v] = part.trim().split(':')
    if (!k || !v) return
    const key = k.trim()
    const val = v.trim()
    if (key.startsWith('@')) {
      freeGroups.push({ groupId: key.slice(1), count: parseInt(val) })
    } else {
      fixed[key] = parseInt(val)
    }
  })
  return { fixed, freeGroups }
}

export function useMenu() {
  const [items, setItems] = useState([])
  const [sets, setSets] = useState([])
  const [sideGroups, setSideGroups] = useState({})
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [fetchedAt, setFetchedAt] = useState(null)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const hasSideGroups = SIDE_GROUPS_URL !== 'REPLACE_WITH_SIDE_GROUPS_URL'
      const fetches = [
        fetch(ITEMS_URL).then(r => r.text()),
        fetch(SETS_URL).then(r => r.text()),
        hasSideGroups ? fetch(SIDE_GROUPS_URL).then(r => r.text()) : Promise.resolve(null),
      ]


      const parsedItems = parseCSV(itemsCSV)
        .map(r => ({ id: r['id'], name: r['商品名'], price: parseInt(r['価格（円）']) }))
        .filter(i => i.id && i.name && !isNaN(i.price))

      const parsedSets = parseCSV(setsCSV)
        .map(r => {
          const { fixed, freeGroups } = parseContains(r['含まれる単品（id:数量）'])
          return {
            id: r['id'],
            name: r['セット名'],
            price: parseInt(r['価格（円）']),
            contains: fixed,
            freeGroups,
          }
        })
        .filter(s => s.id && s.name && !isNaN(s.price))

      // サイドグループ: { side: [{itemId, extra}, ...] }
      const groups = {}
      if (sideGroupsCSV) {
        parseCSV(sideGroupsCSV).forEach(r => {
          const gid = r['グループid']
          const itemId = r['商品id']
          const extra = parseInt(r['追加料金（円）']) || 0
          if (!gid || !itemId) return
          if (!groups[gid]) groups[gid] = []
          groups[gid].push({ itemId, extra })
        })
      }

      setItems(parsedItems)
      setSets(parsedSets)
      setSideGroups(groups)
      // 更新日シートから日付を取得
      try {
        const rows = parseCSV(updatedCSV)
        const updatedRow = rows.find(r => r['キー'] === 'updated')
        if (updatedRow && updatedRow['値']) {
          setFetchedAt(new Date(updatedRow['値']))
        } else {
          setFetchedAt(new Date())
        }
      } catch {
        setFetchedAt(new Date())
      }
      setStatus('success')
    } catch (e) {
      setError(e.message)
      setStatus('error')
    }
  }, [])

  useEffect(() => { load() }, [load])
  return { items, sets, sideGroups, status, error, fetchedAt, reload: load }
}
