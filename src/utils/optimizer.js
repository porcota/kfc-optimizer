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
    const fromDesired = candidates.find(c => (remDesired[c.itemId] || 0) > 0)
    if (fromDesired) {
      chosen.push(fromDesired)
      remDesired[fromDesired.itemId]--
    } else {
      // desiredが尽きたら追加料金が最安の非desiredアイテムを選ぶ
      const fallback = candidates.find(c => !c.inDesired) ?? candidates[0]
      if (!fallback) break
      chosen.push(fallback)
    }
  }

  return chosen
}

export function optimize(items, sets, qty, sideGroups = {}) {
  const desired = { ...qty }
  const totalCount = Object.values(desired).reduce((a, b) => a + b, 0)
  if (totalCount === 0) return null

  const singleOnly = items.reduce((s, i) => s + i.price * (desired[i.id] || 0), 0)

  // 関連セットに絞る
  const relevantSets = sets.filter(set => {
    const fixedKeys = Object.keys(set.contains)
    const hasFreeGroups = set.freeGroups?.length > 0

    // 固定アイテムが1つでもdesiredにないセットは除外
    if (fixedKeys.length > 0 && !fixedKeys.every(k => (desired[k] || 0) > 0)) return false

    if (hasFreeGroups) {
      // freeGroupsがあるセットは、少なくとも1つのグループにdesiredの品がある場合のみ
      return set.freeGroups.some(fg =>
        (sideGroups[fg.groupId] || []).some(g => (desired[g.itemId] || 0) > 0)
      )
    }
    return true
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
    if (m === 0 && set.freeGroups?.length > 0) {
      // freeGroupsのみのセット: desiredで消費できる品数から上限を算出
      const consumable = set.freeGroups.reduce((total, fg) => {
        const matched = (sideGroups[fg.groupId] || [])
          .reduce((s, g) => s + (desired[g.itemId] || 0), 0)
        return total + Math.min(fg.count, matched)
      }, 0)
      const perSet = set.freeGroups.reduce((s, fg) => s + fg.count, 0)
      m = perSet > 0 ? Math.ceil(consumable / perSet) : 1
      m = Math.max(1, m)
    }
    return m + 1
  })

  let best = singleOnly  // 単品合計を初期値にすることで無駄な探索を削減
  let bestCounts = null

  const recurse = (idx, counts, setCostSoFar) => {
    if (setCostSoFar >= best) return  // 枝刈り: セット費用だけで既にbestを超えている
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
                if ((rem[c.itemId] || 0) > 0) rem[c.itemId]--
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
    for (let n = 0; n <= maxN[idx]; n++) {
      counts[idx] = n
      recurse(idx + 1, counts, setCostSoFar + n * relevantSets[idx].price)
    }
  }

  recurse(0, new Array(relevantSets.length).fill(0), 0)

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
            if ((rem2[c.itemId] || 0) > 0) rem2[c.itemId]--
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

function drinkSizeOf(id) {
  if (id.endsWith('_l')) return 'L'
  if (id.endsWith('_m')) return 'M'
  if (id.endsWith('_s')) return 'S'
  return null
}

export function suggestAddition(items, sets, qty, sideGroups = {}) {
  const currentResult = optimize(items, sets, qty, sideGroups)
  const currentSavings = currentResult?.savings ?? 0

  // sideGroupsに含まれるitemIdのSet（セットの自由選択枠で消費できる品）
  const inAnyGroup = new Set(
    Object.values(sideGroups).flatMap(g => g.map(e => e.itemId))
  )

  // ドリンクはカテゴリで判定し、サイズごとに代表1品だけ残す
  // （_s/_m/_l はサイド品にも使われるためID末尾では判定しない）
  // sideGroupsに含まれる品を優先する（セットのfreeGroupで消費できるため）
  const drinkRepBySize = new Map() // size -> { item, inGroup }
  for (const item of items) {
    if (item.category !== 'ドリンク') continue
    const size = drinkSizeOf(item.id)
    if (!size) continue
    const existing = drinkRepBySize.get(size)
    if (!existing) {
      drinkRepBySize.set(size, { item, inGroup: inAnyGroup.has(item.id) })
    } else if (!existing.inGroup && inAnyGroup.has(item.id)) {
      drinkRepBySize.set(size, { item, inGroup: true })
    }
  }

  // sideGroupsまたはセット固定アイテムに含まれる品のみ試す
  // （どちらにも関係ない品を追加してもセット節約は変わらない）
  const relevantItemIds = new Set([
    ...inAnyGroup,
    ...sets.flatMap(s => Object.keys(s.contains)),
  ])

  const candidates = [
    ...items.filter(item => item.category !== 'ドリンク' && relevantItemIds.has(item.id)),
    ...[...drinkRepBySize.values()].map(r => r.item),
  ]

  const suggestions = []

  for (const item of candidates) {
    const newQty = { ...qty, [item.id]: (qty[item.id] || 0) + 1 }
    const newResult = optimize(items, sets, newQty, sideGroups)
    if (!newResult) continue

    const savingsGain = newResult.savings - currentSavings
    const netCost = item.price - savingsGain

    if (savingsGain > 0) {
      const size = item.category === 'ドリンク' ? drinkSizeOf(item.id) : null
      suggestions.push({ item, savingsGain, netCost, drinkSize: size })
    }
  }

  return suggestions
    .sort((a, b) => a.netCost - b.netCost)
    .slice(0, 3)
}

export function suggestSizeChange(items, sets, qty, sideGroups = {}) {
  const currentResult = optimize(items, sets, qty, sideGroups)
  if (!currentResult) return []
  const currentSavings = currentResult.savings

  const inAnyGroup = new Set(
    Object.values(sideGroups).flatMap(g => g.map(e => e.itemId))
  )

  const suggestions = []
  const seen = new Set() // 同じ変更を重複提案しない

  for (const [itemId, count] of Object.entries(qty)) {
    if (!count) continue
    const fromItem = items.find(i => i.id === itemId)
    if (!fromItem) continue

    let variants = [] // { toItem, key, fromDrinkSize, toDrinkSize, needsPicker }

    if (fromItem.category === 'ドリンク') {
      const fromSize = drinkSizeOf(itemId)
      if (!fromSize) continue
      const prefix = itemId.slice(0, itemId.lastIndexOf('_') + 1) // 例: 'lemonade_'
      for (const size of ['S', 'M', 'L']) {
        if (size === fromSize) continue
        const key = `drink_${fromSize}→${size}`
        if (seen.has(key)) continue
        // 同じ商品の別サイズを優先して探す
        const sameItem = items.find(i => i.id === `${prefix}${size.toLowerCase()}`)
        if (sameItem) {
          variants.push({ toItem: sameItem, key, fromDrinkSize: fromSize, toDrinkSize: size, needsPicker: false })
        } else {
          // 同名サイズがなければ代表品を使い、ピッカーで選ばせる
          const sizeItems = items.filter(i => i.category === 'ドリンク' && drinkSizeOf(i.id) === size)
          const rep = sizeItems.find(i => inAnyGroup.has(i.id)) ?? sizeItems[0]
          if (rep) variants.push({ toItem: rep, key, fromDrinkSize: fromSize, toDrinkSize: size, needsPicker: true })
        }
      }
    } else {
      // 同IDプレフィックスで別サイズのアイテム（例: potato_s → potato_l）
      const fromSize = drinkSizeOf(itemId)
      if (!fromSize) continue
      const prefix = itemId.slice(0, itemId.lastIndexOf('_') + 1)
      items
        .filter(i => i.id !== itemId && i.id.startsWith(prefix) && drinkSizeOf(i.id))
        .forEach(toItem => {
          const key = `${itemId}→${toItem.id}`
          if (!seen.has(key)) variants.push({ toItem, key, fromDrinkSize: null, toDrinkSize: null })
        })
    }

    for (const { toItem, key, fromDrinkSize, toDrinkSize, needsPicker } of variants) {
      seen.add(key)

      const newQty = { ...qty, [itemId]: count - 1, [toItem.id]: (qty[toItem.id] || 0) + 1 }
      if (newQty[itemId] <= 0) delete newQty[itemId]

      const newResult = optimize(items, sets, newQty, sideGroups)
      if (!newResult) continue

      const savingsGain = newResult.savings - currentSavings
      const priceDiff = toItem.price - fromItem.price
      const netBenefit = savingsGain - priceDiff

      // セット節約が増え、かつ差額を差し引いてもプラスの場合のみ提案
      if (savingsGain > 0 && netBenefit > 0) {
        suggestions.push({ fromItem, toItem, savingsGain, priceDiff, netBenefit, fromDrinkSize, toDrinkSize, needsPicker: needsPicker ?? false })
      }
    }
  }

  return suggestions.sort((a, b) => b.netBenefit - a.netBenefit).slice(0, 3)
}
