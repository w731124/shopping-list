# 決策紀錄

## 2026-09-04（三）品項庫按鈕換行邏輯修正（追加）

- **根因是 `.catalog-item .name-wrap { min-width: 0; }`**：`min-width: 0` 讓品名欄位可以被壓縮到無限窄，瀏覽器排版時會優先選「把品名壓成逐字瀑布」而不是「觸發整排換行」，導致上一版 `.item-actions` 不換行單位的修正實際上沒有被觸發。改成 `min-width: 7em`（約 6-7 個中文字寬）幫品名欄位設一個壓縮下限，壓到底之後瀏覽器沒有更多空間可擠，才會改走「標籤＋按鈕群組整排換到下一行」這條路。`7em` 是經驗值，照需求文件說明保留未來可能還要微調的空間。
- **已用 Playwright 對正式部署驗證三種情境**：短品名短標籤（`雞蛋` 等既有資料）維持單行；長品名無標籤（新增一筆測試資料）品名正常依詞彙換行、不觸發按鈕換行；長品名＋長標籤（沿用先前測試留下的「文字很長很長很長很長很長」/「很常很長很長的表情」那筆）品名正常換行成多行文字（不是逐字瀑布），標籤與三顆按鈕整組掉到下一行、靠右對齊。截圖確認視覺符合驗收標準，測試新增的資料已刪除清理。

## 2026-09-04（二）加入項目預設分頁改一次性項目 + 品項庫按鈕排版修正

- **加入項目彈窗的分頁對調（`openAddTripModal` 日常採購分支）**：DOM 順序、`is-active`、`hidden` 三處一起換，`bindModalEvents` 的切換事件是靠 `data-seg`/`data-seg-panel` 屬性比對、不是靠 DOM 順序，所以完全不用動事件綁定邏輯，純粹是 render 出來的初始 HTML 不同。
- **品項庫按鈕排版問題的根因是「三顆按鈕各自是 flex row 的獨立子項」**：原本包住三顆按鈕的 `<span>` 沒有自己的 flex context，空間不足時瀏覽器會把三顆按鈕當成三個獨立的可換行單位各自打散。修法是把這個 `<span>` 升級成 `class="item-actions"`、`display:flex; flex-wrap:nowrap`，讓它變成外層 `.catalog-item` 眼中「一個不可拆的區塊」，配合外層 `.catalog-item` 加上 `flex-wrap:wrap`，換行時只會整組 `.item-actions` 掉到下一行，不會拆散。
- **按鈕縮小尺寸只用 `.catalog-item .btn-solid-*` 這種高特異性選擇器覆寫 `padding`/`font-size`/`min-height`**，沒有動 `.btn-solid-primary` 等基礎規則本身——因為本次清單「加入品項庫」按鈕（`promote-to-catalog`）共用同一組基礎 class，若直接改基礎規則會連帶把它也縮小，不符合「只有品項庫管理這裡變小」的需求。已用 Playwright 截圖＋量測按鈕高度確認：品項庫管理按鈕實際渲染高度 28px（改小了），本次清單的「加入品項庫」按鈕未受影響。
- **已用 Playwright 對正式部署驗證**：彈窗預設顯示「新增一次性項目」分頁、切換分頁功能仍正常；品項庫管理一般短名稱項目維持單行、三顆按鈕同排；刻意新增一筆超長名稱＋長標籤的測試品項，確認換行時三顆按鈕整組掉到下一行且仍在同一列（不會各自打散），截圖確認視覺符合預期，測試完刪除該筆測試資料還原。這批純前端異動，不涉及 GAS，push 後 GitHub Pages 更新即可生效，不需要重新部署 GAS。

## 2026-09-04（一）拖曳排序（本次清單＋品項庫管理，限日常採購）

- **`sort_order` 欄位用「懶惰遷移」而非要求使用者手動加欄位**：新增 `ensureSortOrderColumn_(sheetName)`，在 `handle_()` 每次請求最前面對 Catalog／TripList 各呼叫一次——沒有 `sort_order` 表頭就補上該欄位，並依 `category_id` 分組、組內依既有的 `created_at`／`added_at`（缺欄位才退回列順序）算出初始序號寫回；已經有欄位時只讀表頭那一列就返回，成本可以忽略，所以直接放在每次請求最前面，不用另外寫一個「一次性遷移」的手動執行函式，也不會要求使用者自己去 Google Sheet 手動加欄位。
- **`SCHEMA.Catalog`／`SCHEMA.TripList` 把 `sort_order` 放在陣列最後一個**：因為 `ensureSortOrderColumn_` 是用 `getLastColumn()+1` 在既有資料表最右邊新增欄位，必須讓 `SCHEMA` 常數裡的欄位順序跟實際新增後的物理欄位順序一致，`appendRow_`（新增列用）才不會寫錯欄位。
- **`getCatalog_`／`getTripList_` 排序邏輯是「先比 `category_id`、再比 `sort_order`」而不是單純對整個表按 `sort_order` 排序**：雖然前端本來就會用 `category_id` 過濾出各分類清單，理論上只要同分類內順序正確、分類間怎麼交錯都不影響顯示結果，但直接按規格寫「先分組再組內排序」語意更明確、也不用假設不同分類的 `sort_order` 數值不會恰好相同。
- **`reorderCatalogItems`／`reorderTripItems` 用同一個共用函式 `reorderItems_`**：內部先一次讀出整個表的資料範圍（含 `category_id` 用於安全驗證），確認 `orderedItemIds` 裡每個 id 都存在且屬於傳入的 `category_id`（有任何一筆不符合就整個丟例外，不會部分寫入），然後**只覆寫 `sort_order` 這一欄**（用單一次 `Range.setValues()`），其餘欄位或其他分類的列完全不動、也不會被重新排序，符合「不要重算全表」的要求。
- **需求文件裡「`reorderTripItems` 要多限制在同一個 `trip_id` 內生效」這條沒有照字面實作**：因為專案既有的資料模型（見前面「2026-09-02 初版架構」那條）明講 `trip_id` 只是 TripList 這張表自己的主鍵、不是「梯次」分組欄位，本次清單本身沒有「梯次」概念，所以 TripList 沒有任何比 `category_id` 更小的分組單位可以限制。判斷這是需求文件對資料模型的誤解，`reorderTripItems_` 因此跟 `reorderCatalogItems_` 一樣只用 `category_id` 當範圍界線，這也是目前資料模型下唯一合理的分組依據。
- **拖曳套件用 SortableJS（CDN：`cdn.jsdelivr.net/npm/sortablejs@1.15.2`）**，只在 `renderDailyPanel()` 建完 DOM 後呼叫 `initDailySortable()`，鎖定 `#panel-daily` 底下的 `.trip-list`／`.catalog-list` 各自 new 一個 `Sortable` 實例；`renderStorePanel()` 完全沒有呼叫這個初始化，賣場卡片的清單容器沒有掛 `Sortable`，長按不會有任何拖曳反應，直接用「賣場分頁完全不初始化」達成範圍限制，沒有另外寫開關判斷。
- **每次 `renderAll()` 都是整個 `innerHTML` 重繪**，舊的 `Sortable` 實例會隨著舊 DOM 節點一起被捨棄，不需要額外呼叫 `.destroy()`；`initDailySortable()` 在每次 `renderDailyPanel()` 之後都會重新對新的 `<ul>` 建立新實例，維持專案原本「整包重繪」的既有模式，沒有為了拖曳另外改成局部更新 DOM。
- **長按判斷用 `delay: 300` + `delayOnTouchOnly: true` + `touchStartThreshold: 5`**：只有觸控輸入需要長按 300ms 才觸發拖曳，滑鼠（桌機測試／簡報）維持立即拖曳；`filter: 'input, select, button, a'` + `preventOnFilter: false` 讓 checkbox／按鈕／表單控制項本身不會被判定成拖曳起點，短按 checkbox 的原生 click/change 行為不受影響——已用 Playwright 模擬拖曳跟點擊 checkbox 分別驗證過，checkbox 單擊仍正常切換。
- **API 呼叫時機是「放開就打，不等使用者做完全部調整」**：`onEnd` 一觸發就呼叫 `handleReorder()`，內部直接送出 `reorderTripItems`／`reorderCatalogItems`；跟專案既有的樂觀更新模式一致——先在 `state.tripList`／`state.catalog` 陣列裡把該分類底下的項目依放開後的 DOM 順序重新排列（`reorderStateArray()`，只動同分類項目，其他分類項目的陣列位置不受影響）、立刻 `renderAll()`，失敗才把整個陣列還原成拖曳前的快照並跳 toast「排序更新失敗，已還原順序」。
- **`iOS Safari` 長按選單抑制**：CSS 新增 `[data-sortable="true"] .trip-item / .catalog-item { -webkit-touch-callout: none; user-select: none; }`，只加在日常採購兩個 `.section`（各自標了 `data-sortable="true"`），賣場的 `.section` 沒有這個屬性，不影響賣場清單原本的文字選取行為。沒有實機 iOS 測試環境，這條純靠程式碼審視＋官方建議寫法完成，麻煩使用者實際用 iPhone 開 PWA 長按確認一次系統選單不會跳出。
- **已用 Playwright 對正式部署（GAS 尚未重新部署前）驗證**：日常採購「本次清單」與「品項庫管理」兩個清單長按拖曳後，DOM 會先樂觀重排、接著因為後端還沒有 `reorderTripItems`／`reorderCatalogItems` 這兩個 action 而 API 失敗，前端正確把順序還原回拖曳前並跳出「排序更新失敗，已還原順序」的 toast；大賣場分頁的清單容器確認沒有掛上 `Sortable` 實例；checkbox 單擊功能不受拖曳邏輯影響；過程中瀏覽器 console 沒有任何錯誤。**排序真正寫回 Google Sheet、新項目 `sort_order` 接到分類最後面、Catalog 排序不影響既有 TripList 這幾點，需要等 GAS 重新部署後才能實測，這批只驗證了前端邏輯與失敗回滾路徑。**

## GAS 後端需要重新部署

`gas/Code.gs` 這次新增了 `sort_order` 相關的欄位遷移邏輯，以及 `reorderCatalogItems`／`reorderTripItems` 兩個新 action，`getCatalog`／`getTripList`／`addCatalogItem`／`addTripItem` 也都有異動。**這一步一定要回瀏覽器操作**：Apps Script 編輯器貼上新版 `gas/Code.gs` 全部內容 → Deploy > Manage deployments，對現有部署（ID 開頭 `AKfycbyB2Og9aZEl33HMxMXWj8qgFLeRqdISCvt4_F5vM61kBZgTBAu8oLMNc8pmfWOVZ9A8Qw`）按編輯（鉛筆圖示）→ New version → Deploy，**不要建立新的部署**，這樣 `js/config.js` 裡的網址才不用跟著換。

部署完成後建議手動確認：Google Sheet 的 Catalog／TripList 兩張表最右邊多了一欄 `sort_order`，且既有資料列都補上了數字（不是空的）——第一次觸發任何 API 請求（例如打開網頁）時就會自動完成這個遷移，之後每次請求只是快速檢查一下表頭，不會重複遷移。部署完成前，拖曳放開後會先讓畫面樂觀重排，然後因為後端還沒有這兩個新 action 而失敗回滾、跳「排序更新失敗，已還原順序」的 toast（這是本批已經用 Playwright 驗證過的既有行為，不是 bug）。

## 2026-09-03（九）大賣場採購移除品項庫 + 賣場卡片識別色

- **「+ 加入項目」彈窗也一併處理**：需求裡明講賣場新增品項要「統一回歸一次性項目」，所以除了拿掉賣場卡片裡的「品項庫管理」區塊，`openAddTripModal` 依 `category.type` 分流——賣場分類直接跳只有一個輸入框的表單，不再顯示「從品項庫選擇／新增一次性項目」的切換分頁；日常採購維持原本兩種都有的行為不變。
- **`renderAddCatalogForm` 函式直接刪除**：這個函式原本只有大賣場的品項庫管理區塊在用，拿掉該區塊後變成確定的死代碼，比照之前 `.btn-add-light` 的處理方式一併清掉，不保留沒人呼叫的函式。
- **後端／`state.catalog` 完全不動**：`Api.getCatalog()` 還是照樣抓全部分類的品項庫資料（含賣場），只是店面分頁不再渲染、不再提供管理入口，符合「資料保留、只是介面拿掉」的要求；`js/api.js`、`gas/Code.gs` 這次都沒有改動。
- **賣場色條用 inline style 而非額外 CSS class**：因為色碼是「賣場名稱 → hex」的資料查找結果，不是固定樣式，`STORE_ACCENT_COLORS` 物件查不到時 fallback 成 `var(--border)`（沿用現有的中性灰邊框變數，不是憑空發明新色），新增賣場不會因為沒對到色碼而報錯或留白異常。色條直接用 `.section` 既有的 `border-left`，沒有额外處理圓角，因為 `border-radius` 天生就會讓 border 跟著卡片弧度走，不需要另外裁切。

## 2026-09-03（八）本次清單「加入品項庫」+ 品項庫加入本次清單防重複（僅日常採購）

- **兩個功能都用 `categoryById(...).type === 'daily'` 當唯一判斷依據**，沒有額外去查是否為「非賣場」或用分類名稱字串比對——`type` 欄位本來就是為了這個目的存在，直接沿用最不容易出錯。
- **「加入品項庫」的重複判斷是比對同分類下的品項庫「名稱」字串完全相同**（`c.name === item.name`，不 trim、不忽略大小寫），跟品項庫新增表單本身目前也沒有做名稱去重是一致的行為，沒有另外拉高標準。
- **找到同名品項庫項目時，直接把該筆本次清單項目的 `catalog_item_id` 在前端本地補上既有的 `item_id`**（不是新建一筆），跟「新建成功後回填」用同一套邏輯收尾，按鈕都會消失，行為一致。
- **`catalog_item_id` 回填只更新前端 `state`，沒有呼叫任何 GAS action 寫回 TripList 那一列**——因為目前的 API 沒有「更新 TripList 任意欄位」這個動作，且需求裡也明講不需要新增 GAS action。代價：使用者重新整理頁面後，這筆本次清單項目在 Google Sheet 裡的 `catalog_item_id` 欄位其實還是空的，「加入品項庫」按鈕可能會重新出現；使用者若再按一次，因為品項庫已經有同名項目，會走「已有品項」分支而不會真的重複新增，所以功能上不會出錯，只是按鈕消失的效果不會跨重整持續。這是配合「不需要新增 GAS action」限制下的已知取捨，之後如果要徹底解決，需要加一個能更新 TripList 單一欄位的 action。
- **品項庫→本次清單防重複，判斷「同一個 catalog_item_id 是否已經在 TripList 中」，不論是否已打勾**，並且對兩個入口都生效（品項庫管理列表的「加入」按鈕、以及「+ 加入項目」彈窗裡「從品項庫選擇」的加入按鈕）——因為兩者本質上是同一個「品項庫→本次清單」動作，只是入口不同，需求裡也沒有把彈窗排除在外。
- 已用 Playwright 對正式部署的 GAS 後端跑過三個情境確認：品項庫同名去重（跳「品項庫中已有『OO』，未重複新增」）、本次清單重複加入確認框（跳「OO已經在本次清單中，仍要再加入一次嗎？」）、以及「加入品項庫」按鈕只在日常採購的一次性項目上出現。

## 2026-09-03（七）品項庫管理標題與輸入框間距

- `.section-header` 加上 `gap: 12px`：這個 class 同時是「本次清單」標題列與「品項庫管理」標題列共用的容器，加在共用規則上兩邊都會一致變寬鬆，不用另外寫一條只給 `.catalog-header` 用。12px 直接沿用 `.section` 本身的 padding 值，沒有另外發明新間距數字。已用 Playwright 截圖確認桌面寬度（同一行）跟手機寬度（換行）都正常。

## 2026-09-03（六）按鈕改實心設計 + 移除青色選項

- **按鈕與標籤的區隔改用「形狀＋飽和度」雙重規則**：標籤永遠是淺色 tint 背景＋pill 全圓角（沿用既有 `.tag-*`/`.tag-badge`），按鈕永遠是深色實心＋小圓角矩形（新的 `.btn-solid-primary`／`.btn-solid-neutral`／`.btn-solid-danger`）。這樣不管品項列本身是什麼標籤顏色，按鈕視覺上都不會被誤認成另一個標籤。
- **新按鈕 class 寫成通用樣式**（沒有用 `.catalog-item` 前綴限定），並新增 `--danger-deep`／`--neutral-deep`／`--radius-btn` 三個共用變數，之後「本次清單」等其他地方要套用同一套實心按鈕語言可以直接複用，不用再開一套。
- **`.btn-add-light` 直接刪除**（不是保留不用）：這個 class 是上一輪為了「淺色但偏主色調」的按鈕做的，這次被新的實心設計徹底取代，且專案裡沒有其他地方在用它，屬於確定的死代碼，比起保留更該清掉。`.btn-ghost`／`.btn-danger-text` 則保留，因為還在標籤設定彈窗、品項庫編輯表單的「取消」按鈕上使用。
- **移除「青色」只動了 `TAG_COLORS` 這個下拉選單來源陣列**（`js/app.js`），沒有動 `--tag-teal`／`.tag-teal`／`.dot-teal` 這些 CSS——照你的指示保留底層邏輯，只是選色時不再列出來。目前線上資料庫已經有一個名稱剛好叫「青」的既有標籤（測試時建立的），這批沒有處理它，也沒有改動任何既有標籤資料，之後若要編輯那筆標籤的顏色，下拉選單不會再列出「青」這個選項本身，選別的顏色存檔即可。

## 2026-09-03（五）品項庫按鈕邊框加強＋圓角改方形區隔標籤

- 使用者反饋前一版的邊框幾乎看不出來，改成：三個按鈕邊框都加粗到 `1.5px`，`.btn-ghost`（編輯）邊框色從很淡的 `var(--border)` 改成對比較高的 `var(--text-muted)`；`.btn-add-light`（加入）補上原本沒有的 `var(--primary)` 邊框；`.btn-danger-text`（刪除）維持 `var(--danger)` 只加粗。這三個 class 是共用元件（`.btn-ghost`／`.btn-danger-text` 也用在標籤設定彈窗），邊框強化直接套用在共用 class 上，全站沿用該 class 的地方都會一併變清楚。
- 圓角改用 `var(--radius-sm)`（8px）**只限定在 `.catalog-item` 情境**（`.catalog-item .btn-add-light/.btn-ghost/.btn-danger-text` 這個既有的 32px 熱區規則裡多加一行），跟頁面上其他方形元素（`.section`、`.trip-item`、輸入框）的圓角尺寸一致，藉此跟左側 pill 形狀的標籤 badge/dot 做出形狀區隔；`.btn-ghost`／`.btn-danger-text` 在其他情境（例如標籤設定彈窗）維持原本的 999px 全圓角，不受影響。

## 2026-09-03（四）品項庫操作按鈕樣式 + 黃／橙標籤色區隔

- **「加入」新增一個 `.btn-add-light` class，沒有直接改 `.btn-ghost`**：因為 `.btn-ghost` 同時也是「編輯」「取消」在用的中性樣式，若直接把 `.btn-ghost` 改成偏主色調，會連帶把「編輯」「取消」也染色，不符合需求裡「加入＝主色調、編輯＝中性色」的區隔意圖。`.btn-add-light` 直接沿用既有的 `--primary-tint` / `--primary-dark` 變數，沒有新增顏色 token。
- **「刪除」直接修改 `.btn-danger-text` 本身**（不是另外開一個 class）：這個 class 目前也是「標籤設定」彈窗刪除標籤按鈕在共用，直接升級它的按鈕感（背景用既有的 `--tag-red-tint`、加邊框）會讓標籤刪除按鈕一併變得更好點擊，是同一組件的一致性改善，不是意外的範圍擴大。
- **32px 觸控熱區只加在 `.catalog-item` 這個情境下**（`.catalog-item .btn-add-light/.btn-ghost/.btn-danger-text { min-height:32px }`），沒有動 `.btn-ghost`／`.btn-danger-text` 的全域尺寸——避免動到標籤設定彈窗或本次清單目前已經夠緊湊的排版。
- **黃色只改了 `--tag-yellow` / `--tag-yellow-tint` 兩個變數**，其餘標籤色不動；因為 `.dot-yellow`／`.tag-yellow`／`.badge-yellow` 都是引用變數，沒有另外找地方改。已用 Playwright 截圖確認：`鮭魚/大餐`（黃）與 `肉片/平日晚餐`（橙）兩列現在背景色可以一眼分辨。

## 2026-09-03（三）品項庫（Catalog）新增編輯功能

- **UI 模式直接複製標籤編輯（`editingTagId`）那一套，改成 `editingCatalogItemId`**：同一個 `.catalog-item` 列表項目點「編輯」後，該列整個換成 inline 表單（名稱 input + 標籤 select，預帶目前值）+ 儲存/取消，跟前一批標籤設定彈窗的編輯體驗一致，沒有另外做 modal，符合「不用重新設計一套 UI 元件」。
- **明確不連動 TripList**：`updateCatalogItem_` 只改 Catalog 表這一筆的 name/tag_id，TripList 裡已經加入的品項是「加入當下的快照」，改品項庫不會回頭改到本次清單已存在的項目——這是需求裡明講的預期行為，不是遺漏。
- **樂觀更新＋失敗回滾**，跟專案裡其他所有寫入操作一致：本地先改 `state.catalog` 裡對應項目的 name/tag_id 並清掉編輯狀態，API 失敗才把兩個欄位還原、重新打開編輯不會自動重試。

## GAS 後端需要重新部署

`gas/Code.gs` 這次新增了 `updateCatalogItem` action。跟前兩次一樣，**要回瀏覽器操作**：Apps Script 編輯器貼上新版程式碼 → Manage deployments → 編輯現有部署（ID 開頭 `AKfycbyB2Og9aZEl33HMxMXWj8qgFLeRqdISCvt4_F5vM61kBZgTBAu8oLMNc8pmfWOVZ9A8Qw`）→ New version → Deploy，不要新建部署。部署完成前，品項庫的「編輯」按鈕點下去會先讓畫面樂觀更新，然後因為後端還沒有這個 action 而失敗回滾、跳「更新品項失敗」的 toast。

## 2026-09-03（二）品項庫標籤顯示 + 標籤編輯/刪除

- **刪除標籤前的使用數量統計，直接用前端已有的 state 算，沒有加一個「查詢使用數」的 GAS action**：`state.catalog` / `state.tripList` 本來就是頁面載入時整包抓下來放在記憶體裡，本地 `filter` 算 tag_id 符合的筆數就是即時且正確的，不需要多一趟後端往返。GAS 那邊 `deleteTag` 回傳的 `affectedCatalogCount`/`affectedTripListCount` 是伺服器實際刪除後的權威數字，只用來核對，不是拿來決定要不要跳確認框。
- **確認提示用原生 `window.confirm()`**，沒有另外做 modal 元件——需求裡明講「可用現有 modal / confirm 的呈現方式，不用另外設計新元件」，原生 confirm 是這裡最省事、行為最直覺的選項（會阻塞、使用者一定會看到）。
- **編輯/刪除標籤都走樂觀更新＋失敗回滾**，跟專案裡其他所有寫入操作（打勾、刪除品項等）的模式一致：本地先改、畫面先變，API 失敗才把 `state.tags` 與被清空 tag_id 的品項還原回去。因為 Catalog／TripList 資料本來就在前端記憶體裡，「編輯或刪除標籤後兩個分頁要同步」用本地更新就直接達成，不需要重新 fetch。
- **品項庫管理列表加 tint 背景／badge，只加了一條 `.catalog-item .name-wrap { flex: 1 }` CSS**，沒有另外重繪整組樣式——badge 與 tint 都是直接沿用前一批已經做好的 `.tag-*` / `.badge-*` class，`.catalog-item` 本身的 border-bottom 清單列樣式維持不變，只是背景色會透出來，符合「不用重新設計一套」的指示。

## GAS 後端需要重新部署

`gas/Code.gs` 這次新增了 `updateTag` / `deleteTag` 兩個 action。**這一步一定要回瀏覽器操作**：Apps Script 編輯器貼上新版程式碼後，用 Deploy > Manage deployments，對現有部署（ID 開頭 `AKfycbyB2Og9aZEl33HMxMXWj8qgFLeRqdISCvt4_F5vM61kBZgTBAu8oLMNc8pmfWOVZ9A8Qw`）按編輯（鉛筆圖示）→ New version → Deploy，**不要建立新的部署**，這樣 `js/config.js` 裡的網址才不用跟著換。前端在這次重新部署完成前，標籤的「編輯」「刪除」按鈕點下去會因為後端還沒有這兩個 action 而失敗（樂觀更新會先讓畫面變、然後跳「更新/刪除標籤失敗」的 toast 並復原）。

## 2026-09-03 UI/UX 微調：標籤 badge、日常頁視覺統一

- **標籤 badge 配色**：新增 9 組「深色文字」CSS 變數（`--tag-*-deep`），badge 背景維持白底、邊框用 `currentColor` 直接吃文字色，避免每個顏色都要多寫一條 border 規則。此變更只套用在本次清單列（`trip-item`），品項庫列目前沒有背景色塊問題所以不動，範圍對齊需求描述。
- **日常採購頁拿掉「品項庫管理」的 `<details>` 折疊**：原本巢狀在 `<details><summary>` 裡，若要讓標題與新增表單同一行，互動元件（input/select）會被包進可點擊的 `<summary>` 熱區，點下去會誤觸開合、打字體驗差。改成跟「本次清單」對等的獨立卡片（一直展開），才能讓兩區塊真正共用同一套標題列 class（`.section-title`）與同一個 flex header 排版。**只調整日常採購頁**，大賣場採購頁的 5 個賣場區塊維持原本收合設計，未在本次需求範圍內。
- **「+ 加入項目」按鈕文字全域統一**：品項庫新增按鈕的文字（`renderAddCatalogForm`）是共用函式，大賣場頁也會一起變成「+ 加入項目」。這代表同一畫面可能同時看到兩顆文字相同、但實際動作不同的按鈕（一個是加進品項庫、一個是加進本次清單）——是使用者要求「完全一致」下的必然結果，先照做，如果之後發現使用者實測會混淆，可以再討論是否分開命名。
- **響應式換行方式**：`.section-header.catalog-header` 設 `flex-wrap: wrap`，表單本身沿用既有 `.inline-form` 的 wrap，沒有額外用 `flex-basis: 100%` 強迫換行，而是讓內容自然決定——手機寬度（≈375px）標題與表單放不下會整個換行到下一行，桌面/平板寬度（≥768px 測試過）會維持同一行，已用 Playwright 截圖驗證兩種寬度皆符合預期。
- **編輯標籤入口**：直接在既有 `#btn-tags` 圖示按鈕內加一個文字 `<span>`，沒有另外做獨立的文字連結，因為那顆按鈕本來就是唯一入口，加文字只是讓它「看得出來是入口」而不是重做互動結構。

## 2026-09-02 初版架構

- **前端／後端分離**：前端純靜態檔（GitHub Pages），GAS 只回傳 JSON（`doGet`/`doPost` 依 `action` 分派），不輸出任何 HTML 頁面。
- **CORS 迴避**：`js/api.js` 一律以 `POST` + `Content-Type: text/plain` 呼叫 GAS，避免瀏覽器觸發 preflight（GAS Web App 不支援 `OPTIONS`）。GAS 端仍照樣解析 `postData.contents` 為 JSON。
- **ID 產生**：GAS 端用 `Utilities.getUuid()` 截短產生 `cat_/itm_/trip_/tag_` 前綴 ID，避免跨表衝突且可讀。
- **樂觀更新＋競態保護**：新增本次清單項目時，先以 `tmp_...` 暫時 ID 插入畫面並標記 `_pending`；若使用者在伺服器回應前對同一項目按了打勾或刪除，動作會先在本地生效、並記錄「待重放」旗標（`_pendingCheckToggles` / `_deleteRequested`），等新增的伺服器回應到達、換上正式 ID 後再補打對應的 API 呼叫。這是為了避免打勾/刪除用暫時 ID 呼叫 API 而失敗。
- **TripList 的 `trip_id` 定位**：規格中的 `trip_id` 是「本次清單這一列」的主鍵，不是分組用的購物梯次 ID——因為清空時機由使用者手動決定，沒有「梯次」概念，因此沒有另外的 trip 分組欄位。
- **一個品項一個標籤**：`tag_id` 為單值欄位（非陣列），標籤在日常／大賣場兩分頁共用同一張 `Tags` 表。
- **賣場管理採軟刪除**：`Categories.visible` 布林欄位控制顯示/隱藏，不做硬刪除，避免刪掉歷史 Catalog/TripList 資料的關聯分類。
- **Service Worker 快取範圍**：只快取 HTML/CSS/JS 外殼檔案；請求方法非 `GET` 或網址含 `script.google.com`（GAS API）一律略過快取、直接打網路，因為使用者已確認賣場收訊良好、不需要離線讀寫。
- **圖示為暫用預留位**：`icons/icon-192.png`、`icon-512.png` 是用 .NET System.Drawing 產生的簡易購物袋圖形，僅供「加入主畫面」功能可運作，之後可直接替換成正式設計稿，檔名與尺寸維持不變即可。

## 待辦（需使用者手動完成，本機無法自動化）

1. 建立新的 Google Sheet（空白試算表即可）。
2. 開啟 Extensions > Apps Script，貼上 `gas/Code.gs` 全部內容。
3. 執行一次 `setupSheets`（會跳出授權視窗，需同意），自動建立 Categories／Catalog／TripList／Tags 四張表，並寫入日常＋五個賣場的預設分類。
4. Deploy > New deployment > Web app，執行身分選「我」、存取權限選「任何人」，取得 Web App URL。
5. 把該 URL 貼到 `js/config.js` 的 `GAS_CONFIG.URL`。
6. 確認 GitHub Pages 網址（見部署輸出）可正常讀寫後，用手機瀏覽器開啟並「加入主畫面」。
