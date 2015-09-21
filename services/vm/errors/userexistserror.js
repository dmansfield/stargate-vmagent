var util = require('util');
var VError = require('verror');

/**
 * `UserExistsError` error.
 *
 * @api public
 */
function UserExistsError() {
    VError.apply(this, arguments);
    this.name = 'UserExistsError';
};

util.inherits(UserExistsError, VError);

module.exports = UserExistsError;
