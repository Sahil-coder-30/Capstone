import { Router } from 'express';
import { getCreditController, checkCreditController, updateCreditController } from '../controllers/credit.controller.js';
import { identifyUser } from '../middleware/auth.middleware.js';

const creditRouter = Router();

// GET /api/auth/credit - Get credit usage and total tokens
creditRouter.get('/', identifyUser, getCreditController);

// GET /api/auth/credit/check - Check if user has credits left
creditRouter.get('/check', identifyUser, checkCreditController);

// POST /api/auth/credit/update - Update tokens and deduct credits for the authenticated user
creditRouter.post('/update', identifyUser, updateCreditController);

export default creditRouter;
