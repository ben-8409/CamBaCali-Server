var page = require('webpage').create();
page.open("REPLACE_URL").then(function (status) {
  page.viewportSize = { width: REPLACE_WIDTH, height: REPLACE_HEIGHT };
  if (status === 'success') {
    console.log("Loaded " + page.title);
    //this closes the slimerjs "about window"
    window.close();
  } else {
    console.error("ERROR");
    phantom.exit();
  }
});
