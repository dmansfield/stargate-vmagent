var express = require('express');
var path = require('path');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

// =============
// Error types
// ==============
//    HTTP errors, these should be the only errors we send to the express error handler
//    all others should be wrapped
var NotImplementedError = require('./errors/http/notimplementederror');
var InternalServerError = require('./errors/http/internalservererror');
var NotFoundError = require('./errors/http/notfounderror');
//    VM service errors.  These MUST be caught and wrapped with an http errro
var VmNotFoundError = require('./services/vm/errors/vmnotfounderror');


var config = require('./config/config');

var vmService = require('./services/vm/vm');

var app = express();

app.use(logger('dev'));
app.use(bodyParser.json());

// routing

app.use('/api/vms/:uuid', function(req, res, next) {
	var uuid = req.params.uuid;
	var allVms = vmService.getVm(uuid, function(err, vms) {
		if (err) {
			if (err instanceof VmNotFoundError) {return next(new NotFoundError(err));}
			next(new InternalServerError(err)); return;
		}
		
		res.json(vms);
	});
});

app.use('/api/vms', function(req, res, next) {
	var allVms = vmService.getVms(function(err, vms) {
		if (err) {return next(new InternalServerError(err));}
		
		res.json(vms);
	});
});

app.use('/api', function(req, res, next) {
	next(new NotImplementedError());
});

app.use('/', function(req, res, next) {
	next(new NotImplementedError());
});

// error handling

// create an 404 for unrouted resources
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// production error handler
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.send({ 
	name: err.name,
    message: err.message,
    error: err.status
  });
});

module.exports = app;
