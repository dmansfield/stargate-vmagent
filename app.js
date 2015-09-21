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
var UserExistsError = require('./services/vm/errors/userexistserror');

var config = require('./config/config');

var vmService = require('./services/vm/vm');

var app = express();

app.use(logger('dev'));
app.use(bodyParser.json());

// routing

app.get('/api/vms/:uuid/assignees', function(req, res, next) {
    var uuid = req.params.uuid;
    vmService.getVmAssignees(uuid, function(err, assignees) {
        if (err) return next(err);
        res.json(assignees); 
        console.log("wrote output");
    });
});

app.put('/api/vms/:uuid/assignees/:user', function(req, res, next) {
    var uuid = req.params.uuid;
    var user = req.params.user;
    var type = req.body.type;
    vmService.addOrUpdateVmAssignee(uuid, req.params.user, req.body.type, function(err) {
        if (err) return next(err);
        res.status(201); // Created
        res.location('/api/vms/'+uuid+'/assignees/'+user);
        res.send({message:"Assignee created", code: 201});
    });
});

app.delete('/api/vms/:uuid/assignees/:user', function(req, res, next) {
    var uuid = req.params.uuid;
    var user = req.params.user;
    vmService.removeVmAssignee(uuid, user, function(err) {
        if (err instanceof UserExistsError) {return next(new NotFoundError(err));}
        if (err) return next(err);
        res.status(204); // No Content
        res.send({message:"Assignee removed", code: 204});
    });
});

app.get('/api/vms/:uuid', function(req, res, next) {
	var uuid = req.params.uuid;
	var allVms = vmService.getVm(uuid, function(err, vms) {
		if (err) {
			if (err instanceof VmNotFoundError) {return next(new NotFoundError(err));}
			next(new InternalServerError(err)); return;
		}
		
		res.json(vms);
	});
});

app.get('/api/vms', function(req, res, next) {
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

// create an 404 for un-routed resources
app.use(function(req, res, next) {
    debug("generating 404");
    next(new NotFoundError());
});

// production error handler
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  console.log('Error handler: ', err);
  res.send({ 
	name: err.name,
    message: err.message,
    code: err.status
  });
});

module.exports = app;
