var config = require('./config/config');

var express = require('express');
var path = require('path');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var passport = require('passport');
var vmService = require('./services/vm/vm');
var passportSetup = require('./passport/passport.js');


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
var WrongPowerStateError = require('./services/vm/errors/wrongpowerstateerror');

// //////////////////////////////

var app = express();

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(passport.initialize());
app.use(passport.authenticate('login'));

passportSetup(passport);

// routing

function mapVmServiceError(err) {
    if (err instanceof UserExistsError) {return new NotFoundError(err);}
    if (err instanceof VmNotFoundError) {return new NotFoundError(err);}
    return new InternalServerError(err, ": %s", err.message);
}

function sendMessageResponse(res, messageOrObject, code, location, errorName) {
    var obj;
    if (typeof(messageOrObject) === 'object') {
        obj = messageOrObject;
    } else {
        obj = {"message":messageOrObject};
    }
    if (code) {
        res.status(code);
        obj.code = code;
    }
    if (location) {
        res.location(location);
        obj.location = location;
    }
    if (errorName) {
        obj.errorName = errorName;
    }
    res.json(obj);
}

app.get('/api/vms/:uuid/assignees', function(req, res, next) {
    var uuid = req.params.uuid;
    vmService.getVmAssignees(uuid, function(err, assignees) {
        if (err) return next(mapVmServiceError(err));
        res.json(assignees); 
    });
});

app.put('/api/vms/:uuid/assignees/:user', function(req, res, next) {
    var uuid = req.params.uuid;
    var user = req.params.user;
    var type = req.body.type;
    vmService.addOrUpdateVmAssignee(uuid, req.params.user, req.body.type, function(err) {
        if (err) return next(mapVmServiceError(err));
        sendMessageResponse(res, "Assignee created", 201, '/api/vms/'+uuid+'/assignees/'+user);
    });
});

app.delete('/api/vms/:uuid/assignees/:user', function(req, res, next) {
    var uuid = req.params.uuid;
    var user = req.params.user;
    vmService.removeVmAssignee(uuid, user, function(err) {
        if (err) return next(mapVmServiceError(err));
        sendMessageResponse(res, "Assignee removed", 200);
    });
});

app.get('/api/vms/:uuid/powerState', function(req, res, next) {
    var uuid = req.params.uuid;
    vmService.getPowerState(uuid, function(err, powerState) {
        if (err) return next(mapVmServiceError(err));
        res.json({
            "powerState": powerState
            , "powerStateName": powerState === vmService.POWER_STATE_ON ? "POWER_STATE_ON":"POWER_STATE_OFF"
        });
    });
});

app.put('/api/vms/:uuid/powerState', function(req, res, next) {
    var uuid = req.params.uuid;
    var powerState = req.body.powerState;
    if (powerState === "cycle") {
        vmService.forceShutdownVm(uuid, function(err) {
            var xtra = "";
            if (err) {
                if (!(err instanceof WrongPowerStateError)) {
                    return next(mapVmServiceError(err));
                }
                xtra += "VM not running. Shutdown skipped.";
            }
            vmService.waitForPowerState(uuid, vmService.POWER_STATE_OFF, 10000, function(err) {
                if (err) return next(mapVmServiceError(err));
                vmService.startVm(uuid, function(err) {
                    if (err) return next(mapVmServiceError(err));
                    sendMessageResponse(res, "Power cycle complete"+(xtra?": "+xtra:""), 200);
                });
            });
        });
    } else {
        if (typeof(powerState) === 'string') {
            if (powerState.toLowerCase() === 'on') powerState = vmService.POWER_STATE_ON;
            else if (powerState.toLowerCase() === 'off') powerState = vmService.POWER_STATE_OFF;
            else return next(new InternalServerError("Invalid power state: %s", powerState));
        }
        vmService.setPowerState(uuid, powerState, function(err) {
            if (err) return next(mapVmServiceError(err));
            sendMessageResponse(res, "Power state changed", 200);
        });
    }
});

app.put('/api/vms/:uuid/graphicsPassword', function(req, res, next) {
    var uuid = req.params.uuid;
    var password = req.body.password;
    var validSeconds = req.body.validSeconds || 60;
    vmService.setGraphicsPassword(uuid, password, validSeconds, function(err) {
        if (err) return next(mapVmServiceError(err));
        sendMessageResponse(res, "Password changed and will be valid for "+validSeconds+" seconds", 200);
    });
});

app.get('/api/vms/:uuid', function(req, res, next) {
    var uuid = req.params.uuid;
    vmService.getVm(uuid, function(err, vm) {
        if (err) return next(mapVmServiceError(err));
        res.json(vm);
    });
});

app.get('/api/vms', function(req, res, next) {
	var allVms = vmService.getVms(function(err, vms) {
        if (err) return next(mapVmServiceError(err));
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
    next(new NotFoundError());
});

// production error handler
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  console.log('Error handler: ', err);
  res.send({ 
	errorName: err.name,
    message: err.message,
    code: err.status
  });
});

module.exports.app = app;
module.exports.init = function(callback) {
    vmService.init(callback);
};
