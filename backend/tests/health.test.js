const request = require('supertest');
const { app, server } = require('../src/server');

describe('GET /api/health', () => {
  afterAll((done) => {
    server.close(done);
  });

  it('returns application health', async () => {
    const response = await request(app).get('/api/health');

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body).toHaveProperty('timestamp');
  });
});
