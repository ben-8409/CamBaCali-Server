'use strict';
/**
 * Store information and status of the execution during the session
 * @module lib/session
 */

// Node modules
var debug = require('debug')('control-server:session'),
    uuid = require('node-uuid'),
    Promise = require('promise');

// Local Modules
var config = require('../config.js');

// Module variables
var calibrations = new Map(),
    resultsMap = new Map(),
    screenSocketMap = new Map(),
    evaluations = new Map();

/* EXPORTS */
module.exports = {
  //results
  'addResult': addResult,
  //sockets
  'delSocketForScreen': delSocketForScreen,
  'getScreenSocketMap': getScreenSocketMap,
  'getSocketForScreen': getSocketForScreen,
  'setSocketForScreen': setSocketForScreen,
  //screens
  'getActiveScreens': getActiveScreens,
  'isScreenActive': isScreenActive,
  'isScreenConfigured': isScreenConfigured,
  //calibration
  'loadCalibrationForScreen': loadCalibrationForScreen,
  'saveCalibrationForScreen': saveCalibrationForScreen,
  'getCalibration': getCalibration,
  'hasCalibration': hasCalibration,
  'createCalibration': createCalibration,
  'saveMeasurement': saveMeasurement,
  'uploadCalibration': uploadCalibration,
  //dE
  'saveDE': saveDE,
  //path
  'getPath': getPath,
  'setPath': setPath,
  //Evaluate
  'addEvaMeasurement': addEvaMeasurement,
  'getEva': getEva,
  'addEva': addEva,
  'hasEva': hasEva
};

/*
 * Calibration
 */
 function Calibration(options) {
   this.parameters = {};
   this.measurements = [];
   this.deltaEs = [];
   this.localMaskPath = '';
   this.masksReady = false;

   if(typeof options === 'object' && options.uuid) {
     debug('Importing Calibration Object');
     this.uuid = options.uuid;
     if(typeof options.parameters === 'object') {
       this.parameters = options.parameters;
     }
     if(options.measurements && Array.isArray(options.measurements)) {
       debug('Import measurements. Length of array ' + options.measurements.length);
       this.measurements = options.measurements;
     }
     if(options.deltaEs && Array.isArray(options.deltaEs)) {
       debug('Import deltaEs. Length of array ' + options.deltaEs.length);
       this.deltaEs = options.deltaEs;
     }
     this.localMaskPath = options.localMaskPath ? options.localMaskPath : '';
     this.masksReady = typeof options.masksReady === 'boolean' ? options.masksReady : false;

   } else if (typeof options === 'string') {
     this.uuid = options;
   } else {
     this.uuid = uuid.v4();
   }
   // calibration parameters, a Map with "screenId" as key and Object containing r,g,b values as value

 }
 Calibration.prototype.addDE = function (dE) {
   this.deltaEs.push(dE);
 };
 Calibration.prototype.latestMeasurement = function () {
   if(this.measurements.length < 1) {
     throw 'No measurements uploaded yet';
   }
   return this.measurements[this.measurements.length - 1];
 };
 Calibration.prototype.toString = function () {
   return this.uuid;
 };
 Calibration.prototype.toObject = function () {
   var obj = {
     'uuid': this.uuid,
     'parameters': this.parameters,
     'measurements': this.measurements,
     'localMaskPath': this.localMaskPath,
     'masksReady': this.masksReady,
     'deltaEs': this.deltaEs
   };
   return obj;
 };
 Calibration.prototype.toJSON = function () {
   return JSON.stringify(this.toObject());
 };

/**
 * createCalibration - Create a new calibration set
 * return {Calibration}
 */
function createCalibration() {
  var calibration = new Calibration();
  calibrations.set(calibration.uuid, calibration);
  debug('New calibration object created: ' + calibration.uuid);
  return calibration;
}
/**
 * getCalibration - Get Calibration with UUID
 * @param {String} UUID
 * return {Calibration}
 */
function getCalibration(calibrationId) {
  if(!calibrations.has(calibrationId)) {
    throw new Error('No calibration with this id available');
  }
  return calibrations.get(calibrationId);
}
/**
 * hasCalibration - Check if there is a calibration with UUID
 * @param {String} UUID
 * return {Boolean}
 */
function hasCalibration(calibrationId) {
  return calibrations.has(calibrationId);
}
function uploadCalibration(obj) {
  var calibration = new Calibration(obj);
  calibrations.set(calibration.uuid, calibration);
  return calibration;
}
 /**
  * saveCalibrationForScreen - Save calibration parameters in the session storage
  *
  * @param  {String} screenId         Id of the Screen
  * @param  {Object} correctionObject Object containing the parameters for each channel
  */
function saveCalibrationForScreen(screenId, correctionObject, calibrationId) {
  calibrations.get(calibrationId).parameters.set(screenId, correctionObject);
}

/**
 * loadCalibrationForScreen - Load the calibration parameters from the session
 *
 * @param  {String} screenId        Id of the Screen
 * @param  {String} UUID
 * @return {Object} Object containing the parameters for each channel
 */
function loadCalibrationForScreen(screenId, calibrationId) {
  if(calibrations.has(calibrationId)) {
    if(calibrations.get(calibrationId).parameters.has(screenId)) {
      return calibrations.get(uuid).parameters.get(screenId);
    } else {
      return { red: 0, blue: 0, green: 0 };
    }
  } else {
    throw Error('No parameters saved with uuid ' + calibrationId);
  }
}

/**
 * saveMeasurement - Save a measurement for later use
 *
 * @param {Object} measurement Measurement results
 * @param {String} uuid	(optional) Id for the calibration run this measurement belongs to
 * return {Object} The supplied measurement with an added uuid
 */
function saveMeasurement(measurement, calibrationId) {
  if (typeof calibrationId === 'undefined') {
    calibrationId = uuid.v4();
    debug('Save measurement without uuid. Generated one: ' + calibrationId);
  }
  if (!calibrations.has(calibrationId)) {
    debug('No calibration with this id (' + calibrationId + '), generating a new one.');
    calibrations.set(calibrationId, new Calibration(calibrationId));
  }
  debug('Add measurement to calibration ' + calibrationId + ' with screens ' +
       Object.keys(measurement.screens));
  calibrations.get(calibrationId).measurements.push(measurement);
  debug(typeof calibrations.get(calibrationId).measurements);
  return calibrations.get(calibrationId);
}
/**
 * addResult - Add a result object
 *
 * @param  {type} result description
 * @return {type}        description
 */
function addResult(result, calibrationId) {
  if (typeof calibrationId === 'undefined' ) { calibrationId = uuid.v4(); }
  if (typeof result.uuid === 'undefined') { result.uuid = uuid.v4(); }
  if (resultsMap.has(result.uuid)) {
    //this is not the first result for this uuid, add measurements to the list
    resultsMap.get(result.uuid).push(result.measurements);
    debug('Added measurements to result ' + result.uuid);
  } else {
    resultsMap.set(result.uuid, [result.measurements]);
    debug('Saved new result' + result.uuid);
  }
  return result;
}

// Get/Set SocketId for ScreenId
function delSocketForScreen(screenId) {
  return screenSocketMap.delete(screenId);
}

function getScreenSocketMap() {
  return new Map(screenSocketMap);
}

function getSocketForScreen(screenId) {
  if (!screenSocketMap.has(screenId)) {
    console.log('not there');
    throw Error('Cannot return get socketId: No socket for screen ' + screenId + ' registered.');
  }
  return screenSocketMap.get(screenId);
}

function setSocketForScreen(screenId, socketId) {
  screenSocketMap.set(screenId, socketId);
}

// Check status of screens
function isScreenConfigured(screenId) {
  return config.screens[screenId] !== undefined;
}

function isScreenActive(screenId) {
  return screenSocketMap.has(screenId);
}

// Get all active screens
function getActiveScreens() {
  return screenSocketMap.keys();
}

/**
 * delta e
 */
 function saveDE(dE, calibrationId) {
   if (!calibrations.has(calibrationId)) {
     debug('No calibration with this id (' + calibrationId + ')');
   }
   debug('Add dE values to calibration ' + calibrationId);
   calibrations.get(calibrationId).addDE(dE);
   return calibrations.get(calibrationId);
 }

/* Eva */
function hasEva(name) {
  return evaluations.has(name);
}
function addEva(name, data) {
  evaluations.set(name, data);
  return evaluations.get(name);
}
function addEvaMeasurement(name, color, data) {
  return new Promise(function (resolve, reject) {
    debug('Add Measurement');
    try {
      if(!evaluations.has(name)) {
        evaluations.get(name) = new Map();
      }
      evaluations.get(name).set(color, data);
    } catch(e) {
      reject(e);
    }
    resolve('Saved Measurement');
  });

}

function getEva(name) {
  Object.keys(evaluations).forEach(function(eva) {
    console.log(eva);
  });
  return evaluations.get(name);
}


/*
 * PATH
 */
function setPath(calibrationId, dirPath) {
  calibrations.get(calibrationId).localMaskPath = dirPath;
}
function getPath(calibrationId) {
  return calibrations.get(calibrationId).localMaskPath;
}
