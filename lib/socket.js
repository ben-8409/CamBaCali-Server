'use strict';
/**
 * Handle the WebSocket connection to Screens and UI
 * @module lib/socket
 */
var debug = require('debug')('control-server:socket-handler'),
    temporal = require('temporal'),
    Promise = require('promise'),
    session = require('./session.js');

var io;

function createSocket(server) {
  io = require('socket.io')(server);
  io.on('connection', function (socket) {
    debug('client connected');
    var assosiatedScreenId;
    //register event
    socket.on('registerScreen', function (screenId) {
      assosiatedScreenId = screenId;
      session.setSocketForScreen(screenId, socket.id);
      socket.join('screens');
      debug('Screen with ID ' + screenId + ' registered.');
    });
    socket.on('registerControl', function () {
      socket.join('controls');
      socket.emit();
      debug('New control registered');
    });
    socket.on('disconnect', function () {
      debug('Socket ' + socket.id + ' disconnected');
      if (assosiatedScreenId !== '') {
        session.delSocketForScreen(assosiatedScreenId);
        debug('Screen ' + assosiatedScreenId + ' no longer registered');
      }
    });
  });
}

function announceResult(result) {
  debug('Announce Result upload');
  io.to('controls').emit('resultsUploaded', result);
}

function highlightScreen(screenId) {
  var color;
  session.getScreenSocketMap().forEach( function (socket, screen) {
    if (screen === screenId) {
      debug('Highlight ' + screen + ' on socket ' + socket);
      color = 'rgb(0,255,0)';
    } else {
      color = 'rgb(255,0,0)';
    }
    io.to(socket).emit('changeColor', color);
  });
}

function highlightScreenAndWait(screen) {
  return new Promise(function (resolve, reject) {
    try {
      highlightScreen(screen);
      setTimeout(function() {
        debug('Screen should be highlighted now: ' + screen);
        resolve(screen);
      }, 1200);
    } catch (e) {
      reject(e);
    }
  });
}

//TODO: remove, for compability only
function screenRegistered (screen) {
  return session.isScreenActive(screen);
}

function setDisplayColor(color) {
  debug('Change display color');
  io.to('screens').emit('changeColor', 'rgb(' + color.red + ',' + color.green + ',' + color.blue + ')');
  io.to('controls').emit('colorChanged', color);
}

function setDisplayColorAndWait(color) {
  return new Promise(function (resolve, reject) {
    try {
      setDisplayColor(color);
      setTimeout(function() {
        debug('Color should have been set by now');
        resolve(color);
      }, 1200);
 //     temporal.delay(1000, function () {
//
//      });
    } catch (e) {
      reject(e);
    }
  });
}

function setScreenColor(screen, color) {
  io.to(session.getSocketForScreen(screen)).emit('changeColor', 'rgb(' + color.red + ',' + color.green + ',' + color.blue + ')');
  io.to('controls').emit('colorChanged', color, screen);
}

function calibrationStatusUpdate(uuid, payload) {
  io.to('controls').emit('calibrationStatusUpdate', uuid, payload);
}

// Module exports
module.exports.announceResult = announceResult;
module.exports.calibrationStatusUpdate = calibrationStatusUpdate;

module.exports.createSocket = createSocket;

module.exports.highlightScreen = highlightScreen;
module.exports.highlightScreenAndWait = highlightScreenAndWait;

module.exports.setDisplayColor = setDisplayColor;
module.exports.setDisplayColorAndWait = setDisplayColorAndWait;
module.exports.setScreenColor = setScreenColor;

module.exports.screenRegistered = screenRegistered;
