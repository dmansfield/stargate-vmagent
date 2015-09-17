var util = require('util');
var VError = require('verror');

/**
 * `InternalServerError` error.
 *
 * @api public
 */
function InternalServerError() {
	VError.apply(this, arguments);
	
	this.name = 'InternalServerError';
	// not sure why, but message comes prefixed with ': ' already.
	this.message = 'Internal Server Error' + this.message;
	this.status = 500;
};

util.inherits(InternalServerError, VError);

module.exports = InternalServerError;
