# 決策紀錄

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
