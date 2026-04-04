const request = require('supertest');
const { app, server } = require('../src/server');
const pool = require('../src/config/db');

describe('GET /api/health', () => {
  afterAll(async () => {
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
    await pool.end();
  });

  it('returns application health', async () => {
    const response = await request(app).get('/api/health');

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body).toHaveProperty('timestamp');
  });
});