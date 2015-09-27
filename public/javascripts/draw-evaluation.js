    
var drawEva = (function () {
  'use strict';
  function draw(canvasId) {
    console.log("DRAW!");
      var max = this.previewSize
      var canvas = document.querySelector(canvasId);
      var maxX = canvas.width;
      var maxY = canvas.height;
      var ctx = canvas.getContext('2d');
      //clear
      ctx.setTransform( 1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(0,255,0,1)';
      ctx.fillRect(0, 0, maxX, maxY);
  }
return {
   draw: draw,
  };
})();