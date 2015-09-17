var util = require('util');
var VError = require('verror');

/**
 * `InternalServerError` error.
 *
 * @api public
 */
function VmNotFoundError() {
	VError.apply(this, arguments);
	this.name = 'VmNotFoundError';
};

util.inherits(VmNotFoundError, VError);

module.exports = VmNotFoundError;
