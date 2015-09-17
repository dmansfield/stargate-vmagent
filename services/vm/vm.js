var libvirt = require('libvirt'); 
var config = require('../../config/config');
var debug = require('debug')('stargate-vmagent:vmservice');
var VmNotFoundError = require('./errors/vmnotfounderror');

debug('Connecing to libvirt hypervisor: %s', config.libvirt.hypervisor.uri);

var hypervisor = new libvirt.Hypervisor(config.libvirt.hypervisor.uri);

function getDomainXml(dom) {

	// https://libvirt.org/html/libvirt-libvirt-domain.html#virDomainXMLFlags
	var VIR_DOMAIN_XML_SECURE		= 	1; // dump security sensitive information too
	var VIR_DOMAIN_XML_INACTIVE		= 	2; // dump inactive domain information
	var VIR_DOMAIN_XML_UPDATE_CPU	= 	4; // update guest CPU requirements according to host CPU
	var VIR_DOMAIN_XML_MIGRATABLE	= 	8; // dump XML suitable for migration

	return dom.toXml([0]);
}

function getDomainMetadata(dom) {
	
}

// throws VmNotFoundError
exports.getVm = function(uuid, callback) {
	var dom = hypervisor.lookupDomainByUUID(uuid);

	if (!dom) {
		callback(new VmNotFoundError("No VM found for uuid: %s", uuid), null);
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
		callback(new VmNotFoundError("No VM found for uuid: %s", uuid), null);
	}
	
	dom.destroy();
}

exports.startVm = function(uuid, callback) {
	var dom = hypervisor.lookupDomainByUUID(uuid);

	if (!dom) {
		callback(new VmNotFoundError("No VM found for uuid: %s", uuid), null);
	}
	
	dom.start();
}

// TODO: this work could be split up using process.nextTick() 
// to improve concurrency. unfortunately libvirt module is synchronous
exports.getVms = function(callback) {
	var vms = [];
	
	var inactiveDomains = hypervisor.getDefinedDomains();
	inactiveDomains.forEach(function(val) {
		var dom = hypervisor.lookupDomainByName(val);
		vms.push({name: val, active: 0, uuid: dom.getUUID()});
	});
		
	var activeDomains = hypervisor.getActiveDomains();
	activeDomains.forEach(function(val) {
		debug("looking up domain %s", val);
		var dom = hypervisor.lookupDomainById(val);
		vms.push({name: dom.getName(), active: 1, uuid: dom.getUUID()});
	});
		
	callback(null, vms);
};

