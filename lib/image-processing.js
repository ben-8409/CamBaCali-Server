'use strict';

/**
 * Image Processing wrapper
 * @module lib/image-processing
 */

var debug = require('debug')('control-server:image-processing');

var cameraControl = require('./camera-control.js'),
  config = require('../config.js'),
  cmdUtils = require('./cmd-utils.js'),
  socket = require('./socket.js'),
  ext;

if(config.useJPEG) {
  ext = 'jpg';
} else {
  ext = 'cr2';
}

function identifyScreens(dir, calibrationId) {
 return cmdUtils.spawnLocally('calibtool', ['--save_masks',
                                         '--path', dir,
                                         '--server_address', config.serverURI,
                                         '--uuid', calibrationId,
                                         '--ext', ext,
                                         '--distance', '70.0'],
                           { 'cwd': dir });
}

function* maskCreationGenerator (calibrationObj) {
  var screensArray = Object.keys(config.screens);
  debug('Capture Redscreen image');
  yield socket.setDisplayColorAndWait({ red: 255, green: 0, blue: 0 });
  // delay finished
  yield cameraControl.captureAndConvertImage('redscreen', calibrationObj.localMaskPath);
  debug('Highlight screens and capture');
  for(var screen of screensArray) {
    yield socket.highlightScreenAndWait(screen);
    debug('Screen ' + screen + ' should be highlighted now');
    yield cameraControl.captureAndConvertImage('screen_' + screen, calibrationObj.localMaskPath);
    debug('Highlight picture for screen ' + screen + ' captured.');
  } //end for each screen
}


// Module exports
module.exports = {
  'identifyScreens': identifyScreens,
  'maskCreationGenerator': maskCreationGenerator
};
