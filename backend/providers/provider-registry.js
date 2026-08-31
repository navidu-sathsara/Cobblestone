'use strict';

const { NotFoundError } = require('../core/errors');

class ProviderRegistry {
  constructor(providers) {
    this.providers = new Map(providers.map((provider) => [provider.id, provider]));
  }

  get(id) {
    const provider = this.providers.get(id);
    if (!provider) throw new NotFoundError('Content provider', id);
    return provider;
  }

  list() { return [...this.providers.keys()]; }
  search(id, options) { return this.get(id).search(options); }
}

module.exports = { ProviderRegistry };
