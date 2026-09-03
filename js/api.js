// 封裝所有呼叫 GAS Web App 的函式。
// 用 text/plain 送出 POST body 以避免瀏覽器對 GAS 觸發 CORS preflight（GAS 不支援 OPTIONS）。
(function () {
  function callGas(action, params) {
    var url = window.GAS_CONFIG.URL;
    var payload = Object.assign({ action: action }, params || {});
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (!json.success) throw new Error(json.error || 'GAS 回傳失敗');
        return json.data;
      });
  }

  window.Api = {
    getCategories: function () { return callGas('getCategories'); },
    addCategory: function (name, type) { return callGas('addCategory', { name: name, type: type }); },
    toggleCategoryVisible: function (id) { return callGas('toggleCategoryVisible', { id: id }); },

    getCatalog: function (categoryId) { return callGas('getCatalog', { category_id: categoryId }); },
    addCatalogItem: function (categoryId, name, tagId) {
      return callGas('addCatalogItem', { category_id: categoryId, name: name, tag_id: tagId });
    },
    updateCatalogItem: function (itemId, name, tagId) {
      return callGas('updateCatalogItem', { item_id: itemId, name: name, tag_id: tagId });
    },
    deleteCatalogItem: function (itemId) { return callGas('deleteCatalogItem', { item_id: itemId }); },

    getTripList: function () { return callGas('getTripList'); },
    addTripItem: function (params) { return callGas('addTripItem', params); },
    toggleCheck: function (tripId) { return callGas('toggleCheck', { trip_id: tripId }); },
    deleteTripItem: function (tripId) { return callGas('deleteTripItem', { trip_id: tripId }); },

    getTags: function () { return callGas('getTags'); },
    addTag: function (name, colorKey) { return callGas('addTag', { name: name, color_key: colorKey }); },
    updateTag: function (tagId, name, colorKey) { return callGas('updateTag', { tag_id: tagId, name: name, color_key: colorKey }); },
    deleteTag: function (tagId) { return callGas('deleteTag', { tag_id: tagId }); }
  };
})();
