import { test, expect } from '@playwright/test'

// ──────────────────────────────────────────────
// モックデータ（実際のスプレッドシートのID・商品名を使用）
//
// chicken_original(310円) + potato_s(290円) の合計 600円
// regular_set(500円): 600円 → 100円お得
// lunch_chicken(450円): 600円 → 150円お得
// ──────────────────────────────────────────────
const ITEMS_CSV = [
  'id,商品名,価格（円）',
  'chicken_original,オリジナルチキン 1ピース,310',
  'potato_s,ポテトS,290',
].join('\n')

const SETS_CSV = [
  'id,セット名,価格（円）,含まれる単品（id:数量）',
  'regular_set,チキンセット,500,"chicken_original:1,@side:1"',
  'lunch_chicken,ランチチキンセット,450,"chicken_original:1,@side:1"',
].join('\n')

const SIDE_GROUPS_CSV = [
  'グループid,商品id,追加料金（円）',
  'side,potato_s,0',
].join('\n')

const UPDATED_CSV = [
  'キー,値',
  'updated,2026-03-01',
].join('\n')

/** Google Sheets の4つのURLをすべてモックする */
async function mockMenuData(page) {
  await page.route(/gid=2114492706/, route =>
    route.fulfill({ contentType: 'text/csv; charset=utf-8', body: ITEMS_CSV })
  )
  await page.route(/gid=28426279/, route =>
    route.fulfill({ contentType: 'text/csv; charset=utf-8', body: SETS_CSV })
  )
  await page.route(/gid=449307324/, route =>
    route.fulfill({ contentType: 'text/csv; charset=utf-8', body: SIDE_GROUPS_CSV })
  )
  await page.route(/gid=1549646750/, route =>
    route.fulfill({ contentType: 'text/csv; charset=utf-8', body: UPDATED_CSV })
  )
}

// ──────────────────────────────────────────────
// テスト1: アプリが正常に起動する
// ──────────────────────────────────────────────
test('アプリが正常に起動する', async ({ page }) => {
  await mockMenuData(page)
  await page.goto('/')

  // ヘッダーが表示される
  await expect(page.getByText('ケンタ賢者')).toBeVisible()
  await expect(page.getByText('KFCの注文を賢く最安値で')).toBeVisible()

  // メニュー読み込み後にメインUIが表示される
  await expect(page.getByText('注文を追加')).toBeVisible()
  await expect(page.getByText('最適な注文構成')).toBeVisible()

  // 商品ドロップダウンにアイテムが表示される
  await expect(page.locator('select option', { hasText: 'オリジナルチキン 1ピース' })).toBeAttached()
  await expect(page.locator('select option', { hasText: 'ポテトS' })).toBeAttached()

  // 初期状態では「商品を追加してください」が表示される
  await expect(page.getByText('左側で商品を追加してください')).toBeVisible()
})

// ──────────────────────────────────────────────
// テスト2: 商品を1つ追加すると最適化結果が表示される
// ──────────────────────────────────────────────
test('商品を1つ追加すると最適化結果が表示される', async ({ page }) => {
  await mockMenuData(page)
  await page.goto('/')
  await expect(page.getByText('注文を追加')).toBeVisible()

  // オリジナルチキンを選択して追加
  await page.locator('select').selectOption('chicken_original')
  await page.getByRole('button', { name: '追加' }).click()

  // 右パネルに最適化結果が表示される（「左側で…」が消える）
  await expect(page.getByText('左側で商品を追加してください')).not.toBeVisible()

  // 合計金額と単品最安表示が出る
  await expect(page.getByText('合計')).toBeVisible()
  await expect(page.getByText('単品注文が最安です')).toBeVisible()

  // カートにも商品名が表示される（span要素）
  await expect(page.locator('span', { hasText: 'オリジナルチキン 1ピース' }).first()).toBeVisible()
})

// ──────────────────────────────────────────────
// テスト3: メンバーを追加できる
// ──────────────────────────────────────────────
test('メンバーを追加できる', async ({ page }) => {
  await mockMenuData(page)
  await page.goto('/')
  await expect(page.getByText('注文を追加')).toBeVisible()

  // 「＋」ボタンをクリックしてメンバー追加フォームを開く
  await page.getByRole('button', { name: '＋' }).click()

  // 名前を入力してEnterで確定
  await page.getByPlaceholder('名前を入力').fill('テストユーザー')
  await page.getByPlaceholder('名前を入力').press('Enter')

  // 新しいメンバータグが表示される
  await expect(page.getByRole('button', { name: 'テストユーザー' })).toBeVisible()
})

// ──────────────────────────────────────────────
// テスト4: メニューを再読み込みすると新しい商品が反映される
//
// 1回目: chicken_original のみ
// 再読み込み後: chicken_original + potato_s が追加される
// → ドロップダウンに「ポテトS」が出現することで再取得を検証
// ──────────────────────────────────────────────
test('メニューを再読み込みすると新しい商品が反映される', async ({ page }) => {
  const ITEMS_CSV_V1 = [
    'id,商品名,価格（円）',
    'chicken_original,オリジナルチキン 1ピース,310',
  ].join('\n')

  const ITEMS_CSV_V2 = [
    'id,商品名,価格（円）',
    'chicken_original,オリジナルチキン 1ピース,310',
    'potato_s,ポテトS,290',
  ].join('\n')

  let itemsCallCount = 0

  // React StrictMode により初期マウントで load() が2回呼ばれるため、
  // 最初の2回はV1を返し、3回目（再読み込みボタン押下）でV2を返す
  await page.route(/gid=2114492706/, route => {
    const body = itemsCallCount < 2 ? ITEMS_CSV_V1 : ITEMS_CSV_V2
    itemsCallCount++
    route.fulfill({ contentType: 'text/csv; charset=utf-8', body })
  })
  await page.route(/gid=28426279/, route =>
    route.fulfill({ contentType: 'text/csv; charset=utf-8', body: SETS_CSV })
  )
  await page.route(/gid=449307324/, route =>
    route.fulfill({ contentType: 'text/csv; charset=utf-8', body: SIDE_GROUPS_CSV })
  )
  await page.route(/gid=1549646750/, route =>
    route.fulfill({ contentType: 'text/csv; charset=utf-8', body: UPDATED_CSV })
  )

  await page.goto('/')
  await expect(page.getByText('注文を追加')).toBeVisible()

  // 初回: ポテトSはドロップダウンに存在しない
  await expect(page.locator('select option', { hasText: 'ポテトS' })).not.toBeAttached()

  // 再読み込みボタンをクリック
  await page.getByRole('button', { name: 'メニューを再読み込み' }).click()
  await expect(page.getByText('注文を追加')).toBeVisible()

  // 再読み込み後: ポテトSがドロップダウンに現れる
  await expect(page.locator('select option', { hasText: 'ポテトS' })).toBeAttached()

  // 新たに追加された ポテトS を選択して追加
  await page.locator('select').selectOption('potato_s')
  await page.getByRole('button', { name: '追加' }).click()

  // 最適化結果が表示される
  await expect(page.getByText('合計')).toBeVisible()
  await expect(page.locator('span', { hasText: 'ポテトS' }).first()).toBeVisible()
})

// ──────────────────────────────────────────────
// テスト5: ランチトグルでランチセットが切り替わる
// ──────────────────────────────────────────────
test('ランチトグルでランチセットが切り替わる', async ({ page }) => {
  await mockMenuData(page)
  await page.goto('/')
  await expect(page.getByText('注文を追加')).toBeVisible()

  // オリジナルチキン + ポテトSを追加
  // (単品合計600円、regular_set=500円で100円お得)
  await page.locator('select').selectOption('chicken_original')
  await page.getByRole('button', { name: '追加' }).click()
  await page.locator('select').selectOption('potato_s')
  await page.getByRole('button', { name: '追加' }).click()

  // ランチOFF時: regular_setが使われ100円お得
  await expect(page.getByText('100円お得！')).toBeVisible()

  // 「〜15時」バッジは非表示
  await expect(page.getByText('〜15時')).not.toBeVisible()

  // ランチトグルをONにする
  await page.getByLabel('ランチモード切替').click()

  // 「〜15時」バッジが表示される
  await expect(page.getByText('〜15時')).toBeVisible()

  // ランチセット(450円)が使われ150円お得になる
  await expect(page.getByText('150円お得！')).toBeVisible()

  // 結果にランチセットのバッジが出る
  await expect(page.getByText('ランチ').first()).toBeVisible()
})
