'use strict';

var debug = require('debug')('control-server:calibration-sequence'),
  Promise = require('promise'),
  temp = require('temp'),
  temporal = require('temporal'),
  uuidGen = require('node-uuid');

var async = require('./async.js'),
  cameraControl = require('./camera-control.js'),
  colorConverter = require('./color-converter.js'),
  colorDistance = require('./color-distance.js'),
  config = require('../config.js'),
  imageProcessing = require('./image-processing.js'),
  nvSettings = require('./nv-settings-wrapper.js'),
  session = require('./session.js'),
  socket = require('./socket.js'),
  commonUtils = require('./common-utils.js'),
  cmdUtils = require('./cmd-utils.js');

temp.track();

/*
 * Exports
 */

module.exports = {
  'calcDistancesFromReference': calcDistancesFromReference,
  'calcDeltaEs': calcDeltaEs,
  'calibrate': calibrate,
  'getDifference': getDifference,
  'getDifferences': getDifferences,
  'humanReadableDeltaEs': humanReadableDeltaEs,
  'paramsFromLatestMeasurement': paramsFromLatestMeasurement,
  'singleSample': singleSample,
  'strategyOne': strategyOne,
  'strategyTwo': strategyTwo,
  'strategyThree': strategyThree,
  'measureOnly': measureOnly
};

/**
 * Calculate the euclidian distance of two n-dimensional points
 * @param {array} p1 First point
 */
function calcDistancesFromReference(points, reference) {
  var distances = {},
    referenceLab = colorConverter.sRGBtoLab(reference);

  Object.keys(points).forEach(function(key) {
    var lab = colorConverter.sRGBtoLab(points[key]);
    distances[key] = colorDistance.euclidianDistance(referenceLab, lab);
  });

  return distances;
}


/**
 * Calculate euclidian distances for the result set
 * from one reference point
 * @param {array} reference - Contains the reference value
 * @param {object} points - A object containing the points an their id
 * @param {string} points.id1dea216d-f582-4504-8cef-703abdf51485
 * Get deltaEs for one measurement
 * @param   {[[Type]]} uuid            [[Description]]
 * @param   {[[Type]]} lap             [[Description]]
 * @param   {[[Type]]} referenceScreen [[Description]]
 * @returns {[[Type]]} [[Description]]
 */
function getDifference(uuid, lap, referenceScreen) {
  var measurements = session.getCalibration(uuid).measurements[lap];
  debug(measurements);
  debug('lap ' + lap);
  var differences = {
    'uuid': uuid
  };
  differences.deltaEs = calcDistancesFromReference(measurements[lap],
    measurements[lap][referenceScreen]);
  return differences;
}

/**
 * Get an array of differences for each measurement in a run defined by runUuid
 * @param   {String}       calibrationId         Unique identifier of a run containing the measurements
 * @param   {String}       referenceScreen Identifier of the screen to work as reference
 * @returns {Array[Array]} Returns an array with the differences for each screen
 */
function getDifferences(calibrationId, referenceScreen) {
  var measurements = session.getCalibration(calibrationId).measurements;
  var differences = measurements.map(function(currentValue) {
    return calcDistancesFromReference(currentValue, currentValue[referenceScreen]);
  });
  return differences;
}

function findDarkest(screens, channel) {
  return new Promise( function ( resolve, reject ) {
    try {
      var darkestValue = 255;
      var darkestId = 'y1x1';
      Object.keys(screens).forEach(function compare(screen) {
        var value = screens[screen][channel];
        debug("Screen " + screen + " Value for channel " + channel + " is " + value);
        if(value < darkestValue) {
          darkestValue = value;
          darkestId = screen;
        }
      });
      resolve(darkestId);
    } catch (e) {
      reject(e);
    }
  });
}

function calcDeltaEs(measurements, reference) {
  return new Promise( function ( resolve, reject ) {
    try {
      var referenceLab = colorConverter.sRGBtoLab(reference);
      var deltaEs = {};
      Object.keys(measurements).forEach(function dE(screen) {
        var colorArray = measurements[screen];
        deltaEs[screen] = colorDistance.euclidianDistance(colorConverter.sRGBtoLab(colorArray), referenceLab);
      });
      resolve(deltaEs);
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * measure - Measure the a sample with given filename in the given path
 * @param {String} sampleFilename
 * @param {String} dirPath
 * @return {Promise}
 */
function measure(uuid, sampleFilename, dirPath) {
  debug('Measure image' + sampleFilename);
  var ext;
  if(config.useJPEG) {
    ext = 'jpg';
  } else {
    ext = 'ppm';
  }
  return cmdUtils.spawnLocally('calibtool', ['--load_masks',
      '--path', dirPath, '--input_sample', sampleFilename,
      '--server_address', config.serverURI,
      '--uuid', uuid,
      '--ext', ext
    ])
    .then(function() {
      return {
        'filename': sampleFilename,
        'path': dirPath
      };
    });
}

/**
 * Sample the colour appereance
 */
function sample(uuid, number, workingDir) {
  return new Promise(function(resolve, reject) {
    if (typeof workingDir === 'undefined') {
      debug('Working dir undefined, i should reject');
      reject(new Error('Working dir undefined'));
    } else {
      var sampling = async(function* sampling(file, dir) {
        var image = yield cameraControl.captureAndConvertImage(file, dir);
        yield measure(uuid, image.filename, image.workingDir);
      });
      var filename = 'sample_' + number.toString() + '_' + uuidGen.v4();
      debug('Sample single image' + filename);
      sampling(filename, workingDir).then(resolve, reject);
    }
  });
}


function singleSample(maskPath) {
  return new Promise(function(resolve, reject) {
    socket.setDisplayColor({
      red: 128,
      green: 128,
      blue: 128
    });
    temporal.delay(1200, function() {
      sample(uuidGen.v4(), maskPath).then(resolve, reject);
    });
  });
}

/**
 *
 */
function* calibrationLoop(calibrationObj, limit, referenceScreen) {
  var i,
    sequence = async(calibrationSequence),
    result;
  for (i = 0; i < limit; i++) {
    result = yield sequence(calibrationObj, referenceScreen, factorTypeOne(i, limit));
  }
  return result;
}

function factorTypeOne(lap, limit) {
  if(limit === 1 || lap < 1) {
    return 1;
  }
  var factor = 1 - ((lap - 1) * (1 / limit));
  factor = Math.max(factor, 0.1);
  debug('Run ' + lap + ' Factor ' + factor );
  return factor;
}

function strategyThree(calibrationObj, laps, referenceScreen) {
  return new Promise(function(resolve, reject) {
    debug('Starting Loop for calibration ' + calibrationObj);
    var looping = async(calibrationLoop);
    looping(calibrationObj, laps, referenceScreen).then(
      function() {
        debug('Looping resolved');
        resolve('Sample loop successful');
      },
      function(err) {
        debug('Looping rejected ' + err + err.message + err.stack);
        reject(new Error('Could not run calibration loop'));
      });
  });
}

function paramsFromLatestMeasurement(calibrationUUID, referenceScreen) {
  var c = session.getCalibration(calibrationUUID),
    m = c.measurements[c.measurements.length - 1];

  return calcDeltaEs(m.screens, m.screens[referenceScreen]).then(
    function (deltaEs) {
      debug(deltaEs);
      return nvSettings.calcParameters(deltaEs, m.screens,
        m.screens[referenceScreen], c.parameters);
    });
}

function humanReadableDeltaEs(deltaEs) {
  var output;
  Object.keys(deltaEs).forEach(function eachScreen(screen) {
    var p = deltaEs[screen];
    output += '\n' + 'Screen: ' + screen + ': ' + p + '\n';
  });
  return output;
}

function calibrate(calibrationObj, referenceScreen) {
  var looping = async(calibrationLoop);
  return looping(calibrationObj, 1, referenceScreen);
}

/**
 * Control the calibration sequence - Generator.
 * Use the Interator function next or the "async"
 * wrapper function to execute this function.
 */
function* calibrationSequence ( calibrationData, referenceScreen, factor ) {
  if ( typeof calibrationData === 'undefined' ) {
    throw 'A calibration object is required to start';
  } else if ( typeof calibrationData.uuid !== 'string' || calibrationData.uuid === '') {
    debug(typeof calibrationData.uuid);
    throw 'The supplied calibration object must have a uuid';
  }
  var calibrationTargetColor = {
    red: 160,
    green: 160,
    blue: 160
  };
  //--------------------------------
  var asyncMaskCreation = async(imageProcessing.maskCreationGenerator),
    promiseTempDir, // will be used to create a temp dir
    promiseMaskImages, //will be used to create Masks
    promiseMaskProcessing, //use calibtool to process mask images
    promiseMeasurement, // use calibtool to measure the colors
    promiseDeltaEs, // the delta E values for the measurements and the reference above
    promiseCapture,
    promiseNVParameters, // the params for the nvidia-settings command
    promiseNVSettings, // use nvidia-settings on the remote machines
    sampleFilename, //filename to capture
    sampleMeasurement; //the measurements from the current sample

  debug('Init calibration sequence with reference ' + referenceScreen);
  //--------------------------------
  if ( calibrationData.localMaskPath !== '' && calibrationData.masksReady ) {
    debug('Masks ready and path supplied');
  } else {
    debug('Masks must be created');
    debug('Create temp dir');
    // yield temp dir
    promiseTempDir = yield commonUtils.makeTempDir(calibrationData.uuid);
    calibrationData.localMaskPath = promiseTempDir;
    debug('Create mask images');
    // yield images for the masks
    // promiseMaskImages = yield takeMaskImages(calibrationData.localMaskPath);
    promiseMaskImages = yield asyncMaskCreation(calibrationData);
    debug(promiseMaskImages);
    debug('Process mask images');
    // yield mask processing from calibtool
    promiseMaskProcessing = yield imageProcessing.identifyScreens(calibrationData.localMaskPath,
      calibrationData.uuid);
    debug(promiseMaskProcessing);
    // verify that masks are ready TODO: verify this is working
    // masksReady is set by the api if calibtool above uploads the results
    if (!calibrationData.masksReady) {
      throw 'Could not create masks, but they are required to continue';
    }
  }// end ad-hoc mask creation

  debug('Start calibration sequence');
  //--------------------------------
  debug('Set display color');
  // yield when the color has been Set
  yield socket.setDisplayColorAndWait(calibrationTargetColor);
  debug('Display Color changed');
  sampleFilename = uuidGen.v4();
  debug('Take sample');
  //yield gphoto capture and download and conversion
  promiseCapture = yield cameraControl.captureAndConvertImage(sampleFilename,
    calibrationData.localMaskPath);
  debug('Measure sample');
  // calibtool color measurement
  promiseMeasurement = yield measure(calibrationData.uuid,
                                      sampleFilename,
                                      calibrationData.localMaskPath);
  debug(promiseMeasurement);
  //TODO: Verify upload of measurements results. The filename can be used to identify
  //      the upload. For now we just download the the latest measurement
  sampleMeasurement = calibrationData.latestMeasurement();
  debug('The latest measurement has values for screen ' + sampleMeasurement);
  //this trows if no measurement is available
  //TODO: Do not hard-code the reference screen
  debug('Calculate dE values');
  //yield dE values for all screens
  promiseDeltaEs = yield calcDeltaEs(sampleMeasurement.screens,
                                      sampleMeasurement.screens[referenceScreen]);
  debug(promiseDeltaEs);
  debug('Save dE values');
  calibrationData.addDE(promiseDeltaEs);
  debug('Calc nvidia-settings paramters');
  //yield paramaters for the nvidia settings tool
  promiseNVParameters = yield nvSettings.calcParameters(promiseDeltaEs,
                                                        sampleMeasurement.screens,
                                                        sampleMeasurement.screens[referenceScreen],
                                                        calibrationData.parameters, factor);
  debug(promiseNVParameters);
  debug('Apply screen correction with nvidia settings tool');
  //yield when all settings have been applied
  promiseNVSettings = yield nvSettings.applyParametersAndWait(promiseNVParameters);
  debug(promiseNVSettings);
  debug('Save parameters');
  calibrationData.parameters = promiseNVParameters;
}

function* maskCreation(calibrationData) {
  var asyncImgProcMaskCreation = async(imageProcessing.maskCreationGenerator),
    promiseTempDir;
  debug('Create temp dir');
  // yield temp dir
  promiseTempDir = yield commonUtils.makeTempDir(calibrationData.uuid);
  calibrationData.localMaskPath = promiseTempDir;
  debug('Create mask images');
  // yield images for the masks
  yield asyncImgProcMaskCreation(calibrationData);
  debug('Process mask images');
  // yield mask processing from calibtool
  yield imageProcessing.identifyScreens(calibrationData.localMaskPath,
    calibrationData.uuid);
  debug('Images processed');
  // verify that masks are ready TODO: verify this is working
  // masksReady is set by the api if calibtool above uploads the results
  if (!calibrationData.masksReady) {
    throw new Error('Mask creation failed');
  }
}

function* feedbackSequence(calibrationData, reference, channel, factor) {
  var sampleFilename,
    sampleMeasurement;

  var promiseDeltaEs,
      promiseNVParameters;
  debug('Take sample');
  sampleFilename = uuidGen.v4();

  yield cameraControl.captureAndConvertImage(sampleFilename,
    calibrationData.localMaskPath);
  debug('Measure sample');
  // calibtool color measurement
  yield measure(calibrationData.uuid,
                sampleFilename,
                calibrationData.localMaskPath);
  //TODO: Verify upload of measurements results. The filename can be used to identify
  //      the upload. For now we just download the the latest measurement
  sampleMeasurement = calibrationData.latestMeasurement();
  debug('The latest measurement has values for screen ' + sampleMeasurement);
  //this trows if no measurement is available
  //find darkest screen

  debug('Calculate dE values');
  //yield dE values for all screens
  promiseDeltaEs = yield calcDeltaEs(sampleMeasurement.screens,
                    sampleMeasurement.screens[reference]);

  debug('Save dE values');
  calibrationData.addDE(promiseDeltaEs);

  debug('Calc nvidia-settings paramters');
  //yield paramaters for the nvidia settings tool
  if(channel) {
    promiseNVParameters = yield nvSettings.calcParametersAlternative(promiseDeltaEs,
                                                        sampleMeasurement.screens,
                                                        sampleMeasurement.screens[reference],
                                                        calibrationData.parameters,
                                                        channel);
  } else {
    promiseNVParameters = yield nvSettings.calcParametersAlternative2(promiseDeltaEs,
                                                        sampleMeasurement.screens,
                                                        sampleMeasurement.screens[reference],
                                                        calibrationData.parameters,
                                                        factor);
  }

  debug('Apply screen correction with nvidia settings tool');
  //yield when all settings have been applied
  yield nvSettings.applyParametersAndWait(promiseNVParameters);

  debug('Save parameters');
  calibrationData.parameters = promiseNVParameters;
}

function* feedbackLoop(calibrationData, reference, channel, limit) {
  var i,
    sequence = async(feedbackSequence),
    result;
  for (i = 0; i < limit; i++) {
    result = yield sequence(calibrationData, reference, channel, factorTypeOne(i, limit));
  }
  return result;
}

/**
 * Control the calibration sequence - Generator.
 * Use the Interator function next or the "async"
 * wrapper function to execute this function.
 */
function* calibrationSequenceAlternative ( calibrationData, laps ) {
  if ( typeof calibrationData === 'undefined' ) {
    throw 'A calibration object is required to start';
  } else if ( typeof calibrationData.uuid !== 'string' || calibrationData.uuid === '') {
    debug(typeof calibrationData.uuid);
    throw 'The supplied calibration object must have a uuid';
  }
  //--------------------------------
  var asyncMaskCreation = async(maskCreation),
      asyncControlLoop = async(feedbackLoop);

  var sampleFilename,
      sampleMeasurement;

  var redReference = 'y1x1',
  blueReference = 'y1x1',
  greenReference = 'y1x1';

  var red = {
    red: 255,
    green: 0,
    blue: 0
  };
  var green = {
    red: 0,
    green: 255,
    blue: 0
  };
  var blue = {
    red: 0,
    green: 0,
    blue: 255
  };

  debug('Init calibration');
  //--------------------------------
  if ( calibrationData.localMaskPath !== '' && calibrationData.masksReady ) {
    debug('Masks ready and path supplied');
  } else {
    yield asyncMaskCreation(calibrationData);
  }

  debug('Start calibration sequence');

  debug("Red Channel");
  // yield when the color has been Set
  yield socket.setDisplayColorAndWait(red);

  debug('Take sample');
  sampleFilename = uuidGen.v4();
  yield cameraControl.captureAndConvertImage(sampleFilename,
    calibrationData.localMaskPath);

  debug('Measure sample');
  // calibtool color measurement
  yield measure(calibrationData.uuid,
                sampleFilename,
                calibrationData.localMaskPath);

  //TODO: Verify upload of measurements results. The filename can be used to identify
  //      the upload. For now we just download the the latest measurement
  sampleMeasurement = calibrationData.latestMeasurement();
  debug('The latest measurement has values for screen ' + sampleMeasurement);


  redReference = yield findDarkest(sampleMeasurement.screens, 0);
  debug('Use screen id: ' + redReference);
  yield asyncControlLoop(calibrationData, redReference, 0, laps);


  debug("Blue Channel");
  yield socket.setDisplayColorAndWait(green);

  debug('Take sample');
  sampleFilename = uuidGen.v4();
  yield cameraControl.captureAndConvertImage(sampleFilename,
    calibrationData.localMaskPath);

  debug('Measure sample');
  // calibtool color measurement
  yield measure(calibrationData.uuid,
                sampleFilename,
                calibrationData.localMaskPath);

  //TODO: Verify upload of measurements results. The filename can be used to identify
  //      the upload. For now we just download the the latest measurement
  sampleMeasurement = calibrationData.latestMeasurement();
  debug('The latest measurement has values for screen ' + sampleMeasurement);
  greenReference = yield findDarkest(sampleMeasurement.screens, 1);
  debug('Use screen id: ' + greenReference);
  yield asyncControlLoop(calibrationData, greenReference, 1, laps);

  debug("Blue Channel");
  yield socket.setDisplayColorAndWait(blue);

  debug('Take sample');
  sampleFilename = uuidGen.v4();
  yield cameraControl.captureAndConvertImage(sampleFilename,
    calibrationData.localMaskPath);

  debug('Measure sample');
  // calibtool color measurement
  yield measure(calibrationData.uuid,
                sampleFilename,
                calibrationData.localMaskPath);

  //TODO: Verify upload of measurements results. The filename can be used to identify
  //      the upload. For now we just download the the latest measurement
  sampleMeasurement = calibrationData.latestMeasurement();
  debug('The latest measurement has values for screen ' + sampleMeasurement);
  blueReference = yield findDarkest(sampleMeasurement.screens, 2);
  debug('Use screen id: ' + blueReference);
  asyncControlLoop(calibrationData, blueReference, 2, laps);
  //yield asyncControlLoop(calibrationData, 'green');
  //asyncControlLoop(calibrationData, 'blue');
}

function strategyOne(calibrationData, laps, s) {
  return new Promise(function(resolve, reject) {
    debug('Starting Strategy One for calibration ' + calibrationData);
    var strategy = async(calibrationSequenceAlternative);
    strategy(calibrationData, laps, s).then(
      function(result) {
        debug('Strategy one finished' + result);
        resolve('Strategy one finished');
      },
      function(err) {
        debug('Rejected ' + err + err.message + err.stack);
        reject(new Error('Could not run strategy one'));
      });
  });
}

/**
 * Control the calibration sequence - Generator.
 * Use the Interator function next or the "async"
 * wrapper function to execute this function.
 */
function* calibrationSequenceTwo ( calibrationData, laps ) {
  if ( typeof calibrationData === 'undefined' ) {
    throw 'A calibration object is required to start';
  } else if ( typeof calibrationData.uuid !== 'string' || calibrationData.uuid === '') {
    debug(typeof calibrationData.uuid);
    throw 'The supplied calibration object must have a uuid';
  }
  //--------------------------------
  var asyncMaskCreation = async(maskCreation),
      asyncControlLoop = async(feedbackLoop);

  var sampleFilename,
      sampleMeasurement;

  var redReference = 'y1x1';

  var grey = {
    red: 192,
    green: 192,
    blue: 192
  };

  debug('Init calibration');
  //--------------------------------
  if ( calibrationData.localMaskPath !== '' && calibrationData.masksReady ) {
    debug('Masks ready and path supplied');
  } else {
    yield asyncMaskCreation(calibrationData);
  }

  debug('Start calibration sequence');

  debug("Grey");
  // yield when the color has been Set
  yield socket.setDisplayColorAndWait(grey);

  debug('Take sample');
  sampleFilename = uuidGen.v4();
  yield cameraControl.captureAndConvertImage(sampleFilename,
    calibrationData.localMaskPath);

  debug('Measure sample');
  // calibtool color measurement
  yield measure(calibrationData.uuid,
                sampleFilename,
                calibrationData.localMaskPath);

  //TODO: Verify upload of measurements results. The filename can be used to identify
  //      the upload. For now we just download the the latest measurement
  sampleMeasurement = calibrationData.latestMeasurement();
  debug('The latest measurement has values for screen ' + sampleMeasurement);


  redReference = yield findDarkest(sampleMeasurement.screens, 0);
  debug('Use screen id: ' + redReference);
  asyncControlLoop(calibrationData, redReference, false, laps);
}

function strategyTwo(calibrationData, laps) {
  return new Promise(function(resolve, reject) {
    debug('Starting Strategy Two for calibration ' + calibrationData);
    var strategy = async(calibrationSequenceTwo);
    strategy(calibrationData, laps).then(
      function(result) {
        debug('Strategy two finished' + result);
        resolve('Strategy two finished');
      },
      function(err) {
        debug('Rejected ' + err + err.message + err.stack);
        reject(new Error('Could not run strategy two'));
      });
  });
}

function* measureOne(calibrationData, color, name) {
  var sampleFilename, sampleMeasurement, promiseDeltaEs;
  debug("Red Channel");
  // yield when the color has been Set
  yield socket.setDisplayColorAndWait(color);

  debug('Take sample');
  sampleFilename = name + 'r' + color.red + "g" + color.green + 'b' + color.blue + uuidGen.v4();
  yield cameraControl.captureAndConvertImage(sampleFilename,
    calibrationData.localMaskPath);
  debug('Measure sample');
  // calibtool color measurement
  yield measure(calibrationData.uuid,
                sampleFilename,
                calibrationData.localMaskPath);
  //TODO: Verify upload of measurements results. The filename can be used to identify
  //      the upload. For now we just download the the latest measurement
  sampleMeasurement = calibrationData.latestMeasurement();
  debug('The latest measurement has values for screen ' + sampleMeasurement);
  //this trows if no measurement is available
  //find darkest screen

  debug('Calculate dE values');
  //yield dE values for all screens
  promiseDeltaEs = yield calcDeltaEs(sampleMeasurement.screens,
                    sampleMeasurement.screens['y3x2']);

  debug('Save dE values');
  session.addEvaMeasurement(name, color, promiseDeltaEs);
  debug('Done: measureOne');
}

function* measureSequence(calibrationData, name) {
  var asyncMeasure = async(measureOne);
  yield asyncMeasure(calibrationData, { red: 255, green: 0, blue: 0}, name);
  yield asyncMeasure(calibrationData, { red: 0, green: 255, blue: 0}, name);
  yield asyncMeasure(calibrationData, { red: 0, green: 0, blue: 255}, name);
  yield asyncMeasure(calibrationData, { red: 0, green: 255, blue: 255}, name);
  yield asyncMeasure(calibrationData, { red: 255, green: 255, blue: 0}, name);
  yield asyncMeasure(calibrationData, { red: 127, green: 0, blue: 255}, name);
  yield asyncMeasure(calibrationData, { red: 0, green: 127, blue: 0}, name);
  yield asyncMeasure(calibrationData, { red: 0, green: 0, blue: 127}, name);
  yield asyncMeasure(calibrationData, { red: 0, green: 127, blue: 127}, name);
  yield asyncMeasure(calibrationData, { red: 127, green: 127, blue: 0}, name);
  yield asyncMeasure(calibrationData, { red: 127, green: 0, blue: 127}, name);
  yield asyncMeasure(calibrationData, { red: 33, green: 10, blue: 56}, name);
  yield asyncMeasure(calibrationData, { red: 66, green: 23, blue: 77}, name);
  yield asyncMeasure(calibrationData, { red: 77, green: 250, blue: 10}, name);
  yield asyncMeasure(calibrationData, { red: 110, green: 222, blue: 28}, name);
  yield asyncMeasure(calibrationData, { red: 255, green: 255, blue: 255}, name);
  asyncMeasure(calibrationData, { red: 0, green: 0, blue: 0}, name);
}

function measureOnly(calibrationData, name) {
  return new Promise(function(resolve, reject) {
    debug('Starting Measurement' + calibrationData);
    var strategy = async(measureSequence);
    strategy(calibrationData, name).then(
      function(result) {
        resolve('Measurement one finished' + result);
      },
      function(err) {
        reject(new Error('Could not run Measurement one' + err));
      });
  });
}
