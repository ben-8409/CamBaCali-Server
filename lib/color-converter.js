'use strict';

/**
 * Convert color values between different color spaces.
 * Sources for algorithms and conversion tables are
 * Hunt, Measuring Color and Bruce Lindbloom:
 * - http://www.brucelindbloom.com/index.html?Eqn_XYZ_to_Lab.html
 * - http://www.brucelindbloom.com/index.html?Eqn_RGB_XYZ_Matrix.html
 * @module lib/color-converter
 */

/**
 * Caculate the Matrix product  C = M*V
 * @private
 * @param {Number[][]} Matrix M
 * @param {Number[]} vector V
 * @returns {Number[]} Vector C
 */
 function matrixProduct(matrix, vector) {
   var result = [];
   for(var i = 0; i < 3; i++) {
     result[i] = matrix[i][0] * vector[0] + matrix[i][1] * vector[1] + matrix[i][2] * vector[2];
   }
   return result;
 }

/*
 * sRGB to XYZ
 *---------------------------------------------------
 */

// Source: http://www.brucelindbloom.com/index.html?Eqn_RGB_XYZ_Matrix.html
var M_SRGB2XYZ = [[0.4124564, 0.3575761, 0.1804375],
                  [0.2126729, 0.7151522, 0.0721750],
                  [0.0193339, 0.1191920, 0.9503041]];
/*var M_SRGB2XYZ = [[0.4124564, 0.2126729, 0.0193339],
                  [0.3575761, 0.7151522, 0.1191920],
                  [0.1804375, 0.0721750, 0.9503041]];*/

/**
 * Convert a 8 bit RGB int to a float in range 0.0 to 1.0
 * @param {Number} int Rage 0 to 255
 * @returns {Number} Range 0.0 to 1.0
 */
function convertRGBINT2RGBFLOAT (int) {
  return (1 / 255) * int;
}

/**
 * Convert a SRGB value to XYZ relative to D65
 * @param   {Number[]} rgb               Array with RGB channel values
 * @param   {Boolean}  convertRGBtoFloat  Convert the RGB values to range 0 to 1 first
 * @returns {Number[]} xyz Array with XYZ values in Number (0 to 1.0)
 */
function sRGBtoXYZ(rgb, convertRGBtoFloat) {
  if (convertRGBtoFloat === undefined) {
    convertRGBtoFloat = true;
  }
  if (convertRGBtoFloat) {
    rgb = rgb.map( convertRGBINT2RGBFLOAT );
  }
  var xyz = matrixProduct(M_SRGB2XYZ, rgb);
  xyz = xyz.map(function (v) {
    return v * 100;
  });
  return xyz;
}

 /*
  * XYZ to L*a*b
  * -------------------------------------------------
  * Conversion to CIEL*a*b requires a reference white
  */
 var XYZr = { 'X': 95.047, 'Y': 100, 'Z': 108.883 };

 /*
  * Mapping relative luminance to Lightness L*
  * is done with two functions (here g and h), depending on a "junction point" epsilon.
  * In the CIE Standard, they are approximated, their intention can be seen below.
  * Node that the real calculation uses an approximation as well, in this case
  * given by the limited precision of the JS Number format. So this will not fix the
  * slope discontinuities (see lindbloom) but should be considerably better in
  * the approximation.
  */
 var epsilon = 216 / 24389;
 var kappa = 24389 / 27;

 function g(c) {
  return Math.pow(c, 1 / 3);
 }

 function h(c) {
   return (kappa * c + 16) / 116;
 }

 /*
  * The function f converts a stimulus C from XYZ to a stimulus in CIELAB
  * taking into account the reference white for that stimulus given in Cr
  */
 function f(c) {
   if ( c > epsilon) {
     return g(c);
   } else {
     return h(c);
   }
 }

 /*
  * Calculate L*a*b* components for CIELAB
  */

 function L(Y) {
   return 116 * f(Y / XYZr.Y) - 16;
 }

 function a(X, Y) {
   return 500 * (f(X / XYZr.X) - f(Y / XYZr.Y));
 }

 function b(Y, Z) {
   return 200 * (f(Y / XYZr.Y) - f(Z / XYZr.Z));
 }

/**
 * Convert a given tristumulus color from XYZ to L*a*b.
 * Returns the same collection it is given.
 * @param {Object|Array} XYZ values as Array or Object
 * @returns {Object|Array} L*a*b values as Array or Object
 */
function XYZtoLab(XYZ) {
 //if XZY is and object, return as Lab object
 if(XYZ instanceof Array) {
   if(XYZ.length !== 3) {
     throw Error('Illegal number of elements in XYZ array. Must be 3.');
   } else {
     return [ L(XYZ[1]), a(XYZ[0], XYZ[1]), b(XYZ[1], XYZ[2]) ];
   }
 } else {
   throw Error('Illegal Argument. Must be Array or Object');
 }
}

/*
 * sRGB to L*a*b
 * --------------------------------------------------------
 */
/**
 * Convert a sRGB color triple to L*a*b color values
 * assuming 8bit / 256 step encoding of the sRGB value
 * and a D65 light Source
 * @param {Number[]}  rgb   Color values for channels R,G,B
 * @returns {Number[]} L*a*b Color
 */
function sRGBtoLab(sRGB) {
  if(sRGB.length !== 3) {
    throw new Error('sRGB to Lab conversion error: No valid color supplied.' + Object.keys(sRGB));
  }
  return XYZtoLab(sRGBtoXYZ(sRGB));
}

// Module exports
module.exports = {
  'sRGBtoLab': sRGBtoLab,
  'sRGBtoXYZ': sRGBtoXYZ,
  'XYZtoLab': XYZtoLab
};
