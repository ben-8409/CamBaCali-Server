'use strict';

/**
 * Calculate the distance between to colors
 * @module lib/color-distance
 */

/**
* Calculate the euclidian distance of two nd points
* @param {Number[]} p1 First point
* @param {Number[]} p2 Second point
*/
function euclidianDistance(p1, p2) {
 var sum = 0;
 p1.forEach(function (element, index) {
   sum += Math.pow((element - p2[index]), 2);
 });
 return Math.sqrt(sum);
}


// Module exports
module.exports = {
  'euclidianDistance': euclidianDistance
};
