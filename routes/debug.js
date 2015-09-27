/*jslint node: true, esnext: true*/
'use strict';

/*
 * Node Modules
 */
var bodyParser = require('body-parser'),
  debug = require('debug')('control-server:api-router'),
  path = require('path'),
  router = require('express').Router();

/*
 * File Modules
 */
var calibration = require('../local-modules/calibration.js'),
  cameraControl = require('../local-modules/camera-control.js'),
  colorCorrection = require('../local-modules/color-corrector.js'),
  config = require('../config.js'),
  rfc4122 = require('../local-modules/rfc4122-uuid.js'),
  scriptGenerator = require('../local-modules/script-generator.js'),
  session = require('../local-modules/session.js'),
  socket = require('../local-modules/socket.js'),
  utils = require('../local-modules/utils.js');

//parse json
router.use(bodyParser.json());

/*
 * Parameters
 */
router.param('uuid', function(req, res, next, uuid) {
  if (!session.hasResult(uuid)) {
    res.status(404).send('No result ' + uuid + ' saved.');
  }
  req.uuid = uuid;
  next();
});
router.param('screenId', function(req, res, next, screenId) {
  if(config.screens.has(screenId)) {
    req.screen = screenId;
    next();
  } else {
    res.status(404).send('No screen ' + screenId + ' configured.');
  }
});

/*
 * Controlling the Camera and CV programs
 */
router.get('/camera/auto-detect', function(req, res) {
  cameraControl.autoDetect().then(function(result) {
    res.send(result);
  }, function(err) {
    debug(err);
    res.status(500).send(err.message);
  });
});

router.post('/camera/createMasks', function(req, res) {
  if (!req.body.calibrationId) {
    res.sendStatus(400);
  } else {
    calibration.detectScreens(req.body.calibrationId).then(function(result) {
      debug('Masks created');
      socket.calibrationStatusUpdate('mask-creation-successfull', { 'uuid': req.body.calibrationId, 'result': result});
    }, function (err) {
      debug('Could not create masks');
      debug('Reason : ' + err);
      socket.calibrationStatusUpdate('mask-creation-failed', {'uuid': req.body.calibrationId, 'error': err});
    });
    res.send('Started screen detection');
  }
});

router.post('/camera/sample', function(req, res) {
  var maskPath = session.getCurrentPath();
  if (req.body && req.body.maskPath !== undefined) {
    maskPath = req.body.maskPath;
    debug('Path set by user to ' + maskPath);
  }
  if (!maskPath) {
    res.status(500).send('No path found or set!');
  } else {
    calibration.singleSample(maskPath)
      .then(function success(result) {
        res.send(result.stdout);
      }, function error(err) {
        res.status(500).send(err.stderr);
      });
  }
});


/**
 * Looping of colors
 */
router.post('/loopColors/start', function(req, res) {
  console.log('Recieved request to loop through colors.');
  socket.loopRandomColors();
  res.send('Looping initiated\n');
});
router.post('/loopColors/stop', function(req, res) {
  socket.stopLoop();
  res.send('Looping stopped\n');
});

/*
 * Results
 */
router.post('/results', function(req, res) {
  if (!req.body || Object.keys(req.body).length === 0) {
    debug(req.body);
    return res.status(400).send('No valid data supplied.');
  }
  var result = session.addResult(req.body);
  socket.announceResult(req.body);
  debug('Result saved with value ' + result.uuid);
  res.send(result.uuid);
});

router.post('/results/:uuid', function(req, res) {
  var result = session.addResult(req.body);
  socket.announceResult(result);
  debug('Result saved with value ' + result.uuid);
  res.send(result.uuid);
});

router.get('/results/:uuid', function(req, res) {
  debug('Request for result ' + req.uuid);
  res.json(session.getResult(req.uuid));
});

/*
 * DeltaEs
 */
// TODO: deprecated function
router.get('/results/:uuid/reference/:screenId', function(req, res) {
  var measurements = session.getResult(req.uuid);
  res.json(calibration.getDifference(req.uuid, measurements.length, req.screen));
});

router.get('/deltaEs/:uuid/reference/:screenId', function(req, res) {
  res.json(calibration.getDifferences(req.uuid, req.screen));
});

/*
 * (Physical) Screens
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
router.use('/screens/kill', function(req, res) {
  var hosts = utils.getHostnames(config.screens);
  hosts.forEach(function(host) {
    var cmd = scriptGenerator.killCmd(host);
    console.log(host);
    utils.executeWithSSH(cmd, config.screensUser, host)
      .then(null, function(err) {
        debug(err);
      });
  });
  res.send('Done');
});
// Start the display components on the screens (browser)
router.use('/screens/start', function(req, res) {
  var screensForHosts = utils.groupScreensByHostname(config.screens);
  screensForHosts.forEach(function(screens, hostname) {
    var cmd = '';
    debug('starting screens on host ' + hostname);
    screens.forEach(function(screen) {
      cmd += scriptGenerator.startCmdForScreen(screen) + '\; ';
    });
    debug('cmd is: ' + cmd);
    utils.executeWithSSH('"' + cmd + '"', config.screensUser, hostname)
      .then(function(result) {
        debug('Ok (' + hostname + ': ' + result);
      }, function(err) {
        debug(err);
      });
  });
  res.send('Ok.');
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
router.post('/screens/:screenId/setBrightnessCorrection', function(req, res) {
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).send('No valid data supplied.');
  } else {
    colorCorrection.setColorCorrection(req.screen, req.body.channel, req.body.value);
    res.send('Applying color correction');
  }
});

/**
 * Set the color for all currently active sceens
 */
router.post('/setColor', function(req, res) {
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

module.exports = router;
