import request from 'supertest';
import path from 'path';
import TestAgent from 'supertest/lib/agent';
import server from '@/app';
import DAO from '@/lib/DAO';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const agent: InstanceType<typeof TestAgent> = request.agent(server);

beforeAll((done) => {
  done();
});

afterAll(async () => {
  const dao = new DAO();
  await dao.deleteUser({ id: 'jest' });
  dao.release();
});

describe('User API scenario', () => {
  it('should create a new user', async () => {
    const res = await agent
      .post('/api/users')
      .type('form')
      .field('id', 'jest')
      .field('password', 'jest')
      .field('nickname', 'jest')
      .attach('image', path.resolve(__dirname, './jest.png'));

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('data');
  });

  it('should get users info', async () => {
    const res = await agent.get('/api/users');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toMatchObject({ data: { id: 'jest' } });
  });
});
