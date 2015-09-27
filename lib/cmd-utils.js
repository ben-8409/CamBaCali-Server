'use strict';
/**
 * Utilities for external command execution locally *and* remote using ssh
 * @module lib/cmd-utils
 */
var debug = require('debug')('control-server:cmd-utils'),
  exec = require('child_process').exec,
  spawn = require('child_process').spawn,
  Promise = require('promise');

/**
 * Promise tp execute a given cmd locally
 * @param {String}    cmd     The command to ru
 * @param {Object}    options Options as defined by node.js "execute" function
 * @return {Promise}  promise
 */
function executeLocally(cmd, options) {
  return new Promise( function (resolve, reject) {
    exec(cmd, options, function (error, stdout, stderr) {
      if(error === null) {
        resolve(stdout);
      } else {
        debug(stderr);
        reject(error);
      }
    });
  });
}

/**
 * Promise to execute a given cmd using ssh on a remote machine
 * @param {String} cmd          The command to run
 * @param {String} user         username
 * @param {String} hostname     host
 * @return {Promise} promise
 */
function executeRemotely(cmd, user, hostname) {
  var ssh = 'ssh ' + user + '@' + hostname + ' ';
  return executeLocally(ssh + cmd);
}

/**
 * Promise to spawn locally and run the given command
 * @param   {String}    cmd     Command/programm to run
 * @param   {String[]}  [args]  Command line arguments for the cmd to run
 * @param   {Object}    options Options to pass to node.js Spawn command
 * @returns {Promise} - A promise the resolves if exit code is 0, rejects otherwise. The return value for rejected is a error object containing stderr in the message, fulfilled promises return the stdout output.
 */
function spawnLocally(cmd, args, options) {
  return new Promise( function (resolve, reject) {
    if(!args) {
      args = [];
    } else if (!(args instanceof Array)) {
      reject(new Error('Illegal argument ' + args));
    }
    var run = spawn(cmd, args, options),
        process = {
          cmd: cmd,
          stdout: '',
          stderr: '',
          code: undefined
      };

    run.stdout.on('data', function (data) {
      process.stdout += data;
      debug('[spawned ' + cmd + ' stdout]: ' + data);
    });
    run.stderr.on('data', function (data) {
      process.stderr += data;
     debug('[spawned ' + cmd + ' stderr]: ' + data);
    });

    run.on('error', function (err) {
      debug('Internal error when spawning the cmd ' + cmd);
      reject(err);
    });

    run.on('close', function (code) {
      process.code = code;
      debug('child process exited with code ' + code);
      if (code === 0) {
        resolve(process.stdout);
      } else {
        reject(new Error('Exit with code ' + process.code + '\n stderr: ' + process.stderr));
      }
    });
  });
}

// Module exports
module.exports = {
  'executeLocally': executeLocally,
  'executeRemotely': executeRemotely,
  'spawnLocally': spawnLocally
};
