/* jslint browser:true */
//requires the physical-screen element to be imported
function addPhysicalDisplay(parentSelector, id) {
  var parentEl = document.querySelector(parentSelector);
  var newScreen = document.createElement("physical-screen");
  newScreen.setAttribute("id","screen-"+id);
  parentEl.appendChild(newScreen);
}

exports.addPhysicalDisplay = addPhysicalDisplay;