var util = require('util');
var VError = require('verror');

/**
 * `NotFoundError` error.
 *
 * @api public
 */
function NotFoundError() {
	VError.apply(this, arguments);
	
	this.name = 'NotFoundError';
	// not sure why, but message comes prefixed with ': ' already.
	this.message = 'Not Found' + this.message;
	this.status = 404;
};

util.inherits(NotFoundError, VError);

module.exports = NotFoundError;
