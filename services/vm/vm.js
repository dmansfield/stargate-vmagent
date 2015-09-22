var libvirt = require('libvirt'); 
var config = require('../../config/config');
var debug = require('debug')('stargate-vmagent:vmservice');
var VmNotFoundError = require('./errors/vmnotfounderror');
var UserExistsError = require('./errors/userexistserror');
var InvalidArgumentError = require('./errors/invalidargumenterror');
var WrongPowerStateError = require('./errors/wrongpowerstateerror');
var VError = require("verror");
var xpath = require('xpath');
var dom = require('xmldom').DOMParser;

// xml "schema". todo: implement a true xsd
var METADATA_NS = "http://github.com/dmansfield/stargate-vmagent";
var METADATA_NS_QUAL = "sgvm";
var ASSIGNED_USER_ELEM = "assignedUser";
var ASSIGNED_USER_TYPE_ATTRIBUTE = "type";
var INITIAL_METADATA_XML = "<metadata></metadata>";

// exported constants
exports.POWER_STATE_OFF = 0;
exports.POWER_STATE_ON = 1;

// internal constants
var ACTIVE_STATE_POLL_INTERVAL_MS = 100;
var VIR_ERR_NO_DOMAIN_METADATA = 80; // not defined in libvirt library

// validation tools
var ValidUserTypes = {
      'administrator' : 1
    , 'user' : 1
};

debug('Connecing to libvirt hypervisor: %s', config.libvirt.hypervisor.uri);

var hypervisor = new libvirt.Hypervisor(config.libvirt.hypervisor.uri);

exports.init = function(callback) {
    hypervisor.connect(function(err) {
        if (err) return callback(err);
        hypervisor.getVersion(function(err, version) {
            if (err) return callback(err);
            debug("hypervisor version %s", version);
            callback();
        });
    });
};

function withDomain(uuidOrName, callback) {
    var method;
    
    var re = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    method = (uuidOrName.match(re)) ? "lookupDomainByUUID" : "lookupDomainByName";
    
    hypervisor[method](uuidOrName, function(err, domain) {
        if (err) {
            if (err.code === libvirt.VIR_ERR_NO_DOMAIN) {
                err = new VmNotFoundError(err, "no domain for key %s using method %s", uuidOrName, method);
            }
            return callback(err);
        }
        callback(null, domain);
    });
}

// throws VmNotFoundError
exports.getVm = function(uuidOrName, callback) {
    withDomain(uuidOrName, function(err, domain) {
        if (err) return callback(err);
        callback(new VError("not implemented"));
    });
};

exports.forceShutdownVm = function(uuidOrName, callback) {
    withDomain(uuidOrName, function(err, domain) {
        if (err) return callback(err);
        domain.destroy(function(err) {
            var re = /domain is not running/;
            if (err && err.code === libvirt.VIR_ERR_OPERATION_INVALID && err.message.match(re)) {
                err = new WrongPowerStateError(err,"Cannot shutdown powered off VM");
            }
            return callback(err); 
        });
    });
}

exports.startVm = function(uuidOrName, callback) {
    withDomain(uuidOrName, function(err, domain) {
        if (err) return callback(err);
        domain.start(function(err) {
            var re = /domain is already running/;
            if (err && err.code === libvirt.VIR_ERR_OPERATION_INVALID && err.message.match(re)) {
                err = new WrongPowerStateError(err, "Cannot start already running VM");
            }
            return callback(err); 
        });
    });
}

// callback(err, res) will receive an array of vm object, each with properties:
//   name
//   id (if running)
//   active
//   uuid

exports.getVms = function(callback) {
	var vms = [];
	// since we request a lot of data async, we need to know when the "last"
	// of it arrives to call the supplied callback. if one of the libvirt
	// function belowe pretending to be async isn't then this won't quite work
	var asyncPending = 0;
	var allErr = [];

	function checkComplete() {
	    debug("asyncPending=%s", asyncPending) ;
        if (asyncPending === 0) {
            if (allErr.length > 0) {
                return callback(allErr, null);
            } else {
                return callback(null, vms);
            }
        } 
	}
	
	// resolve an "incomplete" domain.
	function resolveVm(vm) {
	    vms.push(vm);
	    
	    asyncPending++;
	    var method;
	    var key;
	    if (vm.name) {
	        method = "lookupDomainByName";
	        key = vm.name;
	    } else {
	        method = "lookupDomainById";
	        key = vm.id;
	    }
        hypervisor[method](key, function(err, domain) {
            asyncPending--;
            if (err) {
                allErr.push(err);
            } else {
                debug("got domain data using method %s and key %s", domain, method, key);
                if (!vm.name) {
                    asyncPending++;
                    domain.getName(function(err, name) {
                        asyncPending--;
                        if (err) allErr.push(err);
                        debug("domain key:%s name:%s", key, name);
                        vm.name = name;
                        checkComplete();
                    });
                }
                asyncPending++;
                domain.getUUID(function(err, uuid) {
                   asyncPending--;
                   if (err) allErr.push(err);
                   debug("domain key:%s uuid:%s", key, uuid);
                   vm.uuid = uuid;
                   checkComplete();
                });
            }
        });
	}

	asyncPending++;
	hypervisor.listDefinedDomains(function(err, domainNames) {
	    asyncPending--;
	    // error here? nothing else submitted. die.
	    if (err) { return callback(err) };
        debug("got list of defined domains: %s", domainNames);
	    if (domainNames) {
    	    domainNames.forEach(function(domainName) {
    	       var vm = {name: domainName, active: 0};
    	       resolveVm(vm);
    	    });
	    }
	});
	
	asyncPending++;
	hypervisor.listActiveDomains(function(err, domainIds) {
	    asyncPending--;

	    if (err) {
	        allErr.push(err);
	        return checkComplete();
	    }
	    
        debug("got list of active domains: %s", domainIds);
	    
	    if (domainIds) {
    	    domainIds.forEach(function(domainId) {
    	        var vm = {id: domainId, active: 1};
    	        resolveVm(vm);
    	    });
	    }
	});
};

function waitForPowerState(domain, desiredState, untilTimeMs, startTimeMs, callback) {
    domain.isActive(function(err, active) {
       if (err) return callback(err); 
       var now = new Date().getTime();
       //console.log("state is %s at %d", active, now);
       if (active === desiredState) return callback();
       if (now > untilTimeMs) {
           var err = new VError("desiredState %s not reached after %s ms", desiredState, startTimeMs - now);
           return callback(err);
       }
       setTimeout(function() {
           waitForPowerState(domain, desiredState, untilTimeMs, startTimeMs, callback);
       }, ACTIVE_STATE_POLL_INTERVAL_MS);
    });
}

exports.waitForPowerState = function(uuidOrName, powerState, timeoutMs, callback) { 
    withDomain(uuidOrName, function(err, domain) {
        if (err) return callback(err);
        var now = new Date().getTime();
        waitForPowerState(domain, powerState == exports.POWER_STATE_ON, now + timeoutMs, now, callback);
    });
};

//
// This will fail (without much extra information) unless the domain was started
// with an initial (possibly empty) password set. empty passwords prevent any
// connection.  This only sets the password on the running instance; after
// machine restart the password will revert to the persistently defined one.
//
exports.setGraphicsPassword = function(uuidOrName, password, validSeconds, callback) {
    withDomain(uuidOrName, function(err, domain) {
        if (err) return callback(err);
        domain.toXml(function(err, xml) {
            if (err) return callback(err);

            var doc = new dom().parseFromString(xml);
            var nodes = xpath.select("/domain/devices/graphics", doc);
            if (nodes.length != 1) {
                return callback(new VError("unable to find <graphics/> element in domain xml"));
            }
            var graphicsNode = nodes[0];

            var validToMs = new Date().getTime();
            validToMs += validSeconds * 1000;
            // required format is without milliseconds and without the trailing 'Z'
            var dt = new Date(validToMs).toISOString().replace(/\.\d{3}Z$/, '');

            graphicsNode.setAttribute("passwd", password);
            graphicsNode.setAttribute("passwdValidTo", dt);

            domain.updateDevice(graphicsNode.toString(), [libvirt.VIR_DOMAIN_AFFECT_LIVE], function(err) {
                return callback(err);
            });
        });
    });
};

// operating on "metadata" of domain

function withDomainAndMetadataDocument(uuidOrName, callback) {
    withDomain(uuidOrName, function(err, domain) {
        if (err) return callback(err);
        domain.getMetadata(libvirt.VIR_DOMAIN_METADATA_ELEMENT, METADATA_NS, 0, function(err, xml) {
            if (err) {
                if (err.code !== VIR_ERR_NO_DOMAIN_METADATA)  return callback(err);
                xml = INITIAL_METADATA_XML;
            }
            
            var doc = new dom().parseFromString(xml);

            callback(err, domain, doc);
        });
    });
}

function findExistingUser(doc, user) {
    for (var i = 0; i < doc.childNodes[0].childNodes.length; i++) {
        var node = doc.childNodes[0].childNodes[i];
        if (node.tagName === ASSIGNED_USER_ELEM && node.textContent === user) {
            return node;
        }
    }
}

exports.getVmAssignees = function(uuidOrName, callback) {
    withDomainAndMetadataDocument(uuidOrName, function(err, domain, doc) {
        if (err) return callback(err);
        var userNodes = xpath.select("//"+ASSIGNED_USER_ELEM, doc);
        var users = [];
        userNodes.forEach(function(userNode) {
            var type = userNode.getAttribute(ASSIGNED_USER_TYPE_ATTRIBUTE)
            var user = userNode.textContent;
            users.push({"user":user,"type":type});
        });
        return callback(null, users);
    });
};

exports.addOrUpdateVmAssignee = function(uuidOrName, user, type, callback) {
    if (ValidUserTypes[type] === undefined) return callback(new InvalidArgumentError("bad user type: %s", type));
    
    withDomainAndMetadataDocument(uuidOrName, function(err, domain, doc) {
        if (err) return callback(err);
        
        var existingUser = findExistingUser(doc, user); 

        if (existingUser) {
            existingUser.parentNode.removeChild(existingUser);
        } 
        
        var newUser = doc.createElement(ASSIGNED_USER_ELEM);
        newUser.setAttribute(ASSIGNED_USER_TYPE_ATTRIBUTE, type);
        var newUserContent = doc.createTextNode(user);
        newUser.appendChild(newUserContent);
            
        doc.childNodes[0].appendChild(newUser);

        var newXml = doc.toString();

        domain.setMetadata(libvirt.VIR_DOMAIN_METADATA_ELEMENT, newXml, METADATA_NS_QUAL, METADATA_NS, 0, function(err) {
            return callback(err, existingUser ? "Existing user updated" : "User Created");
        });
        
    });
};

exports.removeVmAssignee = function(uuidOrName, user, callback) {
    withDomainAndMetadataDocument(uuidOrName, function(err, domain, doc) {
        if (err) return callback(err);
        
        var remove = findExistingUser(doc, user);

        if (!remove) {
            // doesn't break idempotency since server state is the same as if it were removed
            return callback(new UserExistsError("user %s cannot be removed from %s: doesn't exist", user, uuidOrName));
        }

        doc.childNodes[0].removeChild(remove);
        
        var newXml = doc.toString();
        domain.setMetadata(libvirt.VIR_DOMAIN_METADATA_ELEMENT, newXml, METADATA_NS_QUAL, METADATA_NS, 0, function(err) {
            return callback(err);
        });
    });
};
