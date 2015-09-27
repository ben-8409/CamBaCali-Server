'use strict';

// Node Modules
var debug = require('debug')('calib:control'),
  nodeUuid = require('node-uuid'),
  router = require('express').Router();

// Local Modules
var config = require('../config.js'),
  commonUtils = require('../lib/common-utils.js'),
  session = require('../lib/session.js');

/* /control */

router.get('/', function (req, res) {
  res.render('ui/index', {
    title: 'Start',
    short: 'start'
  });
});

router.get('/calibration/:uuid?', function (req, res) {
  var calibration = session.hasCalibration(req.params.uuid) ?
    session.getCalibration(req.params.uuid)
    : session.createCalibration();
  var screenIds = commonUtils.screenIdsArray(config.screens);
  res.render('ui/calibration', {
    title: 'Calibration',
    short: 'calibration',
    calibration: calibration,
    screenIds: screenIds
  });
});
router.get('/calibration/:uuid/results', function (req, res) {
  var calibration = session.getCalibration(req.params.uuid);
  var measurements = calibration.measurements.length > 0 ?
    calibration.measurements[calibration.measurements.length - 1] :
    undefined;
  res.render('ui/results', {
    title: 'Control interface > Results',
    calibrationId: calibration.uuid,
    screens: measurements
  });
});

router.get('/colors', function (req, res) {
  var screenColors = {},
    screens = [];
  Object.keys(config.screens).forEach(function generateColors(screen) {
    screens.push(screen);
    screenColors[screen] = [255, 255, 255];
  });
  res.render('ui/colors', {
    title: 'Colors',
    screens: JSON.stringify(screens),
    colors: screenColors,
    short: 'colors'
  });
});

router.get('/results', function (req, res) {
  var latestResult = session.getLatestResult();
  if (latestResult === undefined) {
    res.render('ui/results', {
      title: 'Results'
    });
  } else {
    debug(latestResult.uuid);
    res.render('ui/results', {
      title: 'Results',
      screens: latestResult.measurements,
      deltaEs: latestResult.deltaEs,
      uuid: latestResult.uuid
    });

  }
});

router.get('/evaluate', function (req, res) {
  res.render('ui/evaluate', {
    title: 'Evaluation (beta)',
    short: 'evaluate'
  });
});


router.get('/tools', function (req, res) {
  res.render('ui/tools', {
    title: 'Tools',
    short: 'tools',
    calibrationUuid: nodeUuid.v4()
  });
});

module.exports = router;
