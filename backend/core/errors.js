'use strict';

class LauncherError extends Error {
  constructor(code, message, details = undefined, options = undefined) {
    super(message, options);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
  }
}

class ValidationError extends LauncherError {
  constructor(message, details, options) { super('VALIDATION_ERROR', message, details, options); }
}

class NotFoundError extends LauncherError {
  constructor(resource, id) { super('NOT_FOUND', `${resource} was not found`, { resource, id }); }
}

class ConflictError extends LauncherError {
  constructor(message, details, options) { super('CONFLICT', message, details, options); }
}

class NetworkError extends LauncherError {
  constructor(message, details, options) { super('NETWORK_ERROR', message, details, options); }
}

class IntegrityError extends LauncherError {
  constructor(message, details, options) { super('INTEGRITY_ERROR', message, details, options); }
}

class AuthenticationError extends LauncherError {
  constructor(message, details, options) { super('AUTHENTICATION_ERROR', message, details, options); }
}

class ConfigurationError extends LauncherError {
  constructor(message, details, options) { super('CONFIGURATION_ERROR', message, details, options); }
}

function serializeError(error) {
  return {
    name: error?.name || 'Error',
    code: error?.code || 'UNEXPECTED_ERROR',
    message: String(error?.message || error || 'Unknown error'),
    details: error?.details,
  };
}

module.exports = {
  LauncherError,
  ValidationError,
  NotFoundError,
  ConflictError,
  NetworkError,
  IntegrityError,
  AuthenticationError,
  ConfigurationError,
  serializeError,
};
