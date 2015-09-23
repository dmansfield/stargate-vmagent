/**
 * `NotAuthorizedError` error.
 *
 * @api public
 */
function NotAuthorizedError(message) {
  Error.call(this);
  Error.captureStackTrace(this, arguments.callee);
  this.name = 'NotAuthorizedError';
  this.message = 'Not Authorized' + ( message ? ": "+message : "");
  this.status = 401;
};

/**
 * Inherit from `Error`.
 */
NotAuthorizedError.prototype.__proto__ = Error.prototype;


/**
 * Expose `NotAuthorizedError`.
 */
module.exports = NotAuthorizedError;
