'use strict';
/**
 * Control module for external USB cameras with gphoto2 and remote
 * cmd execution
 * @module lib/camera-control
 */

// NPM public modules
var Promise = require('promise'),
    debug = require('debug')('control-server:camera-control');

// Local proprietary modules
var config = require('../config.js'),
  utils = require('./cmd-utils.js');

var gammaSettings = {
  'dcraw': {
    'srgb_gamma': '-g 2.4 12.92',
    'no_gamma': '-g 1.0 0.0',
    'default': ''
  },
  'ufraw': {
    'no_gamma': '--gamma=1.00'
  }
};

/**
 * Auto-detect a connected camera with gphoto2. Run a simple RE on the output to determine
 * if a camera has been found.
 * @returns {Promise} promise
 */
function autoDetect() {
  var usbRE = /usb/g; //TODO: more robust RE
  //this requires a new promise because detection could fail even if the
  //promise resolves
  return new Promise(function (resolve, reject){
    var gphoto = utils.spawnLocally('gphoto2', ['--auto-detect']);
    gphoto.then(function (result) {
      //if fulfilled even when gphoto does not find a camera
      //we search the output for an usb port therefore
      if(usbRE.test(result)) {
        resolve(result);
      } else {
        reject(new Error('No camera with usb port found.'));
      }
    }, function (err) {
      reject(err);
    });
  });
}

/**
 * Capture one image with default settings and save at "filename"
 * @param   {String}  filename Valid unix filename
 * @param   {String}  workingDir Working directory to run the external tool in
 * @returns {Promise} Resolves if a picture was captured and downloaded from the camera.
 */
function captureImage(filename, workingDir) {
  return new Promise(function (resolve, reject) {
    var gphoto = utils.spawnLocally('gphoto2', ['--capture-image-and-download', '--filename=' + filename ], { cwd: workingDir });

    gphoto.then(function (result) {
      debug('Image captured successfully: ' + result);
      resolve({ 'filename': filename, 'workingDir': workingDir });
    }, function (err) {
      debug('Could not capture image ' + filename + ': ' + err);
      reject(err);
    });
});
}


/**
 * convertImage - Convert a raw image to a format opencv is able to handle
 * @param filename    {String} filename of the image
 * @param workingDir  {String} Path to working directory
 * @return {Promise}           description
 */
function convertImage(filename, workingDir) {
  return new Promise(function (resolve, reject) {
    if(!filename) {
      debug('No filename supplied: ' + filename);
      reject(new Error('No filename supplied: ' + filename));
    } else {
      debug('Convert image ' + filename);
      var convert;
      if(config.useUfraw) {
        convert = utils.spawnLocally('ufraw-batch', ['--lensfun=auto', filename], { cwd: workingDir });
      } else {
        convert = utils.spawnLocally('dcraw', ['-W', '-o 1', gammaSettings.dcraw_srgb_gamma, '-h', filename], { cwd: workingDir });
      }
      convert.then(function () {
        resolve({ 'filename': filename, 'workingDir': workingDir });
      }, function (error) {
        debug('Could not convert image. ' + filename);
        reject(error);
      });
    }
  });
}

/**
 * captureAndConvertImage
 * @param filename    {String} filename of the image
 * @param workingDir  {String} Path to working directory
 * @param formatString      {String} optional, overwrite configuration setting for format
 * @return {Promise}           description
 */
function captureAndConvertImage(filename, workingDir, formatString) {
  var formatSwitch;
  if(formatString === 'jpg' || formatString === 'raw') {
    formatSwitch = formatString;
  } else if (config.useJPEG ) {
    formatSwitch = 'jpg';
  } else {
    formatSwitch = 'raw';
  }

  if(formatSwitch === 'jpg') {
    return captureImage(filename + '.jpg', workingDir);
  } else {
    return captureImage(filename + '.cr2', workingDir).then( function() {
        return convertImage(filename + '.cr2', workingDir);
      });
  }
}

// Module exports
module.exports = {
 'autoDetect': autoDetect,
 'captureImage': captureImage,
 'convertImage': convertImage,
 'captureAndConvertImage': captureAndConvertImage
};
