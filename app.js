'use strict';
var express = require('express'),
  socket = require('./lib/socket.js'),
  debug = require('debug')('control-server:app'),
  path = require('path'),
  lessMiddleware = require('less-middleware');

var app = express(),
    server = require('http').createServer(app);
// generate scripts

// setup server
var port = process.env.PORT || 3000;

// setup sockets
socket.createSocket(server);

// router middleware
var api = require('./routes/api.js'),
  ui = require('./routes/ui.js'),
  screen = require('./routes/screen.js'),
  scripts = require('./routes/scripts.js');

//compile less
app.use(lessMiddleware(path.join(__dirname, '/public')));

// serve static files
app.use(express.static(path.join(__dirname, '/public')));
app.use('/bower_components', express.static(path.join(__dirname, '/bower_components')));

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use('/index.html', function (req, res) {
  res.render('index', {
    'title': 'Welcome'
  });
});

app.use('/api', api);
app.use('/ui', ui);
app.use('/screen', screen);
app.use('/scripts', scripts);

server.listen(port, function () {
  debug('Express server listens at ' + server.address().address + ':' + server.address().port);
});
