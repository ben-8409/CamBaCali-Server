'use strict';

/*
 * Node Modules
 */
var bodyParser = require('body-parser'),
  debug = require('debug')('control-server:api'),
  path = require('path'),
  router = require('express').Router(),
  uuidGen = require('node-uuid');

/*
 * File Modules
 */
var calibration = require('../lib/calibration.js'),
  cameraControl = require('../lib/camera-control.js'),
  config = require('../config.js'),
  scriptGenerator = require('../lib/script-generator.js'),
  session = require('../lib/session.js'),
  socket = require('../lib/socket.js'),
  commonUtils = require('../lib/common-utils.js'),
  cmdUtils = require('../lib/cmd-utils.js'),
  nvSettings = require('../lib/nv-settings-wrapper.js');

//parse forms
router.use(bodyParser.urlencoded({ extended: false }));
//parse json
router.use(bodyParser.json());

/*
 * Parameters
 */
router.param('uuid', function (req, res, next, uuid) {
  if (!session.hasCalibration(uuid)) {
    res.status(404).send('No calibration ' + uuid + ' saved.');
  }
  req.uuid = uuid;
  next();
});
router.param('screenId', function(req, res, next, screenId) {
  if(config.screens.hasOwnProperty(screenId)) {
    req.screen = screenId;
    next();
  } else {
    res.status(404).send('No screen ' + screenId + ' configured.');
  }
});
router.param('name', function(req, res, next, name) {
  if (!session.hasEva(name)) {
    res.status(404).send('No evaluation ' + name + ' saved.');
  }
  req.name = name;
  next();
});
/*
 * Controll the calibration
 */
// get existing calibrations
router.get('/calibrations', function (req, res) {
  res.setStatus(500).send('Not yet implemented');
});
// upload an existing calibration
router.put('/calibrations', function (req, res) {
  var uploadedCalibration = session.uploadCalibration(req.body);
  res.json(uploadedCalibration);
});
// get an existing
router.get('/calibrations/:uuid', function (req, res) {
  res.json(session.getCalibration(req.uuid).toObject());
});
// notify of mask processing
router.post('/calibrations/:uuid/masksReady', function (req, res) {
  session.getCalibration(req.uuid).masksReady = true;
  res.sendStatus(200);
});
// upload a measurement
router.post('/calibrations/:uuid/measurement', function (req, res) {
  if(!req.body) {
    return res.sendStatus(400);
  }
  var curCalibration = session.saveMeasurement(req.body, req.uuid);
  res.send('Saved measurement for calibration id ' + curCalibration.uuid);
});
// upload a measurement
router.post('/calibrations/:uuid/measure', function (req, res) {
  var measurement = calibration.measureOnly(session.getCalibration(req.uuid));
  measurement.then(function(result) { debug('Measurement finished ' + result);
}, function(err) { debug(err);});
  res.send('Started measurement for calibration id ' + req.uuid);
});
// upload a measurement
router.get('/calibrations/:uuid/deltaEs', function (req, res) {
  var dE = session.getCalibration(req.uuid).deltaEs;
  if(req.body && req.body.exportTo && req.body.exportTo === 'CSV') {
    return res.send(commonUtils.convertDeltaEtoCSV(dE, config.screens));
  }
    res.json(dE);
});
// start loop
/*router.post('/calibrations/:uuid/start', function (req, res) {
  if(!req.body || !req.body.laps || !req.body.referenceScreen) {
    return res.sendStatus(400);
  }
  var curCalibration = session.getCalibration(req.uuid);
  calibration.loop(curCalibration, req.body.laps, req.body.referenceScreen).then(function (result) {
    debug('Looping resolved');
    socket.calibrationStatusUpdate({ 'uuid': curCalibration.uuid, 'result': result});
  }, function (err) {
    debug('Looping rejected');
    socket.calibrationStatusUpdate({'uuid': curCalibration.uuid, 'error': err});
  });
  res.send('Calibration loop started');
});*/
//TODO: deprecate
router.post('/calibrations/start', function (req, res) {
  var requiredFields = ['laps', 'calibrationId', 'referenceScreen', 'strategy'];
  debug(JSON.stringify(req.body, null, 2));
  var missing = requiredFields.filter(function (value) {
    if(!req.body[value]) {
      debug('Required data not supplied: ' + value);
      return true;
    } else {
      return false;
    }
  });
  if(missing.length > 0) {
    return res.status(400).send('Missing fields :' + missing);
  }
  var curCalibration = session.getCalibration(req.body.calibrationId);
  if(req.body.strategy === 'one') {
    calibration.strategyOne(curCalibration, req.body.laps).then(function (result) {
      debug('Strategy one resolved');
      socket.calibrationStatusUpdate({ 'uuid': curCalibration.uuid, 'result': result});
    }, function (err) {
      debug('Strategy one rejected');
      socket.calibrationStatusUpdate({'uuid': curCalibration.uuid, 'error': err});
    });
    res.send('Strategy one started');
  } else if(req.body.strategy === 'two') {
    calibration.strategyTwo(curCalibration, req.body.laps).then(function (result) {
      debug('Strategy two resolved');
      socket.calibrationStatusUpdate({ 'uuid': curCalibration.uuid, 'result': result});
    }, function (err) {
      debug('Strategy two rejected');
      socket.calibrationStatusUpdate({'uuid': curCalibration.uuid, 'error': err});
    });
    res.send('Strategy two started');
  } else if(req.body.strategy === 'three'){
    calibration.strategyThree(curCalibration, req.body.laps, req.body.referenceScreen).then(function (result) {
      debug('Looping resolved');
      socket.calibrationStatusUpdate({ 'uuid': curCalibration.uuid, 'result': result});
    }, function (err) {
      debug('Looping rejected');
      socket.calibrationStatusUpdate({'uuid': curCalibration.uuid, 'error': err});
    });
    res.send('Default Calibration loop started');
  }

});

/*
 * Controlling the Camera and CV programs
 */
router.use('/camera/auto-detect', function(req, res) {
  cameraControl.autoDetect().then(function(result) {
    res.send(result);
  }, function(err) {
    debug(err);
    res.status(500).send(err.message);
  });
});
router.post('/camera/capture', function(req, res) {
  var filename;
  if (!req.body.filename) {
    debug('Generate UUID for file');
    filename = uuidGen.v4();
  } else {
    filename = req.body.filename;
  }
  var makeTempDir = function() {
      return commonUtils.makeTempDir('test-image-' + uuidGen.v4());
    },
    captureImage = function(dirPath) {
      return cameraControl.captureAndConvertImage(path.join(dirPath, filename), dirPath);
    },
    resolved = function(result) {
      res.send(result);
    },
    rejected = function(err) {
      res.status(500).send(err.message);
    };
  //promise chain starts here
  makeTempDir()
    .then(captureImage)
    .then(resolved, rejected);
});

/*
 * DeltaEs
 */
router.get('/deltaEs/:uuid/reference/:screenId', function(req, res) {
  res.json(calibration.getDifferences(req.uuid, req.screen));
});

/*
 * Measurements
 */
router.post('/evaluate/start', function (req, res) {
  var requiredFields = ['calibrationId', 'name'];
  debug(JSON.stringify(req.body, null, 2));
  var missing = requiredFields.filter(function (value) {
    if(!req.body[value]) {
      debug('Required data not supplied: ' + value);
      return true;
    } else {
      return false;
    }
  });
  if(missing.length > 0) {
    return res.status(400).send('Missing fields :' + missing);
  }
  var measurement = calibration.measureOnly(session.getCalibration(req.body.calibrationId), req.body.name);
  measurement.then(function(result) { debug('Measurement finished ' + result);
}, function(err) { debug(err);});
  res.send('Started measurement for calibration id ' + req.uuid);
});
// get an existing
router.get('/evaluate/results/:name', function (req, res) {
  res.json(session.getEva(req.name));
});
router.use('/evaluate/results', function (req, res) {
  var requiredFields = ['name'];
  debug(JSON.stringify(req.body, null, 2));
  var missing = requiredFields.filter(function (value) {
    if(!req.body[value]) {
      debug('Required data not supplied: ' + value);
      return true;
    } else {
      return false;
    }
  });
  if(missing.length > 0) {
    return res.status(400).send('Missing fields :' + missing);
  }
  debug(req.body.name + " Data: " + session.getEva(req.body.name));
  res.json(session.getEva(req.body.name));
});

/*
 * Screens
 */
router.get('/screens', function(req, res) {
  var json = {};
  json.screens = [];
  Object.keys(config.screens).forEach(function(id) {
    json.screens.push(id);
  });
  res.json(json);
});
// Kill the display component on all machines
router.post('/screens/kill', function(req, res) {
  var hosts = commonUtils.getHostnames(config.screens);
  hosts.forEach(function(host) {
    var cmd = scriptGenerator.killCmd(host);
    console.log(host);
    cmdUtils.executeRemotely(cmd, config.screensUser, host)
      .then(null, function(err) {
        debug(err);
      });
  });
  res.send('In process.');
});
// reset the screen paramters
router.post('/screens/reset', function (req, res) {
  nvSettings.resetScreens();
  res.send('In process. May take some seconds!');
});
// Start the display components on the screens (browser)
router.post('/screens/start', function(req, res) {
  var screensForHosts = commonUtils.groupScreensByHostname(config.screens);
  screensForHosts.forEach(function(screens, hostname) {
    var cmd = '';
    debug('starting screens on host ' + hostname);
    screens.forEach(function(screen) {
      cmd += scriptGenerator.startCmdForScreen(screen) + '\; ';
    });
    debug('cmd is: ' + cmd);
    cmdUtils.executeRemotely('"' + cmd + '"', config.screensUser, hostname)
      .then(function(result) {
        debug('Ok (' + hostname + ': ' + result);
      }, function(err) {
        debug(err);
      });
  });
  res.send('In process.');
});
router.post('/screens/:screenId/highlight', function(req, res) {
  console.log('Highlight ' + req.screen);
  socket.highlightScreen(req.screen);
  res.send('Ok\n');
});
router.post('/screens/:screenId/setColor', function(req, res) {
  console.log('Change color for ' + req.screen + ' to ' + req.body);
  if (!req.body) {
    return res.status(400).send('No valid data supplied.');
  }
  socket.setScreenColor(req.screen, req.body);
  res.send('Success: Set Color\n');
});
//TODO
router.post('/screens/:screenId/setBrightnessCorrection', function(req, res) {
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).send('No valid data supplied.');
  } else {
    nvSettings.applyParametersToSingleScreenAndWait(req.screen, req.body);
    res.send('Applying color correction');
  }
});

/**
 * Set the color for all currently active sceens
 */
router.post('/screens/setColor', function(req, res) {
  debug('Set color ' + req.body);
  if (!req.body || Object.keys(req.body).length === 0) {
    debug(req.body);
    return res.status(400).send('No valid data supplied.');
  }
  if (req.body.screen && req.body.screen !== '') {
    debug('Set color: Screen id supplied ' + req.body.screen);
    socket.setScreenColor(req.body.screen, req.body);
  } else {
    debug('Set color: No Screen id, set full display to' + req.body);
    socket.setDisplayColor(req.body);
  }
  res.send('Success: Set Color\n');
});

/*
 * Exports
 */
module.exports = router;
