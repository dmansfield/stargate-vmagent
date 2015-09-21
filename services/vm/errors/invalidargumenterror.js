var util = require('util');
var VError = require('verror');

/**
 * `InvalidArgumentError` error.
 *
 * @api public
 */
function InvalidArgumentError() {
    VError.apply(this, arguments);
    this.name = 'InvalidArgumentError';
};

util.inherits(InvalidArgumentError, VError);

module.exports = InvalidArgumentError;
