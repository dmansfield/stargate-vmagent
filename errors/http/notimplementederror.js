/**
 * `NotImplementedError` error.
 *
 * @api public
 */
function NotImplementedError(message) {
  Error.call(this);
  Error.captureStackTrace(this, arguments.callee);
  this.name = 'NotImplementedError';
  this.message = 'Not Implemented' + ( message ? ": "+message : "");
  this.status = 501;
};

/**
 * Inherit from `Error`.
 */
NotImplementedError.prototype.__proto__ = Error.prototype;


/**
 * Expose `NotImplementedError`.
 */
module.exports = NotImplementedError;
