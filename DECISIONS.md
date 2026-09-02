# 決策紀錄

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
