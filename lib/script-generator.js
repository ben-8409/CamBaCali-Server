'use strict';

/**
 * Utility to generate and execute scripts
 * @module lib/script-generator
 */
var fs = require('fs'),
  config = require('../config.js'),
  debug = require('debug')('control-server:script-generator');


var scriptIntro = '#!/bin/bash\n',
  browser = config.browser + ' ' + config.browserGlobalOpts + ' ',
  slimerjsLaunch,
  bashRecordScreenRegTemplate = fs.readFileSync('script-templates/bash-record-screenreg.sh', {
    encoding: 'utf8'
  });

debug('Use slimer? ' + config.useSlimerJS);
if (config.useSlimerJS) {
  slimerjsLaunch = fs.readFileSync('script-templates/slimerjs-launch-screen.js', {
    encoding: 'utf8'
  });
}
var gphotoCreateMasksTemplate = fs.readFileSync('script-templates/gphoto-create-masks.sh', {
  encoding: 'utf8'
});
var gphotoTakeMasksTemplate = fs.readFileSync('script-templates/gphoto-take-masks.sh', {
  encoding: 'utf8'
});

function displayEnvString(screenId) {
  return 'DISPLAY=' + config.screens[screenId].x_screen + ' ';
}

function generateStartCmdForScreen(screenId) {
  var command;
  if (config.useSlimerJS) {
    command = 'curl ' + config.serverURI + '/scripts/' + screenId + '/slimerjs > ' + 'slimer_' + screenId + '.js; ';
    command += '(' + displayEnvString(screenId) + config.browser + ' slimer_' + screenId + '.js &)';
  } else {
    var profile = '-P ' + screenId + ' ';
    var url = config.serverUrl + screenId;
    var wmctrl = 'wmctrl -rx "Mozilla Firefox" -b add,fullscreen';
    command = '(' + displayEnvString(screenId) + browser + profile + url + ' &); sleep 1 && ' + displayEnvString(screenId) + wmctrl;
  }
  return command;
}

function generateKillCmd() {
  if (config.useSlimerJS) {
    return '"killall xulrunner; killall slimerjs"';
  } else {
    return '"killall firefox"';
  }
}

function getScreensBashArray() {
  var bashArrayStart = '(';
  var bashArrayEnd = ')';
  var screensList = '';
  var screens = Object.keys(config.screens);
  screens.forEach(function (screen, index) {

    screensList += '"' + screen + '"';
    if (index < screens.length - 1) {
      screensList += ' ';
    }
  });
  return bashArrayStart + screensList + bashArrayEnd;
}

function generateGphotoTakeMasksScript() {
  var replacements = new Map(),
      script = gphotoTakeMasksTemplate;
  replacements.set('REPLACE_SERVER', config.serverURI);
  replacements.set('REPLACE_SCREENS_BASHARRAY', getScreensBashArray());
  replacements.forEach( function (replace, keyword) {
    script = script.replace(new RegExp(keyword, 'g'), replace);
  });
  return script;
}

function generateGphotoCreateMaskScript() {
  var replacements = new Map(),
      script = gphotoCreateMasksTemplate;
  replacements.set('REPLACE_SERVER', config.serverURI);
  replacements.set('REPLACE_SCREENS_BASHARRAY', getScreensBashArray());
  replacements.forEach( function (replace, keyword) {
    script = script.replace(new RegExp(keyword, 'g'), replace);
  });
  return script;
}

function generateScreenRegScript() {
  var script = bashRecordScreenRegTemplate.replace('REPLACE_SERVER', config.serverURI + '/scripts');
  script = script.replace('REPLACE_SCREENLIST', getScreensBashArray());
  return script;
}

function generateSlimerScript(screen) {
  if (!config.useSlimerJS || slimerjsLaunch === undefined) {
    throw Error('Setup not configured for slimer js or error loading the script template');
  }
  var script = slimerjsLaunch.replace('REPLACE_URL', config.serverUrl + screen);
  script = script.replace('REPLACE_WIDTH', config.physicalDisplaySize.width);
  script = script.replace('REPLACE_HEIGHT', config.physicalDisplaySize.height);
  return script;
}

function generateStartScript() {
  var script = scriptIntro;
  Object.keys(config.screens).forEach(function (screen) {
    var ssh = 'ssh ' + config.screensUser + '@' + config.screens[screen].hostname + ' -fx ',
      command = generateStartCmdForScreen(screen);
    script += ssh + '\'' + command + '\'\nsleep 1\n';
  });
  return script;
}

function generateKillScript() {
  var hosts = new Set();
  var script = scriptIntro;

  var hostname;
  Object.keys(config.screens).forEach(function (screen) {
    hostname = config.screens[screen].hostname;
    if (typeof hostname !== 'undefined' && !hosts.has(hostname)) {
      hosts.add(hostname);
      script += 'ssh ' + config.screensUser + '@' + hostname + ' ' + generateKillCmd(hostname) + '\n';
    }
  });

  return script;
}

function generateCreateProfileScript() {
  var script = scriptIntro;
  Object.keys(config.screens).forEach(function (screen) {
    var ssh = 'ssh ' + config.screensUser + '@' + config.screens[screen].hostname + ' ';
    var command = config.browser + ' --no-remote -CreateProfile ' + screen;
    script += ssh + displayEnvString(screen) + command + '\n';
  });

  return script;
}

// Module exports
module.exports = {
  'createProfileScript': generateCreateProfileScript,
  'screenRegScript': generateScreenRegScript,
  'gphotoCreateMaskScript': generateGphotoCreateMaskScript,
  'gphotoTakeMasksScript': generateGphotoTakeMasksScript,
  'slimerScript': generateSlimerScript,
  'startCmdForScreen': generateStartCmdForScreen,
  'startScript': generateStartScript,
  'killCmd': generateKillCmd,
  'killScript': generateKillScript
};
