var util = require('util');
var VError = require('verror');

/**
 * `WrongPowerStateError` error.
 *
 * @api public
 */
function WrongPowerStateError() {
	VError.apply(this, arguments);
	this.name = 'WrongPowerStateError';
};

util.inherits(WrongPowerStateError, VError);

module.exports = WrongPowerStateError;
