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
  Catalog: ['item_id', 'category_id', 'name', 'tag_id', 'created_at'],
  TripList: ['trip_id', 'catalog_item_id', 'category_id', 'name', 'tag_id', 'checked', 'added_at'],
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

function ok_(data) {
  return { success: true, data: data };
}
function err_(message) {
  return { success: false, error: String(message) };
}

// ---------- 入口 ----------
function doGet(e) {
  return handle_(e);
}
function doPost(e) {
  return handle_(e);
}

function handle_(e) {
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
  var result;
  try {
    switch (action) {
      case 'getCategories': result = ok_(sheetToObjects_(SHEETS.CATEGORIES)); break;
      case 'addCategory': result = ok_(addCategory_(params)); break;
      case 'toggleCategoryVisible': result = ok_(toggleCategoryVisible_(params)); break;

      case 'getCatalog': result = ok_(getCatalog_(params)); break;
      case 'addCatalogItem': result = ok_(addCatalogItem_(params)); break;
      case 'deleteCatalogItem': result = ok_(deleteCatalogItem_(params)); break;

      case 'getTripList': result = ok_(sheetToObjects_(SHEETS.TRIPLIST)); break;
      case 'addTripItem': result = ok_(addTripItem_(params)); break;
      case 'toggleCheck': result = ok_(toggleCheck_(params)); break;
      case 'deleteTripItem': result = ok_(deleteTripItem_(params)); break;

      case 'getTags': result = ok_(sheetToObjects_(SHEETS.TAGS)); break;
      case 'addTag': result = ok_(addTag_(params)); break;

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

// ---------- Catalog ----------
function getCatalog_(p) {
  var rows = sheetToObjects_(SHEETS.CATALOG);
  if (p.category_id) {
    rows = rows.filter(function (r) { return String(r.category_id) === String(p.category_id); });
  }
  return rows;
}

function addCatalogItem_(p) {
  var obj = {
    item_id: genId('itm'),
    category_id: p.category_id,
    name: p.name,
    tag_id: p.tag_id || '',
    created_at: new Date().toISOString()
  };
  return appendRow_(SHEETS.CATALOG, obj);
}

function deleteCatalogItem_(p) {
  var removed = deleteRowByKey_(SHEETS.CATALOG, 'item_id', p.item_id);
  return { item_id: p.item_id, removed: removed };
}

// ---------- TripList ----------
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
    added_at: new Date().toISOString()
  };
  return appendRow_(SHEETS.TRIPLIST, obj);
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
