import express from 'express';
import { identifyAdmin } from '../middleware/identifyAdmin.middleware.js';
import {
    grantCreditsController,
    resetCreditsController,
    listUsersController,
    listAllTransactionsController,
    listPackagesAdminController,
} from '../controllers/admin.controller.js';

const router = express.Router();

// All admin routes require admin identity
router.use(identifyAdmin);

// User management
router.get('/users', listUsersController);

// Transaction audit log
router.get('/transactions', listAllTransactionsController);

// Subscription packages + cost analysis
router.get('/packages', listPackagesAdminController);

// Credit operations
router.post('/grant', grantCreditsController);
router.post('/reset', resetCreditsController);

export default router;
