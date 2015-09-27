/*jslint node: true, sloppy: true*/
'use strict';

var express = require('express');
var router = express.Router();

/* /screen/:screenID */
router.get('/:screenId', function (req, res) {
  var screenId = req.params.screenId;
  res.render('screen/index', { title: 'Screen ' + screenId,
                         screen: screenId
                         });
});

module.exports = router;
