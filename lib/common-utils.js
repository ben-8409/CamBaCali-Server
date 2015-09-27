'use strict';
/**
 * Common/Shared utility functions for the calibration control server
 * @module lib/common-utils
 */
var debug = require('debug')('control-server:common-utils'),
  Promise = require('promise'),
  temp = require('temp');

// should keep track of created folders and delete on exit. TODO: disfunctional
temp.track();

/**
 * Return a set of unique hostnames for the screens supplied.
 * @param {Object} Object with screens as objects containing a property hostname
 * @return {Set} Set of hostnames
 */
function getHostnames(screens) {
  var hostname,
      hostnames = new Set();
  Object.keys(screens).forEach(function (screen) {
    hostname = screens[screen].hostname;
    if (typeof hostname !== 'undefined' && !hostnames.has(hostname)) {
      hostnames.add(hostname);
    }
  });
  return hostnames;
}

/**
 * Given a object of screens, this returns a object containing
 * hostnames with the list of screens.
 * @param {Object} Object containing the screens as subobject
 * @returns {Map} Maps with hostnames as keys for arrays of screensIds
 */
function groupScreensByHostname(screens) {
  var hostnames = new Map();
  Object.keys(screens).forEach(function (screenId) {
    var screen = screens[screenId];
    //
    if (hostnames.has(screen.hostname)) {
      //append to that array of screens
      hostnames.get(screen.hostname).push(screenId);
    } else {
      hostnames.set(screen.hostname, [screenId]);
    }
  });
  return hostnames;
}


/**
 * Create a temporary directory that should be deleted on exit
 * @param {String} name part of the directory name
 * @returns {String} directory name
 */
function makeTempDir(name) {
  return new Promise( function (resolve, reject) {
    temp.mkdir(name, function(err, dirPath) {
      if(err) {
        reject(err);
      } else {
        debug('Temp dir ' + dirPath + ' created');
        resolve(dirPath);
      }
    });
  });
}

/**
 * Convert to CSV
 * @param {Object[]} deltaE measurments
 * @param {String[]} screens
 * @return {String}
 */
function convertDeltaEtoCSV(deltaEs, screens) {
  if(!Array.isArray(deltaEs) || typeof screens !== 'object') {
    throw new Error('Invalid argument to convertDeltaEtoCSV');
  }
  var out = '',
    screen,
    iteration,
    screenIds = [];
  //heading
  Object.keys(screens).forEach(function (s) {
    out += s + ',';
    screenIds.push(s);
  });
  out += '\n';
  for (iteration of deltaEs) {
    debug(iteration);
    for (screen of screenIds) {
      out += iteration[screen] + ',';
    }
    out += '\n';
  }
  return out;
}

function screenIdsArray(screens) {
  var ids = [];
  Object.keys(screens).forEach(function generateColors(screen) {
    ids.push(screen);
  });
  return ids;
}

// Module exports
module.exports = {
  'convertDeltaEtoCSV': convertDeltaEtoCSV,
  'getHostnames': getHostnames,
  'groupScreensByHostname': groupScreensByHostname,
  'makeTempDir': makeTempDir,
  'screenIdsArray': screenIdsArray
};
