/**
 * freeGroups対応の最適化
 * セットに @side:2 のような自由選択サイドがある場合、
 * desiredの中から最もコストを下げる組み合わせを選ぶ
 */

// パック内でサイドをN品選ぶとき、desiredを最大限消費する最安の選び方を返す
function chooseSides(groupItems, desired, count, items) {
  // desiredにある商品を優先して選ぶ（お得になるから）
  // groupItems: [{itemId, extra}]
  // 追加料金ゼロ & desiredにある商品を優先、次に追加料金が安い順
  const candidates = groupItems
    .map(g => {
      const item = items.find(i => i.id === g.itemId)
      const inDesired = (desired[g.itemId] || 0) > 0
      return { ...g, item, inDesired }
    })
    .filter(g => g.item)
    .sort((a, b) => {
      // desiredにあるものを優先
      if (a.inDesired !== b.inDesired) return a.inDesired ? -1 : 1
      // 追加料金が安い順
      return a.extra - b.extra
    })

  const chosen = []
  const remDesired = { ...desired }

  for (let i = 0; i < count; i++) {
    // まだdesiredに残っている候補を優先
    const best = candidates.find(c => (remDesired[c.itemId] || 0) > 0)
      || candidates[0]
    if (!best) break
    chosen.push(best)
    if (remDesired[best.itemId] > 0) remDesired[best.itemId]--
  }

  return chosen
}

export function optimize(items, sets, qty, sideGroups = {}) {
  const desired = { ...qty }
  const totalCount = Object.values(desired).reduce((a, b) => a + b, 0)
  if (totalCount === 0) return null

  const singleOnly = items.reduce((s, i) => s + i.price * (desired[i.id] || 0), 0)

  // 関連セットに絞る（freeGroupsがある場合はchickenなど固定アイテムで判定）
  const relevantSets = sets.filter(set => {
    const fixedKeys = Object.keys(set.contains)
    const hasFreeGroups = set.freeGroups && set.freeGroups.length > 0

    if (hasFreeGroups) {
      // freeGroupsがあるセットは固定アイテムだけ確認
      if (fixedKeys.length === 0) return true
      return fixedKeys.every(k => (desired[k] || 0) > 0)
    }
    // 通常セットは全アイテムがdesiredにある場合のみ
    return fixedKeys.every(k => (desired[k] || 0) > 0)
  })

  if (relevantSets.length === 0) {
    return {
      sets: [],
      singles: items.map(i => ({ ...i, count: desired[i.id] || 0 })).filter(i => i.count > 0),
      total: singleOnly,
      singleOnly,
      savings: 0,
    }
  }

  const maxN = relevantSets.map(set => {
    let m = 0
    for (const [k, v] of Object.entries(set.contains))
      if (desired[k] > 0) m = Math.max(m, Math.ceil(desired[k] / v))
    // freeGroupsのみのセット（チキンパック等）は最大数を欲しいチキン数から計算
    if (m === 0 && set.freeGroups?.length > 0) m = 1
    return Math.min(m + 1, 4)
  })

  let best = Infinity
  let bestCounts = null

  const recurse = (idx, counts) => {
    if (idx === relevantSets.length) {
      const rem = { ...desired }
      let cost = 0

      for (let i = 0; i < relevantSets.length; i++) {
        if (!counts[i]) continue
        const set = relevantSets[i]
        const n = counts[i]

        // 固定アイテムを引く
        cost += n * set.price
        for (const [k, v] of Object.entries(set.contains))
          rem[k] = (rem[k] || 0) - n * v

        // freeGroupsの処理：各パック1個ごとにサイドを選ぶ
        if (set.freeGroups?.length > 0) {
          for (let j = 0; j < n; j++) {
            for (const fg of set.freeGroups) {
              const groupItems = sideGroups[fg.groupId] || []
              const chosen = chooseSides(groupItems, rem, fg.count, items)
              for (const c of chosen) {
                cost += c.extra
                rem[c.itemId] = (rem[c.itemId] || 0) - 1
              }
            }
          }
        }
      }

      for (const item of items) {
        const r = rem[item.id] || 0
        if (r > 0) cost += r * item.price
      }

      if (cost < best) { best = cost; bestCounts = [...counts] }
      return
    }
    for (let n = 0; n <= maxN[idx]; n++) { counts[idx] = n; recurse(idx + 1, counts) }
  }

  recurse(0, new Array(relevantSets.length).fill(0))

  if (bestCounts === null) {
    return {
      sets: [],
      singles: items.map(i => ({ ...i, count: desired[i.id] || 0 })).filter(i => i.count > 0),
      total: singleOnly,
      singleOnly,
      savings: 0,
    }
  }

  // 結果を組み立て
  const rem2 = { ...desired }
  const usedSets = []
  for (let i = 0; i < relevantSets.length; i++) {
    if (!bestCounts[i]) continue
    const set = relevantSets[i]
    const n = bestCounts[i]

    for (const [k, v] of Object.entries(set.contains))
      rem2[k] = (rem2[k] || 0) - n * v

    const chosenSides = []
    if (set.freeGroups?.length > 0) {
      for (let j = 0; j < n; j++) {
        for (const fg of set.freeGroups) {
          const groupItems = sideGroups[fg.groupId] || []
          const chosen = chooseSides(groupItems, rem2, fg.count, items)
          for (const c of chosen) {
            rem2[c.itemId] = (rem2[c.itemId] || 0) - 1
            chosenSides.push(c)
          }
        }
      }
    }

    usedSets.push({ ...set, count: n, chosenSides })
  }

  const singles = items
    .map(item => ({ ...item, count: Math.max(0, rem2[item.id] || 0) }))
    .filter(i => i.count > 0)

  return {
    sets: usedSets,
    singles,
    total: best,
    singleOnly,
    savings: singleOnly - best,
  }
}
