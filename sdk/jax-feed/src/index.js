/**
 * JAX Feed SDK
 * POST /api/feed with Bearer token.
 * amountCents is signed: money out is negative.
 */

export class JaxFeed {
  constructor({ baseUrl, token, fetchImpl } = {}) {
    if (!baseUrl) throw new Error('baseUrl is required');
    if (!token) throw new Error('token is required');
    this.baseUrl = String(baseUrl).replace(/\/$/, '');
    this.token = String(token);
    this.fetchImpl = fetchImpl || globalThis.fetch;
  }

  async ping() {
    return this.#call('GET', '/api/feed');
  }

  async post(transactions) {
    if (!Array.isArray(transactions)) throw new Error('transactions must be an array');
    return this.#call('POST', '/api/feed', { transactions });
  }

  async #call(method, path, body) {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Feed ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }
}
