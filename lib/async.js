
'use strict';
/**
 * Use a Generator to run async Promise returning functions like
 * synchronous code.
 * Copy & Paste from https://www.promisejs.org/generators/
 * See https://github.com/ForbesLindesay/promisejs.org
 * @module lib/async.js
 */
var Promise = require('promise');

/**
 * Async Helper function to use loops with promises and
 * generator functions.
 * @param  {function*} makeGenerator Generator function
 * @return {Promise}
 */
 module.exports = function async(makeGenerator){
  return function () {
    var generator = makeGenerator.apply(this, arguments);

    function handle(result){
      // result => { done: [Boolean], value: [Object] }
      if (result.done) {
        return Promise.resolve(result.value);
      }

      return Promise.resolve(result.value).then(function (res){
        return handle(generator.next(res));
      }, function (err){
        return handle(generator.throw(err));
      });
    }

    try {
      return handle(generator.next());
    } catch (ex) {
      return Promise.reject(ex);
    }
  };
};
