/*jslint browser: true*/
/*global io,console */
(function () {
  'use strict';

  //requires the physical-screen element to be imported
  function addPhysicalDisplay(parentEl, resultUUID, dataType, id, color) {
    var newScreen = document.createElement('physical-screen');
    newScreen.setAttribute('screenId', id);
    newScreen.setAttribute('resultUUID', resultUUID);
    if (dataType === 'RGB_INT') {
      newScreen.setAttribute('red', color[0]);
      newScreen.setAttribute('green', color[1]);
      newScreen.setAttribute('blue', color[2]);
    } else {
      console.error('Data format not yet supported: ' + dataType);
    }
    parentEl.appendChild(newScreen);
  }

  //display results
  function displayResults(parentSelector, data) {
    var parentEl = document.querySelector(parentSelector);
    parentEl.innerHTML = '';
    Object.keys(data.measurements).forEach(function display(screen) {
      addPhysicalDisplay(parentEl, data.uuid, data.dataType, screen, data.measurements[screen]);
    });

  }
  //establish socket.io connection
  var socket = io();


  //wait for DOM
  document.addEventListener('DOMContentLoaded', function () {
    /* Connection Management */
    socket.on('connect', function () {
      console.log('WebSocket connected');
      socket.emit('registerControl');
    });
    socket.on('connect_error', function (err) {
      console.error('connection error:' + err);
    });
    socket.on('colorChanged', function (color, screen) {
      if (screen) {
        console.log('Color changed (' + screen + ')');
      } else {
        console.log('Color changed by control sever');
      }
    });
    socket.on('calibrationStatusUpdate', function (uuid, payload) {
      console.log('update for ' + uuid + ' : ' + payload);
    });
    socket.on('resultsUploaded', function (data) {
      console.log('Results uploaded ' + data.uuid);
      displayResults('#display-wall', data);
      document.querySelector('simple-table').clearDataSet();
    });
  }); //end wait for DOM
}());
