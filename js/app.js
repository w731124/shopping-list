(function () {
  'use strict';

  // 賣場企業識別色（卡片左側色條），用賣場名稱比對；新賣場若不在表裡則 fallback 中性灰邊框
  var STORE_ACCENT_COLORS = {
    'Costco': '#D32F2F',
    'Nitori': '#2E7D32',
    'Daiso': '#D6336C',
    'Decathlon': '#0072CE',
    'IKEA': '#FFCC00'
  };

  var TAG_COLORS = [
    { key: 'red', label: '紅' }, { key: 'orange', label: '橙' }, { key: 'yellow', label: '黃' },
    { key: 'green', label: '綠' }, { key: 'blue', label: '藍' },
    { key: 'purple', label: '紫' }, { key: 'pink', label: '粉' }
  ];

  var state = {
    categories: [],
    catalog: [],   // 全部品項庫（所有分類混在一起，用 category_id 過濾）
    tripList: [],
    tags: [],
    activeTab: 'daily',
    editingTagId: null,
    editingCatalogItemId: null,
    editingTripItemId: null,
    editingCategoryId: null,
    storeManageOpen: false
  };

  function tmpId() { return 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }

  function tagById(tagId) { return state.tags.filter(function (t) { return String(t.tag_id) === String(tagId); })[0]; }
  function categoryById(id) { return state.categories.filter(function (c) { return String(c.id) === String(id); })[0]; }

  // 「品項庫 → 本次清單」的重複加入判斷，只套用在日常採購（賣場品項庫可無限次加入）
  function isDuplicateInDailyTrip(categoryId, catalogItemId) {
    var cat = categoryById(categoryId);
    if (!cat || cat.type !== 'daily') return false;
    return state.tripList.some(function (t) {
      return t.catalog_item_id && String(t.catalog_item_id) === String(catalogItemId);
    });
  }

  function confirmDuplicateAdd(categoryId, catalogItemId) {
    if (!isDuplicateInDailyTrip(categoryId, catalogItemId)) return true;
    var catalogItem = state.catalog.filter(function (c) { return String(c.item_id) === String(catalogItemId); })[0];
    var name = catalogItem ? catalogItem.name : '此品項';
    return window.confirm(name + '已經在本次清單中，仍要再加入一次嗎？');
  }

  function showToast(msg) {
    var root = document.getElementById('toast-root');
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(function () { el.remove(); }, 2200);
  }

  // ---------- 初始化 ----------
  function init() {
    bindTabs();
    bindHeader();
    Promise.all([
      Api.getCategories(), Api.getCatalog(), Api.getTripList(), Api.getTags()
    ]).then(function (results) {
      state.categories = results[0].sort(function (a, b) { return Number(a.sort_order) - Number(b.sort_order); });
      state.catalog = results[1];
      state.tripList = results[2];
      state.tags = results[3];
      renderAll();
    }).catch(function (e) {
      console.error(e);
      showToast('初始資料載入失敗，請檢查 GAS 網址設定');
    });
  }

  function bindTabs() {
    document.getElementById('tabs').addEventListener('click', function (e) {
      var btn = e.target.closest('.tab-btn');
      if (!btn) return;
      state.activeTab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.toggle('is-active', b === btn); });
      document.getElementById('panel-daily').classList.toggle('is-active', state.activeTab === 'daily');
      document.getElementById('panel-store').classList.toggle('is-active', state.activeTab === 'store');
    });
  }

  function bindHeader() {
    document.getElementById('btn-tags').addEventListener('click', openTagsModal);
  }

  function renderAll() {
    renderDailyPanel();
    renderStorePanel();
  }

  // ---------- 日常採購 ----------
  function renderDailyPanel() {
    var panel = document.getElementById('panel-daily');
    var dailyCat = state.categories.filter(function (c) { return c.type === 'daily'; })[0];
    if (!dailyCat) { panel.innerHTML = '<p class="empty-hint">尚未設定日常分類</p>'; return; }
    var items = state.tripList.filter(function (t) { return String(t.category_id) === String(dailyCat.id); });
    var catalogItems = state.catalog.filter(function (c) { return String(c.category_id) === String(dailyCat.id); });

    panel.innerHTML =
      '<div class="section" data-category-id="' + dailyCat.id + '" data-sortable="true">' +
        '<div class="section-header">' +
          '<h2 class="section-title">本次清單</h2>' +
          '<button class="btn-add" data-action="open-add-trip" data-category-id="' + dailyCat.id + '">+ 加入項目</button>' +
        '</div>' +
        renderTripList(items) +
      '</div>' +
      '<div class="section" data-category-id="' + dailyCat.id + '" data-sortable="true">' +
        '<div class="section-header catalog-header">' +
          '<h2 class="section-title">品項庫管理</h2>' +
          '<form class="inline-form catalog-inline-form" data-action="add-catalog-form" data-category-id="' + dailyCat.id + '">' +
            '<input type="text" name="name" placeholder="新增品項庫名稱" required>' +
            renderTagSelect() +
            '<button class="btn-add" type="submit">+ 加入項目</button>' +
          '</form>' +
        '</div>' +
        renderCatalogList(catalogItems) +
      '</div>';

    bindSectionEvents(panel);
    initDailySortable(panel, dailyCat.id);
  }

  // ---------- 大賣場採購 ----------
  function renderStorePanel() {
    var panel = document.getElementById('panel-store');
    var stores = state.categories.filter(function (c) { return c.type === 'store'; });
    var visibleStores = stores.filter(function (c) { return c.visible === true || c.visible === 'TRUE'; });

    var storeCardsHtml = '';
    visibleStores.forEach(function (store) {
      var items = state.tripList.filter(function (t) { return String(t.category_id) === String(store.id); });
      var accentColor = STORE_ACCENT_COLORS[store.name] || 'var(--border)';
      storeCardsHtml +=
        '<div class="section store-block" data-category-id="' + store.id + '" data-sortable="true" style="border-left: 5px solid ' + accentColor + ';">' +
          '<div class="section-header">' +
            '<h2 class="section-title">' + escapeHtml(store.name) + '</h2>' +
            '<button class="btn-add" data-action="open-add-trip" data-category-id="' + store.id + '">+ 加入項目</button>' +
          '</div>' +
          renderTripList(items) +
        '</div>';
    });

    var html = '<div id="store-cards-list" data-sortable="true">' + storeCardsHtml + '</div>';

    html +=
      '<details class="collapsible section"' + (state.storeManageOpen ? ' open' : '') + '>' +
        '<summary>賣場管理</summary>' +
        '<div class="store-manage-header">' +
          '<span class="name-wrap"></span>' +
          '<span class="store-manage-header-label">切換顯示</span>' +
          '<span class="store-manage-header-spacer"></span>' +
        '</div>' +
        '<ul class="store-manage-list">' +
          stores.map(function (s) {
            if (state.editingCategoryId === s.id) {
              return '<li class="store-manage-item">' +
                '<form class="inline-form" data-action="edit-category-form" data-category-id="' + s.id + '">' +
                  '<input type="text" name="name" value="' + escapeHtml(s.name) + '" required>' +
                  '<span class="inline-form-actions">' +
                    '<button class="btn-add" type="submit">儲存</button>' +
                    '<button class="btn-ghost" type="button" data-action="cancel-edit-category">取消</button>' +
                  '</span>' +
                '</form>' +
              '</li>';
            }
            var isVisible = s.visible === true || s.visible === 'TRUE';
            return '<li class="store-manage-item">' +
              '<span class="name-wrap">' + escapeHtml(s.name) + '</span>' +
              '<label class="switch">' +
                '<input type="checkbox" data-action="toggle-store-visible" data-category-id="' + s.id + '" ' + (isVisible ? 'checked' : '') + '>' +
                '<span class="slider"></span>' +
              '</label>' +
              '<span class="item-actions">' +
                '<button class="btn-icon" data-action="start-edit-category" data-category-id="' + s.id + '">✎</button>' +
                '<button class="btn-icon" data-action="delete-category" data-category-id="' + s.id + '">✕</button>' +
              '</span>' +
            '</li>';
          }).join('') +
        '</ul>' +
        '<form class="inline-form" data-action="add-store-form">' +
          '<input type="text" name="name" placeholder="新增賣場名稱，例如 Ikea(宜家)" required>' +
          '<button class="btn-add" type="submit">新增</button>' +
        '</form>' +
      '</details>';

    panel.innerHTML = html;
    bindSectionEvents(panel);
    visibleStores.forEach(function (store) {
      var section = panel.querySelector('.store-block[data-category-id="' + store.id + '"]');
      if (section) initTripListSortable(section.querySelector('.trip-list'), store.id);
    });
    initStoreCardsSortable(document.getElementById('store-cards-list'));
    bindStoreManageToggle(panel);
  }

  // <details> 展開/收合狀態由瀏覽器記在 DOM 上，但 renderStorePanel 每次都整段重繪 DOM，
  // 所以改成用 state.storeManageOpen 自己記，每次渲染完都要重新綁一次 toggle 事件
  function bindStoreManageToggle(panel) {
    var details = panel.querySelector('.collapsible');
    if (!details) return;
    details.addEventListener('toggle', function () {
      state.storeManageOpen = details.open;
    });
  }

  function renderTripList(items) {
    if (!items.length) return '<p class="empty-hint">目前沒有項目，點右上角加入</p>';
    return '<ul class="trip-list">' + items.map(renderTripItemRow).join('') + '</ul>';
  }

  function renderTripItemRow(item) {
    if (state.editingTripItemId === item.trip_id) {
      return '<li class="trip-item" data-trip-id="' + item.trip_id + '">' +
        '<form class="inline-form" data-action="edit-trip-form" data-trip-id="' + item.trip_id + '">' +
          '<input type="text" name="name" value="' + escapeHtml(item.name) + '" required>' +
          '<span class="inline-form-actions">' +
            renderTagSelect(item.tag_id) +
            '<button class="btn-add" type="submit">儲存</button>' +
            '<button class="btn-ghost" type="button" data-action="cancel-edit-trip">取消</button>' +
          '</span>' +
        '</form>' +
      '</li>';
    }
    var tag = tagById(item.tag_id);
    var tagClass = tag ? 'tag-' + tag.color_key : '';
    var dotClass = tag ? 'dot-' + tag.color_key : '';
    var checked = item.checked === true || item.checked === 'TRUE';
    var cat = categoryById(item.category_id);
    var showPromote = !!cat && cat.type === 'daily' && !item.catalog_item_id && !item._promotingToCatalog;
    return '<li class="trip-item ' + tagClass + (checked ? ' is-checked' : '') + (item._pending ? ' is-pending' : '') + '" data-trip-id="' + item.trip_id + '">' +
      '<input type="checkbox" class="chk" data-action="toggle-check" data-trip-id="' + item.trip_id + '" ' + (checked ? 'checked' : '') + '>' +
      (tag ? '<span class="tag-dot ' + dotClass + '"></span>' : '') +
      '<span class="name">' + escapeHtml(item.name) + '</span>' +
      (tag ? '<span class="tag-badge badge-' + tag.color_key + '">' + escapeHtml(tag.name) + '</span>' : '') +
      '<span class="item-actions">' +
        (showPromote ? '<button class="btn-icon" data-action="promote-to-catalog" data-trip-id="' + item.trip_id + '">＋</button>' : '') +
        '<button class="btn-icon" data-action="start-edit-trip" data-trip-id="' + item.trip_id + '">✎</button>' +
        '<button class="btn-icon" data-action="delete-trip" data-trip-id="' + item.trip_id + '">✕</button>' +
      '</span>' +
    '</li>';
  }

  function renderCatalogList(items) {
    if (!items.length) return '<p class="empty-hint">品項庫是空的</p>';
    return '<ul class="catalog-list">' + items.map(renderCatalogRow).join('') + '</ul>';
  }

  function renderCatalogRow(c) {
    if (state.editingCatalogItemId === c.item_id) {
      return '<li class="catalog-item" data-item-id="' + c.item_id + '">' +
        '<form class="inline-form" data-action="edit-catalog-form" data-item-id="' + c.item_id + '">' +
          '<input type="text" name="name" value="' + escapeHtml(c.name) + '" required>' +
          '<span class="inline-form-actions">' +
            renderTagSelect(c.tag_id) +
            '<button class="btn-add" type="submit">儲存</button>' +
            '<button class="btn-ghost" type="button" data-action="cancel-edit-catalog">取消</button>' +
          '</span>' +
        '</form>' +
      '</li>';
    }
    var tag = tagById(c.tag_id);
    var tagClass = tag ? 'tag-' + tag.color_key : '';
    return '<li class="catalog-item ' + tagClass + '" data-item-id="' + c.item_id + '">' +
      '<span class="name-wrap">' +
        (tag ? '<span class="tag-dot dot-' + tag.color_key + '"></span>' : '') +
        escapeHtml(c.name) +
      '</span>' +
      (tag ? '<span class="tag-badge badge-' + tag.color_key + '">' + escapeHtml(tag.name) + '</span>' : '') +
      '<span class="item-actions">' +
        '<button class="btn-icon" data-action="add-trip-from-catalog-inline" data-item-id="' + c.item_id + '" data-category-id="' + c.category_id + '">＋</button>' +
        '<button class="btn-icon" data-action="start-edit-catalog" data-item-id="' + c.item_id + '">✎</button>' +
        '<button class="btn-icon" data-action="delete-catalog" data-item-id="' + c.item_id + '">✕</button>' +
      '</span>' +
    '</li>';
  }

  function renderTagSelect(selectedId) {
    var opts = '<option value="">無標籤</option>' + state.tags.map(function (t) {
      return '<option value="' + t.tag_id + '"' + (String(t.tag_id) === String(selectedId) ? ' selected' : '') + '>' + escapeHtml(t.name) + '</option>';
    }).join('');
    return '<select name="tag_id">' + opts + '</select>';
  }

  // ---------- 拖曳排序（本次清單日常/賣場皆支援，品項庫管理僅日常採購有） ----------
  var SORTABLE_OPTS = {
    animation: 150,
    delay: 300,
    delayOnTouchOnly: true,
    touchStartThreshold: 5,
    filter: 'input, select, button, a',
    preventOnFilter: false
  };

  function initTripListSortable(tripListEl, categoryId) {
    if (!tripListEl) return;
    new Sortable(tripListEl, Object.assign({}, SORTABLE_OPTS, {
      onEnd: function (evt) {
        if (evt.oldIndex === evt.newIndex) return;
        handleReorder('trip', categoryId, tripListEl, 'tripId');
      }
    }));
  }

  function initDailySortable(panel, categoryId) {
    initTripListSortable(panel.querySelector('.trip-list'), categoryId);

    var catalogListEl = panel.querySelector('.catalog-list');
    if (catalogListEl) {
      new Sortable(catalogListEl, Object.assign({}, SORTABLE_OPTS, {
        onEnd: function (evt) {
          if (evt.oldIndex === evt.newIndex) return;
          handleReorder('catalog', categoryId, catalogListEl, 'itemId');
        }
      }));
    }
  }

  // 賣場卡片本身的拖曳排序（container 包住所有目前顯示中的 .store-block）
  // filter 額外排除 .trip-list：card 內部的品項清單有自己的 Sortable，避免兩層巢狀拖曳互相搶手勢
  function initStoreCardsSortable(containerEl) {
    if (!containerEl) return;
    new Sortable(containerEl, Object.assign({}, SORTABLE_OPTS, {
      filter: SORTABLE_OPTS.filter + ', .trip-list',
      onEnd: function (evt) {
        if (evt.oldIndex === evt.newIndex) return;
        handleCategoryReorder(containerEl);
      }
    }));
  }

  // kind: 'trip' | 'catalog'；datasetKey 是 <li> 上對應的 dataset 名稱（tripId / itemId）
  function handleReorder(kind, categoryId, listEl, datasetKey) {
    var isTrip = kind === 'trip';
    var stateArr = isTrip ? state.tripList : state.catalog;
    var idField = isTrip ? 'trip_id' : 'item_id';
    var orderedIds = Array.prototype.map.call(listEl.children, function (li) { return li.dataset[datasetKey]; });

    var previousOrder = stateArr.slice();
    reorderStateArray(stateArr, idField, orderedIds);
    renderAll();

    var apiCall = isTrip ? Api.reorderTripItems(categoryId, orderedIds) : Api.reorderCatalogItems(categoryId, orderedIds);
    apiCall.catch(function () {
      if (isTrip) state.tripList = previousOrder; else state.catalog = previousOrder;
      renderAll();
      showToast('排序更新失敗，已還原順序');
    });
  }

  function handleCategoryReorder(containerEl) {
    var orderedIds = Array.prototype.map.call(containerEl.children, function (el) { return el.dataset.categoryId; });
    var previousOrder = state.categories.slice();
    reorderStateArray(state.categories, 'id', orderedIds);
    renderAll();

    Api.reorderCategories(orderedIds).catch(function () {
      state.categories = previousOrder;
      renderAll();
      showToast('賣場排序更新失敗，已還原順序');
    });
  }

  // 依 orderedIds 重排 arr 中 id 落在這個集合裡的項目，其餘項目位置與相對順序不變
  // （orderedIds 只會是同一個分類/同一組可見賣場，靠 id 是否在集合裡就能精準對應，不用另外比對 category_id）
  function reorderStateArray(arr, idField, orderedIds) {
    var byId = {};
    arr.forEach(function (item) { byId[String(item[idField])] = item; });
    var orderedItems = orderedIds.map(function (id) { return byId[String(id)]; }).filter(Boolean);
    var idSet = {};
    orderedIds.forEach(function (id) { idSet[String(id)] = true; });
    var cursor = 0;
    for (var i = 0; i < arr.length; i++) {
      if (idSet[String(arr[i][idField])]) {
        arr[i] = orderedItems[cursor++];
      }
    }
  }

  // ---------- 事件綁定（每次重繪後對該容器綁一次，用委派） ----------
  function bindSectionEvents(root) {
    if (root.dataset.eventsBound === 'true') return;
    root.dataset.eventsBound = 'true';
    root.addEventListener('click', onSectionClick);
    root.addEventListener('submit', onSectionSubmit);
    root.addEventListener('change', onSectionChange);
  }

  function onSectionClick(e) {
    var t;
    if ((t = e.target.closest('[data-action="open-add-trip"]'))) {
      openAddTripModal(t.dataset.categoryId);
    } else if ((t = e.target.closest('[data-action="delete-trip"]'))) {
      deleteTripItem(t.dataset.tripId);
    } else if ((t = e.target.closest('[data-action="delete-catalog"]'))) {
      deleteCatalogItem(t.dataset.itemId);
    } else if ((t = e.target.closest('[data-action="add-trip-from-catalog-inline"]'))) {
      var addItemId = t.dataset.itemId, addCategoryId = t.dataset.categoryId;
      if (!confirmDuplicateAdd(addCategoryId, addItemId)) return;
      addTripItem({ catalog_item_id: addItemId, category_id: addCategoryId });
    } else if ((t = e.target.closest('[data-action="promote-to-catalog"]'))) {
      addTripItemToCatalog(t.dataset.tripId);
    } else if ((t = e.target.closest('[data-action="start-edit-catalog"]'))) {
      state.editingCatalogItemId = t.dataset.itemId;
      renderAll();
    } else if ((t = e.target.closest('[data-action="cancel-edit-catalog"]'))) {
      state.editingCatalogItemId = null;
      renderAll();
    } else if ((t = e.target.closest('[data-action="delete-category"]'))) {
      deleteCategory(t.dataset.categoryId);
    } else if ((t = e.target.closest('[data-action="start-edit-trip"]'))) {
      state.editingTripItemId = t.dataset.tripId;
      renderAll();
    } else if ((t = e.target.closest('[data-action="cancel-edit-trip"]'))) {
      state.editingTripItemId = null;
      renderAll();
    } else if ((t = e.target.closest('[data-action="start-edit-category"]'))) {
      state.editingCategoryId = t.dataset.categoryId;
      renderAll();
    } else if ((t = e.target.closest('[data-action="cancel-edit-category"]'))) {
      state.editingCategoryId = null;
      renderAll();
    }
  }

  function onSectionChange(e) {
    var t;
    if ((t = e.target.closest('[data-action="toggle-check"]'))) {
      toggleCheck(t.dataset.tripId);
    } else if ((t = e.target.closest('[data-action="toggle-store-visible"]'))) {
      toggleCategoryVisible(t.dataset.categoryId);
    }
  }

  function onSectionSubmit(e) {
    var t;
    if ((t = e.target.closest('[data-action="add-catalog-form"]'))) {
      e.preventDefault();
      var name = t.elements.name.value.trim();
      var tagId = t.elements.tag_id.value;
      if (!name) return;
      addCatalogItem(t.dataset.categoryId, name, tagId);
      t.reset();
    } else if ((t = e.target.closest('[data-action="edit-catalog-form"]'))) {
      e.preventDefault();
      var editName = t.elements.name.value.trim();
      var editTagId = t.elements.tag_id.value;
      if (!editName) return;
      updateCatalogItem(t.dataset.itemId, editName, editTagId);
    } else if ((t = e.target.closest('[data-action="add-store-form"]'))) {
      e.preventDefault();
      var storeName = t.elements.name.value.trim();
      if (!storeName) return;
      addCategory(storeName, 'store');
      t.reset();
    } else if ((t = e.target.closest('[data-action="edit-trip-form"]'))) {
      e.preventDefault();
      var editTripName = t.elements.name.value.trim();
      var editTripTagId = t.elements.tag_id.value;
      if (!editTripName) return;
      updateTripItem(t.dataset.tripId, editTripName, editTripTagId);
    } else if ((t = e.target.closest('[data-action="edit-category-form"]'))) {
      e.preventDefault();
      var editCategoryName = t.elements.name.value.trim();
      if (!editCategoryName) return;
      updateCategory(t.dataset.categoryId, editCategoryName);
    }
  }

  // ---------- Trip List：樂觀更新 ----------
  function addTripItem(opts) {
    var catalogSrc = opts.catalog_item_id ? state.catalog.filter(function (c) { return String(c.item_id) === String(opts.catalog_item_id); })[0] : null;
    var localId = tmpId();
    var item = {
      trip_id: localId,
      catalog_item_id: opts.catalog_item_id || '',
      category_id: opts.category_id,
      name: opts.name || (catalogSrc ? catalogSrc.name : ''),
      tag_id: opts.tag_id || (catalogSrc ? catalogSrc.tag_id : ''),
      checked: false,
      added_at: new Date().toISOString(),
      _pending: true,
      _pendingCheckToggles: 0,
      _deleteRequested: false
    };
    state.tripList.push(item);
    renderAll();

    Api.addTripItem({
      catalog_item_id: item.catalog_item_id,
      category_id: item.category_id,
      name: item.name,
      tag_id: item.tag_id
    }).then(function (saved) {
      var idx = state.tripList.indexOf(item);
      if (idx === -1) return;
      if (item._deleteRequested) {
        state.tripList.splice(idx, 1);
        Api.deleteTripItem(saved.trip_id).catch(function () {});
        renderAll();
        return;
      }
      saved._pending = false;
      state.tripList[idx] = saved;
      if (item._pendingCheckToggles % 2 === 1) {
        saved.checked = !(saved.checked === true || saved.checked === 'TRUE');
        Api.toggleCheck(saved.trip_id).catch(function () {});
      }
      renderAll();
    }).catch(function () {
      var idx = state.tripList.indexOf(item);
      if (idx > -1) state.tripList.splice(idx, 1);
      renderAll();
      showToast('加入項目失敗，請重試');
    });
  }

  function toggleCheck(tripId) {
    var item = state.tripList.filter(function (i) { return String(i.trip_id) === String(tripId); })[0];
    if (!item) return;
    var wasChecked = item.checked === true || item.checked === 'TRUE';
    item.checked = !wasChecked;
    renderAll();

    if (item._pending) {
      item._pendingCheckToggles = (item._pendingCheckToggles || 0) + 1;
      return;
    }
    Api.toggleCheck(tripId).catch(function () {
      item.checked = wasChecked;
      renderAll();
      showToast('更新狀態失敗，請重試');
    });
  }

  function deleteTripItem(tripId) {
    var idx = state.tripList.findIndex(function (i) { return String(i.trip_id) === String(tripId); });
    if (idx === -1) return;
    var item = state.tripList[idx];

    if (item._pending) {
      item._deleteRequested = true;
      state.tripList.splice(idx, 1);
      renderAll();
      return;
    }

    state.tripList.splice(idx, 1);
    renderAll();
    Api.deleteTripItem(tripId).catch(function () {
      state.tripList.splice(idx, 0, item);
      renderAll();
      showToast('刪除失敗，請重試');
    });
  }

  function updateTripItem(tripId, name, tagId) {
    var item = state.tripList.filter(function (i) { return String(i.trip_id) === String(tripId); })[0];
    if (!item) return;
    var prevName = item.name;
    var prevTagId = item.tag_id;
    item.name = name;
    item.tag_id = tagId;
    state.editingTripItemId = null;
    renderAll();

    Api.updateTripItem(tripId, name, tagId).catch(function () {
      item.name = prevName;
      item.tag_id = prevTagId;
      renderAll();
      showToast('更新項目失敗，請重試');
    });
  }

  // 本次清單一次性項目「升級」為品項庫常駐品項，僅限日常採購
  function addTripItemToCatalog(tripId) {
    var item = state.tripList.filter(function (i) { return String(i.trip_id) === String(tripId); })[0];
    if (!item || item.catalog_item_id || item._promotingToCatalog) return;
    var cat = categoryById(item.category_id);
    if (!cat || cat.type !== 'daily') return;

    var existing = state.catalog.filter(function (c) {
      return String(c.category_id) === String(item.category_id) && c.name === item.name;
    })[0];
    if (existing) {
      item.catalog_item_id = existing.item_id;
      renderAll();
      showToast('品項庫中已有「' + item.name + '」，未重複新增');
      return;
    }

    item._promotingToCatalog = true;
    renderAll();

    Api.addCatalogItem(item.category_id, item.name, item.tag_id).then(function (saved) {
      state.catalog.push(saved);
      item.catalog_item_id = saved.item_id;
      item._promotingToCatalog = false;
      renderAll();
      showToast('已加入品項庫');
    }).catch(function () {
      item._promotingToCatalog = false;
      renderAll();
      showToast('加入品項庫失敗，請重試');
    });
  }

  // ---------- Catalog：樂觀更新 ----------
  function addCatalogItem(categoryId, name, tagId) {
    var localId = tmpId();
    var item = { item_id: localId, category_id: categoryId, name: name, tag_id: tagId, created_at: new Date().toISOString(), _pending: true };
    state.catalog.push(item);
    renderAll();

    Api.addCatalogItem(categoryId, name, tagId).then(function (saved) {
      var idx = state.catalog.indexOf(item);
      if (idx > -1) state.catalog[idx] = saved;
      renderAll();
    }).catch(function () {
      var idx = state.catalog.indexOf(item);
      if (idx > -1) state.catalog.splice(idx, 1);
      renderAll();
      showToast('新增品項庫失敗，請重試');
    });
  }

  function updateCatalogItem(itemId, name, tagId) {
    var item = state.catalog.filter(function (c) { return String(c.item_id) === String(itemId); })[0];
    if (!item) return;
    var prevName = item.name;
    var prevTagId = item.tag_id;
    item.name = name;
    item.tag_id = tagId;
    state.editingCatalogItemId = null;
    renderAll();

    Api.updateCatalogItem(itemId, name, tagId).catch(function () {
      item.name = prevName;
      item.tag_id = prevTagId;
      renderAll();
      showToast('更新品項失敗，請重試');
    });
  }

  function deleteCatalogItem(itemId) {
    var idx = state.catalog.findIndex(function (i) { return String(i.item_id) === String(itemId); });
    if (idx === -1) return;
    var item = state.catalog[idx];
    state.catalog.splice(idx, 1);
    renderAll();
    Api.deleteCatalogItem(itemId).catch(function () {
      state.catalog.splice(idx, 0, item);
      renderAll();
      showToast('刪除失敗，請重試');
    });
  }

  // ---------- Category：樂觀更新 ----------
  function addCategory(name, type) {
    var localId = tmpId();
    var cat = { id: localId, name: name, type: type, visible: true, sort_order: state.categories.length, _pending: true };
    state.categories.push(cat);
    renderAll();

    Api.addCategory(name, type).then(function (saved) {
      var idx = state.categories.indexOf(cat);
      if (idx > -1) state.categories[idx] = saved;
      renderAll();
    }).catch(function () {
      var idx = state.categories.indexOf(cat);
      if (idx > -1) state.categories.splice(idx, 1);
      renderAll();
      showToast('新增賣場失敗，請重試');
    });
  }

  function toggleCategoryVisible(categoryId) {
    var cat = categoryById(categoryId);
    if (!cat) return;
    var was = cat.visible === true || cat.visible === 'TRUE';
    cat.visible = !was;
    renderAll();
    Api.toggleCategoryVisible(categoryId).catch(function () {
      cat.visible = was;
      renderAll();
      showToast('更新賣場顯示狀態失敗');
    });
  }

  function updateCategory(categoryId, name) {
    var cat = categoryById(categoryId);
    if (!cat) return;
    var prevName = cat.name;
    cat.name = name;
    state.editingCategoryId = null;
    renderAll();

    Api.updateCategory(categoryId, name).catch(function () {
      cat.name = prevName;
      renderAll();
      showToast('更新賣場名稱失敗，請重試');
    });
  }

  // 只能刪除賣場（type === 'store'），連動刪除該賣場底下的本次清單項目
  function deleteCategory(categoryId) {
    var cat = categoryById(categoryId);
    if (!cat || cat.type !== 'store') return;
    if (!window.confirm('確定要刪除賣場「' + cat.name + '」嗎？這個賣場底下的本次清單項目也會一併刪除，無法復原。')) return;

    var idx = state.categories.indexOf(cat);
    var removedTripItems = state.tripList.filter(function (t) { return String(t.category_id) === String(categoryId); });
    state.categories.splice(idx, 1);
    state.tripList = state.tripList.filter(function (t) { return String(t.category_id) !== String(categoryId); });
    renderAll();

    Api.deleteCategory(categoryId).catch(function () {
      state.categories.splice(idx, 0, cat);
      state.tripList = state.tripList.concat(removedTripItems);
      renderAll();
      showToast('刪除賣場失敗，請重試');
    });
  }

  // ---------- 加入項目 Modal ----------
  function openAddTripModal(categoryId) {
    var cat = categoryById(categoryId);
    var isDaily = !!cat && cat.type === 'daily';

    // 賣場分類沒有品項庫管理介面了，加入項目統一走一次性項目輸入，不提供品項庫選擇
    if (!isDaily) {
      var storeModalHtml =
        '<div class="modal-overlay" id="modal-overlay">' +
          '<div class="modal-sheet">' +
            '<div class="modal-header">' +
              '<h3 class="modal-title">加入項目</h3>' +
              '<button class="modal-close" data-action="close-modal">×</button>' +
            '</div>' +
            '<form class="inline-form" data-action="oneoff-form" data-category-id="' + categoryId + '">' +
              '<input type="text" name="name" placeholder="項目名稱" required>' +
              renderTagSelect() +
              '<button class="btn-add" type="submit">加入</button>' +
            '</form>' +
          '</div>' +
        '</div>';
      showModal(storeModalHtml);
      return;
    }

    var catalogItems = state.catalog.filter(function (c) { return String(c.category_id) === String(categoryId); });
    var modalHtml =
      '<div class="modal-overlay" id="modal-overlay">' +
        '<div class="modal-sheet">' +
          '<div class="modal-header">' +
            '<h3 class="modal-title">加入項目</h3>' +
            '<button class="modal-close" data-action="close-modal">×</button>' +
          '</div>' +
          '<div class="segment">' +
            '<button type="button" class="is-active" data-seg="oneoff">新增一次性項目</button>' +
            '<button type="button" data-seg="catalog">從品項庫選擇</button>' +
          '</div>' +
          '<div data-seg-panel="oneoff">' +
            '<form class="inline-form" data-action="oneoff-form" data-category-id="' + categoryId + '">' +
              '<input type="text" name="name" placeholder="項目名稱" required>' +
              renderTagSelect() +
              '<button class="btn-add" type="submit">加入</button>' +
            '</form>' +
          '</div>' +
          '<div data-seg-panel="catalog" class="hidden">' +
            (catalogItems.length
              ? catalogItems.map(function (c) {
                  var tag = tagById(c.tag_id);
                  return '<div class="pick-list-item">' +
                    '<span>' + (tag ? '<span class="tag-dot dot-' + tag.color_key + '"></span> ' : '') + escapeHtml(c.name) + '</span>' +
                    '<button class="btn-add" data-action="pick-catalog-item" data-item-id="' + c.item_id + '" data-category-id="' + categoryId + '">加入</button>' +
                  '</div>';
                }).join('')
              : '<p class="empty-hint">此分類品項庫是空的，可切換到「新增一次性項目」</p>') +
          '</div>' +
        '</div>' +
      '</div>';
    showModal(modalHtml);
  }

  function bindModalEvents(overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.closest('[data-action="close-modal"]')) closeModal();
      var seg = e.target.closest('[data-seg]');
      if (seg) {
        overlay.querySelectorAll('[data-seg]').forEach(function (b) { b.classList.toggle('is-active', b === seg); });
        overlay.querySelectorAll('[data-seg-panel]').forEach(function (p) {
          p.classList.toggle('hidden', p.dataset.segPanel !== seg.dataset.seg);
        });
      }
      var pick = e.target.closest('[data-action="pick-catalog-item"]');
      if (pick) {
        var pickItemId = pick.dataset.itemId, pickCategoryId = pick.dataset.categoryId;
        if (!confirmDuplicateAdd(pickCategoryId, pickItemId)) return;
        addTripItem({ catalog_item_id: pickItemId, category_id: pickCategoryId });
        closeModal();
      }
    });
    overlay.addEventListener('submit', function (e) {
      var form = e.target.closest('[data-action="oneoff-form"]');
      if (form) {
        e.preventDefault();
        var name = form.elements.name.value.trim();
        var tagId = form.elements.tag_id.value;
        if (!name) return;
        addTripItem({ category_id: form.dataset.categoryId, name: name, tag_id: tagId });
        closeModal();
      }
    });
  }

  // ---------- 標籤設定 Modal ----------
  function openTagsModal() {
    renderTagsModalContent();
  }

  function renderTagsModalContent() {
    var modalHtml =
      '<div class="modal-overlay" id="modal-overlay">' +
        '<div class="modal-sheet">' +
          '<div class="modal-header">' +
            '<h3 class="modal-title">標籤設定</h3>' +
            '<button class="modal-close" data-action="close-modal">×</button>' +
          '</div>' +
          '<ul class="tag-manage-list">' +
            (state.tags.length ? state.tags.map(renderTagManageRow).join('') : '<p class="empty-hint">尚未建立標籤</p>') +
          '</ul>' +
          '<form class="inline-form" data-action="add-tag-form">' +
            '<input type="text" name="name" placeholder="新標籤名稱" required>' +
            '<select name="color_key">' +
              TAG_COLORS.map(function (c) { return '<option value="' + c.key + '">' + c.label + '</option>'; }).join('') +
            '</select>' +
            '<button class="btn-add" type="submit">新增</button>' +
          '</form>' +
        '</div>' +
      '</div>';
    showModal(modalHtml, bindTagsModalEvents);
  }

  function renderTagManageRow(t) {
    if (state.editingTagId === t.tag_id) {
      return '<li class="tag-manage-item">' +
        '<form class="inline-form" data-action="edit-tag-form" data-tag-id="' + t.tag_id + '">' +
          '<input type="text" name="name" value="' + escapeHtml(t.name) + '" required>' +
          '<select name="color_key">' +
            TAG_COLORS.map(function (c) { return '<option value="' + c.key + '"' + (c.key === t.color_key ? ' selected' : '') + '>' + c.label + '</option>'; }).join('') +
          '</select>' +
          '<button class="btn-add" type="submit">儲存</button>' +
          '<button class="btn-ghost" type="button" data-action="cancel-edit-tag">取消</button>' +
        '</form>' +
      '</li>';
    }
    return '<li class="tag-manage-item">' +
      '<span><span class="tag-dot dot-' + t.color_key + '"></span> ' + escapeHtml(t.name) + '</span>' +
      '<span>' +
        '<button class="btn-ghost" data-action="start-edit-tag" data-tag-id="' + t.tag_id + '">編輯</button> ' +
        '<button class="btn-danger-text" data-action="delete-tag" data-tag-id="' + t.tag_id + '">刪除</button>' +
      '</span>' +
    '</li>';
  }

  function bindTagsModalEvents(overlay) {
    overlay.addEventListener('click', function (e) {
      var t;
      if ((t = e.target.closest('[data-action="start-edit-tag"]'))) {
        state.editingTagId = t.dataset.tagId;
        renderTagsModalContent();
      } else if ((t = e.target.closest('[data-action="cancel-edit-tag"]'))) {
        state.editingTagId = null;
        renderTagsModalContent();
      } else if ((t = e.target.closest('[data-action="delete-tag"]'))) {
        deleteTag(t.dataset.tagId);
      }
    });
    overlay.addEventListener('submit', function (e) {
      var form;
      if ((form = e.target.closest('[data-action="add-tag-form"]'))) {
        e.preventDefault();
        var name = form.elements.name.value.trim();
        var colorKey = form.elements.color_key.value;
        if (!name) return;
        addTag(name, colorKey);
      } else if ((form = e.target.closest('[data-action="edit-tag-form"]'))) {
        e.preventDefault();
        var editName = form.elements.name.value.trim();
        var editColor = form.elements.color_key.value;
        if (!editName) return;
        updateTag(form.dataset.tagId, editName, editColor);
      }
    });
  }

  function addTag(name, colorKey) {
    var localId = tmpId();
    var tag = { tag_id: localId, name: name, color_key: colorKey, _pending: true };
    state.tags.push(tag);
    renderTagsModalContent();
    renderAll();

    Api.addTag(name, colorKey).then(function (saved) {
      var idx = state.tags.indexOf(tag);
      if (idx > -1) state.tags[idx] = saved;
      renderTagsModalContent();
      renderAll();
    }).catch(function () {
      var idx = state.tags.indexOf(tag);
      if (idx > -1) state.tags.splice(idx, 1);
      renderTagsModalContent();
      renderAll();
      showToast('新增標籤失敗，請重試');
    });
  }

  function updateTag(tagId, name, colorKey) {
    var tag = tagById(tagId);
    if (!tag) return;
    var prevName = tag.name;
    var prevColor = tag.color_key;
    tag.name = name;
    tag.color_key = colorKey;
    state.editingTagId = null;
    renderTagsModalContent();
    renderAll();

    Api.updateTag(tagId, name, colorKey).catch(function () {
      tag.name = prevName;
      tag.color_key = prevColor;
      renderTagsModalContent();
      renderAll();
      showToast('更新標籤失敗，請重試');
    });
  }

  function deleteTag(tagId) {
    var tag = tagById(tagId);
    if (!tag) return;
    var catalogCount = state.catalog.filter(function (c) { return String(c.tag_id) === String(tagId); }).length;
    var tripCount = state.tripList.filter(function (t) { return String(t.tag_id) === String(tagId); }).length;
    var usedCount = catalogCount + tripCount;
    var msg = usedCount > 0
      ? '標籤「' + tag.name + '」目前有 ' + usedCount + ' 個品項使用中，刪除後這些品項會變成未分類（無標籤）。確定要刪除嗎？'
      : '確定要刪除標籤「' + tag.name + '」嗎？';
    if (!window.confirm(msg)) return;

    var idx = state.tags.indexOf(tag);
    state.tags.splice(idx, 1);
    var touchedCatalog = state.catalog.filter(function (c) { return String(c.tag_id) === String(tagId); });
    var touchedTrip = state.tripList.filter(function (t) { return String(t.tag_id) === String(tagId); });
    touchedCatalog.forEach(function (c) { c.tag_id = ''; });
    touchedTrip.forEach(function (t) { t.tag_id = ''; });
    renderTagsModalContent();
    renderAll();

    Api.deleteTag(tagId).catch(function () {
      state.tags.splice(idx, 0, tag);
      touchedCatalog.forEach(function (c) { c.tag_id = tagId; });
      touchedTrip.forEach(function (t) { t.tag_id = tagId; });
      renderTagsModalContent();
      renderAll();
      showToast('刪除標籤失敗，請重試');
    });
  }

  // ---------- Modal 共用 ----------
  function showModal(html, extraBind) {
    var root = document.getElementById('modal-root');
    root.innerHTML = html;
    var overlay = document.getElementById('modal-overlay');
    bindModalEvents(overlay);
    if (extraBind) extraBind(overlay);
  }
  function closeModal() {
    document.getElementById('modal-root').innerHTML = '';
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
