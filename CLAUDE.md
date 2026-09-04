# 購物清單 PWA — 專案說明

手機優先的購物清單網頁 app（可加到主畫面）。前端純靜態，部署在 GitHub Pages；資料存在 Google Sheets；Google Apps Script (GAS) 是唯一的資料 API，只回傳 JSON，不輸出任何 HTML 頁面。

## 部署資訊（不會變動，直接沿用）

- GitHub repo：`w731124/shopping-list`（public），本機路徑就是這個資料夾
- 上線網址：https://w731124.github.io/shopping-list/（GitHub Pages，指向 master branch 根目錄）
- GAS Web App 網址已寫在 `js/config.js`，部署 ID 開頭是 `AKfycbyB2Og9aZEl33HMxMXWj8qgFLeRqdISCvt4_F5vM61kBZgTBAu8oLMNc8pmfWOVZ9A8Qw`
- **GAS 只能由使用者手動在瀏覽器操作**：Claude 沒有 Google API/OAuth 工具，無法自動建立 Sheet 或部署 GAS。任何改到 `gas/Code.gs` 的任務，完成後都要提醒使用者回 Apps Script 編輯器貼上新程式碼，並用「Manage deployments → 編輯現有部署 → New version → Deploy」更新，**絕對不要新建部署**（會換網址，`js/config.js` 要跟著改）。純前端（HTML/CSS/JS）的改動不需要這個步驟，要在回報時講清楚這次「需不需要」重新部署 GAS。

## 架構

```
index.html      單頁應用外殼
manifest.json   PWA manifest
sw.js           service worker：只快取靜態外殼、網路優先（fetch 失敗才退回快取），不快取 GAS API 回應
icons/          PWA 圖示（暫用 .NET 畫的簡易購物袋圖形，之後可直接換正式設計稿覆蓋同檔名）
css/style.css   全站樣式，用 CSS 變數（--primary/--tag-*/--radius-* 等）
js/config.js    GAS_CONFIG.URL，只有這裡放 Web App 網址
js/api.js       封裝所有 fetch 呼叫；POST 一律用 Content-Type: text/plain 避免觸發 CORS preflight（GAS 不支援 OPTIONS）
js/app.js       全部前端邏輯：state 管理、渲染、樂觀更新
gas/Code.gs     GAS 後端，doGet/doPost 依 action 分派；setupSheets() 是一次性建表用
```

### 資料模型（Google Sheets 四張表）
- **Categories**：日常（type=daily，只有一筆）+ 賣場（type=store，可新增/隱藏，軟刪除）
- **Catalog**：品項庫主目錄，`category_id` 分類，`tag_id` 單一標籤
- **TripList**：本次清單，`catalog_item_id` 可為空（代表一次性項目），`trip_id` 只是這張表自己的主鍵，不是「梯次」概念——清單本身沒有「梯次」，清空時機由使用者手動決定
- **Tags**：標籤共用一套，`color_key` 對應前端固定色板，一個品項只能掛一個標籤

### 目前的分頁差異（重要，已在 2026-09-03 定案）
- **日常採購**：有完整的品項庫管理（新增/編輯/刪除/標籤），本次清單支援「加入品項庫」把一次性項目升級進品項庫，品項庫→本次清單有重複加入防呆
- **大賣場採購**（Costco/IKEA/Decathlon/Nitori/Daiso）：**沒有品項庫管理介面**，新增品項一律走一次性項目輸入；後端 Catalog 表裡賣場資料還留著（沒刪，只是前端不管理），賣場卡片左側有企業識別色色條（`STORE_ACCENT_COLORS` 物件查表，查無資料 fallback 中性灰）

## 工作流程慣例（這個專案這樣跑，不是通用規則）

1. 使用者的需求大多是**先去另一個 Claude 對話討論、產出詳細 prompt，再貼過來給這裡執行**。這種 prompt 通常已經很完整（含「執行判斷原則」「不用每個小細節都先問」），可以直接動工，完成後用「回報修改了哪些檔案＋列出關鍵決策」收尾，不用先問過才做。
2. 使用者**直接**在這裡打的小需求（不是轉貼的 prompt），才需要先講清楚要怎麼改、等對方回覆再動工。
3. **每次改完都不要自動 commit/push**——完成後回報，等使用者明確說「請 push」才 commit + push。這是使用者反覆確認過的習慣。
4. 每個階段性任務做完，把關鍵決策（改了什麼、為什麼、取捨）追加寫進 `DECISIONS.md`，跟 commit 一起送出。**這份檔案已經有完整歷史，開新對話時應該先讀這份，比重新問使用者更快。**

## 驗證方式

- 這台機器 `python`/`python3` 只是 Windows Store 的假 shim（不能用），改用 Node 開一個極簡靜態檔案伺服器（`http.createServer` 讀檔案回傳），背景執行，指定一個空的埠。
- 全域裝了 Playwright + Chromium，但這個專案沒有 `package.json`，`node` 腳本要 `require('playwright')` 前先 `export NODE_PATH="$(npm root -g)"`（PowerShell 用 `$env:NODE_PATH`），不然會 `MODULE_NOT_FOUND`。
- 畫面/互動類改動用 Playwright 截圖驗證（存到 scratchpad，用 Read 工具看圖確認），純資料/結構類改動用 grep 驗證即可，不用每次都開瀏覽器。
- **這個測試流程是打正式線上的 GAS/Google Sheet，不是 mock**，所以 Google Sheet 裡本來就會累積測試資料（例如標籤名稱直接叫「青」「藍」「紫」、品項叫「測試一次性品項X」「顏色22」之類），看到這些不是 bug，是先前驗證留下的，不用特地清掉也不用大驚小怪。
- 驗證完記得停掉背景的靜態伺服器（`Get-NetTCPConnection -LocalPort <port> | Stop-Process`）。

## 已知取捨（不是 bug，是刻意的簡化）

- 「本次清單→加入品項庫」與「品項庫→本次清單同名去重」這兩個功能，找到既有品項庫項目時，只在前端 `state` 補上 `catalog_item_id`，**沒有寫回 Google Sheet**（目前沒有能更新 TripList 任意欄位的 GAS action，且明確要求不新增 action）。代價：使用者重新整理頁面後，「加入品項庫」按鈕可能重新出現，但因為品項庫已有同名項目，最多只會跳「已有品項」提示，不會真的產生重複資料。之後如果要徹底解決，需要新增一個能更新 TripList 單一列的 action。
- Service worker 快取策略是「網路優先，離線才退回快取」（`sw.js` 裡的 `CACHE_NAME` 版本號），如果使用者回報「明明推上去了但畫面沒變」，優先懷疑瀏覽器/PWA 快取，可以直接請對方到 DevTools > Application 把 Service Worker unregister、Clear site data 再重開，比反覆檢查程式碼本身更快定位問題（Ctrl+Shift+R 有時不夠徹底）。
