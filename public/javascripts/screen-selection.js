/*global api*/
(function() {
  'use strict';
  var screenSelectorId = 'display-wall';

  //add event listener for screen selector
  window.addEventListener('polymer-ready', function() {
    var screenSelector = document.querySelector('#' + screenSelectorId);
    screenSelector.addEventListener('core-select', function(e) {
      var uuid = e.detail.item.resultUUID;
      document.querySelector('confirm-reference').setAttribute('uuid', e.detail.item.resultUUID);
      document.querySelector('confirm-reference').setAttribute('reference', e.detail.item.screenId);
      console.log(e.detail.item.screenId + ' ' + e.detail.isSelected);
      api.getResultsWithReference(uuid, e.detail.item.screenId).then(
        function(response) { //resolve
          //convert response for use in simple-table
          var data = {
            'title': response.uuid,
            'values': response.deltaEs
          };
          //get keys to use as rows
          var screens = Object.keys(response.deltaEs);
          var table = document.querySelector('simple-table');
          //set data
          table.rows = screens;
          table.addData(data);
        },
        function(Error) {
          console.error(Error);
        });
    });
    document.querySelector('confirm-reference').addEventListener('referenceConfirmed', function(e) {
      console.log(e.detail);
      api.setReference(e.detail);
    });
  }); //DOMContentLoaded
})();
