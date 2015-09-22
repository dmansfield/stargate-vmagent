var libvirt = require('libvirt'); 
var config = require('../../config/config');
var debug = require('debug')('stargate-vmagent:vmservice');
var VmNotFoundError = require('./errors/vmnotfounderror');
var UserExistsError = require('./errors/userexistserror');
var InvalidArgumentError = require('./errors/invalidargumenterror');
var xpath = require('xpath');
var dom = require('xmldom').DOMParser;

// xml "schema". todo: implement a true xsd
var METADATA_NS = "http://github.com/dmansfield/stargate-vmagent";
var METADATA_NS_QUAL = "sgvm";
var ASSIGNED_USER_ELEM = "assignedUser";
var ASSIGNED_USER_TYPE_ATTRIBUTE = "type";
var INITIAL_METADATA_XML = "<metadata></metadata>";

// error code not defined in libvirt library
var VIR_ERR_NO_DOMAIN_METADATA = 80;

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

// throws VmNotFoundError
exports.getVm = function(uuid, callback) {
    var dom = hypervisor.lookupDomainByUUID(uuid);

    if (!dom) {
        return callback(new VmNotFoundError("No VM found for uuid: %s", uuid), null);
    }
    
    var xml = getDomainXml(dom);
    
    callback(null, {
            name: dom.getName()
            , uuid: dom.getUUID()
            , info: dom.getInfo()
            , xml: xml
    });
};

exports.forceShutdownVm = function(uuid, callback) {
	var dom = hypervisor.lookupDomainByUUID(uuid);

	if (!dom) {
		return callback(new VmNotFoundError("No VM found for uuid: %s", uuid), null);
	}
	
	dom.destroy();
}

exports.startVm = function(uuid, callback) {
	var dom = hypervisor.lookupDomainByUUID(uuid);

	if (!dom) {
		return callback(new VmNotFoundError("No VM found for uuid: %s", uuid), null);
	}
	
	dom.start();
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

// operating on "metadata" of domain

function withDomainAndMetadataDocument(uuidOrName, callback) {
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
