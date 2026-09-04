/**
 * 購物清單 API — Google Apps Script (Web App)
 * 部署方式：Extensions > Apps Script 貼上本檔案 → 執行 setupSheets() 一次建表 →
 * Deploy > New deployment > Web app（執行身分：我；存取權限：任何人）
 */

var SHEETS = {
  CATEGORIES: 'Categories',
  CATALOG: 'Catalog',
  TRIPLIST: 'TripList',
  TAGS: 'Tags'
};

var SCHEMA = {
  Categories: ['id', 'name', 'type', 'visible', 'sort_order'],
  Catalog: ['item_id', 'category_id', 'name', 'tag_id', 'created_at', 'sort_order'],
  TripList: ['trip_id', 'catalog_item_id', 'category_id', 'name', 'tag_id', 'checked', 'added_at', 'sort_order'],
  Tags: ['tag_id', 'name', 'color_key']
};

var DEFAULT_STORES = ['Costco', 'IKEA', 'Decathlon', 'Nitori', 'Daiso'];

// ---------- 一次性建表 ----------
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SCHEMA).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(SCHEMA[name]);
    }
  });

  var catSheet = ss.getSheetByName(SHEETS.CATEGORIES);
  if (catSheet.getLastRow() < 2) {
    catSheet.appendRow([genId('cat'), '日常採購(Daily)', 'daily', true, 0]);
    DEFAULT_STORES.forEach(function (storeName, i) {
      catSheet.appendRow([genId('cat'), storeName, 'store', true, i + 1]);
    });
  }

  var defaultSheet = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (defaultSheet) ss.deleteSheet(defaultSheet);
}

// ---------- 共用工具 ----------
function genId(prefix) {
  return prefix + '_' + Utilities.getUuid().split('-')[0];
}

function getSheet_(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function sheetToObjects_(name) {
  var sheet = getSheet_(name);
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = values[r][i]; });
    obj._row = r + 1; // 實際試算表列號，供更新/刪除使用
    rows.push(obj);
  }
  return rows;
}

function appendRow_(name, obj) {
  var sheet = getSheet_(name);
  var headers = SCHEMA[name];
  var row = headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; });
  sheet.appendRow(row);
  return obj;
}

function updateRowByKey_(name, keyField, keyValue, patch) {
  var sheet = getSheet_(name);
  var headers = SCHEMA[name];
  var keyCol = headers.indexOf(keyField);
  var values = sheet.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][keyCol]) === String(keyValue)) {
      Object.keys(patch).forEach(function (field) {
        var col = headers.indexOf(field);
        if (col > -1) sheet.getRange(r + 1, col + 1).setValue(patch[field]);
      });
      return true;
    }
  }
  return false;
}

function deleteRowByKey_(name, keyField, keyValue) {
  var sheet = getSheet_(name);
  var headers = SCHEMA[name];
  var keyCol = headers.indexOf(keyField);
  var values = sheet.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][keyCol]) === String(keyValue)) {
      sheet.deleteRow(r + 1);
      return true;
    }
  }
  return false;
}

// 刪除所有符合條件的列（由下往上刪，避免刪除中途列號位移），回傳刪除筆數
function deleteRowsByField_(name, field, value) {
  var sheet = getSheet_(name);
  var headers = SCHEMA[name];
  var col = headers.indexOf(field);
  var values = sheet.getDataRange().getValues();
  var count = 0;
  for (var r = values.length - 1; r >= 1; r--) {
    if (String(values[r][col]) === String(value)) {
      sheet.deleteRow(r + 1);
      count++;
    }
  }
  return count;
}

function ok_(data) {
  return { success: true, data: data };
}
function err_(message) {
  return { success: false, error: String(message) };
}

// 確保表格已有 sort_order 欄位；第一次呼叫時（欄位不存在）會補上欄位並依 category_id
// 分組、依既有建立時間（Catalog: created_at / TripList: added_at，缺欄位則用列順序）
// 補上初始排序值。已經有欄位的情況下只讀表頭一列，成本很低，可以每次請求都呼叫。
function ensureSortOrderColumn_(sheetName) {
  var sheet = getSheet_(sheetName);
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headers.indexOf('sort_order') > -1) return;

  var newCol = lastCol + 1;
  sheet.getRange(1, newCol).setValue('sort_order');

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var catCol = headers.indexOf('category_id');
  var dateField = sheetName === SHEETS.CATALOG ? 'created_at' : 'added_at';
  var dateCol = headers.indexOf(dateField);
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  var order = values.map(function (row, i) { return i; });
  order.sort(function (i, j) {
    var catI = String(values[i][catCol]), catJ = String(values[j][catCol]);
    if (catI !== catJ) return catI < catJ ? -1 : 1;
    var dateI = dateCol > -1 ? values[i][dateCol] : i;
    var dateJ = dateCol > -1 ? values[j][dateCol] : j;
    if (dateI < dateJ) return -1;
    if (dateI > dateJ) return 1;
    return i - j;
  });

  var counters = {};
  var sortOrders = new Array(values.length);
  order.forEach(function (i) {
    var cat = String(values[i][catCol]);
    counters[cat] = (counters[cat] || 0) + 1;
    sortOrders[i] = counters[cat];
  });

  sheet.getRange(2, newCol, lastRow - 1, 1).setValues(sortOrders.map(function (v) { return [v]; }));
}

// 分類內排序：依 category_id 分組、組內依 sort_order 遞增
function sortByCategoryThenOrder_(rows) {
  return rows.sort(function (a, b) {
    var catA = String(a.category_id), catB = String(b.category_id);
    if (catA !== catB) return catA < catB ? -1 : 1;
    return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
  });
}

// 新增項目時的預設排序值：該分類目前最大值 + 1（加到分類清單最後面）
function nextSortOrder_(sheetName, categoryId) {
  var rows = sheetToObjects_(sheetName);
  var maxOrder = rows.reduce(function (m, r) {
    if (String(r.category_id) !== String(categoryId)) return m;
    return Math.max(m, Number(r.sort_order) || 0);
  }, 0);
  return maxOrder + 1;
}

// 拖曳放開後重新排序：只改動 orderedIds 涵蓋、且屬於 categoryId 的列，單一批次寫入 sort_order 欄位
function reorderItems_(sheetName, idField, categoryId, orderedIds) {
  var sheet = getSheet_(sheetName);
  var headers = SCHEMA[sheetName];
  var idCol = headers.indexOf(idField);
  var catCol = headers.indexOf('category_id');
  var sortCol = headers.indexOf('sort_order');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var idToRowIndex = {};
  values.forEach(function (row, r) { idToRowIndex[String(row[idCol])] = r; });

  var touchedIndexes = orderedIds.map(function (id) {
    var rowIndex = idToRowIndex[String(id)];
    if (rowIndex === undefined) throw '找不到項目: ' + id;
    if (String(values[rowIndex][catCol]) !== String(categoryId)) throw '項目不屬於此分類: ' + id;
    return rowIndex;
  });

  touchedIndexes.forEach(function (rowIndex, i) { values[rowIndex][sortCol] = i + 1; });

  var sortColValues = values.map(function (row) { return [row[sortCol]]; });
  sheet.getRange(2, sortCol + 1, lastRow - 1, 1).setValues(sortColValues);

  return touchedIndexes.map(function (rowIndex) {
    var obj = {};
    headers.forEach(function (h, c) { obj[h] = values[rowIndex][c]; });
    return obj;
  });
}

// ---------- 入口 ----------
function doGet(e) {
  return handle_(e, 'GET');
}
function doPost(e) {
  return handle_(e, 'POST');
}

function handle_(e, method) {
  var params = {};
  try {
    if (e.postData && e.postData.contents) {
      params = JSON.parse(e.postData.contents);
    } else {
      params = e.parameter || {};
    }
  } catch (parseErr) {
    return respond_(err_('無法解析請求內容: ' + parseErr));
  }

  var action = params.action;

  // 只有 get 開頭的讀取類 action 允許用 GET 呼叫（例如健康檢查），其餘一律要求 POST，
  // 避免有人直接開 GAS exec 網址（不是秘密，寫在公開前端 JS 裡）就能觸發寫入/刪除
  if (method === 'GET' && !/^get/.test(action || '')) {
    return respond_(err_('此操作僅允許透過 POST 呼叫: ' + action));
  }

  var result;
  try {
    ensureSortOrderColumn_(SHEETS.CATALOG);
    ensureSortOrderColumn_(SHEETS.TRIPLIST);
    switch (action) {
      case 'getCategories': result = ok_(sheetToObjects_(SHEETS.CATEGORIES)); break;
      case 'addCategory': result = ok_(addCategory_(params)); break;
      case 'toggleCategoryVisible': result = ok_(toggleCategoryVisible_(params)); break;
      case 'reorderCategories': result = ok_(reorderCategories_(params)); break;
      case 'deleteCategory': result = ok_(deleteCategory_(params)); break;

      case 'getCatalog': result = ok_(getCatalog_(params)); break;
      case 'addCatalogItem': result = ok_(addCatalogItem_(params)); break;
      case 'updateCatalogItem': result = ok_(updateCatalogItem_(params)); break;
      case 'deleteCatalogItem': result = ok_(deleteCatalogItem_(params)); break;
      case 'reorderCatalogItems': result = ok_(reorderCatalogItems_(params)); break;

      case 'getTripList': result = ok_(getTripList_(params)); break;
      case 'addTripItem': result = ok_(addTripItem_(params)); break;
      case 'toggleCheck': result = ok_(toggleCheck_(params)); break;
      case 'deleteTripItem': result = ok_(deleteTripItem_(params)); break;
      case 'reorderTripItems': result = ok_(reorderTripItems_(params)); break;

      case 'getTags': result = ok_(sheetToObjects_(SHEETS.TAGS)); break;
      case 'addTag': result = ok_(addTag_(params)); break;
      case 'updateTag': result = ok_(updateTag_(params)); break;
      case 'deleteTag': result = ok_(deleteTag_(params)); break;

      default: result = err_('未知的 action: ' + action);
    }
  } catch (bizErr) {
    result = err_(bizErr);
  }
  return respond_(result);
}

function respond_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- Categories ----------
function addCategory_(p) {
  var existing = sheetToObjects_(SHEETS.CATEGORIES);
  var maxOrder = existing.reduce(function (m, c) { return Math.max(m, Number(c.sort_order) || 0); }, 0);
  var obj = {
    id: genId('cat'),
    name: p.name,
    type: p.type || 'store',
    visible: true,
    sort_order: maxOrder + 1
  };
  return appendRow_(SHEETS.CATEGORIES, obj);
}

function toggleCategoryVisible_(p) {
  var rows = sheetToObjects_(SHEETS.CATEGORIES);
  var target = rows.filter(function (r) { return String(r.id) === String(p.id); })[0];
  if (!target) throw '找不到分類: ' + p.id;
  var next = !target.visible;
  updateRowByKey_(SHEETS.CATEGORIES, 'id', p.id, { visible: next });
  return { id: p.id, visible: next };
}

// 拖曳排序賣場卡片：只動陣列裡包含的（目前顯示中的）賣場，隱藏中的賣場 sort_order 不動
function reorderCategories_(p) {
  var orderedIds = p.orderedCategoryIds || [];
  var sheet = getSheet_(SHEETS.CATEGORIES);
  var headers = SCHEMA.Categories;
  var idCol = headers.indexOf('id');
  var typeCol = headers.indexOf('type');
  var sortCol = headers.indexOf('sort_order');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var idToRowIndex = {};
  values.forEach(function (row, r) { idToRowIndex[String(row[idCol])] = r; });

  var touchedIndexes = orderedIds.map(function (id) {
    var rowIndex = idToRowIndex[String(id)];
    if (rowIndex === undefined) throw '找不到分類: ' + id;
    if (String(values[rowIndex][typeCol]) !== 'store') throw '只能對賣場分類排序: ' + id;
    return rowIndex;
  });

  touchedIndexes.forEach(function (rowIndex, i) { values[rowIndex][sortCol] = i + 1; });

  var sortColValues = values.map(function (row) { return [row[sortCol]]; });
  sheet.getRange(2, sortCol + 1, lastRow - 1, 1).setValues(sortColValues);

  return touchedIndexes.map(function (rowIndex) {
    var obj = {};
    headers.forEach(function (h, c) { obj[h] = values[rowIndex][c]; });
    return obj;
  });
}

// 刪除賣場：只能刪 type === 'store'，連動刪除底下的 TripList 與 Catalog 殘留資料
function deleteCategory_(p) {
  var rows = sheetToObjects_(SHEETS.CATEGORIES);
  var target = rows.filter(function (r) { return String(r.id) === String(p.category_id); })[0];
  if (!target) throw '找不到分類: ' + p.category_id;
  if (target.type !== 'store') throw '不能刪除日常採購分類';

  deleteRowByKey_(SHEETS.CATEGORIES, 'id', p.category_id);
  var removedTripCount = deleteRowsByField_(SHEETS.TRIPLIST, 'category_id', p.category_id);
  var removedCatalogCount = deleteRowsByField_(SHEETS.CATALOG, 'category_id', p.category_id);
  return { category_id: p.category_id, removedTripCount: removedTripCount, removedCatalogCount: removedCatalogCount };
}

// ---------- Catalog ----------
function getCatalog_(p) {
  var rows = sheetToObjects_(SHEETS.CATALOG);
  if (p.category_id) {
    rows = rows.filter(function (r) { return String(r.category_id) === String(p.category_id); });
  }
  return sortByCategoryThenOrder_(rows);
}

function addCatalogItem_(p) {
  var obj = {
    item_id: genId('itm'),
    category_id: p.category_id,
    name: p.name,
    tag_id: p.tag_id || '',
    created_at: new Date().toISOString(),
    sort_order: nextSortOrder_(SHEETS.CATALOG, p.category_id)
  };
  return appendRow_(SHEETS.CATALOG, obj);
}

function reorderCatalogItems_(p) {
  return reorderItems_(SHEETS.CATALOG, 'item_id', p.category_id, p.orderedItemIds || []);
}

function updateCatalogItem_(p) {
  var updated = updateRowByKey_(SHEETS.CATALOG, 'item_id', p.item_id, { name: p.name, tag_id: p.tag_id || '' });
  if (!updated) throw '找不到品項: ' + p.item_id;
  return { item_id: p.item_id, name: p.name, tag_id: p.tag_id || '' };
}

function deleteCatalogItem_(p) {
  var removed = deleteRowByKey_(SHEETS.CATALOG, 'item_id', p.item_id);
  return { item_id: p.item_id, removed: removed };
}

// ---------- TripList ----------
function getTripList_(p) {
  var rows = sheetToObjects_(SHEETS.TRIPLIST);
  if (p && p.category_id) {
    rows = rows.filter(function (r) { return String(r.category_id) === String(p.category_id); });
  }
  return sortByCategoryThenOrder_(rows);
}

function addTripItem_(p) {
  var name = p.name;
  var tagId = p.tag_id || '';
  var categoryId = p.category_id;

  if (p.catalog_item_id) {
    var catalog = sheetToObjects_(SHEETS.CATALOG);
    var src = catalog.filter(function (c) { return String(c.item_id) === String(p.catalog_item_id); })[0];
    if (src) {
      name = name || src.name;
      tagId = tagId || src.tag_id;
      categoryId = categoryId || src.category_id;
    }
  }

  var obj = {
    trip_id: genId('trip'),
    catalog_item_id: p.catalog_item_id || '',
    category_id: categoryId,
    name: name,
    tag_id: tagId,
    checked: false,
    added_at: new Date().toISOString(),
    sort_order: nextSortOrder_(SHEETS.TRIPLIST, categoryId)
  };
  return appendRow_(SHEETS.TRIPLIST, obj);
}

function reorderTripItems_(p) {
  return reorderItems_(SHEETS.TRIPLIST, 'trip_id', p.category_id, p.orderedItemIds || []);
}

function toggleCheck_(p) {
  var rows = sheetToObjects_(SHEETS.TRIPLIST);
  var target = rows.filter(function (r) { return String(r.trip_id) === String(p.trip_id); })[0];
  if (!target) throw '找不到清單項目: ' + p.trip_id;
  var next = !target.checked;
  updateRowByKey_(SHEETS.TRIPLIST, 'trip_id', p.trip_id, { checked: next });
  return { trip_id: p.trip_id, checked: next };
}

function deleteTripItem_(p) {
  var removed = deleteRowByKey_(SHEETS.TRIPLIST, 'trip_id', p.trip_id);
  return { trip_id: p.trip_id, removed: removed };
}

// ---------- Tags ----------
function addTag_(p) {
  var obj = {
    tag_id: genId('tag'),
    name: p.name,
    color_key: p.color_key || 'gray'
  };
  return appendRow_(SHEETS.TAGS, obj);
}

function updateTag_(p) {
  var updated = updateRowByKey_(SHEETS.TAGS, 'tag_id', p.tag_id, { name: p.name, color_key: p.color_key });
  if (!updated) throw '找不到標籤: ' + p.tag_id;
  return { tag_id: p.tag_id, name: p.name, color_key: p.color_key };
}

function deleteTag_(p) {
  var removed = deleteRowByKey_(SHEETS.TAGS, 'tag_id', p.tag_id);
  if (!removed) throw '找不到標籤: ' + p.tag_id;
  var affectedCatalogCount = clearTagReferences_(SHEETS.CATALOG, p.tag_id);
  var affectedTripListCount = clearTagReferences_(SHEETS.TRIPLIST, p.tag_id);
  return { tag_id: p.tag_id, affectedCatalogCount: affectedCatalogCount, affectedTripListCount: affectedTripListCount };
}

// 掃描指定表，把所有 tag_id 符合的列清空（設為未分類），回傳受影響列數
function clearTagReferences_(sheetName, tagId) {
  var sheet = getSheet_(sheetName);
  var headers = SCHEMA[sheetName];
  var tagCol = headers.indexOf('tag_id');
  var values = sheet.getDataRange().getValues();
  var count = 0;
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][tagCol]) === String(tagId)) {
      sheet.getRange(r + 1, tagCol + 1).setValue('');
      count++;
    }
  }
  return count;
}
