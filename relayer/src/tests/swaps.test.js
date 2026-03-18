const request = require('supertest');
const app = require('../app');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

describe('Swaps API', () => {
  beforeAll(async () => {
    // Clear the DB before tests
    await prisma.swapIntent.deleteMany({});
  });

  afterAll(async () => {
    // Clean up connections
    await prisma.$disconnect();
  });

  let createdSwapId;
  const mockSwap = {
    hashlock: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    sender: 'GBXXXXXXXXXX',
    receiver: '0xYYYYYYYYYY',
    token: 'USDC',
    amount: '10000000',
    timelock: Math.floor(Date.now() / 1000) + 3600
  };

  it('should create a new swap intent', async () => {
    const res = await request(app)
      .post('/swaps')
      .send(mockSwap);
      
    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.hashlock).toEqual(mockSwap.hashlock);
    expect(res.body.status).toEqual('PENDING');
    createdSwapId = res.body.id;
  });

  it('should get a list of swaps', async () => {
    const res = await request(app).get('/swaps');
    
    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBeTruthy();
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].hashlock).toEqual(mockSwap.hashlock);
  });

  it('should get a specific swap by ID', async () => {
    const res = await request(app).get(`/swaps/${createdSwapId}`);
    
    expect(res.statusCode).toEqual(200);
    expect(res.body.id).toEqual(createdSwapId);
    expect(res.body.hashlock).toEqual(mockSwap.hashlock);
  });

  it('should return 404 for non-existent swap', async () => {
    const res = await request(app).get('/swaps/non-existent-id');
    expect(res.statusCode).toEqual(404);
  });

  it('should reject invalid duplicate hashlock', async () => {
    const res = await request(app)
      .post('/swaps')
      .send(mockSwap); // same mockSwap as before
      
    expect(res.statusCode).toEqual(400); // Because Prisma throws unique constraint violation
  });
});
