'use strict';

var router = require('express').Router(),
    config = require('../config.js'),
    scriptGenerator = require('../lib/script-generator.js');

router.param('screenId', function (req, res, next, screenId) {
  if(!config.screens[screenId]) {
    res.status(404).send('Screen ' + screenId + ' not configured');
  }
  req.screenId = screenId;
  next();
});

router.get('/:screenId/slimerjs', function (req, res) {
  if(!config.useSlimerJS) {
    res.status(400).send('Currently not configured to use slimerjs. Please check config.js if necessary.');
  }
  var script = scriptGenerator.slimerScript(req.screenId);
  res.writeHead(200, {
  'Content-Length': script.length,
  'Content-Type': 'text/plain' });
  res.end(script);
});

router.get('/start', function (req, res) {
  var script = scriptGenerator.startScript();
  res.writeHead(200, {
  'Content-Length': script.length,
  'Content-Type': 'text/plain' });
  res.end(script);
});

router.get('/kill', function (req, res) {
  var script = scriptGenerator.killScript();
  res.writeHead(200, {
  'Content-Length': script.length,
  'Content-Type': 'text/plain' });
  res.end(script);
});

router.get('/createProfile', function (req, res) {
  var script = scriptGenerator.createProfileScript();
  res.writeHead(200, {
  'Content-Length': script.length,
  'Content-Type': 'text/plain' });
  res.end(script);
});

router.get('/highlightScreens', function (req, res) {
  var script = scriptGenerator.createHighlightPicturesScript();
  res.writeHead(200, {
  'Content-Length': script.length,
  'Content-Type': 'text/plain' });
  res.end(script);
});

router.get('/createMasks', function (req, res) {
  var script = scriptGenerator.gphotoCreateMaskScript();
  res.writeHead(200, {
  'Content-Length': script.length,
  'Content-Type': 'text/plain' });
  res.end(script);
});

module.exports = router;
