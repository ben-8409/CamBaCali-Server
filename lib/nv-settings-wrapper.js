'use strict';
/**
 * This module calculates the right color correction parameters to screens
 * using nvidia settings tool. The command is build and then executed using
 * ssh on the on the remote machines
 * @module lib/nv-settings-wrapper
 */

var debug = require('debug')('control-server:nv-settings-wrapper'),
  Promise = require('promise');

var config = require('../config.js'),
  commonUtils = require('./common-utils.js'),
  cmdUtils = require('./cmd-utils.js');

/*
 * Exports
 */
module.exports = {
  'calcParameters': calcParameters,
  'calcParametersAlternative': calcParametersAlternative,
  'calcParametersAlternative2': calcParametersAlternative2,
  'humanReadable': humanReadable,
  'applyParameters': applyParameters,
  'applyParametersAndWait': applyParametersAndWait,
  'applyParametersToSingleScreenAndWait': applyParametersToSingleScreenAndWait,
  'resetScreens': resetScreens
};


function applyParameters(nvParameters) {
  debug('Apply Color Correction for all screens');
  //aggregate screens per hosts to reduce number of ssh commands
  var hostsWithScreens = commonUtils.groupScreensByHostname(config.screens);
  debug(hostsWithScreens);
  //now generate a command for each host
  var promises = [];
  hostsWithScreens.forEach(function (screens, host) {
    var nvSettings = generateAggregatedNVSettingsCmd(screens,
                                                     nvParameters);
    promises.push(cmdUtils.executeRemotely(nvSettings, config.screensUser, host));
  });
  return Promise.all(promises);
}

function applyParametersToSingleScreenAndWait(screenId, nvParameters) {
  return new Promise(function (resolve, reject) {
    var screen = config.screens[screenId];
    var cmd = generateNVSettingsCmd(screenId, nvParameters);
    cmdUtils.executeRemotely(cmd, config.screensUser, screen.hostname).then( function (result) {
    setTimeout(function() {
        debug('Parameters should have been set by now');
        resolve(result);
      }, 3000);
    }, function (reason) {
      reject(reason);
    });
  });
}

function applyParametersAndWait(nvParameters) {
  return new Promise(function (resolve, reject) {
    applyParameters(nvParameters).then( function (result) {
    setTimeout(function() {
        debug('Parameters should have been set by now');
        resolve(result);
      }, 3000);
    }, function (reason) {
      reject(reason);
    });
  });
}

function convertDelimiterIfRequired(value) {
  var convertedValue = value.toString();
  if (config.nv_settings_convert_delimiter) {
    convertedValue = convertedValue.replace('.', ',');
  }
  return convertedValue;
}

/**
 *
 */
function fitCorrection(value) {
  //value = Math.round(value * 10000) / 10000;
  //return Math.abs(value) > 0.001 ? value : 0;
  return parseFloat(parseFloat(value.toString()).toFixed(4)); //FIXME
}

function generateAggregatedNVSettingsCmd(screens, nvParameters) {
  var cmd = '';
  screens.forEach(function (screenId) {
    if (nvParameters[screenId] !== undefined) {
      //we have a correction for that screen!
      if (cmd !== '') {
        //we are not the first, prepend "; " to chain the bash commands
        cmd += '; ';
      }
      cmd += generateNVSettingsCmd(screenId, nvParameters[screenId]);
    }
  });
  return '\'' + cmd + '\'';
}

function generateNVSettingsCmd(screenId, correctionObject) {
  //load the config of this screen
  var screen = config.screens[screenId];
  var assignPart = ' -a "' + screen.x_screen + '[dpy:' + screen.nv_xsettings_dpy_id + ']/',
    basePart = 'DISPLAY=' + screen.x_screen + ' ' + 'nvidia-settings --ctrl-display=' + screen.x_screen,
    cmd = basePart;

  debug(correctionObject);
  Object.keys(correctionObject).forEach(function (channel) {
    cmd += assignPart;
    if (channel === 'red') {
      cmd += 'RedBrightness';
    } else if (channel === 'green') {
      cmd += 'GreenBrightness';
    } else if (channel === 'blue') {
      cmd += 'BlueBrightness';
    }
    cmd += '"="' + convertDelimiterIfRequired(correctionObject[channel]) + '"';
  });
  return cmd;
}

function humanReadable(nvParameters) {
  var output = '';
  Object.keys(nvParameters).forEach(function eachScreen(screen) {
    var p = nvParameters[screen];
    output += '\n' + 'Screen: ' + screen + ':\n';
    output += '\t Red: ' + p.red + ' Green: ' + p.green + ' Blue: ' + p.blue + '\n';
  });
  return output;
}

/**
 * limitCorrection - Limits the range of the correction parameter to
 * -1 < value < 1.
 * @param   {Number} value
 * @returns {Number} value
 */
function limitCorrection(value) {
  return value > 0 ? Math.min(1, value) : Math.max(-1, value);
}

function mapArrayPositionToChannelName(i, order) {
  var channelName;
  if(order !== 'RGB') {
    throw 'Invalid pixel order! Only RGB supported currently';
  }
  switch (i) { //map array values to rgb-object
    case 0:
      channelName = 'red';
      break;
    case 1:
      channelName = 'green';
      break;
    case 2:
      channelName = 'blue';
  }
  return channelName;
}

function calcParameters(deltaEs, mesaurements, referenceValues, oldParams, factor) {
  debug('Starting to calc parameters with factor ' + factor);
  return new Promise( function (resolve, reject) {
    try {
      var targetDeltaE = 0,
          step = 0.1, //* factor,
        corrections;
      if( typeof oldParams === 'object' ) {
        corrections = oldParams;
      } else {
        corrections = {};
      }

      // screen loop
      Object.keys(deltaEs).forEach(function (screen) {
        if (deltaEs[screen] > targetDeltaE) {
          debug('Working on screen ' + screen + ' with dE ' + deltaEs[screen]);
          // no parameters yet for this screen
          if(!corrections[screen]) {
            corrections[screen] = { 'red': 0, 'green': 0, 'blue': 0 };
          }
          debug('Values : ' + mesaurements[screen]);
          debug('Reference: ' + referenceValues);

          // algorithm switch.
          mesaurements[screen].forEach(function (value, i) {
            var channelName = mapArrayPositionToChannelName(i, 'RGB');
            var referenceValue = referenceValues[i];
            //var cor = delta > 0 ? (-step) : (+step);
            //
            var delta = referenceValue - value;
            /*if(value > referenceValue) {
              debug( channelName + ' is brighter then reference');
              corrections[screen][channelName] -= step;
            } else if (value < referenceValue) {
              debug( channelName + ' is darker then reference');
              corrections[screen][channelName] += step;
            } else {
              debug( channelName + ' is fine.');
            }*/
            corrections[screen][channelName] += fitCorrection((delta * (1 / 72)) * factor);
            //correctionObject[channelName] = limitCorrection(old + cor);
            //debug('Delta for channel ' + channelName + ' is ' + delta);
            //corrections[screen][channelName] = fitCorrection(corrections[screen][channelName]);
            //correctionObject[channelName] = limitCorrection(old
            //  + fitCorrection(delta * (1 / 70), factor));//TODO find the right value

          }); //end channels loop
          //save the correction params in the session
        } // end if > deltaE
      }); //end screens loop
      resolve(corrections);
    } catch (e) {
      reject(e);
    }
  });
}

function calcParametersAlternative2(deltaEs, mesaurements, referenceValues, oldParams, factor) {
  return new Promise( function (resolve, reject) {
    try {
      var targetDeltaE = 0,
          step = 0.02 * factor,
        corrections;
      if( typeof oldParams === 'object' ) {
        corrections = oldParams;
      } else {
        corrections = {};
      }

      // screen loop
      Object.keys(deltaEs).forEach(function (screen) {
        if (deltaEs[screen] > targetDeltaE) {
          debug('Working on screen ' + screen + ' with dE ' + deltaEs[screen]);
          // no parameters yet for this screen
          if(!corrections[screen]) {
            corrections[screen] = { 'red': 0, 'green': 0, 'blue': 0 };
          }
          debug('Values : ' + mesaurements[screen]);
          debug('Reference: ' + referenceValues);

          // algorithm switch.
          mesaurements[screen].forEach(function (value, i) {
            var channelName = mapArrayPositionToChannelName(i, 'RGB');
            var referenceValue = referenceValues[i];
            var param = corrections[screen][channelName];

            var delta = value - referenceValue;
            if(delta > 1) {
              corrections[screen][channelName] = fitCorrection(limitCorrection(param - step));
            } else if(delta < 1){
              corrections[screen][channelName] = fitCorrection(limitCorrection(param + step));
            }
          }); //end channels loop
          //save the correction params in the session
        } // end if > deltaE
      }); //end screens loop
      resolve(corrections);
    } catch (e) {
      reject(e);
    }
  });
}

function calcParametersAlternative(deltaEs,
            measurements,
            referenceValues,
            oldParams,
            channel) {
  return new Promise( function (resolve, reject) {
    if(typeof channel === 'undefined') {
      reject('No channel supplied.');
    }
    try {
      var targetDeltaE = 1,
          step = 0.01,
        corrections;
      if( typeof oldParams === 'object' ) {
        corrections = oldParams;
      } else {
        corrections = {};
      }

      // screen loop
      Object.keys(deltaEs).forEach(function (screen) {
        if (deltaEs[screen] > targetDeltaE) {
          var channelName = mapArrayPositionToChannelName(channel, 'RGB');
          debug('Working on screen ' + screen + ' with dE ' + deltaEs[screen]);
          // no parameters yet for this screen
          if(!corrections[screen]) {
            corrections[screen] = { 'red': 0, 'green': 0, 'blue': 0 };
          }
          debug('Reference Channel is ' + channelName);
          debug('Values : ' + measurements[screen]);
          debug('Reference: ' + referenceValues);

          var value = measurements[screen][channel];
          var referenceValue = referenceValues[channel];
          var param = corrections[screen][channelName];

          var delta = value - referenceValue;
          if(delta > 10) {
            corrections[screen][channelName] = limitCorrection(param - 0.1);
          } else if(delta > 5) {
            corrections[screen][channelName] = limitCorrection(param - 0.04);
          } else if(delta > 1) {
            corrections[screen][channelName] = limitCorrection(param - step);
          }
        } // end if > deltaE
      }); //end screens loop
      resolve(corrections);
    } catch (e) {
      reject(e);
    }
  });
}

function emptyParams() {
  var corrections = {},
    correction = {
      'red': 0,
      'blue': 0,
      'green': 0
    };
  Object.keys(config.screens).forEach(function (screen) {
    corrections[screen] = correction;
  });
  return corrections;
}

function resetScreens() {

  applyParameters(emptyParams());
}
